import { COURSES, getCourse, conflicts, totalCredits } from './catalog.mjs';

export const MIN_CREDITS = 3;
export const MAX_CREDITS = 12;
export const REASONS = ['与个人培养方向不符', '已有同类课程基础', '与个人学习安排不符'];

export function createState() {
  return {
    version: 2, draft: [], origins: {}, editing: true,
    consent: { read: false, reason: '', passed: false, attempts: 0, approved: false },
    guarantee: { ever: false, removed: false }, pending: null, withdrawalAck: false,
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
  assert(isObject(raw) && raw.version === 2, 'version');
  assert(validIds(raw.draft) && isObject(raw.origins), 'draft');
  assert(Object.keys(raw.origins).length === raw.draft.length && raw.draft.every(id => ['student', 'guarantee'].includes(raw.origins[id])), 'course origins');
  assert(raw.draft.every(id => raw.origins[id] !== 'guarantee' || id === 'agri'), 'guarantee origin');
  assert(typeof raw.editing === 'boolean' && typeof raw.notice === 'string', 'plan fields');
  const c = raw.consent, g = raw.guarantee;
  assert(isObject(c) && ['read', 'passed', 'approved'].every(k => typeof c[k] === 'boolean'), 'consent');
  assert(typeof c.reason === 'string' && (!c.reason || REASONS.includes(c.reason)) && validTime(c.attempts), 'reason or attempts');
  assert(!c.reason || c.read, 'reason needs reading');
  assert(!c.passed || (c.read && c.reason && c.attempts > 0), 'quiz prerequisites');
  assert(!c.approved || c.passed, 'approval prerequisites');
  assert(!raw.draft.includes('ml') || c.approved, 'target qualification');
  assert(isObject(g) && typeof g.ever === 'boolean' && typeof g.removed === 'boolean' && (!g.removed || g.ever), 'guarantee');
  assert(!raw.draft.includes('ml') || g.ever, 'first allocation');
  assert(!g.removed || raw.origins.agri !== 'guarantee', 'removed guarantee cannot return');
  assert(raw.origins.agri !== 'guarantee' || (g.ever && c.approved), 'guarantee qualification');
  assert([null, 'consent', 'withdrawal', 'review'].includes(raw.pending) && typeof raw.withdrawalAck === 'boolean', 'pending procedure');
  assert(raw.pending !== 'consent' || (raw.editing && !c.approved), 'consent procedure');
  assert(raw.pending !== 'withdrawal' || (raw.editing && raw.origins.agri === 'guarantee'), 'withdrawal procedure');
  assert(raw.review === null || (validIds(raw.review) && exactIds(raw.review, raw.draft)), 'review snapshot');
  assert(raw.pending !== 'review' || (raw.editing && raw.review !== null && totalCredits(raw.draft) >= MIN_CREDITS), 'review procedure');
  assert(raw.pending === 'review' || raw.review === null, 'stale review');
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
    const conflictId = next.draft.find(other => conflicts(course, getCourse(other)));
    if (conflictId) { block(`与《${getCourse(conflictId).name}》上课时间冲突。`); return; }
    if (totalCredits([...next.draft, id]) > MAX_CREDITS) { block(`本轮最多可选 ${MAX_CREDITS} 学分，请先调整待提交方案。`); return; }
    if (id === 'ml' && !next.consent.approved) { next.pending = 'consent'; log('procedure', '发起重点推荐课程知情确认', id); return; }
    invalidateReview(); next.draft.push(id); next.origins[id] = 'student';
    log('add', `选入《${course.name}》`, id); next.notice = `已选入《${course.name}》。`;
    if (id === 'ml' && !next.guarantee.ever) {
      next.guarantee.ever = true;
      if (!next.draft.includes('agri')) {
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
        log('drop', `退选《${getCourse(action.id).name}》`, action.id); next.notice = '已从待提交方案中移除。';
      }
      break;
    }
    case 'CONSENT_READ':
      if (next.pending !== 'consent') { block('请先发起课程知情确认。'); break; }
      next.consent.read = true; break;
    case 'CONSENT_REASON':
      if (next.pending !== 'consent' || !next.consent.read || !REASONS.includes(action.reason)) { block('请阅读课程说明并选择拒绝理由。'); break; }
      next.consent.reason = action.reason; break;
    case 'CONSENT_ANSWER':
      if (next.pending !== 'consent' || !next.consent.reason) { block('请先填写拒绝理由。'); break; }
      if (next.consent.passed) break;
      next.consent.attempts++; next.consent.passed = action.answer === 'environment';
      if (!next.consent.passed) block('答案不正确。课程采集对象为土壤湿度、温度等环境数据，请重新作答。');
      break;
    case 'CONSENT_CONFIRM':
      if (next.pending !== 'consent' || !next.consent.passed) { block('请完成课程理解确认。'); break; }
      next.consent.approved = true; next.pending = null;
      log('refusal', `已登记知情拒绝：${next.consent.reason}`, 'agri'); add('ml'); break;
    case 'WITHDRAW_ACK':
      if (next.pending !== 'withdrawal' || typeof action.checked !== 'boolean') { block('请先发起保障席位撤销。'); break; }
      next.withdrawalAck = action.checked; break;
    case 'WITHDRAW_CONFIRM':
      if (next.pending !== 'withdrawal' || !next.withdrawalAck || !Number.isFinite(action.holdMs) || action.holdMs < 2000) { block('请确认声明并持续按住撤销按钮。'); break; }
      next.draft = next.draft.filter(id => id !== 'agri'); delete next.origins.agri;
      next.guarantee.removed = true; invalidateReview(); next.notice = '保障席位已撤销。';
      log('withdrawal', '撤销《农业数据采集基础》保障席位', 'agri'); break;
    case 'CANCEL_PROCEDURE': invalidateReview(); break;
    case 'REVIEW':
      if (!next.editing) { block('当前方案已提交。'); break; }
      if (!planSummary(next).valid) { block(`本轮需选择 ${MIN_CREDITS}—${MAX_CREDITS} 学分。`); break; }
      next.review = [...next.draft]; next.pending = 'review'; break;
    case 'SUBMIT': {
      if (!next.editing && next.submitted) break;
      if (next.pending !== 'review' || !next.review || !exactIds(next.review, next.draft) || !planSummary(next).valid) { block('请重新核对当前方案后提交。'); break; }
      if (typeof action.receiptId !== 'string' || !action.receiptId.trim()) throw new TypeError('Missing receipt ID');
      if (next.submitted) next.history.push(structuredClone(next.submitted));
      next.submitted = { id: action.receiptId, at, courses: [...next.draft], credits: totalCredits(next.draft), revision: next.history.length + 1 };
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
