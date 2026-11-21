import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, reduce, restore } from '../state.mjs';

const run = (state, ...actions) => actions.reduce(reduce, state);
const consent = () => run(initialState(), { type: 'OPEN_CONSENT' }, { type: 'READ' },
  { type: 'CHOOSE_REASON', reason: '不感兴趣' }, { type: 'QUIZ', answer: 'environment' });
const rejected = () => reduce(consent(), { type: 'REJECT' });
const added = () => reduce(rejected(), { type: 'ADD_TARGET' });
const removed = () => run(added(), { type: 'OPEN_REMOVE' }, { type: 'WAIVER', checked: true },
  { type: 'REMOVE_BACKUP', holdMs: 2000 });
const confirmed = () => reduce(removed(), { type: 'REVIEW' });
const roundTrip = state => restore(JSON.parse(JSON.stringify(state)));
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('initial contract, fresh references and pure deterministic transitions', () => {
  const first = initialState();
  assert.equal(first.version, 1);
  assert.equal(first.view, 'home');
  assert.deepEqual(first, {
    version: 1, view: 'home', query: '', read: false, reason: '', quizPassed: false,
    attempts: 0, rejected: false, added: false, backupEver: false,
    backupRemoved: false, waiver: false, cart: [], receipt: null,
    events: [], activeMs: 0, notice: '',
  });
  first.cart.push('ml');
  assert.deepEqual(initialState().cart, []);
  const source = freeze(confirmed());
  const action = freeze({ type: 'SUBMIT' });
  assert.deepEqual(reduce(source, action), reduce(source, action));
  assert.equal(source.receipt, null);
  assert.notEqual(reduce(source, action).cart, source.cart);
});

test('search and navigation preserve progress; restricted pages cannot be jumped to', () => {
  let state = rejected();
  for (const query of ['机器学习', '', '不存在']) {
    state = reduce(state, { type: 'SEARCH', query });
    assert.equal(state.query, query);
    assert.equal(state.view, 'results');
    assert.equal(state.rejected, true);
  }
  for (const view of ['home', 'results', 'detail', 'cart']) {
    state = reduce(state, { type: 'NAVIGATE', view });
    assert.equal(state.view, view);
  }
  for (const view of ['consent', 'remove', 'confirm', 'success', 'unknown']) {
    const blocked = reduce(state, { type: 'NAVIGATE', view });
    assert.equal(blocked.view, state.view);
    assert.equal(blocked.events.at(-1).result, 'blocked');
  }
});

test('illegal ordering never unlocks, adds, removes or submits', () => {
  for (const action of [{ type: 'READ' }, { type: 'CHOOSE_REASON', reason: 'x' },
    { type: 'QUIZ', answer: 'environment' }, { type: 'REJECT' }, { type: 'ADD_TARGET' },
    { type: 'OPEN_REMOVE' }, { type: 'WAIVER', checked: true },
    { type: 'REMOVE_BACKUP', holdMs: 2000 }, { type: 'REVIEW' }, { type: 'SUBMIT' }]) {
    const state = reduce(initialState(), action);
    assert.equal(state.events.at(-1).result, 'blocked', action.type);
    assert.deepEqual(state.cart, []);
    assert.equal(state.rejected, false);
    assert.equal(state.receipt, null);
    roundTrip(state);
  }
  let state = run(initialState(), { type: 'OPEN_CONSENT' }, { type: 'READ' });
  state = reduce(state, { type: 'REJECT' });
  assert.equal(state.rejected, false);
  state = reduce(state, { type: 'CHOOSE_REASON', reason: ' ' });
  assert.equal(state.reason, '');
});

test('incorrect quiz retries preserve exact reason and completed work', () => {
  let state = run(initialState(), { type: 'OPEN_TARGET' }, { type: 'OPEN_CONSENT' },
    { type: 'READ' }, { type: 'CHOOSE_REASON', reason: ' 不感兴趣 ' });
  state = reduce(state, { type: 'QUIZ', answer: 'bus' });
  assert.equal(state.attempts, 1);
  assert.equal(state.events.at(-1).result, 'incorrect');
  assert.match(state.notice, /土壤/);
  state = roundTrip(state);
  state = reduce(state, { type: 'QUIZ', answer: 'environment' });
  assert.equal(state.attempts, 2);
  state = reduce(state, { type: 'REJECT' });
  assert.equal(state.reason, ' 不感兴趣 ');
  assert.equal(state.view, 'detail');
  assert.equal(reduce(state, { type: 'OPEN_CONSENT' }).view, 'detail');
  assert.equal(reduce(state, { type: 'CHOOSE_REASON', reason: '改写' }).reason, state.reason);
});

