import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChoiceAudit, RECOMMENDED_PLAN_BASELINE } from '../insights.mjs';
import { createState } from '../state.mjs';

test('keeps the audit hidden until a machine-learning-only result is submitted', () => {
  const blank = createState();
  assert.equal(buildChoiceAudit(blank).visible, false);

  const mixed = createState();
  mixed.submitted = { courses: ['ml', 'agri'] };
  assert.equal(buildChoiceAudit(mixed).visible, false);

  const target = createState();
  target.submitted = { courses: ['ml'] };
  assert.equal(buildChoiceAudit(target).visible, true);
});

test('derives refusal costs and institutional phases from persisted business facts', () => {
  const state = createState();
  state.submitted = { courses: ['ml'] };
  state.consent.appeal = '我已了解课程内容，仍坚持按照个人学习方向选择本轮课程。';
  state.consent.attempts = 2;
  state.withdrawal.requested = true;
  state.guarantee.removed = true;
  state.filing.declarations = [true, true, true];
  state.events = [
    { type: 'procedure' }, { type: 'reason' }, { type: 'objection' }, { type: 'appeal' }, { type: 'refusal' },
    { type: 'add' }, { type: 'guarantee' }, { type: 'withdrawal-permit' }, { type: 'withdrawal' },
    { type: 'filing-required' }, { type: 'filing' }, { type: 'submit' },
  ];

  const audit = buildChoiceAudit(state);
  assert.equal(audit.visible, true);
  assert.equal(audit.actualRecords, 12);
  assert.equal(audit.baselineRecords, RECOMMENDED_PLAN_BASELINE);
  assert.equal(audit.additionalRecords, 10);
  assert.equal(audit.appealCharacters, 27);
  assert.equal(audit.quizAttempts, 2);
  assert.equal(audit.withdrawalStages, 2);
  assert.equal(audit.filingDeclarations, 3);
  assert.deepEqual(audit.phases.map((phase) => phase.records), [5, 1, 2, 2]);
});

test('handles partial or malformed optional facts without inventing costs', () => {
  const audit = buildChoiceAudit({ submitted: { courses: ['ml'] }, events: [{ type: 'add' }] });
  assert.equal(audit.actualRecords, 1);
  assert.equal(audit.additionalRecords, 0);
  assert.deepEqual(
    [audit.appealCharacters, audit.quizAttempts, audit.withdrawalStages, audit.filingDeclarations],
    [0, 0, 0, 0],
  );
});
