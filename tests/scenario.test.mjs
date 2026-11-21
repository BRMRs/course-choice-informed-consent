import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTDOWN_DURATION, INTEREST_COURSE, SCENARIO_DURATION, createScenarioState, scenarioSnapshot, scenarioTransition } from '../scenario.mjs';

test('scenario starts independently and reaches the 8:00 live phase', () => {
  const started = scenarioTransition(createScenarioState(), { type: 'START' });
  assert.equal(started.stage, 'countdown');
  assert.equal(scenarioSnapshot({ ...started, elapsed: COUNTDOWN_DURATION - 1 }).stage, 'countdown');
  const live = scenarioSnapshot({ ...started, elapsed: COUNTDOWN_DURATION });
  assert.equal(live.stage, 'live');
  assert.equal(live.filled, INTEREST_COURSE.enrolledBefore);
});

test('handling the recommendation interruption advances the clock and fills the secondary interest course', () => {
  const started = scenarioTransition(createScenarioState(), { type: 'START' });
  const live = scenarioTransition(started, { type: 'TICK', elapsed: COUNTDOWN_DURATION + 1000 });
  const distracted = scenarioTransition(live, { type: 'DISTRACT' });
  assert.equal(distracted.distracted, true);
  assert.equal(distracted.full, true);
  assert.equal(distracted.filled, INTEREST_COURSE.capacity);
});

test('a fast claim can succeed, while claiming after sellout records a miss', () => {
  const started = scenarioTransition(createScenarioState(), { type: 'START' });
  const live = scenarioTransition(started, { type: 'TICK', elapsed: COUNTDOWN_DURATION + 1000 });
  assert.equal(scenarioTransition(live, { type: 'CLAIM' }).outcome, 'claimed');
  const late = scenarioTransition(started, { type: 'TICK', elapsed: SCENARIO_DURATION });
  assert.equal(scenarioTransition(late, { type: 'CLAIM' }).outcome, 'missed');
});
