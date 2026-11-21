import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSES, totalCredits } from '../catalog.mjs';
import {
  MIN_CREDITS, MAX_CREDITS, REASONS,
  createState, restoreState, planSummary, transition,
} from '../state.mjs';

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

function assertDetached(actual, source) {
  if (!source || typeof source !== 'object') return;
  assert.notEqual(actual, source, 'nested state must not share references');
  if (!actual || typeof actual !== 'object') return;
  for (const key of Object.keys(source)) assertDetached(actual[key], source[key]);
}

// Every successful action in these tests also exercises the persistence boundary.
function act(state, action) {
  const before = structuredClone(state);
  const actionBefore = structuredClone(action);
  const next = transition(freezeDeep(state), freezeDeep(action));
  assert.deepEqual(state, before, 'transition must not mutate its input');
  assert.deepEqual(action, actionBefore, 'transition must not mutate its action');
  assertDetached(next, state);
  const restored = restoreState(next);
  assert.deepEqual(restored, next);
  assertDetached(restored, next);
  assert.deepEqual(JSON.parse(JSON.stringify(next)), next, 'state must remain JSON data');
  assert.deepEqual(restoreState(JSON.parse(JSON.stringify(next))), next);
  return next;
}

function run(state, actions) {
  return actions.reduce((current, action) => act(current, action), state);
}

function qualified() {
  return run(createState(), [
    { type: 'ADD', id: 'ml' },
    { type: 'CONSENT_READ' },
    { type: 'CONSENT_REASON', reason: REASONS[0] },
    { type: 'CONSENT_ANSWER', answer: 'environment' },
    { type: 'CONSENT_CONFIRM', at: 10 },
  ]);
}

function withdraw(state) {
  return run(state, [
    { type: 'DROP', id: 'agri' },
    { type: 'WITHDRAW_ACK', checked: true },
    { type: 'WITHDRAW_CONFIRM', holdMs: 2000, at: 20 },
  ]);
}

function submit(state, receiptId = 'receipt-1', at = 100) {
  return run(state, [{ type: 'REVIEW' }, { type: 'SUBMIT', receiptId, at, expectedCourses: state.draft }]);
}

test('new states are independent, restorable and summarize an empty plan', () => {
  const state = createState();
  assert.deepEqual(restoreState(state), state);
  assertDetached(createState(), state);
  assert.deepEqual(planSummary(state), {
    count: 0, credits: 0, valid: false, completeness: 0, guaranteed: false, periods: 0,
  });
});

test('every available ordinary course can be selected, rejects duplicate selection and can be dropped', () => {
  for (const course of COURSES.filter((course) => course.id !== 'ml' && course.enrolled < course.capacity)) {
    const added = act(createState(), { type: 'ADD', id: course.id, at: 5 });
    assert.deepEqual(added.draft, [course.id]);
    assert.deepEqual(added.origins, { [course.id]: 'student' });
    assert.equal(added.pending, null);
    assert.equal(added.consent.approved, false);
    assert.equal(added.events.at(-1).courseId, course.id);
    assert.equal(added.events.at(-1).at, 5);
    const duplicate = act(added, { type: 'ADD', id: course.id });
    assert.deepEqual(duplicate.draft, added.draft);
    assert.deepEqual(duplicate.events, added.events);
    assert.match(duplicate.notice, /已在/);
    const dropped = act(duplicate, { type: 'DROP', id: course.id });
    assert.deepEqual(dropped.draft, []);
    assert.deepEqual(dropped.origins, {});
    assert.equal(dropped.events.at(-1).type, 'drop');
    const absent = act(dropped, { type: 'DROP', id: course.id });
    assert.match(absent.notice, /不在/);
    assert.deepEqual(absent.events, dropped.events);
  }
});

