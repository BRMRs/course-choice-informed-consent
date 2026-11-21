import { COURSES, FIT_MODEL, getCourse, filterCourses, conflicts, isMachineLearningQuery } from './catalog.mjs?v=3';
import { createState, transition, restoreState, planSummary, MIN_CREDITS, MAX_CREDITS, appealLength } from './state.mjs?v=3';
import { getRoundId, roundStorageKey, createRoundUrl, getRoundLabel } from './rounds.mjs?v=3';
import { procedureContent } from './procedures.mjs?v=3';
import { buildChoiceAudit } from './insights.mjs?v=3';
import { COUNTDOWN_DURATION, INTEREST_COURSE, SCENARIO_DURATION, createScenarioState, scenarioSnapshot, scenarioTransition } from './scenario.mjs?v=1';

const roundId = getRoundId(location.href);
const STORAGE_KEY = roundStorageKey(roundId);
let roundLabel = getRoundLabel(roundId, 0);
let roundCreatedAt = Date.now();
const SOURCE = 'https://github.com/BRMRs/course-choice-informed-consent';
const app = document.querySelector('#app');
const dialog = document.querySelector('#modal');
const dayNames = ['', '周一', '周二', '周三', '周四', '周五'];
const periods = { 1: '08:00—09:40', 3: '10:00—11:40', 5: '14:00—15:40', 7: '16:00—17:40', 9: '18:30—20:10' };
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateText = at => new Date(at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
const timeText = c => `${dayNames[c.day]} ${c.start}—${c.start + c.duration - 1}节`;
let state = createState();
let storageError = '';
let dialogKind = null;
let cancelHold = () => {};
let storageSequence = 0;
let suppressDialogClose = false;
const useSharedStorage = Boolean(navigator.locks?.request);
const recordStorage = {
  getItem: key => (useSharedStorage ? localStorage : sessionStorage).getItem(key),
  setItem: (key, value) => (useSharedStorage ? localStorage : sessionStorage).setItem(key, value),
  keys: () => Object.keys(useSharedStorage ? localStorage : sessionStorage),
};
let actionQueue = Promise.resolve();
let returnFocus = null;
let scenarioState = createScenarioState();
let scenarioTimer = null;

function readSaved() {
  const saved = recordStorage.getItem(STORAGE_KEY);
  if (!saved) return null;
  const envelope = JSON.parse(saved);
  if (!Number.isSafeInteger(envelope.sequence) || envelope.sequence < 0) throw new TypeError('Invalid storage sequence');
  return { sequence: envelope.sequence, state: restoreState(envelope.state), label: envelope.label, createdAt: envelope.createdAt };
}
try {
  const saved = readSaved();
  if (saved) { state = saved.state; storageSequence = saved.sequence; roundLabel = saved.label || roundLabel; roundCreatedAt = saved.createdAt || roundCreatedAt; }
} catch { storageError = '本地记录暂时无法读取，本次可继续办理。'; }

function refreshSaved() {
  try {
    const saved = readSaved();
    if (saved && saved.sequence > storageSequence) { state = saved.state; storageSequence = saved.sequence; }
  } catch { /* Keep the current valid session available. */ }
}
function save() {
  try {
    const nextSequence = storageSequence + 1;
    recordStorage.setItem(STORAGE_KEY, JSON.stringify({ sequence: nextSequence, state, label: roundLabel, createdAt: roundCreatedAt, updatedAt: Date.now() }));
    storageSequence = nextSequence;
    storageError = '';
  } catch { storageError = '浏览器未能保存进度，请保持当前页面打开。'; }
}
function act(action) {
  if (!state.pending && ['ADD', 'DROP', 'REVIEW'].includes(action.type)) {
    const source = document.activeElement;
    returnFocus = source?.matches('[data-action]') ? { action: source.dataset.action, course: source.dataset.course } : null;
  }
  const requested = { ...action, at: Date.now() };
  if (action.type === 'SUBMIT') requested.expectedCourses = [...(state.review || [])];
  const execute = () => {
    refreshSaved();
    state = transition(state, requested);
    save(); render(true);
  };
  actionQueue = actionQueue.then(() => useSharedStorage
    ? navigator.locks.request(STORAGE_KEY, { mode: 'exclusive' }, execute)
    : execute()).catch(() => {
      storageError = '操作暂未完成，请重试当前步骤。'; render();
    });
  return actionQueue;
}
function route() {
  const [path, query = ''] = location.hash.slice(1).split('?');
  const params = new URLSearchParams(query);
  return { page: ['courses', 'timetable', 'results', 'scenario-1'].includes(path?.replace(/^\//, '')) ? path.replace(/^\//, '') : 'courses', params };
}
function navigate(page, params = new URLSearchParams()) {
  const value = `#/${page}${params.size ? '?' + params.toString() : ''}`;
  if (location.hash === value) render();
  else location.hash = value;
}
function filters() {
  const { params } = route();
  return { query: params.get('q') || '', department: params.get('department') || 'all', category: params.get('category') || 'all', availableOnly: params.get('available') === '1', sort: params.get('sort') || 'fit', scenario: params.get('scenario') === '1' };
}
function roundRecords() {
  const records = [];
  try {
    for (const key of recordStorage.keys().filter(key => key.startsWith('mingli-selection-workbench-v3:'))) {
      try {
        const envelope = JSON.parse(recordStorage.getItem(key));
        const saved = restoreState(envelope.state);
        records.push({ id: key.split(':')[1], label: envelope.label || '原始体验', updatedAt: envelope.updatedAt || 0, state: saved });
      } catch { /* A damaged record must not hide the other rounds. */ }
    }
  } catch { /* The active session remains usable without storage. */ }
  return records.sort((a, b) => b.updatedAt - a.updatedAt);
}
function roundsDialog() {
  dialogKind = { type: 'rounds' };
  const records = roundRecords();
  setDialog(`<div class="dialog-heading"><div><span class="dialog-kicker">独立办理记录</span><h2 id="modal-title">体验记录</h2></div>${closeButton()}</div><p class="dialog-description">每轮单独保存，可随时返回继续办理。</p><div class="round-records">${records.map(r => { const s = planSummary(r.state); return `<a class="round-record" href="${escape(createRoundUrl(location.href, r.id))}" ${r.id === roundId ? 'aria-current="true"' : ''}><strong>${escape(r.label)}${r.id === roundId ? ' · 当前' : ''}</strong><span>${s.count} 门 / ${s.credits} 学分 · ${r.state.editing ? '办理中' : '已提交'}</span><small>${dateText(r.updatedAt)}</small></a>`; }).join('')}</div><div class="dialog-actions">${button('关闭', 'close-dialog', 'secondary')}${button('开始新一轮体验', 'start-round', 'primary')}</div>`);
}
function startRound() {
  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    const label = getRoundLabel(id, roundRecords().length);
    recordStorage.setItem(roundStorageKey(id), JSON.stringify({ sequence: 0, state: createState(), label, createdAt: now, updatedAt: now }));
    location.assign(createRoundUrl(location.href, id));
  } catch {
    setDialog(`<div class="dialog-heading"><h2 id="modal-title">新一轮暂未建立</h2>${closeButton()}</div><p>浏览器未能保存独立记录，请允许本地存储后重试。当前进度仍保留。</p>`);
  }
}
const iconPaths = {
  school: 'M3 9l9-6 9 6M5 10v10h14V10M9 20v-6h6v6M9 9h6',
  courses: 'M4 4h16v16H4zM4 9h16M9 9v11',
  calendar: 'M4 5h16v16H4zM8 3v4M16 3v4M4 10h16M8 14h2M14 14h2M8 17h2',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  search: 'M18 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0m-2 5 5 5',
  check: 'm5 12 4 4L19 6',
  chevron: 'm9 5 7 7-7 7',
  info: 'M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  clock: 'M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  close: 'm6 6 12 12M18 6 6 18',
  inbox: 'M4 4h16v16H4zM4 13h5l1 3h4l1-3h5',
};
function icon(name, size = 18) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${iconPaths[name] || iconPaths.info}"/></svg>`; }
function button(label, action, style = '', attributes = '') { return `<button type="button" class="button ${style}" data-action="${action}" ${attributes}>${label}</button>`; }
function linkButton(label, action, attributes = '') { return `<button type="button" class="link-button" data-action="${action}" ${attributes}>${label}</button>`; }

function shell(content) {
  const { page } = route();
  const summary = planSummary(state);
  const titles = { courses: '选课工作台', timetable: '每周课表', results: '选课结果' };
  return `<header class="topbar">
    <a href="#/courses" class="brand"><span class="brand-mark">${icon('school', 27)}</span><span class="university">明理大学</span><span class="system-name">本科教务系统</span></a>
    <div class="top-actions"><span class="current-term">2026—2027 学年 · 第一学期</span>${button('场景 1· 8:00 抢课', 'scenario-1', 'scenario-top')}${button('体验记录', 'rounds', 'quiet')}${button('新一轮体验', 'start-round', 'secondary')}${button(icon('info'), 'about', 'quiet', 'aria-label="系统信息"')}<span class="avatar">李</span><span class="student-name">李予安</span></div>
  </header>
  <div class="workspace"><aside class="sidebar"><div class="nav-caption">教学服务</div><nav aria-label="教学服务">${[['courses', '课程查询', 'courses'], ['timetable', '每周课表', 'calendar'], ['results', '选课结果', 'receipt']].map(([id, name, symbol]) => `<a href="#/${id}" class="nav-link ${page === id ? 'active' : ''}" ${page === id ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${name}</span>${page === id ? '<i></i>' : ''}</a>`).join('')}</nav>
    <section class="round-note"><span class="round-label">当前选课轮次</span><strong>第一轮 · 正选</strong><small class="experience-label">${escape(roundLabel)}</small><span class="round-open">${icon('clock', 14)} 选课开放中</span></section><div class="sidebar-footer">本科生院 · 教务服务中心<br><span>选课服务 / v3.0</span></div></aside>
  <main id="content" data-page="${page}"><div class="breadcrumb">教学服务 ${icon('chevron', 12)} ${titles[page]}</div>
    <div class="page-heading"><div><h1 tabindex="-1">${titles[page]}</h1><p>${page === 'courses' ? '2026—2027 学年第一学期本科生第一轮选课' : page === 'timetable' ? '第一学期 · 第 1—16 教学周' : '查看已提交方案及办理记录'}</p></div><span class="status ${state.editing ? 'neutral' : 'success'}">${state.editing ? '方案待提交' : '本轮已提交'}</span></div>
    <section class="student-strip" aria-label="学生与选课信息"><div class="student-identity"><span class="student-icon">李</span><div><strong>李予安 <span>20260301026</span></strong><small>计算机学院 · 计算机科学与技术 · 大一</small></div></div><div class="student-stat"><span>本轮学分要求</span><strong>${MIN_CREDITS}—${MAX_CREDITS} <small>学分</small></strong></div><div class="student-stat"><span>当前方案</span><strong>${summary.credits} <small>学分 / ${summary.count} 门</small></strong></div></section>
    ${storageError ? `<div class="alert warning" role="status">${icon('info')}<span>${escape(storageError)}</span></div>` : ''}
    ${state.notice && state.editing && !state.pending && page === 'courses' ? `<div class="alert ${/冲突|满|最多|需|未找到|请先/.test(state.notice) ? 'warning' : 'info'}" role="status">${icon('info')}<span>${escape(state.notice)}</span>${linkButton('关闭', 'dismiss')}</div>` : ''}
    ${content}
    <footer class="page-footer"><span>明理大学本科生院</span><span>${storageError ? '本地保存异常' : '本地记录已保存'} · 所有时间均为北京时间</span></footer>
  </main></div>${page === 'courses' ? `<div class="mobile-plan-bar"><div><strong>${summary.credits} 学分</strong><span>${summary.count} 门${state.editing ? '待提交' : '已提交'}</span></div>${state.editing ? `${linkButton('查看方案', 'view-plan')}${button('核对并提交', 'review', 'primary', !summary.valid ? 'disabled' : '')}` : button('查看提交结果', 'goto-results', 'primary')}</div>` : ''}`;
}

function scenarioPage() {
  const snapshot = scenarioSnapshot(scenarioState);
  const countdown = Math.max(0, COUNTDOWN_DURATION - snapshot.elapsed);
  const scenarioMinutes = Math.min(5, Math.floor((snapshot.elapsed / COUNTDOWN_DURATION) * 5));
  const clock = snapshot.stage === 'briefing' ? '07:55' : snapshot.stage === 'countdown' ? `07:${String(55 + scenarioMinutes).padStart(2, '0')}` : '08:00';
  const active = snapshot.stage === 'live' || snapshot.stage === 'finished';
  const interestDisabled = snapshot.full || snapshot.stage !== 'live' || snapshot.distracted;
  return `<section class="scenario-page" aria-labelledby="scenario-title"><div class="scenario-hero"><span class="scenario-kicker">SCENARIO 1 · 独立体验</span><h1 id="scenario-title">8:00 抢课现场</h1><p>在这个独立场景中，你将扮演一名只想选《机器学习》的学生。你可以对其他课程感兴趣，但不想被系统安排《农业数据采集基础》。</p><div class="scenario-actions">${snapshot.stage === 'briefing' ? button('开始', 'scenario-start', 'primary') : ''}${snapshot.stage === 'finished' ? button('重新体验', 'scenario-reset', 'secondary') : ''}<a class="button secondary" href="#/courses">跳过场景，进入选课</a></div></div>
    <div class="scenario-clock"><span>当前时间</span><strong>${clock}</strong></div>
    ${snapshot.stage === 'countdown' ? `<div class="scenario-countdown"><span>距离选课开始</span><strong>00:${String(Math.max(0, Math.ceil(countdown / 1000))).padStart(2, '0')}</strong></div>` : ''}
    ${active ? `<div class="scenario-board"><div class="scenario-board-head"><div><span class="scenario-kicker">第一轮·正选</span><h2>选课清单</h2></div><span class="live-dot">LIVE</span></div><div class="scenario-courses"><article class="scenario-course-card ${snapshot.full ? 'sold-out' : ''}"><div><span class="status warning">有点感兴趣</span><h3>${INTEREST_COURSE.name}</h3><p>DES2201 · 2 学分 · 周三 3—4节</p></div><div class="scenario-seat"><strong>${snapshot.filled} / ${INTEREST_COURSE.capacity}</strong><span>${snapshot.full ? '已满' : '余位变化'}</span></div><button type="button" class="button ${snapshot.full ? 'secondary' : 'primary'}" data-action="scenario-claim" ${interestDisabled ? 'disabled' : ''}>${snapshot.full ? '已被选满' : '抢这门'}</button></article><article class="scenario-course-card target"><div><span class="status neutral">你的目标</span><h3>机器学习</h3><p>CS3102 · 3 学分 · 周三 5—6节</p></div><div class="scenario-seat"><strong>46 / 60</strong><span>尚有余位</span></div><a class="button secondary" href="#/courses?q=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0">去选这门</a></article></div>${!snapshot.distracted && !snapshot.full ? `<div class="scenario-interruption"><span>${icon('info', 16)}</span><div><strong>重点推荐课程知情确认</strong><p>选《机器学习》前，需先完成一项推荐课程办理。</p></div>${button('处理提醒', 'scenario-distract', 'secondary')}</div>` : ''}</div>` : ''}
    ${snapshot.stage === 'finished' ? `<div class="scenario-result ${snapshot.outcome === 'claimed' ? 'success' : 'warning'}"><h2>${snapshot.outcome === 'claimed' ? '你抢到了有点感兴趣的课' : '你错过了有点感兴趣的课'}</h2><p>${snapshot.outcome === 'claimed' ? '但你还没有处理重点推荐。返回选课工作台，体验另一个时间成本。' : '你没有失败选到《机器学习》，但你在处理系统要求时失去了另一个选择。'}</p><a class="button primary" href="#/courses?q=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0">继续体验选课办理</a></div>` : ''}</section>`;
}

function scenarioShell() {
  return `<header class="topbar"><a href="#/courses" class="brand"><span class="brand-mark">${icon('school', 27)}</span><span class="university">明理大学</span><span class="system-name">本科教务系统</span></a><div class="top-actions"><span class="current-term">2026—2027 学年 · 第一学期</span>${button('场景 1· 8:00 抢课', 'scenario-1', 'scenario-top')}${button('体验记录', 'rounds', 'quiet')}${button('新一轮体验', 'start-round', 'secondary')}${button(icon('info'), 'about', 'quiet', 'aria-label="系统信息"')}<span class="avatar">李</span><span class="student-name">李予安</span></div></header><main class="scenario-main" id="content">${scenarioPage()}<footer class="page-footer"><span>明理大学本科生院</span></footer></main>`;
}

function stopScenarioTimer() { if (scenarioTimer) { clearInterval(scenarioTimer); scenarioTimer = null; } }
function startScenarioTimer() {
  stopScenarioTimer();
  const started = performance.now();
  scenarioTimer = setInterval(() => {
    const before = scenarioState.stage;
    scenarioState = scenarioTransition(scenarioState, { type: 'TICK', elapsed: performance.now() - started });
    if (before !== 'live' && scenarioState.stage === 'live') {
      const params = new URLSearchParams({ scenario: '1', sort: 'fit' });
      navigate('courses', params);
      return;
    }
    render(true);
    if (scenarioState.stage === 'finished') stopScenarioTimer();
  }, 180);
}

function courseAction(course) {
  const selected = state.draft.includes(course.id);
  if (!state.editing) return selected ? '<span class="row-state">已提交</span>' : '<span class="muted">—</span>';
  if (selected) return linkButton(state.origins[course.id] === 'guarantee' && state.withdrawal.requested ? '执行撤销' : '退选', 'drop', `data-course="${course.id}" aria-label="退选${course.name}"`);
  if (enrollmentFor(course) >= course.capacity) return '<span class="status muted-status">已满</span>';
  const conflicting = state.draft.find(id => conflicts(course, getCourse(id)));
  if (conflicting) return button('时间冲突', 'add', 'row-button conflict-button', `data-course="${course.id}" aria-label="查看${course.name}时间冲突"`);
  return button('选课', 'add', 'row-button', `data-course="${course.id}" aria-label="选课${course.name}"`);
}
function enrollmentFor(course) {
  const f = filters();
  if (f.scenario && course.id === INTEREST_COURSE.id) return scenarioSnapshot(scenarioState).filled;
  return course.enrolled;
}
function courseTable(courses, mode = 'catalog') {
  return `<div class="course-table-wrap"><table class="course-table ${mode === 'submitted' ? 'submitted-table' : ''}"><caption class="sr-only">${mode === 'catalog' ? '开课教学班列表' : '方案课程明细'}</caption><thead><tr><th scope="col">课程 / 教学班</th><th scope="col">学分</th><th scope="col">教师</th><th scope="col">上课安排</th><th scope="col">${mode === 'catalog' ? '已选 / 容量' : '课程类别'}</th>${mode === 'catalog' ? '<th scope="col" class="action-cell">操作</th>' : ''}</tr></thead><tbody>${courses.map(c => { const enrolled = enrollmentFor(c); return `<tr class="${state.draft.includes(c.id) && mode === 'catalog' ? 'selected-row' : ''}"><td data-label="课程"><button class="course-title" data-action="detail" data-course="${c.id}">${c.name}</button><div class="course-secondary"><span>${c.code} · 01班</span>${c.eligibleFrom ? `<span class="course-stage">${['', '大一', '大二', '大三', '大四'][c.eligibleFrom]}起</span>` : ''}${mode === 'catalog' ? `<span class="fit-value ${c.fit >= 90 ? 'recommended' : ''}">${c.fit >= 90 ? '推荐 ' : '适配 '}${c.fit}%</span>` : ''}</div></td><td data-label="学分" class="credit-cell">${c.credits}</td><td data-label="教师">${c.teacher}</td><td data-label="上课安排"><span>${timeText(c)}</span><small>${c.room} · ${c.weeks}</small></td><td data-label="${mode === 'catalog' ? '容量' : '类别'}">${mode === 'catalog' ? `<span class="capacity ${enrolled >= c.capacity ? 'full' : ''}">${enrolled}<em> / ${c.capacity}</em></span>` : c.category}</td>${mode === 'catalog' ? `<td class="action-cell">${courseAction(c)}</td>` : ''}</tr>`; }).join('')}</tbody></table></div>`;
}

function selectionPanel() {
  const s = planSummary(state);
  return `<aside class="selection-panel" aria-label="当前选课方案"><div class="panel-title"><h2>${state.editing ? '待提交方案' : '已提交方案'}</h2><span>${s.count} 门</span></div><div class="plan-credits"><strong>${s.credits}<span> / ${MAX_CREDITS}</span></strong><span>学分</span></div><div class="credit-track"><i style="width:${s.credits / MAX_CREDITS * 100}%"></i><b style="left:${MIN_CREDITS / MAX_CREDITS * 100}%"></b></div><div class="credit-labels"><span>最低 ${MIN_CREDITS} 学分</span><span>上限 ${MAX_CREDITS} 学分</span></div>
    <div class="selected-list">${state.draft.length ? state.draft.map(id => { const c = getCourse(id); return `<div class="selected-item"><div class="selected-item-head"><button class="course-title" data-action="detail" data-course="${id}">${c.name}</button>${state.editing ? linkButton(state.origins[id] === 'guarantee' && state.withdrawal.requested ? '执行撤销' : '退选', 'drop', `data-course="${id}" aria-label="退选方案中的${c.name}"`) : icon('check', 15)}</div><div class="selected-item-meta">${c.credits} 学分 · ${timeText(c)}</div>${state.origins[id] === 'guarantee' ? `<span class="status warning">${state.withdrawal.requested ? '撤销获批 · 席位仍在' : '保障席位'}</span>` : ''}</div>`; }).join('') : `<div class="empty-selection">${icon('inbox', 30)}<span>暂无待提交课程</span></div>`}</div>
    <div class="plan-bottom"><div class="plan-condition ${s.valid ? 'met' : ''}">${icon(s.valid ? 'check' : 'info', 15)} ${s.valid ? '符合本轮学分要求' : `还需选择 ${Math.max(0, MIN_CREDITS - s.credits)} 学分`}</div>${state.editing ? button('核对并提交', 'review', 'primary full-width', !s.valid ? 'disabled' : '') : button('查看提交结果', 'goto-results', 'primary full-width')}<a class="timetable-link" href="#/timetable">查看每周课表</a></div></aside>`;
}

function coursesPage() {
  const f = filters(), list = filterCourses(f);
  const departments = [...new Set(COURSES.map(c => c.department))];
  const recommendationExpanded = isMachineLearningQuery(f.query) && f.sort === 'fit';
  const rush = f.scenario;
  return `${!state.editing ? `<div class="submitted-banner"><span>${icon('check')} 本轮方案已提交，课程列表可继续查询。</span>${button('调整选课', 'edit', 'secondary')}</div>` : ''}<div class="work-grid"><section class="catalog-panel"><div class="section-title"><h2>开课查询</h2><span>第一轮可选教学班</span></div>
    <form id="filter-form" class="filters"><div class="search-row"><label class="search-field">${icon('search')}<span class="sr-only">课程名称、课程号或教师</span><input type="search" name="q" placeholder="课程名称 / 课程号 / 任课教师" value="${escape(f.query)}" autocomplete="off"></label><button class="button primary" type="submit">查询</button>${linkButton('重置', 'reset-filters')}</div><div class="filter-row"><label>开课学院<select name="department"><option value="all">全部学院</option>${departments.map(d => `<option ${f.department === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label><label>课程类别<select name="category"><option value="all">全部类别</option>${['专业选修', '公共选修', '通识选修'].map(c => `<option ${f.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label><label class="check-filter"><input type="checkbox" name="available" ${f.availableOnly ? 'checked' : ''}>仅显示有余位</label></div></form>
    ${recommendationExpanded ? `<div class="ranking-notice" role="status">${icon('info', 15)}<span>已根据综合适配扩展查询结果；关键词完全匹配的课程仍在列表中。</span></div>` : ''}<div class="table-toolbar"><span>共 <strong>${list.length}</strong> 个教学班${f.query ? ` · “${escape(f.query)}”` : ''}</span><label>排序<select id="sort-select" aria-label="课程排序"><option value="fit" ${f.sort === 'fit' ? 'selected' : ''}>综合适配优先</option><option value="code" ${f.sort === 'code' ? 'selected' : ''}>课程号顺序</option><option value="credits" ${f.sort === 'credits' ? 'selected' : ''}>学分从高到低</option></select></label></div>
    ${list.length ? courseTable(list) : `<div class="empty-state">${icon('search', 30)}<h3>没有符合条件的教学班</h3><p>请修改查询条件。</p>${button('清除筛选条件', 'reset-filters', 'secondary')}</div>`}<div class="table-footer"><span>已显示全部 ${list.length} 个教学班</span><span>每个教学班独立占用选课名额</span></div></section>${selectionPanel()}</div>`;
}

function timetablePage() {
  const { params } = route();
  const useSubmitted = params.get('mode') === 'submitted' || (!state.editing && params.get('mode') !== 'draft');
  const ids = useSubmitted ? state.submitted?.courses || [] : state.draft;
  return `<section class="surface"><div class="section-title"><div><h2>每周课程安排</h2><span>${ids.length} 门课程 · 第 1—16 周</span></div><div class="segmented"><a href="#/timetable?mode=draft" class="${!useSubmitted ? 'active' : ''}">待提交方案</a><a href="#/timetable?mode=submitted" class="${useSubmitted ? 'active' : ''}">已提交方案</a></div></div><div class="schedule-wrap"><table class="schedule"><caption class="sr-only">${useSubmitted ? '已提交' : '待提交'}方案每周课表</caption><thead><tr><th scope="col">节次 / 时间</th>${dayNames.slice(1).map(d => `<th scope="col">${d}</th>`).join('')}</tr></thead><tbody>${[1, 3, 5, 7, 9].map(start => `<tr><th scope="row"><strong>${start}—${start + 1} 节</strong><small>${periods[start]}</small></th>${[1, 2, 3, 4, 5].map(day => { const c = ids.map(getCourse).find(c => c.day === day && c.start === start); return `<td>${c ? `<button class="schedule-course ${!useSubmitted && state.origins[c.id] === 'guarantee' ? 'guarantee-course' : ''}" data-action="detail" data-course="${c.id}"><strong>${c.name}</strong><span>${c.teacher} · ${c.room}</span><small>${c.weeks}</small></button>` : '<span class="schedule-empty">—</span>'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div><div class="table-footer"><span>${useSubmitted ? '按最近一次提交结果显示' : '按当前待提交方案显示，提交前可继续调整'}</span><a href="#/courses">返回课程查询</a></div></section>`;
}

function resultsPage() {
  const receipt = state.submitted;
  if (!receipt) return `<section class="surface empty-state">${icon('receipt', 34)}<h2>尚无提交记录</h2><p>当前选课方案尚未提交。</p><a class="button primary" href="#/courses">返回选课工作台</a></section>`;
  const audit = buildChoiceAudit(state);
  const auditSection = !audit.visible ? '' : `<section class="surface choice-audit" aria-labelledby="choice-audit-title"><div class="section-title"><div><h2 id="choice-audit-title">个人方案办理成本</h2><span>根据本轮实际办理记录生成</span></div><span class="status warning">较推荐方案多 ${audit.additionalRecords} 条</span></div>
    <div class="audit-comparison"><div><span>按重点推荐提交</span><strong>${audit.baselineRecords}</strong><small>条预计办理记录</small></div><span class="audit-arrow" aria-hidden="true">→</span><div class="actual"><span>坚持当前个人方案</span><strong>${audit.actualRecords}</strong><small>条实际办理记录</small></div></div>
    <div class="audit-facts" aria-label="额外办理事项"><div><strong>${audit.appealCharacters}</strong><span>字个人意愿申明</span></div><div><strong>${audit.quizAttempts}</strong><span>次课程理解核验</span></div><div><strong>${audit.withdrawalStages}</strong><span>阶段席位撤销</span></div><div><strong>${audit.filingDeclarations}</strong><span>项备案声明</span></div></div>
    <ol class="audit-phases">${audit.phases.map(phase => `<li><span>${phase.records} 条记录</span><div><strong>${phase.label}</strong><p>${phase.description}</p></div></li>`).join('')}</ol><div class="audit-outcome">${icon('check', 17)}<span>最终提交结果未改变：方案仅包含《机器学习》。</span></div></section>`;
  return `<section class="surface"><div class="result-header"><div class="result-title"><span class="result-check">${icon('check', 22)}</span><div><h2>选课方案已提交</h2><p>第 ${receipt.revision} 版 · ${receipt.courses.length} 门课程 · ${receipt.credits} 学分</p></div></div>${state.editing ? '<a class="button secondary" href="#/courses">继续调整方案</a>' : button('调整选课', 'edit', 'secondary')}</div><div class="receipt-meta"><div><span>选课轮次</span><strong>第一轮 · 正选</strong><small class="experience-label">${escape(roundLabel)}</small></div><div><span>提交编号</span><strong>${escape(receipt.id)}</strong></div><div><span>提交时间</span><strong>${dateText(receipt.at)}</strong></div></div>${courseTable(receipt.courses.map(getCourse), 'submitted')}<div class="table-footer"><span>以上课程已纳入本轮选课结果</span><a href="#/timetable?mode=submitted">查看已提交课表</a></div></section>
    ${auditSection}
    <details class="surface record-section"><summary>办理记录 <span>${state.events.length} 条</span></summary><ol class="activity-list">${state.events.slice().reverse().map(e => `<li><span>${escape(e.label)}</span><time>${dateText(e.at)}</time></li>`).join('')}</ol></details>
    ${state.history.length ? `<details class="surface record-section"><summary>历史提交 <span>${state.history.length} 版</span></summary>${state.history.slice().reverse().map(r => `<div class="history-row"><div><strong>第 ${r.revision} 版</strong><small>${dateText(r.at)}</small></div><span>${r.courses.map(id => getCourse(id).name).join('、')}</span><span>${r.credits} 学分</span></div>`).join('')}</details>` : ''}`;
}

function courseDetails(id) {
  const c = getCourse(id);
  if (!c) return;
  dialogKind = { type: 'detail', id };
  setDialog(`<div class="dialog-heading"><div><span class="dialog-kicker">${c.code} · 01 教学班</span><h2 id="modal-title">${c.name}</h2></div>${closeButton()}</div><div class="detail-facts">${[['开课学院', c.department], ['课程类别', c.category], ['学分', `${c.credits} 学分`], ['任课教师', c.teacher], ['上课时间', `${timeText(c)} · ${periods[c.start]}`], ['上课地点', c.room], ['教学周次', c.weeks], ['已选 / 容量', `${c.enrolled} / ${c.capacity}`]].map(([l, v]) => `<div><span>${l}</span><strong>${v}</strong></div>`).join('')}</div><details class="fit-model"><summary><span>综合适配依据</span><strong>${c.fit}%</strong></summary><p>当前轮次的综合适配度由以下因素共同构成。</p><dl>${FIT_MODEL.map(factor => `<div><dt>${factor.label}</dt><dd><i style="width:${factor.weight}%"></i><span>${factor.weight}%</span></dd></div>`).join('')}</dl></details><section class="detail-section"><h3>课程简介</h3><p>${c.description}</p></section><section class="detail-section"><h3>教学内容</h3><ol>${c.syllabus.map(t => `<li>${t}</li>`).join('')}</ol></section><section class="detail-section"><h3>考核方式</h3><p>${c.assessment}</p></section><div class="dialog-actions">${button('关闭', 'close-dialog', 'secondary')}${state.editing ? (state.draft.includes(id) ? button('退选该课程', 'drop', 'secondary', `data-course="${id}"`) : button('选入该课程', 'add', 'primary', `data-course="${id}" ${c.enrolled >= c.capacity ? 'disabled' : ''}`)) : ''}</div>`);
}
function closeButton() { return `<button type="button" class="icon-button" data-action="close-dialog" aria-label="关闭对话框">${icon('close', 21)}</button>`; }
function setDialog(html, className = '') {
  const opening = !dialog.open;
  const oldFocus = document.activeElement;
  if (opening && !returnFocus) returnFocus = oldFocus?.matches('[data-action]') ? { action: oldFocus.dataset.action, course: oldFocus.dataset.course } : null;
  cancelHold();
  dialog.className = className;
  dialog.innerHTML = html;
  if (!dialog.open) dialog.showModal();
  setupHold();
  if (!opening && dialog.contains(document.activeElement) === false) {
    const heading = dialog.querySelector('#modal-title');
    heading?.setAttribute('tabindex', '-1'); heading?.focus({ preventScroll: true });
  }
}
function closeDialog() {
  cancelHold(); dialogKind = null;
  suppressDialogClose = true; dialog.close(); suppressDialogClose = false;
  if (returnFocus) {
    const candidates = [...document.querySelectorAll(`[data-action="${returnFocus.action}"]`)];
    const target = candidates.find(node => node.dataset.course === returnFocus.course);
    (target || document.querySelector('h1'))?.focus({ preventScroll: true });
    returnFocus = null;
  } else document.querySelector('h1')?.focus({ preventScroll: true });
}
function procedureDialog() {
  dialogKind = { type: 'procedure' };
  const content = procedureContent(state, { button, closeButton, escape, icon, timeText });
  setDialog(content.html, content.className);
}

const formControls = '#filter-form input, #filter-form select, dialog form input, dialog form select, dialog form textarea';
function captureInputs() {
  return [...document.querySelectorAll(formControls)].map(node => ({ form: node.form?.id, name: node.name, value: node.value, checked: node.checked }));
}
function restoreInputs(inputs) {
  for (const saved of inputs) {
    for (const input of document.querySelectorAll(formControls)) {
      if (input.name !== saved.name || input.form?.id !== saved.form) continue;
      if (input.type === 'radio' || input.type === 'checkbox') { if (input.value === saved.value) input.checked = saved.checked; }
      else input.value = saved.value;
    }
  }
}
function render(preserveInputs = false) {
  const { page } = route();
  if (page === 'scenario-1') {
    app.innerHTML = scenarioShell();
    const scenarioActive = scenarioState.stage === 'countdown' || scenarioState.stage === 'live';
    if (scenarioActive && !scenarioTimer) startScenarioTimer();
    if (!scenarioActive) stopScenarioTimer();
    return;
  }
  if (!(route().params.get('scenario') === '1' && (scenarioState.stage === 'countdown' || scenarioState.stage === 'live'))) stopScenarioTimer();
  if (route().params.get('scenario') === '1' && (scenarioState.stage === 'countdown' || scenarioState.stage === 'live') && !scenarioTimer) startScenarioTimer();
  const inputs = preserveInputs ? captureInputs() : [];
  const focusedId = document.activeElement?.id;
  app.innerHTML = shell(({ courses: coursesPage, timetable: timetablePage, results: resultsPage })[page]());
  if (state.pending) procedureDialog();
  else if (dialogKind?.type === 'procedure') closeDialog();
  else if (dialogKind?.type === 'detail') courseDetails(dialogKind.id);
  restoreInputs(inputs);
  const appealInput = document.querySelector('#appeal-text');
  const appealCount = document.querySelector('#appeal-count');
  if (appealInput && appealCount) appealCount.textContent = String(appealLength(appealInput.value));
  if (focusedId && document.getElementById(focusedId)) document.getElementById(focusedId).focus({ preventScroll: true });
}

function setupHold() {
  const hold = document.querySelector('#hold-button');
  if (!hold || hold.disabled) { cancelHold = () => {}; return; }
  let started = null, frame = 0, completed = false;
  const fill = hold.querySelector('i'), label = hold.querySelector('span');
  function stop() {
    cancelAnimationFrame(frame); started = null;
    if (!completed) { fill.style.width = '0'; label.textContent = '按住 2 秒确认撤销'; }
  }
  function tick(now) {
    if (started === null) return;
    const elapsed = now - started;
    fill.style.width = Math.min(100, elapsed / 20) + '%';
    label.textContent = `确认中 ${(elapsed / 1000).toFixed(1)} / 2 秒`;
    if (elapsed >= 2000) { completed = true; stop(); act({ type: 'WITHDRAW_CONFIRM', holdMs: Math.floor(elapsed) }); }
    else frame = requestAnimationFrame(tick);
  }
  function start() { if (started !== null || completed) return; started = performance.now(); frame = requestAnimationFrame(tick); }
  hold.addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); hold.setPointerCapture(e.pointerId); start(); });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) hold.addEventListener(event, stop);
  hold.addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) start(); } });
  hold.addEventListener('keyup', e => { if (e.code === 'Space') { e.preventDefault(); stop(); } });
  hold.addEventListener('contextmenu', e => e.preventDefault());
  const hidden = () => { if (document.hidden) stop(); };
  window.addEventListener('blur', stop); document.addEventListener('visibilitychange', hidden);
  cancelHold = () => { stop(); window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', hidden); };
}

document.addEventListener('submit', e => {
  if (!['filter-form', 'reason-form', 'answer-form', 'appeal-form', 'withdraw-request-form', 'filing-declarations-form', 'filing-statement-form'].includes(e.target.id)) return;
  e.preventDefault();
  const data = new FormData(e.target);
  if (e.target.id === 'filter-form') {
    const params = new URLSearchParams();
    for (const key of ['q', 'department', 'category']) { const value = String(data.get(key) || '').trim(); if (value && value !== 'all') params.set(key, value); }
    if (data.has('available')) params.set('available', '1');
    if (filters().sort !== 'fit') params.set('sort', filters().sort);
    navigate('courses', params);
  } else if (e.target.id === 'reason-form') act({ type: 'CONSENT_REASON', reason: data.get('reason') });
  else if (e.target.id === 'answer-form') act({ type: 'CONSENT_ANSWER', answer: data.get('answer') });
  else if (e.target.id === 'appeal-form') act({ type: 'CONSENT_APPEAL', text: data.get('appeal'), acknowledged: data.has('acknowledged') });
  else if (e.target.id === 'withdraw-request-form') act({ type: 'WITHDRAW_REQUEST', reason: data.get('reason'), courseCode: data.get('courseCode'), benefits: data.has('benefits'), personal: data.has('personal') });
  else if (e.target.id === 'filing-declarations-form') act({ type: 'FILING_DECLARE', confirmations: [0, 1, 2].map(i => data.getAll('declaration').includes(String(i))) });
  else if (e.target.id === 'filing-statement-form') act({ type: 'FILING_STATEMENT', text: data.get('statement') });
});
document.addEventListener('input', e => {
  if (e.target.id === 'appeal-text') {
    const count = document.querySelector('#appeal-count');
    if (count) count.textContent = String(appealLength(e.target.value));
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'withdraw-ack') act({ type: 'WITHDRAW_ACK', checked: e.target.checked });
  if (e.target.id === 'sort-select') { const { params } = route(); params.set('sort', e.target.value); navigate('courses', params); }
  if (e.target.matches('#filter-form select, #filter-form input[type="checkbox"]')) document.querySelector('#filter-form').requestSubmit();
});
document.addEventListener('click', async e => {
  if (e.target.closest('.skip')) {
    e.preventDefault(); const main = document.querySelector('main'); main.setAttribute('tabindex', '-1'); main.focus(); return;
  }
  const target = e.target.closest('[data-action]'); if (!target) return;
  e.preventDefault();
  const action = target.dataset.action;
  const id = target.dataset.course;
  if (action === 'detail') courseDetails(id);
  else if (action === 'close-dialog' || action === 'cancel-procedure') {
    if (state.pending) act({ type: 'CANCEL_PROCEDURE' }); else closeDialog();
  } else if (action === 'add' || action === 'drop') {
    if (dialogKind?.type === 'detail') closeDialog();
    act({ type: action.toUpperCase(), id });
  } else if (action === 'review') act({ type: 'REVIEW' });
  else if (action === 'consent-read') act({ type: 'CONSENT_READ' });
  else if (action === 'consent-coordinate') act({ type: 'CONSENT_COORDINATE' });
  else if (action === 'consent-confirm') act({ type: 'CONSENT_CONFIRM' });
  else if (action === 'consent-open-appeal') act({ type: 'CONSENT_OPEN_APPEAL' });
  else if (action === 'consent-change-reason') act({ type: 'CONSENT_CHANGE_REASON' });
  else if (action === 'filing-return') act({ type: 'FILING_RETURN' });
  else if (action === 'rounds') roundsDialog();
  else if (action === 'scenario-1') { scenarioState = createScenarioState(); navigate('scenario-1'); }
  else if (action === 'scenario-start') { scenarioState = scenarioTransition(scenarioState, { type: 'START' }); render(); }
  else if (action === 'scenario-distract') { scenarioState = scenarioTransition(scenarioState, { type: 'DISTRACT' }); render(); }
  else if (action === 'scenario-claim') { scenarioState = scenarioTransition(scenarioState, { type: 'CLAIM' }); render(); }
  else if (action === 'scenario-reset') { scenarioState = scenarioTransition(scenarioState, { type: 'RESET' }); render(); }
  else if (action === 'start-round') startRound();
  else if (action === 'submit') {
    const token = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    await act({ type: 'SUBMIT', receiptId: 'XK-2026-' + token.slice(0, 8).toUpperCase() });
    if (!state.editing) navigate('results');
  } else if (action === 'edit') { await act({ type: 'EDIT' }); navigate('courses'); }
  else if (action === 'goto-results') navigate('results');
  else if (action === 'view-plan') { const plan = document.querySelector('.selection-panel'); plan?.scrollIntoView({ behavior: 'smooth', block: 'start' }); plan?.setAttribute('tabindex', '-1'); plan?.focus({ preventScroll: true }); }
  else if (action === 'reset-filters') navigate('courses');
  else if (action === 'dismiss') act({ type: 'DISMISS_NOTICE' });
  else if (action === 'about') {
    dialogKind = { type: 'about' };
    setDialog(`<div class="dialog-heading"><h2 id="modal-title">系统信息</h2>${closeButton()}</div><dl class="confirmation-list"><div><dt>服务名称</dt><dd>本科生选课服务</dd></div><div><dt>当前版本</dt><dd>3.0</dd></div></dl><p class="dialog-description">本系统为选课交互原型。学校、学生与课程资料均为虚构，办理记录保存在当前浏览器，不连接真实教务服务。</p><div class="dialog-actions"><a class="button secondary" href="${SOURCE}" target="_blank" rel="noopener">源代码</a>${button('关闭', 'close-dialog', 'primary')}</div>`);
  }
});
dialog.addEventListener('cancel', e => { e.preventDefault(); if (state.pending) act({ type: 'CANCEL_PROCEDURE' }); else closeDialog(); });
dialog.addEventListener('close', () => { if (!suppressDialogClose && !dialog.open) { cancelHold(); dialogKind = null; } });
window.addEventListener('hashchange', () => { closeDialog(); render(); window.scrollTo(0, 0); document.querySelector('h1')?.focus({ preventScroll: true }); });
window.addEventListener('storage', e => {
  if (!useSharedStorage || e.key !== STORAGE_KEY || !e.newValue) return;
  refreshSaved(); render(true);
});
if (!location.hash) history.replaceState(null, '', '#/courses');
const initializeRound = () => {
  try {
    const saved = readSaved();
    if (!saved) save();
    else {
      state = saved.state; storageSequence = saved.sequence;
      roundLabel = saved.label || roundLabel; roundCreatedAt = saved.createdAt || roundCreatedAt;
    }
  } catch { storageError = '浏览器未能保存进度，请保持当前页面打开。'; }
  render(true);
};
actionQueue = useSharedStorage ? navigator.locks.request(STORAGE_KEY, { mode: 'exclusive' }, initializeRound) : Promise.resolve(initializeRound());
render();