test('first add preserves rejection, subsequent additions never refill removed backup', () => {
  let state = added();
  assert.deepEqual(state.cart, ['ml', 'agri']);
  assert.equal(state.rejected, true);
  assert.equal(state.backupEver, true);
  assert.match(state.notice, /已知情拒绝/);
  state = reduce(state, { type: 'ADD_TARGET' });
  assert.deepEqual(state.cart, ['ml', 'agri']);
  state = removed();
  for (let i = 0; i < 3; i++) {
    state = run(roundTrip(state), { type: 'OPEN_TARGET' }, { type: 'ADD_TARGET' });
    assert.deepEqual(state.cart, ['ml']);
    assert.equal(state.backupEver, true);
    assert.equal(state.backupRemoved, true);
  }
});

test('waiver and uninterrupted hold threshold are required; cancellation preserves waiver', () => {
  let state = reduce(added(), { type: 'OPEN_REMOVE' });
  state = reduce(state, { type: 'REMOVE_BACKUP', holdMs: 2000 });
  assert.equal(state.backupRemoved, false);
  state = reduce(state, { type: 'WAIVER', checked: true });
  for (const holdMs of [0, 1000, 1999, 1000]) {
    state = reduce(state, { type: 'REMOVE_BACKUP', holdMs });
    assert.equal(state.backupRemoved, false);
    assert.equal(state.waiver, true);
  }
  state = roundTrip(state);
  state = reduce(state, { type: 'WAIVER', checked: false });
  assert.equal(reduce(state, { type: 'REMOVE_BACKUP', holdMs: 3000 }).backupRemoved, false);
  state = run(state, { type: 'WAIVER', checked: true }, { type: 'REMOVE_BACKUP', holdMs: 2000 });
  assert.equal(state.view, 'cart');
  assert.deepEqual(state.cart, ['ml']);
});

test('review cannot include agriculture; leaving confirmation requires review again', () => {
  assert.equal(reduce(added(), { type: 'REVIEW' }).view, 'cart');
  let state = confirmed();
  state = reduce(state, { type: 'OPEN_CART' });
  assert.equal(reduce(state, { type: 'SUBMIT' }).receipt, null);
  state = run(state, { type: 'REVIEW' }, { type: 'SUBMIT', id: 'receipt-1', time: '2026-11-21T05:00:00Z' });
  assert.deepEqual(state.receipt, { id: 'receipt-1', time: '2026-11-21T05:00:00Z', courses: ['ml'] });
  assert.equal(state.view, 'success');
  assert.deepEqual(roundTrip(state), state);
});

test('repeated business operations are idempotent, with separately counted attempts', () => {
  for (const [state, action, field] of [
    [consent(), { type: 'READ' }, 'read'],
    [consent(), { type: 'QUIZ', answer: 'wrong' }, 'attempts'],
    [rejected(), { type: 'REJECT' }, 'rejected'],
    [added(), { type: 'ADD_TARGET' }, 'cart'],
    [removed(), { type: 'REMOVE_BACKUP', holdMs: 2000 }, 'cart'],
  ]) {
    const next = reduce(state, action);
    assert.deepEqual(next[field], state[field]);
    assert.equal(next.events.length, state.events.length + 1);
    assert.equal(next.events.at(-1).result, 'noop');
  }
});

test('receipt is immutable across repeats, restore, navigation and attempted mutations', () => {
  let state = reduce(confirmed(), { type: 'SUBMIT' });
  const receipt = structuredClone(state.receipt);
  for (const action of [{ type: 'SUBMIT', id: 'different', time: 123 },
    { type: 'SEARCH', query: 'x' }, { type: 'ADD_TARGET' }, { type: 'OPEN_CART' },
    { type: 'NAVIGATE', view: 'home' }, { type: 'NAVIGATE', view: 'success' }]) {
    state = reduce(roundTrip(state), action);
    assert.equal(state.view, 'success');
    assert.deepEqual(state.receipt, receipt);
    assert.deepEqual(state.cart, ['ml']);
  }
});