test('unknown and full courses cannot enter the draft', () => {
  for (const id of ['unknown', undefined, ...COURSES.filter((course) => course.enrolled >= course.capacity).map((course) => course.id)]) {
    const state = act(createState(), { type: 'ADD', id });
    assert.deepEqual(state.draft, []);
    assert.deepEqual(state.origins, {});
    assert.equal(state.pending, null);
    assert.equal(state.events.length, 0);
    assert.match(state.notice, id === 'unknown' || id === undefined ? /未找到/ : /名额已满/);
  }
});

test('schedule conflicts block ML before consent and block ordinary additions after approval', () => {
  const ordinary = act(createState(), { type: 'ADD', id: 'visualization' });
  const blockedMl = act(ordinary, { type: 'ADD', id: 'ml' });
  assert.deepEqual(blockedMl.draft, ['visualization']);
  assert.equal(blockedMl.pending, null);
  assert.match(blockedMl.notice, /冲突/);
  const approved = qualified();
  const blockedOrdinary = act(approved, { type: 'ADD', id: 'visualization' });
  assert.deepEqual(blockedOrdinary.draft, approved.draft);
  assert.match(blockedOrdinary.notice, /冲突/);
});

test('credit limits allow exactly the maximum and reject the next course without changing the draft', () => {
  const state = run(createState(), ['agri', 'robotics', 'stats', 'expert', 'ethics'].map((id) => ({ type: 'ADD', id })));
  assert.equal(totalCredits(state.draft), MAX_CREDITS);
  assert.equal(planSummary(state).valid, true);
  for (const id of ['music', 'ml']) {
    const blocked = act(state, { type: 'ADD', id });
    assert.deepEqual(blocked.draft, state.draft);
    assert.equal(blocked.pending, null);
    assert.match(blocked.notice, /最多/);
  }
  const receipt = submit(state).submitted;
  assert.equal(receipt.credits, MAX_CREDITS);
});

test('below-minimum drafts cannot be reviewed or submitted; exactly the minimum can', () => {
  for (const state of [createState(), act(createState(), { type: 'ADD', id: 'stats' })]) {
    assert.equal(planSummary(state).valid, false);
    const reviewed = act(state, { type: 'REVIEW' });
    assert.equal(reviewed.review, null);
    assert.equal(reviewed.pending, null);
    assert.ok(reviewed.notice);
    assert.equal(act(reviewed, { type: 'SUBMIT', receiptId: 'invalid', expectedCourses: reviewed.draft }).submitted, null);
  }
  const state = run(createState(), ['stats', 'music'].map((id) => ({ type: 'ADD', id })));
  assert.equal(planSummary(state).credits, MIN_CREDITS);
  assert.equal(submit(state).submitted.credits, MIN_CREDITS);
});

test('ML opens consent without selecting either course; closing preserves completed steps for reopening', () => {
  let state = act(createState(), { type: 'ADD', id: 'ml' });
  assert.equal(state.pending, 'consent');
  assert.deepEqual(state.draft, []);
  state = run(state, [
    { type: 'CONSENT_READ' },
    { type: 'CONSENT_REASON', reason: REASONS[1] },
    { type: 'CONSENT_ANSWER', answer: 'wrong' },
    { type: 'CANCEL_PROCEDURE' },
  ]);
  assert.equal(state.pending, null);
  assert.deepEqual(state.consent, { read: true, reason: REASONS[1], passed: false, attempts: 1, approved: false });
  state = act(state, { type: 'ADD', id: 'ml' });
  assert.equal(state.pending, 'consent');
  assert.equal(state.consent.attempts, 1);
  state = run(state, [{ type: 'CONSENT_ANSWER', answer: 'environment' }, { type: 'CANCEL_PROCEDURE' }]);
  assert.equal(state.consent.passed, true);
  assert.equal(state.consent.approved, false);
  state = run(state, [{ type: 'ADD', id: 'ml' }, { type: 'CONSENT_CONFIRM' }]);
  assert.deepEqual(state.draft, ['ml', 'agri']);
});

