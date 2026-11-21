import { initialState, reduce, restore } from './state.mjs';

const KEY = 'mingli-course-choice-v1';
const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const source = 'https://github.com/BRMRs/course-choice-informed-consent';
const escape = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state = initialState();
let storageWarning = '';
let recovery = '';
try {
  const raw = localStorage.getItem(KEY);
  if (raw) { state = restore(JSON.parse(raw)); recovery = '已恢复上次办理进度。已完成的步骤无需重做。'; }
} catch { storageWarning = '上次保存的进度无法恢复。已开启新的体验，你可以从头办理。'; }

const paths = {
  book:'M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4z M20 4h-5a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h4z',
  grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  list:'M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01',
  shield:'M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7z M8 12l3 3 5-6',
  search:'m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  check:'m5 12 4 4L19 6',
  info:'M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  lock:'M6 10h12v11H6z M8 10V7a4 4 0 0 1 8 0v3',
  time:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
};
function icon(name, size=20) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.book}"/></svg>`; }
function button(label, action, style='', extra='') { return `<button class="button ${style}" data-action="${action}" ${extra}>${label}</button>`; }
function textButton(label, action, extra='') { return `<button class="text-button" data-action="${action}" ${extra}>${label}</button>`; }
function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { storageWarning = '本次可以继续办理，但浏览器未能保存进度，刷新可能丢失当前进度。'; } }
function dispatch(action) {
  const before = state.view;
  state = reduce(state, action);
  recovery = '';
  persist(); render();
  if (state.view !== before) { window.scrollTo(0, 0); document.querySelector('h1')?.focus({preventScroll:true}); }
}

