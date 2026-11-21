import test from 'node:test';
import assert from 'node:assert/strict';
import { getRoundId, roundStorageKey, createRoundUrl, upsertRound, getRoundLabel } from '../rounds.mjs';

const record = (id = 'default', overrides = {}) => ({
  id, label: '原始体验', createdAt: 10, updatedAt: 20,
  courseCount: 2, credits: 3.5, submitted: false, ...overrides,
});
const invalidIds = ['', 'a'.repeat(65), '../escape', 'a:b', 'a/b', 'a b', '中文', 'a\n', 'a\0', '%2f', '<script>', null, undefined, 1, {}];
function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

test('reads outer round only and falls back for absent, invalid or malformed URLs', () => {
  assert.equal(getRoundId('https://example.test/app?v=3#/courses?round=old'), 'default');
  assert.equal(getRoundId('https://example.test/app?round=outer#/courses?round=inner'), 'outer');
  assert.equal(getRoundId(new URL('https://example.test/?round=A_0-z')), 'A_0-z');
  assert.equal(getRoundId('not a URL'), 'default');
  for (const id of invalidIds.filter(id => typeof id === 'string')) {
    assert.equal(getRoundId(`https://example.test/?round=${encodeURIComponent(id)}`), 'default');
  }
});

test('storage keys isolate rounds, including prototype-like but valid IDs', () => {
  const ids = ['default', 'new-round', 'A_0-z', 'a'.repeat(64), '__proto__', 'constructor'];
  assert.equal(new Set(ids.map(roundStorageKey)).size, ids.length);
  for (const id of ids) assert.equal(roundStorageKey(id), `mingli-selection-workbench-v3:${id}`);
  for (const id of invalidIds) assert.throws(() => roundStorageKey(id), TypeError);
});

test('new URL preserves origin, path, version and outer parameters, clearing the entire old hash', () => {
  const source = new URL('https://example.test:8443/sub/app?v=3&tag=a&tag=b&round=old&round=stale#/receipt?round=hidden&token=old');
  const before = source.href;
  const result = new URL(createRoundUrl(source, 'fresh_2'));
  assert.equal(source.href, before);
  assert.equal(result.origin, source.origin);
  assert.equal(result.pathname, source.pathname);
  assert.equal(result.searchParams.get('v'), '3');
  assert.deepEqual(result.searchParams.getAll('tag'), ['a', 'b']);
  assert.deepEqual(result.searchParams.getAll('round'), ['fresh_2']);
  assert.equal(result.hash, '#/courses');
  assert.equal(getRoundId(result), 'fresh_2');
  assert.equal(getRoundId(source), 'old');
  assert.equal(new URL(createRoundUrl('https://example.test/app', 'next')).hash, '#/courses');
  for (const id of invalidIds) assert.throws(() => createRoundUrl(source, id), TypeError);
});

test('upsert preserves old rounds, sorts descending and deeply detaches every input', () => {
  const records = freezeDeep([record(), record('second', { updatedAt: 30, metadata: { notes: ['kept'] } })]);
  const incoming = freezeDeep(record('third', { updatedAt: 40, metadata: { notes: ['new'] } }));
  const before = structuredClone({ records, incoming });
  const next = upsertRound(records, incoming);
  assert.deepEqual(next.map(r => r.id), ['third', 'second', 'default']);
  assert.deepEqual(next[2], records[0]);
  assert.notEqual(next, records);
  next.forEach(item => assert.ok(!records.includes(item) && item !== incoming));
  next[0].metadata.notes.push('changed');
  next[1].metadata.notes.push('changed');
  next[2].label = 'changed';
  assert.deepEqual({ records, incoming }, before);
  assert.deepEqual(upsertRound(records, incoming), upsertRound(records, incoming));
});

test('deduplicates by ID, keeps newest existing duplicate and replaces only the requested round', () => {
  const original = record();
  const records = [original, record('same', { updatedAt: 50 }), record('same', { updatedAt: 30 })];
  assert.equal(upsertRound(records, record('new')).find(r => r.id === 'same').updatedAt, 50);
  const replacement = record('same', { updatedAt: 60, courseCount: 4, credits: 8, submitted: true });
  const next = upsertRound(records, replacement);
  assert.deepEqual(next, [replacement, original]);
  assert.equal(records.length, 3);
  assert.equal(upsertRound(records, record('same')).find(r => r.id === 'same').updatedAt, 20);
  assert.deepEqual(upsertRound([], record('__proto__')).map(r => r.id), ['__proto__']);
});

test('rejects malformed records and illegal counts in incoming and historical records', () => {
  const corrupt = [null, [], {}, ...invalidIds.map(id => record('bad', { id }))];
  for (const value of [-1, NaN, Infinity, '2', null, undefined, Number.MAX_SAFE_INTEGER + 1]) {
    for (const field of ['courseCount', 'credits', 'createdAt', 'updatedAt']) corrupt.push(record('bad', { [field]: value }));
  }
  corrupt.push(record('bad', { courseCount: 1.5 }), record('bad', { createdAt: 1.5 }),
    record('bad', { updatedAt: 20.5 }), record('bad', { updatedAt: 9 }),
    record('bad', { submitted: 1 }), record('bad', { submitted: 'false' }),
    record('bad', { label: '' }), record('bad', { label: '  ' }), record('bad', { label: 1 }));
  for (const field of Object.keys(record())) {
    const missing = record();
    delete missing[field];
    corrupt.push(missing);
  }
  for (const bad of corrupt) {
    assert.throws(() => upsertRound([], bad), TypeError);
    assert.throws(() => upsertRound([bad], record()), TypeError);
  }
  assert.throws(() => upsertRound(new Array(1), record()), TypeError);
  for (const bad of [null, {}, 'records']) assert.throws(() => upsertRound(bad, record()), TypeError);
  assert.equal(upsertRound([], record('empty', { createdAt: 0, updatedAt: 0, courseCount: 0, credits: 0 }))[0].credits, 0);
});

test('labels use zero-based indexes and reject invalid IDs or indexes', () => {
  assert.equal(getRoundLabel('default'), '原始体验');
  assert.equal(getRoundLabel('new', 0), '第 1 轮体验');
  assert.equal(getRoundLabel('new', 2), '第 3 轮体验');
  for (const id of invalidIds) assert.throws(() => getRoundLabel(id, 0), TypeError);
  for (const index of [-1, 0.5, '0', null, undefined, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => getRoundLabel('new', index), TypeError);
  }
});