test('consent prerequisites block skipping, permit incorrect-answer retries and do not recount a passed quiz', () => {
  const idle = createState();
  for (const action of [
    { type: 'CONSENT_READ' }, { type: 'CONSENT_REASON', reason: REASONS[0] },
    { type: 'CONSENT_ANSWER', answer: 'environment' }, { type: 'CONSENT_CONFIRM' },
  ]) assert.deepEqual(act(idle, action).consent, idle.consent);
  let state = act(idle, { type: 'ADD', id: 'ml' });
  state = act(state, { type: 'CONSENT_REASON', reason: REASONS[0] });
  assert.equal(state.consent.reason, '');
  state = act(state, { type: 'CONSENT_ANSWER', answer: 'environment' });
  assert.equal(state.consent.attempts, 0);
  state = act(state, { type: 'CONSENT_CONFIRM' });
  assert.deepEqual(state.draft, []);
  assert.equal(state.consent.approved, false);
  state = run(state, [{ type: 'CONSENT_READ' }, { type: 'CONSENT_REASON', reason: 'invalid reason' }]);
  assert.equal(state.consent.reason, '');
  state = act(state, { type: 'CONSENT_REASON', reason: REASONS[2] });
  for (const answer of ['wrong', 'student']) {
    state = act(state, { type: 'CONSENT_ANSWER', answer });
    assert.equal(state.consent.passed, false);
    assert.match(state.notice, /重新作答/);
  }
  state = act(state, { type: 'CONSENT_ANSWER', answer: 'environment' });
  assert.equal(state.consent.attempts, 3);
  assert.equal(state.consent.passed, true);
  state = act(state, { type: 'CONSENT_ANSWER', answer: 'wrong' });
  assert.equal(state.consent.attempts, 3);
  assert.equal(state.consent.passed, true);
  state = act(state, { type: 'CONSENT_CONFIRM' });
  assert.equal(state.consent.approved, true);
  assert.deepEqual(state.draft, ['ml', 'agri']);
  assert.deepEqual(state.origins, { ml: 'student', agri: 'guarantee' });
  assert.deepEqual(state.guarantee, { ever: true, removed: false });
  assert.equal(state.pending, null);
  assert.equal(state.events.filter((event) => event.type === 'guarantee').length, 1);
  assert.deepEqual(planSummary(state), { count: 2, credits: 6, valid: true, completeness: 100, guaranteed: true, periods: 4 });
});

test('an already selected agriculture course retains its student origin when ML is approved', () => {
  const state = run(act(createState(), { type: 'ADD', id: 'agri' }), [
    { type: 'ADD', id: 'ml' }, { type: 'CONSENT_READ' },
    { type: 'CONSENT_REASON', reason: REASONS[0] },
    { type: 'CONSENT_ANSWER', answer: 'environment' }, { type: 'CONSENT_CONFIRM' },
  ]);
  assert.deepEqual(state.draft, ['agri', 'ml']);
  assert.equal(state.origins.agri, 'student');
  assert.equal(state.guarantee.ever, true);
  assert.equal(state.events.filter((event) => event.type === 'guarantee').length, 0);
  const dropped = act(state, { type: 'DROP', id: 'agri' });
  assert.deepEqual(dropped.draft, ['ml']);
  assert.equal(dropped.pending, null);
});

test('ML still enters when its first guarantee allocation would exceed the credit limit, without later backfill', () => {
  let state = run(createState(), ['robotics', 'stats', 'expert', 'ethics'].map((id) => ({ type: 'ADD', id })));
  state = run(state, [
    { type: 'ADD', id: 'ml' }, { type: 'CONSENT_READ' },
    { type: 'CONSENT_REASON', reason: REASONS[0] },
    { type: 'CONSENT_ANSWER', answer: 'environment' }, { type: 'CONSENT_CONFIRM' },
  ]);
  assert.equal(totalCredits(state.draft), MAX_CREDITS);
  assert.ok(state.draft.includes('ml'));
  assert.ok(!state.draft.includes('agri'));
  assert.deepEqual(state.guarantee, { ever: true, removed: true });
  state = run(state, [{ type: 'DROP', id: 'robotics' }, { type: 'DROP', id: 'ml' }, { type: 'ADD', id: 'ml' }]);
  assert.ok(!state.draft.includes('agri'));
});

