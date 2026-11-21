import { COURSES, getCourse, conflicts, totalCredits } from './catalog.mjs?v=3';

export const MIN_CREDITS = 3;
export const MAX_CREDITS = 12;
export const REASONS = ['与个人培养方向不符', '已有同类课程基础', '与个人学习安排不符'];
export const APPEAL_MIN = 30;
export const FILING_STATEMENT = '我仍坚持当前选课方案';
export const WITHDRAW_REASONS = ['已明确表示不接受本课程推荐', '本轮仅按个人课程计划选课', '不需要系统保留的保障席位'];
export const OBJECTIONS = {
  [REASONS[0]]: '本课程已被认定为计算机类专业的跨学科培养补充。培养方向不同属于推荐依据，暂不构成不接受推荐的直接理由。',
  [REASONS[1]]: '已有同类基础有助于提高课程修读收益。系统无法据此认定该课程没有修读价值，此理由暂不通过。',
  [REASONS[2]]: '个人安排未体现为已登记的课程冲突。系统暂不能以未登记安排作为不接受推荐的客观依据。',
};
const blankFiling = () => ({ courses: null, declarations: [false, false, false], stage: 0, statement: '', completed: false, number: null });
const blankWithdrawal = () => ({ requested: false, reason: '', courseCode: '', benefits: false, personal: false, number: null });
export const appealLength = value => Array.from(String(value ?? '').replace(/\s/g, '')).length;

export function createState() {
  return {
    version: 3, draft: [], origins: {}, editing: true,
    consent: { read: false, reason: '', appealOpen: false, appeal: '', appealAcknowledged: false, appealFiled: false, passed: false, attempts: 0, approved: false },
    guarantee: { ever: false, removed: false }, pending: null, withdrawalAck: false,
    withdrawal: blankWithdrawal(), filing: blankFiling(),
    review: null, submitted: null, history: [], events: [], notice: '',
  };
}

const exactIds = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const assert = (condition, message) => { if (!condition) throw new TypeError(`Invalid plan: ${message}`); };
const validIds = ids => Array.isArray(ids) && ids.every(id => COURSES.some(c => c.id === id)) && new Set(ids).size === ids.length;
const validTime = value => Number.isSafeInteger(value) && value >= 0;

function validateReceipt(receipt) {
  assert(isObject(receipt) && typeof receipt.id === 'string' && receipt.id.length > 0, 'receipt ID');
  assert(validTime(receipt.at) && validIds(receipt.courses) && receipt.courses.length > 0, 'receipt snapshot');
  assert(receipt.credits === totalCredits(receipt.courses) && receipt.credits >= MIN_CREDITS && receipt.credits <= MAX_CREDITS, 'receipt credits');
  assert(Number.isSafeInteger(receipt.revision) && receipt.revision > 0, 'receipt revision');
  for (const id of receipt.courses) assert(!receipt.courses.some(other => other !== id && conflicts(getCourse(id), getCourse(other))), 'receipt conflict');
}

