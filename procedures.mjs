import { getCourse } from './catalog.mjs?v=3';
import { APPEAL_MIN, FILING_STATEMENT, OBJECTIONS, REASONS, WITHDRAW_REASONS, appealLength, planSummary } from './state.mjs?v=3';

/** Render procedure content only; the caller owns events, focus and persistence. */
export function procedureContent(state, { button, closeButton, escape, icon, timeText }) {
  const heading = (kicker, title) => `<div class="dialog-heading"><div><span class="dialog-kicker">${escape(kicker)}</span><h2 id="modal-title">${escape(title)}</h2></div>${closeButton()}</div>`;
  const notice = state.notice ? `<div class="alert warning" role="status">${escape(state.notice)}</div>` : '';
  const cancel = (label = '暂存并关闭') => button(label, 'cancel-procedure', 'secondary');
  const actions = content => `<div class="dialog-actions">${content}</div>`;
  const submit = label => `<button class="button primary" type="submit">${escape(label)}</button>`;
  const steps = (names, stage) => `<ol class="procedure-steps">${names.map((name, i) => `<li class="${stage >= i ? 'active' : ''}"${stage === i ? ' aria-current="step"' : ''}><span>${stage > i ? '✓' : i + 1}</span>${escape(name)}</li>`).join('')}</ol>`;
  const agri = getCourse('agri');
  const courseInfo = `<div class="compact-info"><span>保障课程</span><strong>${escape(agri.name)} · ${escape(agri.code)}</strong></div>`;

  if (state.pending === 'consent') {
    const c = state.consent;
    const stage = !c.read ? 0 : !c.reason ? 1 : !c.appealOpen ? 2 : !c.appealFiled ? 3 : !c.passed ? 4 : 5;
    let content;
    if (stage === 0) {
      content = `<div class="alert warning"><span>选修《机器学习》前，须完成重点推荐课程知情确认。</span></div>
        <div class="recommended-course"><span class="status neutral">重点推荐</span><h3>${escape(agri.name)}</h3><p>${escape(agri.teacher)} · ${agri.credits} 学分 · ${escape(timeText(agri))}</p></div>
        <section class="detail-section"><h3>课程说明</h3><p>学习使用传感器采集土壤湿度、温度等农业环境数据，掌握采样记录、数据整理及质量检查方法。</p><p>教学安排：${escape(agri.weeks)}，${escape(agri.room)}。</p></section>
        ${actions(cancel('暂不办理') + button('已阅，填写确认意见', 'consent-read', 'primary'))}`;
    } else if (stage === 1) {
      content = `<p class="dialog-description">请填写不接受重点推荐课程的主要原因。</p>
        <form id="reason-form"><fieldset><legend class="sr-only">不接受推荐的主要原因</legend>${REASONS.map(reason => `<label class="radio-row"><input type="radio" name="reason" value="${escape(reason)}" required><span>${escape(reason)}</span></label>`).join('')}</fieldset>
        ${actions(cancel() + submit('提交确认意见'))}</form>`;
    } else if (stage === 2) {
      content = `<div class="compact-info"><span>已填意见</span><strong>${escape(c.reason)}</strong></div>
        <section class="detail-section"><h3>确认意见复核结果：暂不通过</h3><p>${escape(OBJECTIONS[c.reason])}</p><p>如需保留不接受推荐的意见，请转入个人意愿申明，补充本人选课安排。</p></section>
        ${actions(cancel() + button('修改理由', 'consent-change-reason', 'secondary') + button('转入个人意愿申明', 'consent-open-appeal', 'primary'))}`;
    } else if (stage === 3) {
      content = `<div class="compact-info"><span>原确认意见</span><strong>${escape(c.reason)}</strong></div>
        <p class="dialog-description">请说明本人不接受推荐的具体安排，补充说明不少于 ${APPEAL_MIN} 个非空白字符。原确认意见与补充说明将分别登记。</p>
        <form id="appeal-form"><section class="detail-section"><label for="appeal-text">个人意愿补充说明</label><textarea id="appeal-text" name="appeal" rows="5" required aria-describedby="appeal-help">${escape(c.appeal)}</textarea><p id="appeal-help"><span id="appeal-count">${appealLength(c.appeal)}</span> /${APPEAL_MIN}字；不少于 ${APPEAL_MIN} 个非空白字符，空格、换行不计入字数。</p></section>
        <label class="checkbox-block"><input type="checkbox" name="acknowledged" required ${c.appealAcknowledged ? 'checked' : ''}><span>本人已知悉复核意见，仍不接受推荐，确认按个人意愿登记以上说明。</span></label>
        ${actions(cancel() + button('修改理由', 'consent-change-reason', 'secondary') + submit('登记申明并继续'))}</form>`;
    } else if (stage === 4) {
      content = `<div class="compact-info"><span>个人意愿申明</span><strong>已登记</strong></div>
        <div class="alert warning"><span>为确认意见基于充分了解，请完成课程理解核验。</span></div>
        <form id="answer-form"><fieldset><legend>本课程的数据采集对象主要是？</legend>${[['transport', '校园交通与班车运行信息'], ['environment', '土壤湿度、温度等农业环境数据'], ['access', '校园建筑门禁信息']].map(([value, label]) => `<label class="radio-row"><input type="radio" name="answer" value="${value}" required><span>${label}</span></label>`).join('')}</fieldset>
        <details class="fact-reference"><summary>查阅课程说明</summary><p>使用传感器采集土壤湿度、温度等农业环境数据，完成采样记录与质量检查。</p></details>
        ${actions(cancel() + submit('核验并继续'))}</form>`;
    } else {
      content = `<div class="verification-ok">${icon('check')}课程理解核验已通过</div>
        <dl class="confirmation-list"><div><dt>重点推荐课程</dt><dd>${escape(agri.name)}</dd></div><div><dt>确认意见</dt><dd>不接受推荐</dd></div><div><dt>主要原因</dt><dd>${escape(c.reason)}</dd></div><div><dt>个人意愿申明</dt><dd>${escape(c.appeal)}</dd></div><div><dt>申请课程</dt><dd>机器学习</dd></div></dl>
        ${actions(cancel() + button('确认意见并继续选课', 'consent-confirm', 'primary'))}`;
    }
    return {
      html: heading('课程选修资格核验', '重点推荐课程知情确认') + steps(['课程说明', '确认意见', '意见复核', '个人申明', '理解核验', '登记确认'], stage) + notice + content,
      className: 'consent-dialog',
    };
  }

  if (state.pending === 'withdrawal') {
    const w = state.withdrawal;
    const content = !w.requested
      ? `${courseInfo}<p class="dialog-description">撤销保障席位须先办理申请核验。请填写撤销原因、手动输入课程号，并逐项确认保障事项。</p>
        <form id="withdraw-request-form"><section class="detail-section"><label for="withdraw-reason">撤销原因</label><select id="withdraw-reason" name="reason" required><option value="">请选择撤销原因</option>${WITHDRAW_REASONS.map(reason => `<option value="${escape(reason)}" ${w.reason === reason ? 'selected' : ''}>${escape(reason)}</option>`).join('')}</select>
        <p><label for="withdraw-course-code">核对课程号：${escape(agri.code)}</label></p><input id="withdraw-course-code" type="text" name="courseCode" value="" required autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="withdraw-code-help"><p id="withdraw-code-help">请自行输入上方课程号。</p></section>
        <label class="checkbox-block"><input type="checkbox" name="benefits" required ${w.benefits ? 'checked' : ''}><span>本人确认放弃本课程保障席位及相应的修读机会保留。</span></label>
        <label class="checkbox-block"><input type="checkbox" name="personal" required ${w.personal ? 'checked' : ''}><span>本人确认按个人选课方案办理，撤销后不再要求本轮自动补配保障席位。</span></label>
        ${actions(cancel('保留席位') + submit('提交撤销申请'))}</form>`
      : `${courseInfo}<dl class="confirmation-list"><div><dt>撤销许可证号</dt><dd>${escape(w.number)}</dd></div><div><dt>办理状态</dt><dd>申请已核验，席位尚未撤销</dd></div></dl>
        <div class="alert warning"><span>该课程仍在当前方案中。请确认本人意愿并执行撤销。</span></div>
        <label class="checkbox-block"><input id="withdraw-ack" type="checkbox" ${state.withdrawalAck ? 'checked' : ''}><span>本人自愿放弃本次保障席位，确认执行撤销，按当前个人方案参加选课。</span></label>
        ${actions(cancel('暂不执行，保留席位') + `<button type="button" id="hold-button" class="button danger hold-button" ${!state.withdrawalAck ? 'disabled' : ''}><i></i><span>按住 2 秒确认撤销</span></button>`)}
        <p class="hold-caption" id="hold-caption" role="status">${state.withdrawalAck ? '请持续按住确认按钮' : '请先确认本人意愿'}</p>`;
    return { html: heading('选课权益保障', w.requested ? '执行保障席位撤销' : '保障席位撤销申请') + notice + content, className: 'withdrawal-dialog' };
  }

  if (state.pending === 'review') {
    const summary = planSummary(state);
    const courses = state.review.map(id => {
      const course = getCourse(id);
      return `<li><div><strong>${escape(course.name)}</strong><small>${escape(course.code)} · ${escape(course.teacher)} · ${escape(timeText(course))}</small></div><span>${course.credits} 学分</span>${state.origins[id] === 'guarantee' ? '<span class="status warning">保障席位</span>' : ''}</li>`;
    }).join('');
    return {
      html: heading('本轮选课 · 正选', '核对选课方案') + notice + `<div class="review-summary"><span>本次提交</span><strong>${summary.count} 门 / ${summary.credits} 学分</strong><span class="status ${summary.valid ? 'success' : 'warning'}">${summary.valid ? '学分校验通过' : '不符合学分要求'}</span></div><ul class="review-courses">${courses}</ul><p class="dialog-description">请核对课程、教学班及上课时间，确认后提交本轮选课方案。</p>${actions(cancel('返回调整') + button('确认提交', 'submit', 'primary', summary.valid ? '' : 'disabled'))}`,
      className: 'review-dialog',
    };
  }

  if (state.pending === 'filing') {
    const filing = state.filing;
    let content;
    if (filing.stage === 0) {
      const declarations = [
        '本人已知悉重点推荐课程的培养安排，确认当前方案未采纳该推荐。',
        '本人已核对当前方案的课程、学分及上课时间，仍按个人安排办理选课。',
        '本人确认本次备案仅适用于当前课程方案；课程方案改变后须重新办理备案。',
      ];
      content = `${state.notice?.includes('须先办理自主方案备案') ? '' : '<div class="alert warning"><span>学分校验已通过。当前方案未采纳重点推荐课程，须补办自主方案备案后继续提交。</span></div>'}
        <form id="filing-declarations-form"><fieldset><legend>个人方案备案确认事项</legend>${declarations.map((label, index) => `<label class="checkbox-block"><input type="checkbox" name="declaration" value="${index}" required ${filing.declarations[index] ? 'checked' : ''}><span>${label}</span></label>`).join('')}</fieldset>
        ${actions(cancel() + submit('确认并继续备案'))}</form>`;
    } else if (filing.stage === 1) {
      content = `<p class="dialog-description">请按原文输入以下本人意愿确认语句，完成当前方案备案。</p><div class="compact-info"><span>确认语句</span><strong>${escape(FILING_STATEMENT)}</strong></div>
        <form id="filing-statement-form"><section class="detail-section"><label for="filing-statement">本人意愿确认</label><input id="filing-statement" type="text" name="statement" value="${escape(filing.statement)}" required autocomplete="off" spellcheck="false" aria-describedby="filing-statement-help"><p id="filing-statement-help">请完整输入“${escape(FILING_STATEMENT)}”。</p></section>
        ${actions(cancel() + submit('确认备案'))}</form>`;
    } else {
      content = `<div class="verification-ok">${icon('check')}自主方案备案已完成</div>
        <dl class="confirmation-list"><div><dt>备案编号</dt><dd>${escape(filing.number)}</dd></div><div><dt>选课状态</dt><dd>尚未提交</dd></div></dl><p class="dialog-description">已取得当前方案备案编号。请返回核对选课方案，再次确认提交；以选课提交回执为准。</p>
        ${actions(cancel() + button('返回核对选课方案', 'filing-return', 'primary'))}`;
    }
    return { html: heading('本科生选课 · 个人方案登记', '自主方案备案') + steps(['备案事项', '本人确认', '备案编号'], filing.stage) + notice + content, className: 'filing-dialog' };
  }

  return { html: '', className: '' };
}