test('every meaningful boundary restores without losing progress, events or receipt', () => {
  let state = initialState();
  for (const action of [{ type: 'SEARCH', query: '机器学习' }, { type: 'OPEN_TARGET' },
    { type: 'OPEN_CONSENT' }, { type: 'READ' }, { type: 'CHOOSE_REASON', reason: '不感兴趣' },
    { type: 'QUIZ', answer: 'wrong' }, { type: 'QUIZ', answer: 'environment' },
    { type: 'REJECT' }, { type: 'ADD_TARGET' }, { type: 'OPEN_REMOVE' },
    { type: 'WAIVER', checked: true }, { type: 'REMOVE_BACKUP', holdMs: 2000 },
    { type: 'REVIEW' }, { type: 'SUBMIT' }]) {
    state = reduce(state, action);
    assert.deepEqual(roundTrip(state), state);
    state = roundTrip(state);
  }
  const restored = restore(state);
  restored.cart.push('agri');
  restored.receipt.courses.push('agri');
  restored.events[0].type = 'changed';
  assert.deepEqual(state.cart, ['ml']);
  assert.deepEqual(state.receipt.courses, ['ml']);
  assert.equal(state.events[0].type, 'SEARCH');
});

test('TICK accumulates caller-provided active time only and never counts as business action', () => {
  let state = run(initialState(), { type: 'TICK', ms: 10 }, { type: 'SEARCH', query: 'ml' },
    { type: 'TICK', ms: 20 });
  assert.equal(state.activeMs, 30);
  assert.deepEqual(state.events, [{ type: 'SEARCH', at: 10, result: 'ok' }]);
  state = roundTrip(state);
  assert.equal(state.activeMs, 30);
  for (const ms of [-1, NaN, Infinity, 0.5, '10', Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => reduce(state, { type: 'TICK', ms }));
  }
});

test('restore rejects corrupt, legacy, impossible and mismatched success snapshots', () => {
  for (const raw of [null, [], '{}', {}, { ...initialState(), version: 2 },
    { ...initialState(), extra: 1 }, { ...initialState(), read: 'true' },
    { ...initialState(), attempts: -1 }, { ...initialState(), quizPassed: true },
    { ...initialState(), rejected: true }, { ...initialState(), cart: ['ml'] },
    { ...added(), cart: ['ml', 'ml'] }, { ...added(), cart: ['ml', 'other'] },
    { ...added(), cart: ['ml', 'agri', ,] },
    { ...removed(), backupEver: false }, { ...removed(), waiver: false },
    { ...added(), view: 'confirm' }, { ...initialState(), view: 'remove' },
    { ...initialState(), view: 'success' }, { ...initialState(), activeMs: NaN },
    { ...initialState(), events: [{ type: 'TICK', at: 0, result: 'ok' }] },
    { ...initialState(), events: [{ type: 'READ', at: 1, result: 'ok' }] },
    { ...initialState(), activeMs: 3, events: [
      { type: 'SEARCH', at: 2, result: 'ok' }, { type: 'READ', at: 1, result: 'ok' }] },
  ]) assert.throws(() => restore(raw), TypeError);
  const success = reduce(confirmed(), { type: 'SUBMIT' });
  for (const patch of [{ view: 'cart' }, { cart: ['ml', 'agri'] },
    { receipt: { ...success.receipt, courses: ['agri'] } },
    { receipt: { ...success.receipt, id: '' } },
    { receipt: { ...success.receipt, time: 'invalid' } }]) {
    assert.throws(() => restore({ ...success, ...patch }), TypeError);
  }
});

test('malformed actions throw without modifying input', () => {
  const state = freeze(initialState());
  for (const action of [null, {}, { type: 'UNKNOWN' }, { type: 'SEARCH' },
    { type: 'QUIZ' }, { type: 'CHOOSE_REASON', reason: 1 }, { type: 'WAIVER', checked: 1 },
    { type: 'REMOVE_BACKUP', holdMs: Infinity }, { type: 'SUBMIT', id: '' },
    { type: 'SUBMIT', time: {} }]) assert.throws(() => reduce(state, action), TypeError);
  assert.deepEqual(state, initialState());
});