export function restoreState(raw) {
  assert(isObject(raw) && raw.version === 3, 'version');
  assert(validIds(raw.draft) && isObject(raw.origins), 'draft');
  assert(Object.keys(raw.origins).length === raw.draft.length && raw.draft.every(id => ['student', 'guarantee'].includes(raw.origins[id])), 'course origins');
  assert(raw.draft.every(id => raw.origins[id] !== 'guarantee' || id === 'agri'), 'guarantee origin');
  assert(typeof raw.editing === 'boolean' && typeof raw.notice === 'string', 'plan fields');
  const c = raw.consent, g = raw.guarantee;
  assert(isObject(c) && ['read', 'passed', 'approved', 'appealOpen', 'appealAcknowledged', 'appealFiled'].every(k => typeof c[k] === 'boolean'), 'consent');
  assert(typeof c.reason === 'string' && (!c.reason || REASONS.includes(c.reason)) && validTime(c.attempts), 'reason or attempts');
  assert(!c.reason || c.read, 'reason needs reading');
  assert(typeof c.appeal === 'string', 'appeal text');
  assert(!c.appealOpen || c.reason, 'appeal prerequisites');
  assert(!c.appealFiled || (c.appealOpen && c.appealAcknowledged && appealLength(c.appeal) >= APPEAL_MIN), 'appeal filing');
  assert(!c.passed || (c.read && c.reason && c.appealFiled && c.attempts > 0), 'quiz prerequisites');
  assert(!c.approved || c.passed, 'approval prerequisites');
  assert(!raw.draft.includes('ml') || c.approved, 'target qualification');
  assert(isObject(g) && typeof g.ever === 'boolean' && typeof g.removed === 'boolean' && (!g.removed || g.ever), 'guarantee');
  assert(!raw.draft.includes('ml') || g.ever, 'first allocation');
  assert(!g.removed || raw.origins.agri !== 'guarantee', 'removed guarantee cannot return');
  assert(raw.origins.agri !== 'guarantee' || (g.ever && c.approved), 'guarantee qualification');
  assert([null, 'consent', 'withdrawal', 'review', 'filing'].includes(raw.pending) && typeof raw.withdrawalAck === 'boolean', 'pending procedure');
  assert(raw.pending !== 'consent' || (raw.editing && !c.approved), 'consent procedure');
  assert(raw.pending !== 'withdrawal' || (raw.editing && raw.origins.agri === 'guarantee'), 'withdrawal procedure');
  assert(raw.review === null || (validIds(raw.review) && exactIds(raw.review, raw.draft)), 'review snapshot');
  assert(raw.pending !== 'review' || (raw.editing && raw.review !== null && totalCredits(raw.draft) >= MIN_CREDITS), 'review procedure');
  assert(raw.pending === 'review' || raw.review === null, 'stale review');
  const w = raw.withdrawal, f = raw.filing;
  assert(isObject(w) && ['requested', 'benefits', 'personal'].every(k => typeof w[k] === 'boolean'), 'withdrawal record');
  assert(typeof w.reason === 'string' && typeof w.courseCode === 'string', 'withdrawal fields');
  assert(!w.requested || (g.ever && WITHDRAW_REASONS.includes(w.reason) && w.courseCode === getCourse('agri').code && w.benefits && w.personal && typeof w.number === 'string'), 'withdrawal permission');
  assert(!g.removed || w.requested || raw.origins.agri !== 'guarantee', 'withdrawal lifecycle');
  assert(isObject(f) && (f.courses === null || validIds(f.courses)) && [0, 1, 2].includes(f.stage), 'filing snapshot');
  assert(Array.isArray(f.declarations) && f.declarations.length === 3 && f.declarations.every(v => typeof v === 'boolean'), 'filing declarations');
  assert(typeof f.statement === 'string' && typeof f.completed === 'boolean', 'filing fields');
  assert(f.courses === null || exactIds(f.courses, raw.draft), 'filing plan changed');
  assert(f.stage === 0 || (f.courses !== null && f.declarations.every(Boolean)), 'filing stages');
  assert(!f.completed || (f.stage === 2 && f.statement === FILING_STATEMENT && typeof f.number === 'string' && f.number.length > 0), 'filing completion');
  assert((f.stage === 2) === f.completed, 'filing final stage');
  assert(f.courses !== null || (f.stage === 0 && !f.completed && f.declarations.every(v => !v)), 'empty filing');
  assert(raw.pending !== 'filing' || (raw.editing && f.courses !== null), 'filing procedure');
  assert(Array.isArray(raw.history), 'history');
  raw.history.forEach((receipt, index) => { validateReceipt(receipt); assert(receipt.revision === index + 1, 'history sequence'); });
  assert(raw.submitted !== null || raw.history.length === 0, 'history requires a current receipt');
  if (raw.submitted !== null) { validateReceipt(raw.submitted); assert(raw.submitted.revision === raw.history.length + 1, 'revision sequence'); }
  assert(raw.editing || (raw.submitted !== null && exactIds(raw.draft, raw.submitted.courses) && raw.pending === null), 'submitted plan');
  assert(Array.isArray(raw.events) && raw.events.every(e => isObject(e) && typeof e.type === 'string' && validTime(e.at) && typeof e.label === 'string'), 'events');
  assert(totalCredits(raw.draft) <= MAX_CREDITS, 'credit limit');
  for (const id of raw.draft) assert(!raw.draft.some(other => other !== id && conflicts(getCourse(id), getCourse(other))), 'draft conflict');
  return structuredClone(raw);
}