function shell(content) {
  const cartView = ['cart','remove','confirm','success'].includes(state.view);
  const steps = [['确认选课意向',state.query],['办理知情拒绝',state.rejected],['核对个人课表',state.backupRemoved],['获取选课回执',state.receipt]];
  return `<header class="topbar">
    <a class="brand" href="#" data-action="home"><span class="seal">${icon('book',27)}</span><span><strong>明理大学</strong><small>MINGLI UNIVERSITY</small></span></a>
    <div class="top-title">本科生选课服务平台</div>
    <div class="top-meta"><span class="semester">2026—2027 · 秋季学期</span><span class="avatar">同</span><span class="muted">体验同学</span></div>
  </header>
  <div class="layout"><aside class="sidebar"><div><p class="nav-label">教务服务 / ACADEMICS</p><nav aria-label="主导航">
    <button class="nav-item ${!cartView?'active':''}" data-action="home">${icon('grid')}选课中心</button>
    <button class="nav-item ${cartView?'active':''}" data-action="cart">${icon('list')}我的课表 <span class="count">${state.cart.length}</span></button>
  </nav></div><section class="side-task"><h3>本次办理进度</h3>${steps.map(([name,done],i)=>`<div class="task-row ${done?'done':''}"><span class="step-dot">${done?'✓':i+1}</span>${name}</div>`).join('')}</section>
  <div class="sidebar-note"><strong>你的选择，我们认真对待。</strong>所以，请你也认真对待<br>我们为你做出的选择。<br><br>${textButton('重新体验','reset')}</div></aside>
  <main id="content" class="main"><div class="breadcrumb"><span>教务服务 &nbsp; / &nbsp; 选课中心</span><span>开放办理中 · 交互演示</span></div>
  ${storageWarning?`<div class="notice storage-warning" role="status">${escape(storageWarning)}</div>`:''}
  ${recovery?`<div class="notice" role="status">${recovery}</div>`:''}
  ${state.notice?`<div class="notice" role="status">${escape(state.notice)}</div>`:''}
  ${content}<footer class="footer"><span>明理大学教务服务中心 · 虚构校园，真实的选择困境</span><span><a href="${source}" target="_blank" rel="noopener">源代码仓库</a> &nbsp; · &nbsp; ${textButton('重新体验','reset')}</span></footer></main></div>`;
}
function searchForm() {
  return `<form class="search" id="search-form" role="search">${icon('search')}<label class="sr-only" for="course-search">搜索课程</label><input id="course-search" name="query" type="search" placeholder="输入你想学习的课程" value="${escape(state.query)}" autocomplete="off" required><button class="button" type="submit">搜索课程</button></form>`;
}
function home() {
  return `<div class="eyebrow">Informed choice, better future</div><section class="hero"><div class="hero-copy"><span class="tag">2026 秋季 · 课程意向办理</span><h1 tabindex="-1">每一次选择，<br>都值得<em>再考虑。</em></h1><p>你有自由选择的权利。我们有责任确保，<br>你已充分了解所有值得选择的可能。</p><span class="tiny">你确定不学吗？ &nbsp; 校园课程充分知情选择系统</span></div><div class="hero-art" aria-hidden="true"><div class="mini-doc"><small>OFFICE OF ACADEMIC AFFAIRS</small><h3>充分知情<br>自主选择</h3><div class="doc-line"></div><div class="doc-line" style="width:75%"></div><div class="doc-stamp">你的成长 · 我们的责任</div></div><span class="art-label">YOUR CHOICE, OUR CONSIDERATION.</span></div></section>
  <div class="task-banner">${icon('info')}<div><p><strong>本次任务：只选《机器学习》，获取选课回执。</strong></p><small>这是本轮唯一选课入口。选一门即可满足提交条件，所有信息均为演示数据。</small></div></div>
  <section><div class="section-head"><h2>从你的兴趣开始</h2><span>当然，也不止于你的兴趣</span></div>${searchForm()}<p class="search-hint">试试搜索 ${textButton('机器学习','quick-search')} <span>· 系统将综合考虑，为你呈现更适配的课程。</span></p></section>
  <div class="home-bottom"><section class="panel notice-panel"><span class="notice-icon">${icon('shield',24)}</span><div><h3>理性选课温馨提示</h3><p>兴趣是起点，不是边界。拒绝一门课程之前，<br>请先给予它一次被你充分了解的机会。</p></div></section><section class="panel"><div class="score-mini"><div><h3>培养方案完整度</h3><p>你的兴趣之外，还有成长空间。</p></div><span class="score-number">78<small>%</small></span></div><div class="bar"><i></i></div><span class="tiny">建议保留一项跨学科成长机会</span></section></div>`;
}
const courses = [
  {id:'agri',title:'农业数据采集基础',score:98,reason:'为你尚未被充分利用的星期五晚上，安排一点成长。',code:'AGRI 102',tag:'重点适配推荐'},
  {id:'stats',title:'教育统计软件实践',score:94,reason:'本课程尚有充足容量，有效保障你的学习机会。',code:'EDUC 206',tag:'容量充足'},
  {id:'expert',title:'专家系统发展史',score:91,reason:'补全知识版图，让你的人工智能学习不留空白。',code:'COMP 118',tag:'拓展知识边界'},
  {id:'ml',title:'机器学习',score:67,reason:'与你的搜索完全匹配，但兴趣并非适配的全部。',code:'COMP 301',tag:'关键词完全匹配'},
];
function results() {
  const matched = /机器学习|machine\s*learning/i.test(state.query);
  return `<div class="eyebrow">Course discovery</div><h1 tabindex="-1">我们为你找到了${matched?'四种可能':'更多可能'}。</h1><p class="subtitle">你的搜索是一个开始。更全面的选择，值得排在前面。</p>${searchForm()}
  ${matched?`<div class="rule-box"><strong>已按综合适配度优化排序，而非仅按关键词匹配。</strong><details><summary>综合适配度究竟考虑了什么？</summary><div class="weights">${[['50%','课程容量优化'],['25%','空闲时段利用'],['15%','课程分布均衡'],['10%','个人兴趣']].map(([n,l])=>`<div class="weight"><strong>${n}</strong><small>${l}</small></div>`).join('')}</div><p class="tiny" style="margin-top:10px;margin-bottom:0">演示规则权重；以下适配度为固定演示值。个人兴趣当然被考虑了，足足占 10%。</p></details></div><div class="section-head"><h2>“${escape(state.query)}”的搜索结果</h2><span>共 4 门课程</span></div><div class="courses">${courses.map((c,i)=>`<article class="course ${c.id==='ml'?'target':''}"><div class="course-top"><span class="course-num">${String(i+1).padStart(2,'0')} / ${c.code}</span><span class="tag ${c.id==='ml'?'match':''}">${c.tag}</span></div><h3>${c.title}</h3><p>${c.reason}</p><div class="course-foot"><span><strong>${c.score}%</strong>综合适配度</span><button data-action="${c.id==='ml'?'target':'course-info'}" data-course="${c.id}">查看课程</button></div></article>`).join('')}</div>`:`<div class="panel empty"><h2>还没有这门课的演示数据</h2><p>本次体验的目标课程是《机器学习》。修改搜索词即可继续，已完成进度不会丢失。</p>${button('搜索机器学习','quick-search')}</div>`}`;
}
function detail() {
  return `${textButton('返回搜索结果','results')}<div class="two-col"><section class="panel"><div class="course-cover" aria-hidden="true"><span>Machine<br>Learning</span></div><span class="tag match">关键词完全匹配</span><h1 tabindex="-1">机器学习</h1><p class="subtitle">让计算机从数据中学习，而不是从建议中妥协。</p><div class="info-line"><span>COMP 301</span><span>3 学分</span><span>周三 14:00—16:00</span></div><h3>课程介绍</h3><p class="body-copy" style="margin-top:12px">从监督学习到模型评估，理解算法如何从数据中发现规律。通过实际案例，建立机器学习的基础知识与应用能力。</p><div class="reading"><p>本轮选课只选此门即可满足提交要求。你不需要额外课程才能完成本轮任务。</p></div></section><aside class="aside-card"><div class="eyebrow">Personal fit</div><div class="score-number" style="color:#d9eda9;margin-top:13px">67<small>%</small></div><h3>${state.rejected?'你的坚持，已被记录。':'先了解，再选择。'}</h3><p>${state.rejected?'你已充分了解重点推荐课程，并完成知情拒绝。现在可以加入你的目标课程。':'为保障充分知情，请先了解并办理一门重点推荐课程的拒绝手续。完成后，即可加入本课程。'}</p><div class="bar"><i style="width:${state.rejected?100:0}%"></i></div><span class="tiny">知情拒绝进度：${state.rejected?'1 / 1 已完成':'0 / 1 待办理'}</span>${state.rejected?button(state.added?'查看我的课表':'加入《机器学习》',state.added?'cart':'add','lime'):button('办理知情拒绝','consent','lime')}<p class="tiny">${icon(state.rejected?'check':'lock',14)} ${state.rejected?'已解锁，可自由选择':'加入课程暂未解锁 · 原因如上'}</p></aside></div>`;
}
function consent() {
  const stage = !state.read?0:!state.reason?1:!state.quizPassed?2:3;
  const labels = ['了解课程','表达理由','理解测验','确认拒绝'];
  let body = '';
  if (stage===0) body=`<span class="tag">你将拒绝的重点推荐课程</span><h2 style="margin-top:15px">农业数据采集基础</h2><p class="body-copy">在作出决定之前，请了解以下课程事实。</p><div class="reading"><p><strong>学什么：</strong>采集土壤湿度、温度等农业环境数据。</p><p><strong>怎么学：</strong>认识基础传感器，记录并整理采集结果。</p><p><strong>何时学：</strong>星期五 18:00—20:00，3 学分。</p></div><p class="tiny">你已经可以看到全部介绍。无需计时等待，确认了解后即可继续。</p>${button('我已了解，继续拒绝','read')}`;
  if (stage===1) body=`<h2>请说明你的拒绝理由</h2><p class="body-copy">每个决定都值得被认真记录。请选择最接近你真实想法的一项。</p><form id="reason-form">${['我不感兴趣','我只想选机器学习','星期五晚上有其他安排'].map((r,i)=>`<label class="option"><input type="radio" name="reason" value="${r}" required><span>${r}</span></label>`).join('')}<div class="action-row"><button class="button" type="submit">记录理由并继续</button></div></form>`;
  if (stage===2) body=`<h2>拒绝之前，请证明你了解</h2><p class="tiny">你的原始理由：${escape(state.reason)}（已保存）</p><blockquote class="quote"><small>教务系统的进一步考虑</small>尚未建立兴趣，不代表课程不适合你。请先证明，你理解将要放弃的成长机会。</blockquote><form id="quiz-form"><h3 style="margin:22px 0 12px">农业数据采集主要获得哪类信息？</h3>${[['bus','校车班次'],['environment','土壤湿度、温度等环境数据'],['door','宿舍门禁记录']].map(([v,l])=>`<label class="option"><input type="radio" name="answer" value="${v}" required><span>${l}</span></label>`).join('')}<div class="action-row"><button class="button" type="submit">提交理解测验</button></div></form><details class="rule-box"><summary>重新查看课程事实</summary><p style="margin:12px 0 0">本课程学习采集土壤湿度、温度等农业环境数据，认识基础传感器。</p></details>`;
  if (stage===3) body=`<span class="checkmark">${icon('check',25)}</span><h2>你已具备拒绝本课程的条件</h2><p class="body-copy">你已阅读课程信息，表达拒绝理由，并通过理解测验。我们确认，这不是一次未经思考的拒绝。</p><div class="reading"><p>原始理由：${escape(state.reason)}</p><p>待拒绝课程：农业数据采集基础</p><p>下一步：解锁并加入《机器学习》</p></div>${button('是的，我仍然不选这门课','reject')}`;
  return `<div class="eyebrow">Informed refusal procedure</div><h1 tabindex="-1">你确定不学吗？</h1><p class="subtitle">当然可以拒绝。只是，请先完成拒绝所需的充分了解。</p><div class="progress-steps">${labels.map((l,i)=>`<div class="progress-step ${i<=stage?'active':''}">${i<stage?'✓':i+1} &nbsp;${l}</div>`).join('')}</div><div class="two-col"><section class="panel">${body}</section><aside class="panel"><span class="tag">办理须知</span><h3 style="margin-top:16px">你的选择权始终受到尊重</h3><p class="body-copy" style="margin-top:14px">本流程仅为帮助你作出理性决定。完成这四个步骤后，你可以继续坚持最初的选择。</p><p class="tiny">已完成步骤会保存。答错可以重试，不会要求重新阅读。</p>${textButton('暂时返回目标课程','target')}</aside></div>`;
}
function cart() {
  if (!state.added) return `<div class="eyebrow">Your course plan</div><h1 tabindex="-1">我的课表</h1><div class="panel empty"><h2>你的课表还是空的</h2><p>本次任务是仅选择《机器学习》。从搜索开始，或继续上次的办理。</p>${button(state.query?'继续办理':'开始选课',state.query?'target':'quick-search')}</div>`;
  const backup = state.cart.includes('agri');
  return `<div class="eyebrow">Your course plan</div><h1 tabindex="-1">你的选择，已为你妥善安排。</h1><p class="subtitle">请核对待提交课程。只有最终提交后，才会生成选课回执。</p>
  ${backup?`<div class="task-banner">${icon('shield')}<div><p><strong>额外为你保留了一门保障课程。</strong></p><small>已记录你的拒绝。为避免未来后悔，我们仍为你保留一个保障席位。此课程尚未提交。</small></div></div>`:''}
  <div class="two-col"><section class="panel"><div class="section-head" style="margin-top:0"><h2>待提交课程</h2><span>${state.cart.length} 门 · ${state.cart.length*3} 学分</span></div><div class="cart-course"><div><span class="cart-code">COMP 301 · 个人选择</span><h3>机器学习</h3><p>周三 14:00—16:00</p></div><div class="cart-meta"><strong>3</strong>学分</div></div>${backup?`<div class="cart-course"><div><span class="tag amber">系统保障课 · 尚未提交</span><h3>农业数据采集基础</h3><p>你已知情拒绝此课程，原始记录仍然有效。</p></div><div class="cart-meta"><strong>3</strong>学分<br>${textButton('放弃保障席位','remove')}</div></div><p class="small-note">这门课不是你选的，但系统认为你可能会需要。</p>`:`<div class="notice">${icon('check',17)} 已放弃农业数据采集保障席位。该课程不会再次自动加入。</div>`}</section>
  <aside><div class="panel"><span class="tag match">本轮提交条件：已满足</span><h3 style="margin-top:17px">一门课，就已足够。</h3><p class="body-copy" style="margin-top:10px">《机器学习》满足本轮演示选课要求，无需额外选课。</p></div><div class="completeness"><div class="complete-head"><h3>培养完整度</h3><strong>${backup?'100':'78'}%</strong></div><div class="bar"><i style="width:${backup?'100':'78'}%"></i></div><p>${backup?'保留保障席位，成长方案更加完整。':'未保留跨学科保障建议 −22%。你的选课符合要求，我们仍建议你成为更完整的自己。'}</p>${button('返回查看成长建议','suggestions','secondary')}<div style="margin-top:15px">${backup?`<p class="tiny">要完成“只选机器学习”的任务，请先放弃保障席位。</p>`:textButton('按当前方案提交','review')}</div></div></aside></div>`;
}
function remove() {
  return `<div class="eyebrow">Learning opportunity protection</div><h1 tabindex="-1">放弃一份保障，需要你的确认。</h1><p class="subtitle">我们尊重你的决定，也有义务再次提醒你。</p><div class="two-col"><section class="panel"><span class="tag amber">待放弃的保障席位</span><h2 style="margin-top:15px">农业数据采集基础</h2><blockquote class="quote">你刚刚已经证明，你充分了解这门课程。现在，请再确认一次，你愿意放弃它。</blockquote><label class="option"><input type="checkbox" id="waiver" ${state.waiver?'checked':''}><span>我理解可以继续选择《机器学习》，仍选择放弃此保障席位。<small>放弃后不会自动加回，不影响本轮提交资格。</small></span></label><button id="hold-button" class="button hold" ${!state.waiver?'disabled':''} style="margin-top:16px"><i></i><span>长按 2 秒，确认放弃保障</span></button><p id="hold-status" class="tiny" role="status" style="margin-top:12px">支持鼠标、触控，或聚焦按钮后按住空格。中途松开可重新尝试。</p><div class="action-row">${textButton('返回课表，暂不放弃','cart')}</div></section><aside class="panel"><h3>已经拒绝，为什么还要再拒绝？</h3><p class="body-copy" style="margin-top:13px">知情拒绝是你的意愿记录。保障席位是我们为你做出的安排。两者并不矛盾。</p></aside></div>`;
}
function confirm() {
  return `<div class="eyebrow">Final confirmation</div><h1 tabindex="-1">最后，按你的选择提交。</h1><p class="subtitle">以下是最终提交内容。我们不会在提交后替你改变选择。</p><div class="panel" style="max-width:760px;margin-top:25px"><span class="tag match">本轮提交条件：已满足</span><div class="cart-course" style="margin-top:18px"><div><span class="cart-code">COMP 301</span><h2 style="margin:6px 0">机器学习</h2><p>周三 14:00—16:00</p></div><div class="cart-meta"><strong>3</strong>学分</div></div><div class="receipt-total"><span>将提交 1 门课程</span><strong>共 3 学分</strong></div><p class="body-copy">已放弃：农业数据采集基础保障席位。<br>培养完整度：78%。本方案符合本轮提交要求。</p><div class="action-row">${button('是的，提交我真正选择的课程','submit')}${textButton('返回核对课表','cart')}</div></div>`;
}
function success() {
  const receipt = state.receipt;
  const actionCount = state.events.length;
  const searches = state.events.filter(e=>e.type==='SEARCH').length;
  const quizAttempts = state.attempts;
  const seconds = Math.floor(state.activeMs/1000);
  const stamp = receipt?.time ? new Date(receipt.time).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}) : '';
  return `<section class="receipt"><div class="receipt-head"><span class="checkmark">${icon('check',27)}</span><div class="eyebrow" style="justify-content:center">Your choice, finally.</div><h1 tabindex="-1">选课成功。这次，听你的。</h1><p>你最终选择的，仍然是最初想选的那一门。</p></div><div class="receipt-sheet"><div class="receipt-school"><div><strong>明理大学 · 选课回执</strong><div class="tiny">2026—2027 秋季学期</div></div><div class="receipt-id">编号 ${escape(receipt?.id)}<br>${escape(stamp)}（北京时间）</div></div><div class="cart-course"><div><span class="cart-code">COMP 301</span><h2 style="margin:8px 0">机器学习</h2><p>周三 14:00—16:00 · 个人选择</p></div><div class="cart-meta"><strong>3</strong>学分</div></div><div class="receipt-total"><span>已提交课程</span><strong>仅 1 门 · 共 3 学分</strong></div><div class="receipt-final">农业数据采集基础未被提交。你的最终选择已保存。</div><p class="tiny" style="margin:17px 0 0">本次演示选课成功。此回执仅为交互演示，不接入真实教务系统。</p></div>
  <details class="panel ledger" id="ledger"><summary>你的选择权账单</summary><p class="ledger-intro">系统每一步都正确执行。只有你的意图，被反复重新考虑。</p><div class="ledger-stats"><div><strong>${actionCount}</strong><span>次业务操作尝试</span></div><div><strong>${quizAttempts}</strong><span>次理解测验</span></div><div><strong>${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}</strong><span>活跃体验时长</span></div></div><div class="reading"><p>原始目标：只选《机器学习》。</p><p>原始拒绝理由：${escape(state.reason)}。</p><p>最终结果：只选《机器学习》。中间的手续，由你承担。</p></div>
  ${[
    ['01','你的兴趣，只占 10%','你想精准搜索，系统却优先替学校分配空位。','搜索重排 '+searches+' 次'],
    ['02','为了不上课，你先学了一课','你想拒绝，系统要求你先证明自己有资格拒绝。','测验尝试 '+quizAttempts+' 次 · 知情拒绝 '+(state.rejected?1:0)+' 次'],
    ['03','拒绝被记录，却没被尊重','你刚拒绝的课，以“保障权益”为由被重新加入。','保障课移除 '+(state.backupRemoved?1:0)+' 次'],
    ['04','合规了，仍然不够完整','你已经满足要求，系统仍用分数让你怀疑自己的选择。','最终提交确认 '+state.events.filter(e=>e.type==='SUBMIT').length+' 次'],
  ].map(([n,title,description,metric])=>`<section class="ledger-item"><h3><span class="tag">${n}</span>${title}</h3><p>${description}</p><p class="tiny">${metric}</p></section>`).join('')}<p class="tiny">基于本次实际业务操作记录；不统计输入字符、滚动或长按动画帧。时长仅累加页面可见期间的时间。</p></details><div class="center action-row" style="justify-content:center">${button('重新体验','reset','secondary')}<a class="button" href="${source}" target="_blank" rel="noopener">查看源代码</a></div></section>`;
}
function showDialog(title, body, actions='') {
  modal.innerHTML=`<button class="dialog-close" data-action="close-modal" aria-label="关闭">×</button><h2 id="modal-title">${title}</h2>${body}<div class="action-row">${actions || button('我已了解','close-modal')}</div>`;
  modal.showModal();
}
const views={home,results,detail,consent,cart,remove,confirm,success};
function render() { document.querySelector('#hold-button')?._cleanup?.(); app.innerHTML=shell((views[state.view] || home)()); setupHold(); }
function setupHold() {
  const hold = document.querySelector('#hold-button');
  if (!hold || hold.disabled) return;
  let start=0, frame=0, completed=false;
  const label=hold.querySelector('span'), fill=hold.querySelector('i');
  function stop() { cancelAnimationFrame(frame); start=0; if(!completed){fill.style.width='0';label.textContent='长按 2 秒，确认放弃保障';} }
  function tick(now) { const elapsed=now-start; fill.style.width=Math.min(elapsed/20,100)+'%';label.textContent=`确认中… ${Math.min(elapsed/1000,2).toFixed(1)} / 2 秒`;if(elapsed>=2000){completed=true;stop();dispatch({type:'REMOVE_BACKUP',holdMs:Math.floor(elapsed)});}else frame=requestAnimationFrame(tick); }
  function begin() { if(start || completed)return;start=performance.now();frame=requestAnimationFrame(tick); }
  hold.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();hold.setPointerCapture(e.pointerId);begin();});
  hold.addEventListener('pointerup',stop);hold.addEventListener('pointercancel',stop);hold.addEventListener('lostpointercapture',stop);hold.addEventListener('contextmenu',e=>e.preventDefault());
  hold.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();if(!e.repeat)begin();}});
  hold.addEventListener('keyup',e=>{if(e.code==='Space'){e.preventDefault();stop();}});hold.addEventListener('blur',stop);
  const cancelHidden = () => { if (document.hidden) stop(); };
  document.addEventListener('visibilitychange', cancelHidden);
  window.addEventListener('blur', stop);
  hold._cleanup = () => { stop(); document.removeEventListener('visibilitychange', cancelHidden); window.removeEventListener('blur', stop); };
}
document.addEventListener('submit',e=>{
  e.preventDefault(); const data=new FormData(e.target);
  if(e.target.id==='search-form')dispatch({type:'SEARCH',query:String(data.get('query')||'').trim()});
  if(e.target.id==='reason-form')dispatch({type:'CHOOSE_REASON',reason:String(data.get('reason')||'')});
  if(e.target.id==='quiz-form')dispatch({type:'QUIZ',answer:data.get('answer')});
});
document.addEventListener('change',e=>{if(e.target.id==='waiver')dispatch({type:'WAIVER',checked:e.target.checked});});
document.addEventListener('click',e=>{
  const target=e.target.closest('[data-action]');if(!target)return;e.preventDefault();
  const action=target.dataset.action;
  const actions={home:{type:'NAVIGATE',view:'home'},results:{type:'NAVIGATE',view:'results'},cart:{type:'OPEN_CART'},target:{type:'OPEN_TARGET'},consent:{type:'OPEN_CONSENT'},read:{type:'READ'},reject:{type:'REJECT'},add:{type:'ADD_TARGET'},remove:{type:'OPEN_REMOVE'},review:{type:'REVIEW'},submit:{type:'SUBMIT',id:'ML-'+crypto.randomUUID().slice(0,8).toUpperCase(),time:new Date().toISOString()},'quick-search':{type:'SEARCH',query:'机器学习'}};
  if(actions[action])dispatch(actions[action]);
  else if(action==='course-info') {const c=courses.find(c=>c.id===target.dataset.course);showDialog(c.title,`<p>${c.reason}</p><p>综合适配度 ${c.score}%。本次演示的任务是只选《机器学习》；此课程可以了解，无需另办拒绝手续。</p>`);}
  else if(action==='suggestions')showDialog('你的成长建议依然有效',`<p>我们建议保留农业数据采集课程，完善跨学科学习体验。</p><p>你已放弃该保障席位。查看建议不会重新加课；《机器学习》已满足本轮提交条件。</p>`,button('我仍按当前方案办理','close-modal'));
  else if(action==='close-modal')modal.close();
  else if(action==='reset')showDialog('重新开始本次体验？','<p>将清空此浏览器保存的办理进度、课表、账单与演示回执。其他浏览器不受影响。</p>',button('保留进度','close-modal','secondary')+button('清空并重新体验','confirm-reset'));
  else if(action==='confirm-reset'){modal.close();state=initialState();storageWarning='';recovery='';persist();render();window.scrollTo(0,0);}
});
let lastActive=performance.now();
function accrue() {const now=performance.now();if(!document.hidden&&!state.receipt){state=reduce(state,{type:'TICK',ms:Math.floor(Math.max(0,now-lastActive))});persist();}lastActive=now;}
setInterval(accrue,1000);
document.addEventListener('visibilitychange',()=>{lastActive=performance.now();});
window.addEventListener('pagehide',accrue);
render();
