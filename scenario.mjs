export const SCENARIO_DURATION = 15000;
export const COUNTDOWN_DURATION = 4000;
export const INTEREST_COURSE = {
  id: 'visualization',
  name: '信息可视化设计',
  enrolledBefore: 46,
  capacity: 48,
};

export function createScenarioState() {
  return {
    stage: 'briefing',
    elapsed: 0,
    distracted: false,
    interestClaimed: false,
    outcome: null,
  };
}

export function scenarioSnapshot(state) {
  const safeElapsed = Math.max(0, Math.min(SCENARIO_DURATION, Number(state?.elapsed) || 0));
  const liveElapsed = Math.max(0, safeElapsed - COUNTDOWN_DURATION);
  const filled = Math.min(INTEREST_COURSE.capacity, INTEREST_COURSE.enrolledBefore + Math.floor(liveElapsed / 1800));
  const full = filled >= INTEREST_COURSE.capacity;
  const stage = state?.stage === 'briefing' ? 'briefing' : safeElapsed < COUNTDOWN_DURATION ? 'countdown' : safeElapsed < SCENARIO_DURATION ? 'live' : 'finished';
  return { ...state, elapsed: safeElapsed, stage, filled, full };
}

export function scenarioTransition(state, action) {
  const next = { ...createScenarioState(), ...state };
  if (!action || typeof action.type !== 'string') throw new TypeError('Invalid scenario action');
  if (action.type === 'START') return { ...next, stage: 'countdown', elapsed: 0, outcome: null };
  if (action.type === 'TICK') return scenarioSnapshot({ ...next, elapsed: action.elapsed });
  if (action.type === 'DISTRACT') {
    const elapsed = Math.max(next.elapsed, COUNTDOWN_DURATION + 9000);
    return scenarioSnapshot({ ...next, elapsed, distracted: true });
  }
  if (action.type === 'CLAIM') {
    const snapshot = scenarioSnapshot(next);
    if (snapshot.stage !== 'live' || snapshot.full) return { ...snapshot, outcome: 'missed' };
    return { ...snapshot, interestClaimed: true, outcome: 'claimed' };
  }
  if (action.type === 'RESET') return createScenarioState();
  throw new TypeError(`Unknown scenario action: ${action.type}`);
}
