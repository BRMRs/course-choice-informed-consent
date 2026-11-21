import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSES, getCourse, filterCourses, totalCredits } from '../catalog.mjs';
import {
  MIN_CREDITS, MAX_CREDITS, REASONS, OBJECTIONS, APPEAL_MIN, appealLength, WITHDRAW_REASONS, FILING_STATEMENT,
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

const appeal = '我已认真核对个人培养计划并了解推荐课程内容，仍决定按照个人学习方向选择本轮课程。';
const appealActions = [
  { type: 'CONSENT_OPEN_APPEAL' },
  { type: 'CONSENT_APPEAL', text: appeal, acknowledged: true },
];
const permit = {
  type: 'WITHDRAW_REQUEST', reason: WITHDRAW_REASONS[0],
  courseCode: getCourse('agri').code, benefits: true, personal: true, at: 15,
};

function qualified(state = createState()) {
  return run(state, [
    { type: 'ADD', id: 'ml' }, { type: 'CONSENT_READ' },
    { type: 'CONSENT_REASON', reason: REASONS[0] }, ...appealActions,
    { type: 'CONSENT_ANSWER', answer: 'environment' },
    { type: 'CONSENT_CONFIRM', at: 10 },
  ]);
}

function withdraw(state) {
  return run(state, [
    { type: 'DROP', id: 'agri' }, permit,
    { type: 'DROP', id: 'agri' }, { type: 'WITHDRAW_ACK', checked: true },
    { type: 'WITHDRAW_CONFIRM', holdMs: 2000, at: 20 },
  ]);
}

function beginFiling(state = withdraw(qualified())) {
  const reviewed = act(state, { type: 'REVIEW' });
  return act(reviewed, { type: 'SUBMIT', receiptId: 'deferred', expectedCourses: reviewed.draft });
}

function completeFiling(state, at = 90) {
  return run(state, [
    { type: 'FILING_DECLARE', confirmations: [true, true, true] },
    { type: 'FILING_STATEMENT', text: FILING_STATEMENT, at },
  ]);
}

function submit(state, receiptId = 'receipt-1', at = 100) {
  let next = run(state, [{ type: 'REVIEW' }, { type: 'SUBMIT', receiptId, at, expectedCourses: state.draft }]);
  if (next.pending === 'filing') {
    next = act(completeFiling(next, at - 1), { type: 'FILING_RETURN' });
    next = act(next, { type: 'SUBMIT', receiptId, at, expectedCourses: next.draft });
  }
  assert.equal(next.editing, false, 'legal submission path must terminate');
  assert.ok(next.submitted);
  return next;
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
  for (const course of COURSES.filter((course) => course.id !== 'ml' && !course.eligibleFrom && course.enrolled < course.capacity)) {
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

test('visualization remains selectable alongside ML after the timetable fix', () => {
  const ordinary = act(createState(), { type: 'ADD', id: 'visualization' });
  const blockedMl = act(ordinary, { type: 'ADD', id: 'ml' });
  assert.deepEqual(blockedMl.draft, ['visualization']);
  assert.equal(blockedMl.pending, 'consent');
  const approved = qualified();
  const blockedOrdinary = act(approved, { type: 'ADD', id: 'visualization' });
  assert.deepEqual(blockedOrdinary.draft, [...approved.draft, 'visualization']);
});

test('coordinated consent is a real shorter path that preserves the guarantee', () => {
  const pending = act(createState(), { type: 'ADD', id: 'ml' });
  const coordinated = act(pending, { type: 'CONSENT_COORDINATE' });
  assert.equal(coordinated.pending, null);
  assert.equal(coordinated.consent.approved, true);
  assert.deepEqual(coordinated.draft, ['ml', 'agri']);
  assert.equal(coordinated.origins.agri, 'guarantee');
  assert.ok(coordinated.events.some(event => event.type === 'coordination'));
});

test('first-year students can stage an upper-year course but submission rejects it', () => {
  const staged = act(act(createState(), { type: 'ADD', id: 'ecology' }), { type: 'ADD', id: 'writing' });
  assert.deepEqual(staged.draft, ['ecology', 'writing']);
  const reviewed = act(staged, { type: 'REVIEW' });
  assert.equal(reviewed.pending, 'review');
  const rejected = act(reviewed, { type: 'SUBMIT', expectedCourses: ['ecology', 'writing'], receiptId: 'XK-TEST' });
  assert.equal(rejected.editing, true);
  assert.equal(rejected.submitted, null);
  assert.match(rejected.notice, /不适用于大一/);
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
    { type: 'CONSENT_REASON', reason: REASONS[1] }, ...appealActions,
    { type: 'CONSENT_ANSWER', answer: 'wrong' },
    { type: 'CANCEL_PROCEDURE' },
  ]);
  assert.equal(state.pending, null);
  assert.equal(state.consent.reason, REASONS[1]);
  assert.equal(state.consent.appeal, appeal);
  assert.equal(state.consent.appealFiled, true);
  assert.equal(state.consent.attempts, 1);
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
  state = run(state, [{ type: 'CONSENT_REASON', reason: REASONS[2] }, ...appealActions]);
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

test('preselected agriculture becomes a guarantee when ML is confirmed and cannot be directly dropped', () => {
  const state = qualified(act(createState(), { type: 'ADD', id: 'agri' }));
  assert.deepEqual(state.draft, ['agri', 'ml']);
  assert.equal(state.origins.agri, 'guarantee');
  assert.equal(state.guarantee.ever, true);
  assert.equal(state.events.filter(e => e.type === 'guarantee').length, 1);
  const dropped = act(state, { type: 'DROP', id: 'agri' });
  assert.deepEqual(dropped.draft, state.draft);
  assert.equal(dropped.pending, 'withdrawal');
  assert.deepEqual(withdraw(state).draft, ['ml']);
});

test('first ML selection reserves guarantee credits and cannot bypass allocation by filling the credit limit', () => {
  let state = run(createState(), ['robotics', 'stats', 'expert', 'ethics'].map(id => ({ type: 'ADD', id })));
  const blocked = act(state, { type: 'ADD', id: 'ml' });
  assert.equal(totalCredits(state.draft) + getCourse('ml').credits, MAX_CREDITS);
  assert.deepEqual(blocked.draft, state.draft);
  assert.equal(blocked.pending, null);
  assert.deepEqual(blocked.guarantee, { ever: false, removed: false });
  assert.match(blocked.notice, /预留/);
  state = act(state, { type: 'DROP', id: 'robotics' });
  state = qualified(state);
  assert.equal(totalCredits(state.draft), MAX_CREDITS);
  assert.equal(state.origins.agri, 'guarantee');
  assert.deepEqual(state.guarantee, { ever: true, removed: false });
});

test('withdrawal requires explicit acknowledgement and a finite hold of at least 2000ms', () => {
  const ready = run(qualified(), [{ type: 'DROP', id: 'agri' }, permit, { type: 'DROP', id: 'agri' }]);
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
    assert.deepEqual(result.submitted, { id: 'receipt-1', at: 100, courses: state.draft, credits: totalCredits(state.draft), revision: 1, filingId: result.filing.number });
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
    id: 'current-tab', at: 100, courses: expectedB, credits: 5, revision: 1, filingId: null,
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
  assert.deepEqual(second.submitted, { id: 'second', at: 200, courses: ['agri', 'stats'], credits: 5, revision: 2, filingId: null });
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

for (const reason of REASONS) {
  test(`every refusal branch objects and requires appeal: ${reason}`, () => {
    let state = run(createState(), [
      { type: 'ADD', id: 'ml' }, { type: 'CONSENT_READ' }, { type: 'CONSENT_REASON', reason },
    ]);
    assert.equal(typeof OBJECTIONS[reason], 'string');
    assert.ok(OBJECTIONS[reason].length > 20);
    assert.equal(new Set(Object.values(OBJECTIONS)).size, REASONS.length);
    state = act(state, { type: 'CONSENT_ANSWER', answer: 'environment' });
    assert.equal(state.consent.attempts, 0);
    assert.equal(state.consent.passed, false);
    state = act(state, { type: 'CONSENT_CONFIRM' });
    assert.deepEqual(state.draft, []);
    state = act(state, { type: 'CONSENT_OPEN_APPEAL' });
    assert.equal(state.consent.appealOpen, true);
    assert.match(state.events.at(-1).label, new RegExp(reason));
    assert.equal(state.events.at(-1).type, 'objection');
    state = run(state, [appealActions[1], { type: 'CONSENT_ANSWER', answer: 'environment' }]);
    assert.equal(state.consent.passed, true);
    assert.equal(state.consent.approved, false);
    assert.deepEqual(state.draft, []);
    state = act(state, { type: 'CONSENT_CONFIRM' });
    assert.deepEqual(state.draft, ['ml', 'agri']);
    assert.equal(state.consent.reason, reason);
    assert.equal(state.consent.appeal, appeal);
    assert.equal(state.origins.agri, 'guarantee');
  });
}

test('appeal needs opening, thirty non-whitespace characters and strict acknowledgement', () => {
  let state = run(createState(), [
    { type: 'ADD', id: 'ml' }, { type: 'CONSENT_READ' }, { type: 'CONSENT_REASON', reason: REASONS[0] },
  ]);
  assert.equal(act(state, appealActions[1]).consent.appealFiled, false);
  state = act(state, { type: 'CONSENT_OPEN_APPEAL' });
  assert.equal(APPEAL_MIN, 30);
  assert.equal(appealLength(' 甲\t乙\n😀　'), 3);
  for (const action of [
    { text: '字'.repeat(29), acknowledged: true },
    { text: ` ${'字 \n\t'.repeat(29)} `, acknowledged: true },
    { text: ' '.repeat(100), acknowledged: true },
    { text: 123, acknowledged: true },
    ...[false, undefined, 'true', 1].map(acknowledged => ({ text: appeal, acknowledged })),
  ]) {
    const blocked = act(state, { type: 'CONSENT_APPEAL', ...action });
    assert.equal(blocked.consent.appealFiled, false);
    assert.equal(act(blocked, { type: 'CONSENT_ANSWER', answer: 'environment' }).consent.attempts, 0);
  }
  const accepted = act(state, { type: 'CONSENT_APPEAL', text: ` ${'😀'.repeat(30)} `, acknowledged: true });
  assert.equal(accepted.consent.appealFiled, true);
  assert.equal(appealLength(accepted.consent.appeal), 30);
});

test('changing a refusal restarts the objection branch and cannot erase an already filed statement', () => {
  let state = run(createState(), [
    { type: 'ADD', id: 'ml' }, { type: 'CONSENT_READ' },
    { type: 'CONSENT_REASON', reason: REASONS[0] }, { type: 'CONSENT_OPEN_APPEAL' },
    { type: 'CONSENT_CHANGE_REASON' },
  ]);
  assert.equal(state.consent.reason, '');
  assert.equal(state.consent.appealOpen, false);
  assert.equal(act(state, appealActions[1]).consent.appealFiled, false);
  state = run(state, [{ type: 'CONSENT_REASON', reason: REASONS[1] }, ...appealActions]);
  assert.deepEqual(act(state, { type: 'CONSENT_CHANGE_REASON' }).consent, state.consent);
});

test('filling credits during consent prevents entry and freeing credits allows reopening and confirmation', () => {
  let state = run(createState(), [
    { type: 'ADD', id: 'ml' }, { type: 'CONSENT_READ' },
    { type: 'CONSENT_REASON', reason: REASONS[0] }, ...appealActions,
    { type: 'CONSENT_ANSWER', answer: 'environment' },
    { type: 'ADD', id: 'robotics' }, { type: 'ADD', id: 'stats' },
    { type: 'ADD', id: 'expert' }, { type: 'ADD', id: 'ethics' },
    { type: 'ADD', id: 'ml' }, { type: 'CONSENT_CONFIRM' },
  ]);
  assert.ok(!state.draft.includes('ml'));
  assert.ok(!state.guarantee.ever);
  state = act(state, { type: 'DROP', id: 'robotics' });
  state = act(state, { type: 'ADD', id: 'ml' });
  assert.equal(state.pending, 'consent');
  assert.equal(state.consent.passed, true);
  assert.ok(!state.draft.includes('ml'));
  state = act(state, { type: 'CONSENT_CONFIRM' });
  assert.ok(state.draft.includes('ml'));
  assert.equal(state.origins.agri, 'guarantee');
});

test('withdrawal request validates every field and strict confirmations independently', () => {
  const ready = act(qualified(), { type: 'DROP', id: 'agri' });
  for (const patch of [
    { reason: undefined }, { reason: 'arbitrary' }, { courseCode: '' }, { courseCode: 'CS3102' },
    { benefits: false }, { benefits: 'true' }, { personal: false }, { personal: 1 },
  ]) {
    const blocked = act(ready, { ...permit, ...patch });
    assert.equal(blocked.withdrawal.requested, false);
    assert.deepEqual(blocked.draft, ready.draft);
    assert.equal(blocked.pending, 'withdrawal');
    assert.ok(blocked.notice);
  }
  for (const reason of WITHDRAW_REASONS) {
    const accepted = act(ready, { ...permit, reason, courseCode: ` ${getCourse('agri').code.toLowerCase()} ` });
    assert.equal(accepted.withdrawal.requested, true);
    assert.equal(accepted.withdrawal.reason, reason);
    assert.equal(accepted.withdrawal.courseCode, getCourse('agri').code);
  }
});

test('withdrawal permission closes the application without removing a course or claiming execution', () => {
  const ready = act(qualified(), { type: 'DROP', id: 'agri' });
  const permitted = act(ready, permit);
  assert.equal(permitted.withdrawal.number, 'CX-15');
  assert.equal(permitted.pending, null);
  assert.deepEqual(permitted.draft, ['ml', 'agri']);
  assert.equal(permitted.guarantee.removed, false);
  assert.equal(permitted.events.at(-1).type, 'withdrawal-permit');
  assert.equal(permitted.events.filter(e => e.type === 'withdrawal').length, 0);
  assert.match(permitted.notice, /仍在/);
  const blocked = run(permitted, [{ type: 'WITHDRAW_ACK', checked: true }, { type: 'WITHDRAW_CONFIRM', holdMs: 2000 }]);
  assert.deepEqual(blocked.draft, permitted.draft);
  const reopened = run(restoreState(JSON.parse(JSON.stringify(permitted))), [
    { type: 'DROP', id: 'agri' }, { type: 'WITHDRAW_ACK', checked: true },
    { type: 'WITHDRAW_CONFIRM', holdMs: 2000 },
  ]);
  assert.deepEqual(reopened.draft, ['ml']);
  assert.equal(reopened.events.filter(e => e.type === 'withdrawal').length, 1);
});

test('acknowledgement and long hold cannot execute a withdrawal without permission', () => {
  const ready = run(qualified(), [{ type: 'DROP', id: 'agri' }, { type: 'WITHDRAW_ACK', checked: true }]);
  const blocked = act(ready, { type: 'WITHDRAW_CONFIRM', holdMs: 10000 });
  assert.equal(blocked.withdrawal.requested, false);
  assert.deepEqual(blocked.draft, ['ml', 'agri']);
  assert.equal(blocked.guarantee.removed, false);
});

test('first submission of a valid ML-only plan opens filing without a receipt or submission event', () => {
  const state = withdraw(qualified());
  assert.equal(planSummary(state).valid, true);
  const filing = beginFiling(state);
  assert.equal(filing.pending, 'filing');
  assert.equal(filing.review, null);
  assert.equal(filing.editing, true);
  assert.equal(filing.submitted, null);
  assert.deepEqual(filing.history, []);
  assert.deepEqual(filing.filing.courses, ['ml']);
  assert.equal(filing.filing.completed, false);
  assert.equal(filing.filing.number, null);
  assert.equal(filing.events.at(-1).type, 'filing-required');
  assert.equal(filing.events.filter(e => e.type === 'submit').length, 0);
});

test('filing declarations require exactly three boolean true values', () => {
  const filing = beginFiling();
  for (const confirmations of [undefined, true, [], [true, true], [true, true, true, true], [true, false, true], [true, true, 1], ['true', true, true]]) {
    const blocked = act(filing, { type: 'FILING_DECLARE', confirmations });
    assert.equal(blocked.filing.stage, 0);
    assert.deepEqual(blocked.filing.declarations, [false, false, false]);
    assert.equal(blocked.submitted, null);
  }
  const accepted = act(filing, { type: 'FILING_DECLARE', confirmations: [true, true, true] });
  assert.equal(accepted.filing.stage, 1);
  assert.deepEqual(accepted.filing.declarations, [true, true, true]);
  assert.equal(accepted.filing.completed, false);
});

test('filing statement requires the exact phrase after declarations and only issues a filing ID', () => {
  const initial = beginFiling();
  assert.equal(act(initial, { type: 'FILING_STATEMENT', text: FILING_STATEMENT }).filing.completed, false);
  const declared = act(initial, { type: 'FILING_DECLARE', confirmations: [true, true, true] });
  assert.equal(FILING_STATEMENT, '我仍坚持当前选课方案');
  for (const text of [undefined, 123, '', '我坚持当前选课方案', `${FILING_STATEMENT}。`, '我仍坚持 当前选课方案']) {
    assert.equal(act(declared, { type: 'FILING_STATEMENT', text }).filing.completed, false);
  }
  const complete = act(declared, { type: 'FILING_STATEMENT', text: ` ${FILING_STATEMENT}\n`, at: 88 });
  assert.equal(complete.filing.number, 'BA-88');
  assert.equal(complete.filing.stage, 2);
  assert.equal(complete.pending, 'filing');
  assert.equal(complete.submitted, null);
  assert.equal(complete.editing, true);
  assert.equal(complete.events.at(-1).type, 'filing');
});

test('filing cannot skip return or final submission; its finite exit yields only ML and a filing-linked receipt', () => {
  const filing = beginFiling();
  assert.equal(act(filing, { type: 'FILING_RETURN' }).pending, 'filing');
  const completed = completeFiling(filing);
  const premature = act(completed, { type: 'SUBMIT', receiptId: 'too-early', expectedCourses: completed.draft });
  assert.equal(premature.submitted, null);
  const returned = act(premature, { type: 'FILING_RETURN' });
  assert.equal(returned.pending, 'review');
  assert.deepEqual(returned.review, ['ml']);
  assert.equal(returned.submitted, null);
  const final = act(returned, { type: 'SUBMIT', receiptId: 'final', at: 100, expectedCourses: ['ml'] });
  assert.deepEqual(final.submitted, { id: 'final', at: 100, courses: ['ml'], credits: 3, revision: 1, filingId: 'BA-90' });
  assert.equal(final.editing, false);
  assert.equal(final.events.filter(e => e.type === 'filing-required').length, 1);
  assert.equal(final.events.filter(e => e.type === 'submit').length, 1);
});

test('closing and refreshing incomplete filing preserves declarations and resumes at the same stage', () => {
  const declared = act(beginFiling(), { type: 'FILING_DECLARE', confirmations: [true, true, true] });
  const closed = act(declared, { type: 'CANCEL_PROCEDURE' });
  assert.equal(closed.pending, null);
  assert.equal(act(closed, { type: 'FILING_STATEMENT', text: FILING_STATEMENT }).filing.completed, false);
  const reopened = beginFiling(restoreState(JSON.parse(JSON.stringify(closed))));
  assert.deepEqual(reopened.filing, declared.filing);
  const completed = act(reopened, { type: 'FILING_STATEMENT', text: FILING_STATEMENT, at: 91 });
  assert.equal(submit(act(completed, { type: 'CANCEL_PROCEDURE' })).submitted.filingId, 'BA-91');
});

test('closing completed filing and reviewing again does not demand another filing', () => {
  const complete = completeFiling(beginFiling());
  const closed = act(complete, { type: 'CANCEL_PROCEDURE' });
  const result = submit(restoreState(JSON.parse(JSON.stringify(closed))));
  assert.equal(result.submitted.filingId, complete.filing.number);
  assert.equal(result.events.filter(e => e.type === 'filing-required').length, 1);
});

test('adding or dropping courses invalidates filing even when the original plan is later restored', () => {
  const complete = act(completeFiling(beginFiling()), { type: 'FILING_RETURN' });
  for (const action of [{ type: 'ADD', id: 'stats' }, { type: 'DROP', id: 'ml' }]) {
    const changed = act(complete, action);
    assert.equal(changed.filing.completed, false);
    assert.equal(changed.filing.number, null);
    assert.equal(changed.filing.courses, null);
    assert.equal(changed.pending, null);
    assert.equal(changed.review, null);
  }
  const reverted = run(complete, [{ type: 'ADD', id: 'stats' }, { type: 'DROP', id: 'stats' }]);
  const required = beginFiling(reverted);
  assert.equal(required.pending, 'filing');
  assert.equal(required.filing.completed, false);
  assert.equal(required.events.filter(e => e.type === 'filing-required').length, 2);
});

test('old expectedCourses cannot trigger filing or submit a changed filed plan', () => {
  const old = act(withdraw(qualified()), { type: 'REVIEW' });
  const changed = run(old, [{ type: 'ADD', id: 'stats' }, { type: 'REVIEW' }]);
  const blocked = act(changed, { type: 'SUBMIT', receiptId: 'stale', expectedCourses: old.review });
  assert.equal(blocked.pending, 'review');
  assert.equal(blocked.filing.courses, null);
  assert.deepEqual(blocked.events, changed.events);
  const filing = act(blocked, { type: 'SUBMIT', receiptId: 'current', expectedCourses: changed.review });
  const returned = act(completeFiling(filing), { type: 'FILING_RETURN' });
  const stale = act(returned, { type: 'SUBMIT', receiptId: 'stale-again', expectedCourses: old.review });
  assert.equal(stale.submitted, null);
  assert.deepEqual(stale.events, returned.events);
  const final = act(stale, { type: 'SUBMIT', receiptId: 'valid', expectedCourses: returned.review });
  assert.deepEqual(final.submitted.courses, ['ml', 'stats']);
});

test('unchanged filed resubmission reuses filing while changed revisions preserve receipt history', () => {
  const first = submit(withdraw(qualified()), 'first', 100);
  const second = submit(act(first, { type: 'EDIT' }), 'second', 200);
  assert.equal(second.submitted.filingId, first.submitted.filingId);
  assert.deepEqual(second.history, [first.submitted]);
  assert.equal(second.events.filter(e => e.type === 'filing-required').length, 1);
  const editing = run(second, [{ type: 'EDIT' }, { type: 'ADD', id: 'stats' }]);
  const deferred = beginFiling(editing);
  assert.deepEqual(deferred.submitted, second.submitted);
  assert.deepEqual(deferred.history, [first.submitted]);
  const third = submit(deferred, 'third', 300);
  assert.deepEqual(third.history, [first.submitted, second.submitted]);
  assert.equal(third.submitted.revision, 3);
  assert.notEqual(third.submitted.filingId, first.submitted.filingId);
  assert.deepEqual(third.submitted.courses, ['ml', 'stats']);
});

test('separate new states replay all three procedures without overwriting a completed experience', () => {
  const saved = submit(withdraw(qualified()));
  const snapshot = JSON.stringify(saved);
  const fresh = createState();
  assert.equal(fresh.version, 3);
  assert.equal(fresh.consent.approved, false);
  assert.equal(fresh.withdrawal.requested, false);
  assert.equal(fresh.filing.completed, false);
  assert.equal(fresh.submitted, null);
  const next = beginFiling(withdraw(qualified(fresh)));
  assert.equal(next.pending, 'filing');
  assert.equal(next.submitted, null);
  assert.equal(JSON.stringify(saved), snapshot);
  assert.deepEqual(restoreState(JSON.parse(snapshot)), saved);
});

test('ordinary search and filters still return selectable matches without changing any plan', () => {
  const state = createState();
  for (const query of ['教育统计', 'EDU2106', '陈知远']) {
    assert.deepEqual(filterCourses({ query }).map(c => c.id), ['stats']);
  }
  const available = filterCourses({ department: '计算机学院', availableOnly: true, sort: 'code' });
  assert.deepEqual(available.map(c => c.id), ['ml']);
  assert.ok(filterCourses({ category: '通识选修' }).every(c => c.category === '通识选修'));
  assert.deepEqual(filterCourses({ query: 'not-a-course' }), []);
  assert.deepEqual(act(state, { type: 'ADD', id: filterCourses({ query: 'EDU2106' })[0].id }).draft, ['stats']);
  assert.deepEqual(state.draft, []);
});

test('restore rejects malformed v3 appeal, withdrawal and filing records', () => {
  const cases = [
    [createState(), s => { s.consent.appealOpen = true; }],
    [createState(), s => { s.consent.appeal = null; }],
    [qualified(), s => { s.consent.appealAcknowledged = false; }],
    [qualified(), s => { s.consent.appeal = '短'; }],
    [qualified(), s => { s.consent.appealFiled = false; }],
    [withdraw(qualified()), s => { s.withdrawal.courseCode = 'CS3102'; }],
    [withdraw(qualified()), s => { s.withdrawal.benefits = false; }],
    [withdraw(qualified()), s => { s.withdrawal.personal = false; }],
    [beginFiling(), s => { s.filing.declarations = [true, true]; }],
    [beginFiling(), s => { s.filing.stage = 1; }],
    [beginFiling(), s => { s.filing.courses = ['stats']; }],
    [completeFiling(beginFiling()), s => { s.filing.statement += '。'; }],
    [completeFiling(beginFiling()), s => { s.filing.number = ''; }],
    [completeFiling(beginFiling()), s => { s.filing.completed = false; }],
  ];
  for (const [base, mutate] of cases) {
    const corrupted = structuredClone(base);
    mutate(corrupted);
    assert.throws(() => restoreState(corrupted), TypeError);
    assert.throws(() => transition(corrupted, { type: 'DISMISS_NOTICE' }), TypeError);
  }
});