test('withdrawal requires explicit acknowledgement and a finite hold of at least 2000ms', () => {
  const ready = act(qualified(), { type: 'DROP', id: 'agri' });
  assert.equal(ready.pending, 'withdrawal');
  assert.equal(ready.withdrawalAck, false);
  assert.ok(ready.draft.includes('agri'));
  assert.ok(act(ready, { type: 'WITHDRAW_CONFIRM', holdMs: 5000 }).draft.includes('agri'));
  const invalidAck = act(ready, { type: 'WITHDRAW_ACK', checked: 'true' });
  assert.equal(invalidAck.withdrawalAck, false);
  const acknowledged = act(ready, { type: 'WITHDRAW_ACK', checked: true });
  for (const holdMs of [undefined, -1, 0, 1999, 1999.99, NaN, Infinity, '2000']) {
    const blocked = act(acknowledged, { type: 'WITHDRAW_CONFIRM', holdMs });
    assert.deepEqual(blocked.draft, acknowledged.draft);
    assert.equal(blocked.guarantee.removed, false);
    assert.match(blocked.notice, /持续按住/);
  }
  const unchecked = act(acknowledged, { type: 'WITHDRAW_ACK', checked: false });
  assert.ok(act(unchecked, { type: 'WITHDRAW_CONFIRM', holdMs: 2000 }).draft.includes('agri'));
  for (const holdMs of [2000, 2500]) {
    const removed = act(acknowledged, { type: 'WITHDRAW_CONFIRM', holdMs });
    assert.deepEqual(removed.draft, ['ml']);
    assert.equal(removed.origins.agri, undefined);
    assert.equal(removed.guarantee.removed, true);
    assert.equal(removed.pending, null);
  }
});

test('cancelled withdrawal keeps the seat and reopening requires fresh acknowledgement', () => {
  let state = run(qualified(), [
    { type: 'DROP', id: 'agri' }, { type: 'WITHDRAW_ACK', checked: true }, { type: 'CANCEL_PROCEDURE' },
  ]);
  state = act(state, { type: 'WITHDRAW_CONFIRM', holdMs: 2000 });
  assert.ok(state.draft.includes('agri'));
  state = act(state, { type: 'DROP', id: 'agri' });
  assert.equal(state.withdrawalAck, false);
});

test('after guarantee removal repeated ML add/drop never refills agriculture or repeats consent', () => {
  let state = withdraw(qualified());
  for (let i = 0; i < 4; i++) {
    state = act(state, { type: 'DROP', id: 'ml' });
    assert.deepEqual(state.draft, []);
    state = act(state, { type: 'ADD', id: 'ml' });
    assert.deepEqual(state.draft, ['ml']);
    assert.equal(state.pending, null);
    assert.equal(state.consent.approved, true);
    assert.deepEqual(state.guarantee, { ever: true, removed: true });
  }
  assert.equal(state.events.filter((event) => event.type === 'guarantee').length, 1);
  assert.equal(state.events.filter((event) => event.type === 'refusal').length, 1);
  state = act(state, { type: 'ADD', id: 'agri' });
  assert.equal(state.origins.agri, 'student');
  state = act(state, { type: 'DROP', id: 'agri' });
  assert.equal(state.pending, null);
  assert.deepEqual(state.draft, ['ml']);
});