export function planSummary(state) {
  const credits = totalCredits(state.draft);
  return {
    count: state.draft.length, credits, valid: credits >= MIN_CREDITS && credits <= MAX_CREDITS,
    completeness: !state.draft.length ? 0 : state.draft.includes('agri') ? 100 : 78,
    guaranteed: state.origins.agri === 'guarantee',
    periods: state.draft.reduce((sum, id) => sum + getCourse(id).duration, 0),
  };
}

export function transition(state, action) {
  const next = restoreState(state);
  if (!isObject(action) || typeof action.type !== 'string') throw new TypeError('Invalid action');
  const at = action.at ?? 0;
  if (!validTime(at)) throw new TypeError('Invalid action time');
  next.notice = '';
  const block = message => { next.notice = message; };
  const log = (type, label, courseId = null) => next.events.push({ type, label, courseId, at });
  const invalidateReview = () => { next.review = null; next.pending = null; };

  function add(id) {
    const course = getCourse(id);
    if (!course) { block('未找到该教学班。'); return; }
    if (!next.editing) { block('本轮方案已提交。如需更改，请先点击“调整选课”。'); return; }
    if (next.draft.includes(id)) { block('该教学班已在待提交方案中。'); return; }
    if (course.enrolled >= course.capacity) { block('该教学班名额已满，请选择其他教学班。'); return; }
    if (course.eligibleFrom && course.eligibleFrom > 1) { block(`该课程建议大${course.eligibleFrom}及以上年级修读，当前学生身份暂不可选。`); return; }
    const conflictId = next.draft.find(other => conflicts(course, getCourse(other)));
    if (conflictId) { block(`与《${getCourse(conflictId).name}》上课时间冲突。`); return; }
    if (totalCredits([...next.draft, id]) > MAX_CREDITS) { block(`本轮最多可选 ${MAX_CREDITS} 学分，请先调整待提交方案。`); return; }
    if (id === 'ml' && !next.guarantee.ever && !next.draft.includes('agri') && totalCredits([...next.draft, id, 'agri']) > MAX_CREDITS) {
      block('首次选修本课程须同时配置3学分保障席位，请先预留相应学分。'); return;
    }
    if (id === 'ml' && !next.consent.approved) { next.pending = 'consent'; log('procedure', '发起重点推荐课程知情确认', id); return; }
    invalidateReview(); next.draft.push(id); next.origins[id] = 'student';
    next.filing = blankFiling();
    log('add', `选入《${course.name}》`, id); next.notice = `已选入《${course.name}》。`;
    if (id === 'ml' && !next.guarantee.ever) {
      next.guarantee.ever = true;
      if (next.draft.includes('agri')) {
        next.origins.agri = 'guarantee';
        log('guarantee', '将已选《农业数据采集基础》登记为保障席位', 'agri');
        next.notice = '已选入《机器学习》。农业数据采集基础已转为本轮保障席位。';
      } else {
        const backup = getCourse('agri');
        const hasConflict = next.draft.some(other => conflicts(backup, getCourse(other)));
        if (!hasConflict && totalCredits([...next.draft, 'agri']) <= MAX_CREDITS && backup.enrolled < backup.capacity) {
          next.draft.push('agri'); next.origins.agri = 'guarantee';
          log('guarantee', '配置《农业数据采集基础》保障席位', 'agri');
          next.notice = '已选入《机器学习》，并配置《农业数据采集基础》保障席位。';
        } else { next.guarantee.removed = true; next.notice = '已选入《机器学习》。保障席位因时间或学分限制未配置。'; }
      }
    }
  }

  switch (action.type) {
    case 'ADD': add(action.id); break;
    case 'DROP': {
      if (!next.editing) { block('请先开始调整选课。'); break; }
      if (!next.draft.includes(action.id)) { block('该课程不在待提交方案中。'); break; }
      if (next.origins[action.id] === 'guarantee') { invalidateReview(); next.pending = 'withdrawal'; next.withdrawalAck = false; }
      else {
        invalidateReview(); next.draft = next.draft.filter(id => id !== action.id); delete next.origins[action.id];
        next.filing = blankFiling();
        log('drop', `退选《${getCourse(action.id).name}》`, action.id); next.notice = '已从待提交方案中移除。';
      }
      break;
    }
    case 'CONSENT_READ':
      if (next.pending !== 'consent') { block('请先发起课程知情确认。'); break; }
      next.consent.read = true; break;
    case 'CONSENT_COORDINATE':
      if (next.pending !== 'consent' || next.consent.approved) { block('当前课程办理已完成，请继续选课。'); break; }
      // The coordinated path is a real alternative: it records informed acceptance,
      // skips the personal-refusal workflow, and preserves the guaranteed seat.
      next.consent.read = true;
      next.consent.reason = REASONS[0];
      next.consent.appealOpen = true;
      next.consent.appeal = '接受学校协调方案，按本轮培养安排办理，并保留机器学习的选课资格。';
      next.consent.appealAcknowledged = true;
      next.consent.appealFiled = true;
      next.consent.attempts = 1;
      next.consent.passed = true;
      next.consent.approved = true;
      next.pending = null;
      log('coordination', '接受学校协调方案，快速配置保障席位', 'agri');
      add('ml');
      break;
    case 'CONSENT_REASON':
      if (next.pending !== 'consent' || !next.consent.read || !REASONS.includes(action.reason)) { block('请阅读课程说明并选择拒绝理由。'); break; }
      next.consent.reason = action.reason;
      log('reason', `提交不接受推荐理由：${action.reason}`, 'agri'); break;
    case 'CONSENT_CHANGE_REASON':
      if (next.pending !== 'consent' || next.consent.appealFiled) { block('当前意见已登记，请继续办理。'); break; }
      next.consent.reason = ''; next.consent.appealOpen = false; break;
    case 'CONSENT_OPEN_APPEAL':
      if (next.pending !== 'consent' || !next.consent.reason) { block('请先提交确认意见。'); break; }
      next.consent.appealOpen = true;
      log('objection', `系统复核未通过：${next.consent.reason}`, 'agri'); break;
    case 'CONSENT_APPEAL':
      if (next.pending !== 'consent' || !next.consent.appealOpen) { block('请先转入个人意愿申明。'); break; }
      if (typeof action.text !== 'string' || appealLength(action.text) < APPEAL_MIN || action.acknowledged !== true) {
        block('请填写不少于30个非空白字符的补充说明，并确认按个人意愿登记。'); break;
      }
      next.consent.appeal = action.text.trim(); next.consent.appealAcknowledged = true; next.consent.appealFiled = true;
      log('appeal', '登记个人意愿补充说明', 'agri'); break;
    case 'CONSENT_ANSWER':
      if (next.pending !== 'consent' || !next.consent.appealFiled) { block('请先完成个人意愿申明。'); break; }
      if (next.consent.passed) break;
      next.consent.attempts++; next.consent.passed = action.answer === 'environment';
      if (!next.consent.passed) block('课程理解核验未通过，请查阅课程说明后重新作答。');
      break;
    case 'CONSENT_CONFIRM':
      if (next.pending !== 'consent' || !next.consent.passed) { block('请完成课程理解确认。'); break; }
      next.consent.approved = true; next.pending = null;
      log('refusal', `已登记知情拒绝：${next.consent.reason}`, 'agri'); add('ml'); break;
    case 'WITHDRAW_ACK':
      if (next.pending !== 'withdrawal' || typeof action.checked !== 'boolean') { block('请先发起保障席位撤销。'); break; }
      next.withdrawalAck = action.checked; break;
    case 'WITHDRAW_REQUEST':
      if (next.pending !== 'withdrawal' || next.origins.agri !== 'guarantee') { block('请先发起保障席位撤销申请。'); break; }
      if (!WITHDRAW_REASONS.includes(action.reason) || String(action.courseCode ?? '').trim().toUpperCase() !== getCourse('agri').code || action.benefits !== true || action.personal !== true) {
        block('请填写撤销原因、核对课程号，并逐项确认放弃的保障事项。'); break;
      }
      next.withdrawal = { requested: true, reason: action.reason, courseCode: getCourse('agri').code, benefits: true, personal: true, number: `CX-${at}` };
      invalidateReview();
      next.notice = '撤销申请已核验，席位仍在当前方案中。请执行席位撤销。';
      log('withdrawal-permit', '保障席位撤销申请通过核验，待本人执行', 'agri'); break;
    case 'WITHDRAW_CONFIRM':
      if (next.pending !== 'withdrawal' || !next.withdrawal.requested || !next.withdrawalAck || !Number.isFinite(action.holdMs) || action.holdMs < 2000) { block('请先取得撤销许可，再确认执行并持续按住撤销按钮。'); break; }
      next.draft = next.draft.filter(id => id !== 'agri'); delete next.origins.agri;
      next.guarantee.removed = true; invalidateReview(); next.notice = '保障席位已撤销。';
      next.filing = blankFiling();
      log('withdrawal', '撤销《农业数据采集基础》保障席位', 'agri'); break;
    case 'CANCEL_PROCEDURE': invalidateReview(); break;
    case 'REVIEW':
      if (!next.editing) { block('当前方案已提交。'); break; }
      if (!planSummary(next).valid) { block(`本轮需选择 ${MIN_CREDITS}—${MAX_CREDITS} 学分。`); break; }
      next.review = [...next.draft]; next.pending = 'review'; break;
    case 'FILING_DECLARE':
      if (next.pending !== 'filing' || !Array.isArray(action.confirmations) || action.confirmations.length !== 3 || !action.confirmations.every(v => v === true)) {
        block('请逐项确认三项个人方案备案事项。'); break;
      }
      next.filing.declarations = [true, true, true]; next.filing.stage = 1; break;
    case 'FILING_STATEMENT':
      if (next.pending !== 'filing' || next.filing.stage !== 1 || typeof action.text !== 'string' || action.text.trim() !== FILING_STATEMENT) {
        block(`请按原文输入“${FILING_STATEMENT}”。`); break;
      }
      next.filing.statement = FILING_STATEMENT; next.filing.completed = true; next.filing.stage = 2; next.filing.number = `BA-${at}`;
      log('filing', '自主方案备案完成，选课待再次提交'); break;
    case 'FILING_RETURN':
      if (next.pending !== 'filing' || !next.filing.completed || !exactIds(next.filing.courses, next.draft)) { block('请完成当前方案备案。'); break; }
      next.review = [...next.draft]; next.pending = 'review'; break;
    case 'SUBMIT': {
      if (!next.editing && next.submitted) break;
      if (next.pending !== 'review' || !next.review || !exactIds(next.review, next.draft) || !planSummary(next).valid) { block('请重新核对当前方案后提交。'); break; }
      if (!Array.isArray(action.expectedCourses) || !exactIds(action.expectedCourses, next.review)) {
        block('选课方案已更新，请核对当前课程后再次提交。'); break;
      }
      if (planSummary(next).completeness < 100 && !(next.filing.completed && next.filing.courses && exactIds(next.filing.courses, next.draft))) {
        if (!next.filing.courses || !exactIds(next.filing.courses, next.draft)) next.filing = { ...blankFiling(), courses: [...next.draft] };
        next.pending = 'filing'; next.review = null;
        next.notice = '学分校验已通过。未采纳重点推荐课程的方案，须先办理自主方案备案。';
        log('filing-required', '选课提交暂缓：须补办自主方案备案'); break;
      }
      if (typeof action.receiptId !== 'string' || !action.receiptId.trim()) throw new TypeError('Missing receipt ID');
      if (next.submitted) next.history.push(structuredClone(next.submitted));
      next.submitted = { id: action.receiptId, at, courses: [...next.draft], credits: totalCredits(next.draft), revision: next.history.length + 1, filingId: next.filing.completed ? next.filing.number : null };
      next.editing = false; invalidateReview(); log('submit', `提交选课方案（第 ${next.submitted.revision} 版）`); next.notice = '选课方案提交成功。'; break;
    }
    case 'EDIT':
      if (!next.submitted || next.editing) break;
      next.editing = true; invalidateReview(); log('edit', '开始调整选课方案'); break;
    case 'DISMISS_NOTICE': next.notice = ''; break;
    default: throw new TypeError(`Unknown action: ${action.type}`);
  }
  return restoreState(next);
}
