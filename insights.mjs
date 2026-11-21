import { appealLength } from './state.mjs';

export const RECOMMENDED_PLAN_BASELINE = 2;

const PHASES = [
  {
    id: 'interpretation',
    label: '意见复核',
    description: '系统重新解释不接受推荐的理由，并要求补充申明与理解核验。',
    eventTypes: ['procedure', 'reason', 'objection', 'appeal', 'refusal'],
  },
  {
    id: 'override',
    label: '保障配置',
    description: '不接受推荐的意见已登记，推荐课程仍作为保障席位进入方案。',
    eventTypes: ['guarantee'],
  },
  {
    id: 'withdrawal',
    label: '席位撤销',
    description: '撤销需要分别完成申请核验与本人执行。',
    eventTypes: ['withdrawal-permit', 'withdrawal'],
  },
  {
    id: 'liability',
    label: '自主备案',
    description: '合规的个人方案在提交前还需完成备案并再次确认。',
    eventTypes: ['filing-required', 'filing'],
  },
];

/** Builds a result-only audit from persisted business facts, never from fixed demo copy. */
export function buildChoiceAudit(state) {
  const events = Array.isArray(state?.events) ? state.events : [];
  const courses = state?.submitted?.courses;
  const visible = Array.isArray(courses) && courses.length === 1 && courses[0] === 'ml';
  const actualRecords = events.length;
  const phases = PHASES.map((phase) => ({
    id: phase.id,
    label: phase.label,
    description: phase.description,
    records: events.filter((event) => phase.eventTypes.includes(event?.type)).length,
  }));

  return {
    visible,
    actualRecords,
    baselineRecords: RECOMMENDED_PLAN_BASELINE,
    additionalRecords: Math.max(0, actualRecords - RECOMMENDED_PLAN_BASELINE),
    appealCharacters: appealLength(state?.consent?.appeal),
    quizAttempts: Number.isSafeInteger(state?.consent?.attempts) ? state.consent.attempts : 0,
    withdrawalStages: Number(Boolean(state?.withdrawal?.requested)) + Number(Boolean(state?.guarantee?.removed)),
    filingDeclarations: Array.isArray(state?.filing?.declarations)
      ? state.filing.declarations.filter(Boolean).length
      : 0,
    phases,
  };
}