test('ML alone and multiple ordinary courses both produce valid independent submission receipts', () => {
  const ordinary = run(createState(), ['stats', 'expert', 'music'].map((id) => ({ type: 'ADD', id })));
  for (const state of [withdraw(qualified()), ordinary]) {
    const result = submit(state);
    assert.equal(result.editing, false);
    assert.equal(result.pending, null);
    assert.equal(result.review, null);
    assert.deepEqual(result.submitted, { id: 'receipt-1', at: 100, courses: state.draft, credits: totalCredits(state.draft), revision: 1 });
    assert.notEqual(result.submitted.courses, result.draft);
    assert.deepEqual(result.history, []);
    if (!state.draft.includes('ml')) assert.equal(result.consent.approved, false);
  }
});

test('review is a separate snapshot; changes and closing invalidate it and require another review', () => {
  const base = act(createState(), { type: 'ADD', id: 'agri' });
  const reviewed = act(base, { type: 'REVIEW' });
  assert.deepEqual(reviewed.review, base.draft);
  assert.notEqual(reviewed.review, reviewed.draft);
  for (const action of [{ type: 'ADD', id: 'stats' }, { type: 'DROP', id: 'agri' }, { type: 'CANCEL_PROCEDURE' }]) {
    const changed = act(reviewed, action);
    assert.equal(changed.review, null);
    assert.equal(changed.pending, null);
    assert.equal(act(changed, { type: 'SUBMIT', receiptId: 'stale', expectedCourses: changed.draft }).submitted, null);
  }
  assert.equal(act(base, { type: 'SUBMIT', receiptId: 'unreviewed', expectedCourses: base.draft }).submitted, null);
});

test('a stale review from another tab cannot submit a newer reviewed plan', () => {
  const reviewA = act(act(createState(), { type: 'ADD', id: 'agri' }), { type: 'REVIEW' });
  const expectedA = [...reviewA.review];
  assert.equal(totalCredits(expectedA), 3);
  const reviewB = run(reviewA, [{ type: 'ADD', id: 'stats' }, { type: 'REVIEW' }]);
  const expectedB = [...reviewB.review];
  assert.equal(totalCredits(expectedB), 5);

  const blocked = act(reviewB, { type: 'SUBMIT', receiptId: 'stale-tab', expectedCourses: expectedA });
  assert.equal(blocked.submitted, null);
  assert.equal(blocked.editing, true);
  assert.deepEqual(blocked.draft, expectedB);
  assert.deepEqual(blocked.history, []);
  assert.deepEqual(blocked.events, reviewB.events);
  assert.ok(blocked.notice);

  const submitted = act(blocked, { type: 'SUBMIT', receiptId: 'current-tab', expectedCourses: expectedB, at: 100 });
  assert.equal(submitted.editing, false);
  assert.deepEqual(submitted.submitted, {
    id: 'current-tab', at: 100, courses: expectedB, credits: 5, revision: 1,
  });
});

test('a reviewed plan cannot be submitted without expectedCourses', () => {
  const reviewed = act(act(createState(), { type: 'ADD', id: 'agri' }), { type: 'REVIEW' });
  const blocked = act(reviewed, { type: 'SUBMIT', receiptId: 'missing-snapshot' });
  assert.equal(blocked.submitted, null);
  assert.equal(blocked.editing, true);
  assert.deepEqual(blocked.draft, reviewed.draft);
  assert.deepEqual(blocked.history, []);
  assert.deepEqual(blocked.events, reviewed.events);
  assert.ok(blocked.notice);
});

test('submission requires a receipt ID and repeated submit is idempotent', () => {
  const reviewed = act(act(createState(), { type: 'ADD', id: 'agri' }), { type: 'REVIEW' });
  for (const receiptId of [undefined, '', '   ', 123]) {
    assert.throws(() => transition(reviewed, { type: 'SUBMIT', receiptId, expectedCourses: reviewed.draft }), TypeError);
  }
  const submitted = act(reviewed, { type: 'SUBMIT', receiptId: 'first', at: 101, expectedCourses: reviewed.draft });
  const repeated = act(submitted, { type: 'SUBMIT', receiptId: 'second', at: 999 });
  assert.deepEqual(repeated.submitted, submitted.submitted);
  assert.deepEqual(repeated.history, []);
  assert.deepEqual(repeated.events, submitted.events);
  assert.equal(repeated.editing, false);
  for (const action of [{ type: 'ADD', id: 'stats' }, { type: 'DROP', id: 'agri' }, { type: 'REVIEW' }]) {
    const blocked = act(submitted, action);
    assert.deepEqual(blocked.draft, submitted.draft);
    assert.deepEqual(blocked.submitted, submitted.submitted);
    assert.equal(blocked.pending, null);
  }
});

