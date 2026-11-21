// Pure domain state. The UI owns storage, clocks, visibility and continuous holds.
export function initialState() {
  return {
    version: 1, view: 'home', query: '', read: false, reason: '',
    quizPassed: false, attempts: 0, rejected: false, added: false,
    backupEver: false, backupRemoved: false, waiver: false, cart: [],
    receipt: null, events: [], activeMs: 0, notice: '',
  };
}

const views = new Set(['home', 'results', 'detail', 'consent', 'cart', 'remove', 'confirm', 'success']);
const navigable = new Set(['home', 'results', 'detail', 'cart']);
const actions = new Set(['SEARCH', 'OPEN_TARGET', 'OPEN_CONSENT', 'READ', 'CHOOSE_REASON',
  'QUIZ', 'REJECT', 'ADD_TARGET', 'OPEN_CART', 'OPEN_REMOVE', 'WAIVER',
  'REMOVE_BACKUP', 'REVIEW', 'SUBMIT', 'NAVIGATE', 'TICK']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = value => Number.isSafeInteger(value) && value >= 0;
const onlyML = state => state.cart.length === 1 && state.cart[0] === 'ml';
const validTime = value => count(value) || (typeof value === 'string' &&
  value.length > 0 && Number.isFinite(Date.parse(value)));
function check(condition, message) {
  if (!condition) throw new TypeError(`Invalid state: ${message}`);
}

// Accept parsed v1 data only; never silently repair lost or contradictory progress.
export function restore(raw) {
  check(object(raw), 'expected a parsed object');
  const keys = Object.keys(initialState());
  check(Object.keys(raw).length === keys.length && keys.every(key => Object.hasOwn(raw, key)), 'fields');
  check(raw.version === 1 && views.has(raw.view), 'version or view');
  for (const key of ['query', 'reason', 'notice']) check(typeof raw[key] === 'string', key);
  for (const key of ['read', 'quizPassed', 'rejected', 'added', 'backupEver', 'backupRemoved', 'waiver']) {
    check(typeof raw[key] === 'boolean', key);
  }
  check(count(raw.attempts) && count(raw.activeMs), 'counters');
  check(Array.isArray(raw.cart) && [...raw.cart].every(id => id === 'ml' || id === 'agri') &&
    new Set(raw.cart).size === raw.cart.length, 'cart IDs');
  check(!raw.reason || (raw.read && raw.reason.trim().length > 0), 'reason requires reading');
  check(raw.attempts === 0 || (raw.read && raw.reason.length > 0), 'quiz prerequisites');
  check(!raw.quizPassed || raw.attempts > 0, 'quiz pass requires attempt');
  check(!raw.rejected || (raw.read && raw.reason.length > 0 && raw.quizPassed), 'rejection prerequisites');
  check(raw.added === raw.backupEver && (!raw.added || raw.rejected), 'first addition');
  check(!raw.backupRemoved || (raw.backupEver && raw.waiver), 'removal prerequisites');
  check(!raw.waiver || raw.backupEver, 'waiver prerequisites');
  check(raw.added
    ? raw.cart.includes('ml') && raw.cart.includes('agri') === !raw.backupRemoved
    : raw.cart.length === 0, 'cart contradicts lifecycle');
  check(raw.view !== 'consent' || !raw.rejected, 'completed consent');
  check(raw.view !== 'remove' || (raw.backupEver && !raw.backupRemoved), 'remove view');
  check(raw.view !== 'confirm' || onlyML(raw), 'confirmation courses');
  if (raw.receipt !== null) {
    const receipt = raw.receipt;
    check(object(receipt) && Object.keys(receipt).length === 3 &&
      typeof receipt.id === 'string' && receipt.id.trim().length > 0 && validTime(receipt.time) &&
      Array.isArray(receipt.courses) && receipt.courses.length === 1 && receipt.courses[0] === 'ml', 'receipt');
    check(raw.view === 'success' && onlyML(raw) && raw.backupRemoved, 'success snapshot');
  } else check(raw.view !== 'success', 'missing receipt');
  check(Array.isArray(raw.events), 'events');
  let lastAt = 0;
  for (const event of raw.events) {
    check(object(event) && Object.keys(event).length === 3 && actions.has(event.type) &&
      event.type !== 'TICK' && count(event.at) && event.at >= lastAt && event.at <= raw.activeMs &&
      ['ok', 'blocked', 'noop', 'incorrect'].includes(event.result), 'event');
    lastAt = event.at;
  }
  return {
    ...raw, cart: [...raw.cart], events: raw.events.map(event => ({ ...event })),
    receipt: raw.receipt === null ? null : { ...raw.receipt, courses: [...raw.receipt.courses] },
  };
}

/** Business attempts produce {type, at: activeMs, result}; TICK never logs.
 * SUBMIT optionally accepts caller-supplied id/time. Defaults are deterministic.
 * Malformed actions throw; well-formed but unavailable operations are blocked.
 */
export function reduce(state, action) {
  const next = restore(state);
  if (!object(action) || !actions.has(action.type)) throw new TypeError('Unknown action');
  const { type } = action;
  if (type === 'SEARCH' && typeof action.query !== 'string') throw new TypeError('query must be a string');
  if (type === 'CHOOSE_REASON' && typeof action.reason !== 'string') throw new TypeError('reason must be a string');
  if (type === 'QUIZ' && typeof action.answer !== 'string') throw new TypeError('answer must be a string');
  if (type === 'WAIVER' && typeof action.checked !== 'boolean') throw new TypeError('checked must be boolean');
  if (type === 'REMOVE_BACKUP' && !count(action.holdMs)) throw new TypeError('holdMs must be a nonnegative safe integer');
  if (type === 'TICK') {
    if (!count(action.ms) || !count(next.activeMs + action.ms)) throw new TypeError('invalid ms');
    next.activeMs += action.ms;
    return next;
  }
  if (type === 'SUBMIT' && ((action.id !== undefined &&
    (typeof action.id !== 'string' || !action.id.trim())) ||
    (action.time !== undefined && !validTime(action.time)))) throw new TypeError('invalid receipt metadata');
  let result = 'ok';
  next.notice = '';
  const block = message => { result = 'blocked'; next.notice = message; };
  const noop = () => { result = 'noop'; };
  if (next.receipt) {
    if (type === 'SUBMIT' || (type === 'NAVIGATE' && action.view === 'success')) noop();
    else block('本次选课已提交，请查看回执；重新体验需重置。');
  } else switch (type) {
    case 'SEARCH': next.query = action.query; next.view = 'results'; break;
    case 'OPEN_TARGET': next.view = 'detail'; break;
    case 'OPEN_CONSENT': next.view = next.rejected ? 'detail' : 'consent'; break;
    case 'READ':
      if (next.read) noop();
      else if (next.view !== 'consent') block('请先进入知情拒绝办理。');
      else next.read = true;
      break;
    case 'CHOOSE_REASON':
      if (next.rejected) block('已保存的拒绝理由不可更改。');
      else if (next.view !== 'consent' || !next.read || !action.reason.trim()) block('请先阅读并选择拒绝理由。');
      else if (next.reason === action.reason) noop();
      else next.reason = action.reason;
      break;
    case 'QUIZ':
      if (next.quizPassed) noop();
      else if (next.view !== 'consent' || !next.read || !next.reason) block('请先阅读并选择拒绝理由。');
      else {
        if (!count(next.attempts + 1)) throw new RangeError('attempts overflow');
        next.attempts++;
        next.quizPassed = action.answer === 'environment';
        if (!next.quizPassed) { result = 'incorrect'; next.notice = '农业数据采集获得土壤湿度、温度等环境数据，请重试。'; }
      }
      break;
    case 'REJECT':
      if (next.rejected) noop();
      else if (next.view !== 'consent' || !next.read || !next.reason || !next.quizPassed) block('请完成阅读、理由和理解测验。');
      else { next.rejected = true; next.view = 'detail'; }
      break;
    case 'ADD_TARGET':
      if (!next.rejected) { next.view = 'consent'; block('请先完成重点推荐课知情拒绝。'); }
      else {
        if (next.added) noop();
        else {
          next.added = next.backupEver = true;
          next.cart = ['ml', 'agri'];
          next.notice = '已加入机器学习，并为你保留已知情拒绝的农业数据采集基础保障席位；尚未提交。';
        }
        next.view = 'cart';
      }
      break;
    case 'OPEN_CART': next.view = 'cart'; break;
    case 'OPEN_REMOVE':
      if (!next.cart.includes('agri')) block('没有待放弃的保障席位。');
      else next.view = 'remove';
      break;
    case 'WAIVER':
      if (next.view !== 'remove' || next.backupRemoved) block('请先打开保障席位放弃页面。');
      else if (next.waiver === action.checked) noop();
      else next.waiver = action.checked;
      break;
    case 'REMOVE_BACKUP':
      if (next.backupRemoved) noop();
      else if (next.view !== 'remove' || !next.waiver || action.holdMs < 2000) block('请勾选声明并连续按住两秒。');
      else { next.backupRemoved = true; next.cart = ['ml']; next.view = 'cart'; }
      break;
    case 'REVIEW':
      if (next.view !== 'cart' || !onlyML(next)) block('请先返回课表并仅保留机器学习。');
      else next.view = 'confirm';
      break;
    case 'SUBMIT':
      if (next.view !== 'confirm' || !onlyML(next)) block('请先核对仅含机器学习的最终课表。');
      else {
        next.receipt = { id: action.id ?? `demo-${next.activeMs}-${next.events.length + 1}`,
          time: action.time ?? next.activeMs, courses: [...next.cart] };
        next.view = 'success';
      }
      break;
    case 'NAVIGATE':
      if (!navigable.has(action.view)) block('此页面必须通过对应办理步骤进入。');
      else next.view = action.view;
      break;
  }
  next.events.push({ type, at: next.activeMs, result });
  return next;
}