test('out-of-order actions at each workflow boundary always produce restorable states', () => {
  const boundaries = [initialState()];
  for (const action of [{ type: 'SEARCH', query: '机器学习' }, { type: 'OPEN_TARGET' },
    { type: 'OPEN_CONSENT' }, { type: 'READ' }, { type: 'CHOOSE_REASON', reason: '不感兴趣' },
    { type: 'QUIZ', answer: 'wrong' }, { type: 'QUIZ', answer: 'environment' },
    { type: 'REJECT' }, { type: 'ADD_TARGET' }, { type: 'OPEN_REMOVE' },
    { type: 'WAIVER', checked: true }, { type: 'REMOVE_BACKUP', holdMs: 1999 },
    { type: 'REMOVE_BACKUP', holdMs: 2000 }, { type: 'REVIEW' },
    { type: 'SUBMIT', id: 'real-id', time: '2026-11-21T06:00:00.000Z' }]) {
    boundaries.push(reduce(boundaries.at(-1), action));
  }
  const actions = [{ type: 'SEARCH', query: '' }, { type: 'OPEN_TARGET' },
    { type: 'OPEN_CONSENT' }, { type: 'READ' }, { type: 'CHOOSE_REASON', reason: '不感兴趣' },
    { type: 'QUIZ', answer: 'wrong' }, { type: 'QUIZ', answer: 'environment' },
    { type: 'REJECT' }, { type: 'ADD_TARGET' }, { type: 'OPEN_CART' }, { type: 'OPEN_REMOVE' },
    { type: 'WAIVER', checked: false }, { type: 'WAIVER', checked: true },
    { type: 'REMOVE_BACKUP', holdMs: 1999 }, { type: 'REMOVE_BACKUP', holdMs: 2000 },
    { type: 'REVIEW' }, { type: 'SUBMIT' },
    { type: 'SUBMIT', id: 'another-id', time: '2026-11-21T06:01:00.000Z' },
    ...['home', 'results', 'detail', 'consent', 'cart', 'remove', 'confirm', 'success',
      'unknown', undefined].map(view => ({ type: 'NAVIGATE', view })),
    { type: 'TICK', ms: 0 }, { type: 'TICK', ms: 100 }];
  for (const state of boundaries) for (const action of actions) {
    const next = reduce(freeze(state), action);
    assert.deepEqual(restore(next), next, `${state.view}: direct ${action.type}`);
    assert.deepEqual(roundTrip(next), next, `${state.view}: ${action.type}`);
  }
});

test('every post-receipt navigation stays on success and permits the next action after restore', () => {
  const submitted = reduce(confirmed(), {
    type: 'SUBMIT', id: 'ui-receipt', time: '2026-11-21T06:00:00.000Z',
  });
  for (const view of ['home', 'results', 'detail', 'consent', 'cart', 'remove',
    'confirm', 'success', 'unknown', undefined]) {
    const navigated = reduce(freeze(submitted), { type: 'NAVIGATE', view });
    assert.equal(navigated.view, 'success');
    assert.equal(navigated.events.at(-1).result, view === 'success' ? 'noop' : 'blocked');
    assert.equal(navigated.events.length, submitted.events.length + 1);
    assert.deepEqual(navigated.receipt, submitted.receipt);
    assert.deepEqual(navigated.cart, ['ml']);
    const restored = roundTrip(navigated);
    const ticked = reduce(restored, { type: 'TICK', ms: 123 });
    assert.equal(ticked.activeMs, restored.activeMs + 123);
    assert.deepEqual(ticked.events, restored.events);
    const repeated = reduce(roundTrip(ticked), {
      type: 'SUBMIT', id: 'must-not-replace', time: '2026-11-21T06:05:00.000Z',
    });
    assert.deepEqual(roundTrip(repeated).receipt, submitted.receipt);
    assert.equal(repeated.events.at(-1).result, 'noop');
  }
});