test('EDIT preserves submitted snapshots; later revisions append exactly the prior receipts to history', () => {
  const first = submit(act(createState(), { type: 'ADD', id: 'agri' }), 'first', 100);
  const firstReceipt = structuredClone(first.submitted);
  let editing = act(first, { type: 'EDIT', at: 110 });
  assert.equal(editing.editing, true);
  assert.deepEqual(editing.history, []);
  const redundantEdit = act(editing, { type: 'EDIT' });
  assert.deepEqual(redundantEdit.events, editing.events);
  editing = act(redundantEdit, { type: 'ADD', id: 'stats' });
  assert.deepEqual(editing.submitted, firstReceipt);
  const second = submit(editing, 'second', 200);
  assert.deepEqual(second.history, [firstReceipt]);
  assert.deepEqual(second.submitted, { id: 'second', at: 200, courses: ['agri', 'stats'], credits: 5, revision: 2 });
  const secondReceipt = structuredClone(second.submitted);
  const third = submit(run(second, [{ type: 'EDIT' }, { type: 'DROP', id: 'agri' }, { type: 'ADD', id: 'expert' }]), 'third', 300);
  assert.deepEqual(third.history, [firstReceipt, secondReceipt]);
  assert.equal(third.submitted.revision, 3);
  assert.deepEqual(third.submitted.courses, ['stats', 'expert']);
  assert.deepEqual(first.submitted, firstReceipt);
  assert.deepEqual(second.submitted, secondReceipt);
  assert.notEqual(third.history[0].courses, first.submitted.courses);
  const mutable = restoreState(third);
  mutable.draft.pop();
  mutable.history[0].courses.push('music');
  mutable.submitted.courses.pop();
  assert.deepEqual(third.history, [firstReceipt, secondReceipt]);
  assert.deepEqual(third.draft, ['stats', 'expert']);
  assert.deepEqual(third.submitted.courses, ['stats', 'expert']);
});

test('notice dismissal and irrelevant EDIT/withdrawal actions leave an empty plan intact', () => {
  let state = act(createState(), { type: 'ADD', id: 'missing' });
  assert.ok(state.notice);
  state = act(state, { type: 'DISMISS_NOTICE' });
  assert.equal(state.notice, '');
  for (const action of [{ type: 'EDIT' }, { type: 'WITHDRAW_ACK', checked: true }, { type: 'WITHDRAW_CONFIRM', holdMs: 2000 }, { type: 'CANCEL_PROCEDURE' }]) {
    state = act(state, action);
    assert.deepEqual(state.draft, []);
    assert.equal(state.submitted, null);
  }
});

test('invalid actions and timestamps throw without modifying the input state', () => {
  const state = freezeDeep(createState());
  const before = structuredClone(state);
  for (const action of [null, [], {}, { type: 3 }, { type: 'UNKNOWN' },
    ...[-1, 0.5, NaN, Infinity, '10', Number.MAX_SAFE_INTEGER + 1].map((at) => ({ type: 'ADD', id: 'stats', at }))]) {
    assert.throws(() => transition(state, action), TypeError);
    assert.deepEqual(state, before);
  }
});

test('restore rejects malformed shapes and impossible consent, guarantee, review and draft states', () => {
  const invalid = [null, [], {}, { ...createState(), version: 1 }];
  const cases = [
    (s) => { s.draft = ['unknown']; s.origins = { unknown: 'student' }; },
    (s) => { s.draft = ['stats', 'stats']; s.origins = { stats: 'student' }; },
    (s) => { s.origins.stats = 'student'; },
    (s) => { s.draft = ['stats']; },
    (s) => { s.draft = ['stats']; s.origins = { stats: 'guarantee' }; },
    (s) => { s.editing = 'true'; },
    (s) => { s.notice = null; },
    (s) => { s.consent.read = 1; },
    (s) => { s.consent.reason = 'unknown'; },
    (s) => { s.consent.reason = REASONS[0]; },
    (s) => { s.consent.attempts = -1; },
    (s) => { s.consent.passed = true; },
    (s) => { s.consent.approved = true; },
    (s) => { s.draft = ['ml']; s.origins = { ml: 'student' }; },
    (s) => { s.guarantee.removed = true; },
    (s) => { s.draft = ['agri']; s.origins = { agri: 'guarantee' }; },
    (s) => { s.pending = 'unknown'; },
    (s) => { s.pending = 'withdrawal'; },
    (s) => { s.withdrawalAck = 'yes'; },
    (s) => { s.pending = 'review'; },
    (s) => { s.review = []; },
    (s) => { s.editing = false; },
    (s) => { s.history = {}; },
    (s) => { s.events = [{ type: 'add', at: -1, label: 'invalid' }]; },
    (s) => { s.events = [{ type: 'add', at: 0 }]; },
    (s) => { s.draft = ['agri', 'robotics', 'stats', 'expert', 'ethics', 'music']; s.origins = Object.fromEntries(s.draft.map((id) => [id, 'student'])); },
  ];
  for (const mutate of cases) {
    const state = createState();
    mutate(state);
    invalid.push(state);
  }
  const conflicting = qualified();
  conflicting.draft.push('visualization');
  conflicting.origins.visualization = 'student';
  invalid.push(conflicting);
  const removed = qualified();
  removed.guarantee.removed = true;
  invalid.push(removed);
  const unallocated = qualified();
  unallocated.guarantee.ever = false;
  invalid.push(unallocated);
  const staleReview = act(act(createState(), { type: 'ADD', id: 'agri' }), { type: 'REVIEW' });
  staleReview.review = ['stats'];
  invalid.push(staleReview);
  for (const state of invalid) {
    assert.throws(() => restoreState(state), TypeError);
    assert.throws(() => transition(state, { type: 'DISMISS_NOTICE' }), TypeError);
  }
});

test('restore rejects invalid receipt snapshots and mismatched submitted revisions', () => {
  const valid = submit(act(createState(), { type: 'ADD', id: 'agri' }));
  for (const mutate of [
    (s) => { s.submitted.id = ''; },
    (s) => { s.submitted.at = -1; },
    (s) => { s.submitted.courses = ['unknown']; },
    (s) => { s.submitted.courses = []; },
    (s) => { s.submitted.courses = ['agri', 'agri']; },
    (s) => { s.submitted.credits = 99; },
    (s) => { s.submitted.revision = 0; },
    (s) => { s.submitted.revision = 2; },
    (s) => { s.draft = ['robotics']; s.origins = { robotics: 'student' }; },
    (s) => { s.history = [{ ...s.submitted, courses: ['music'], credits: 1 }]; },
    (s) => { s.history = [{ ...s.submitted, courses: ['ml', 'visualization'], credits: 5 }]; },
  ]) {
    const state = structuredClone(valid);
    mutate(state);
    assert.throws(() => restoreState(state), TypeError);
  }
});

test('restore rejects a history whose revisions cannot have been produced by successive submissions', () => {
  const first = submit(act(createState(), { type: 'ADD', id: 'agri' }), 'first', 100);
  const second = submit(act(first, { type: 'EDIT' }), 'second', 200);
  const corrupt = structuredClone(second);
  corrupt.history[0].revision = 99;
  assert.throws(() => restoreState(corrupt), TypeError, 'history must begin at revision 1, not 99');
});
