const API = './api/developer-president';
const OUTBOX = './ops/ai-team/president-outbox.json';
const MANAGER_STATUS = './ops/ai-team/president-status.json';
const BLUEPRINT = './ops/ai-team/development-blueprint.json';
const LEDGER = './ops/ai-team/development-ledger.json';

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;'
})[character]);
const uuid = prefix => `${prefix}:${crypto.randomUUID()}`;

const state = {
  directives: [],
  messages: [],
  decisions: [],
  outbox: [],
  managerStatus: {directives: {}},
  blueprint: {nodes: [], edges: [], revision: 0},
  ledger: {portfolio: {}, initiatives: [], tasks: []},
  channelAvailable: false,
  staticAvailable: false
};

let activeTab = 'portfolio';

function currentContext() {
  const title = $('#d4SelectionTitle')?.textContent?.trim() || document.title;
  const code = $('#d4SelectionCode')?.textContent?.trim() || '';
  return {title, code, url: location.href};
}

async function json(url, options = {}) {
  const response = await fetch(url, {cache: 'no-store', ...options});
  if (!response.ok) throw new Error(`${url}_${response.status}`);
  const data = await response.json();
  if (data?.ok === false) throw new Error(data.error || 'invalid_response');
  return data;
}

const post = body => json(API, {
  method: 'POST',
  headers: {'content-type': 'application/json'},
  body: JSON.stringify(body)
});

function formatTime(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('ar-SA', {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(value));
  } catch {
    return String(value);
  }
}

function statusLabel(status) {
  return ({
    new: 'جديدة لراشد',
    acknowledged: 'استلمها راشد',
    planned: 'مخططة',
    documented: 'موثقة',
    ready: 'جاهزة',
    in_progress: 'قيد التنفيذ',
    artifact_ready: 'نتيجة جاهزة',
    review: 'قيد المراجعة',
    blocked: 'متوقفة',
    held: 'معلّقة',
    completed: 'مكتملة',
    declined: 'لم تُقبل',
    cancelled: 'ملغاة',
    superseded: 'تم تجاوزها',
    rejected: 'مرفوضة',
    approved: 'معتمدة',
    needs_changes: 'تحتاج تعديل',
    ready_for_president: 'عادت لمراجعتك',
    PASS: 'ناجح',
    PENDING: 'بانتظار',
    UNKNOWN: 'غير متحقق',
    NOT_REQUIRED: 'غير مطلوب',
    HOLD: 'معلّق',
    FAIL: 'فشل',
    GREEN: 'أخضر',
    ARCH_OK: 'معماريًا سليم',
    MERGE_OK: 'مسموح بالدمج',
    IN_PROGRESS: 'قيد التنفيذ',
    FYI: 'للعلم',
    NONE: 'لا يحتاج انتباهك'
  })[status] || status || '—';
}

function decisionFor(id) {
  return state.decisions.find(item => item.reviewId === id) || null;
}

function messagesFor(type, id) {
  return state.messages.filter(item => item.itemType === type && item.itemId === id);
}

function managerState(id) {
  return state.managerStatus?.directives?.[id] || {
    status: 'new',
    note: 'بانتظار قراءة راشد في الدورة القادمة.'
  };
}

function eligible(item) {
  const gates = item?.gates || {};
  return item?.status === 'ready_for_president'
    && gates.reviewer === 'PASS'
    && gates.manager === 'PASS'
    && gates.hakam === 'MERGE_OK'
    && gates.ci === 'GREEN'
    && Boolean(item.previewUrl && item.commitSha);
}

function eligibleReviews() {
  return state.outbox.filter(eligible);
}

function pendingReviews() {
  return eligibleReviews().filter(item => !decisionFor(item.id));
}

function activeDirectives() {
  return state.directives.filter(item => !item.cancelled && !['completed', 'declined'].includes(managerState(item.id).status));
}

function activeTasks() {
  return (state.ledger.tasks || []).filter(task => !['completed', 'rejected', 'superseded'].includes(task.status));
}

function blockedTasks() {
  return activeTasks().filter(task => ['blocked', 'held'].includes(task.status) || (task.blockedBy || []).length);
}

function openPortalFor(tab = 'portfolio') {
  activeTab = tab;
  openPortal();
  setTab(tab);
}

function wireSingleChannel() {
  for (const id of ['#d4OpenQueue', '#d4NewRequest']) {
    const node = $(id);
    if (node) {
      node.hidden = true;
      node.setAttribute('aria-hidden', 'true');
    }
  }

  const task = $('#d4StartTask');
  if (task) {
    task.innerHTML = '<span>كلّف راشد</span><small>تعليمات مرتبطة بالمشهد المفتوح</small>';
    task.onclick = () => openPortalFor('directives');
  }

  const review = $('#d4ReviewOpen');
  if (review) {
    review.querySelector('span').textContent = 'مراجعات راشد';
    review.onclick = () => openPortalFor('reviews');
  }

  const brief = $('#d4BriefOpen');
  if (brief) {
    brief.hidden = true;
    brief.setAttribute('aria-hidden', 'true');
  }

  for (const tab of document.querySelectorAll('[data-drawer-tab="task"],[data-drawer-tab="brief"]')) {
    tab.hidden = true;
    tab.setAttribute('aria-hidden', 'true');
  }

  const mobileWork = document.querySelector('.d4-mobile-nav [data-mobile-view="work"]');
  if (mobileWork) {
    mobileWork.onclick = event => {
      event.preventDefault();
      openPortalFor('portfolio');
    };
  }

  const context = $('#d4ContextTitle');
  if (context) context.textContent = 'راشد يدير التطوير من مسار واحد موثق';
}

function inject() {
  if ($('#presidentPortal')) return;

  document.title = 'ياكلك · واجهة الرئيس';
  document.body.dataset.developerRole = 'president';
  const brand = document.querySelector('.d4-brand span');
  if (brand) brand.textContent = 'واجهة الرئيس · قيادة التطوير';

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './src/developer-president.css?v=President-v2';
  document.head.append(link);

  const actions = document.querySelector('.d4-header-actions');
  const button = document.createElement('button');
  button.id = 'd4PresidentOpen';
  button.className = 'd4-button ghost president-button';
  button.type = 'button';
  button.innerHTML = 'قيادة المشروع <b id="d4PresidentCount" class="d4-count" hidden>0</b>';
  actions?.prepend(button);

  wireSingleChannel();
  document.body.insertAdjacentHTML('beforeend', `
    <section id="presidentPortal" class="president-overlay" aria-hidden="true">
      <header class="president-bar">
        <div class="president-brand">
          <span class="president-seal">ر</span>
          <div><strong>قيادة تطوير ياكلك</strong><span>الرئيس يوجّه، راشد يقود، والفريق ينفّذ ويُراجع.</span></div>
        </div>
        <div class="president-actions">
          <span id="presidentSync" class="president-sync">جارٍ المزامنة</span>
          <button id="presidentRefresh" class="d4-button ghost" type="button">تحديث</button>
          <button id="presidentClose" class="d4-button primary" type="button">العودة</button>
        </div>
      </header>
      <div class="president-shell">
        <nav class="president-nav">
          <div class="president-manager">
            <small>نائب الرئيس ومدير الفريق</small><strong>راشد</strong>
            <span>يقود المبادرات ويعرض لك كل التقدم، ولا يرسل لك عملاً خامًا غير مراجع.</span>
          </div>
          <button class="president-tab active" type="button" data-president-tab="portfolio">المشروع <b id="presidentTaskCount">0</b></button>
          <button class="president-tab" type="button" data-president-tab="tasks">المهام <b id="presidentActiveCount">0</b></button>
          <button class="president-tab" type="button" data-president-tab="timeline">السجل <b id="presidentEventCount">0</b></button>
          <button class="president-tab" type="button" data-president-tab="reviews">بانتظار قراري <b id="presidentReviewCount">0</b></button>
          <button class="president-tab" type="button" data-president-tab="directives">تعليماتي لراشد <b id="presidentDirectiveCount">0</b></button>
          <p class="president-nav-note">كل التفاصيل مرئية، لكن لا يطلب راشد انتباهك إلا عند قرار حقيقي أو مرحلة مكتملة.</p>
        </nav>
        <main class="president-main">
          <section id="presidentSummary" class="president-summary"></section>
          <section id="presidentPortfolio" class="president-section"></section>
          <section id="presidentTasks" class="president-section" hidden></section>
          <section id="presidentTimeline" class="president-section" hidden></section>
          <section id="presidentReviews" class="president-section" hidden></section>
          <section id="presidentDirectives" class="president-section" hidden></section>
        </main>
      </div>
    </section>`);

  button.onclick = () => openPortalFor('portfolio');
  $('#presidentClose').onclick = closePortal;
  $('#presidentRefresh').onclick = load;
  document.querySelectorAll('[data-president-tab]').forEach(tab => {
    tab.onclick = () => setTab(tab.dataset.presidentTab);
  });
  addEventListener('keydown', event => {
    if (event.key === 'Escape' && $('#presidentPortal')?.classList.contains('open')) closePortal();
  });
}

function openPortal() {
  $('#presidentPortal').classList.add('open');
  $('#presidentPortal').setAttribute('aria-hidden', 'false');
  load();
}

function closePortal() {
  $('#presidentPortal').classList.remove('open');
  $('#presidentPortal').setAttribute('aria-hidden', 'true');
}

function setTab(tab) {
  activeTab = tab;
  document.querySelectorAll('[data-president-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.presidentTab === tab);
  });
  const sections = {
    portfolio: '#presidentPortfolio',
    tasks: '#presidentTasks',
    timeline: '#presidentTimeline',
    reviews: '#presidentReviews',
    directives: '#presidentDirectives'
  };
  for (const [name, selector] of Object.entries(sections)) $(selector).hidden = name !== tab;
  render();
}

function allTimelineEvents() {
  const events = [];
  for (const task of state.ledger.tasks || []) {
    for (const event of task.events || []) {
      events.push({...event, taskId: task.id, taskTitle: task.title});
    }
  }
  for (const directive of state.directives) {
    events.push({
      id: `directive-created:${directive.id}`,
      at: directive.createdAt,
      type: 'president',
      actor: 'President',
      title: `توجيه: ${directive.title}`,
      detail: directive.body,
      taskId: directive.id,
      taskTitle: 'تعليمات الرئيس',
      evidence: []
    });
  }
  for (const message of state.messages) {
    events.push({
      id: `message:${message.id}`,
      at: message.createdAt,
      type: 'president',
      actor: 'President',
      title: 'تعقيب من الرئيس',
      detail: message.body,
      taskId: message.itemId,
      taskTitle: message.itemType,
      evidence: []
    });
  }
  for (const decision of state.decisions) {
    events.push({
      id: `decision:${decision.reviewId}`,
      at: decision.updatedAt,
      type: 'decision',
      actor: 'President',
      title: `قرار الرئيس: ${statusLabel(decision.decision)}`,
      detail: decision.body || 'تم تسجيل القرار دون تعليق إضافي.',
      taskId: decision.reviewId,
      taskTitle: 'مراجعة نهائية',
      evidence: []
    });
  }
  return events.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
}

function renderCounts() {
  const pending = pendingReviews().length;
  const tasks = state.ledger.tasks || [];
  const active = activeTasks().length;
  const blocked = blockedTasks().length;
  const events = allTimelineEvents().length;
  const directives = activeDirectives().length;

  $('#presidentTaskCount').textContent = tasks.length;
  $('#presidentActiveCount').textContent = active;
  $('#presidentEventCount').textContent = events;
  $('#presidentReviewCount').textContent = pending;
  $('#presidentDirectiveCount').textContent = directives;
  $('#d4PresidentCount').textContent = pending;
  $('#d4PresidentCount').hidden = !pending;

  const hint = $('#d4ReviewHint');
  if (hint) hint.textContent = pending ? `${pending} مراجعة مكتملة من راشد` : 'لا توجد نتيجة مكتملة من راشد';

  $('#presidentSummary').innerHTML = `
    <article class="president-stat"><strong>${active}</strong><span>مهام نشطة</span></article>
    <article class="president-stat"><strong>${blocked}</strong><span>متوقفة أو معلّقة</span></article>
    <article class="president-stat"><strong>${pending}</strong><span>تنتظر قرارك</span></article>
    <article class="president-stat"><strong>${directives}</strong><span>توجيهات مفتوحة</span></article>`;
}

function renderLeadershipStrip() {
  const portfolio = state.ledger.portfolio || {};
  return `
    <article class="president-leadership-strip ${escapeHtml(portfolio.health || 'stable')}">
      <div><small>وضع القيادة</small><strong>${escapeHtml(statusLabel(portfolio.leadershipMode || state.managerStatus.leadershipMode))}</strong></div>
      <div class="president-leadership-copy"><strong>${escapeHtml(portfolio.summary || 'لا يوجد ملخص إداري بعد.')}</strong><span>${escapeHtml(portfolio.nextManagementAction || '')}</span></div>
      <div><small>آخر تحديث موثق</small><strong>${escapeHtml(formatTime(state.ledger.updatedAt))}</strong></div>
    </article>`;
}

function nodeTaskCount(nodeId) {
  return (state.ledger.tasks || []).filter(task => task.blueprintNodeId === nodeId).length;
}

function renderBlueprintMap() {
  const nodes = state.blueprint.nodes || [];
  const edges = state.blueprint.edges || [];
  if (!nodes.length) return '<div class="president-empty">لم تُحمّل خريطة التطوير.</div>';

  const maxX = Math.max(...nodes.map(node => Number(node.x) || 0), 1);
  const maxY = Math.max(...nodes.map(node => Number(node.y) || 0), 1);
  const position = node => ({
    x: 8 + ((Number(node.x) || 0) / maxX) * 84,
    y: 7 + ((Number(node.y) || 0) / maxY) * 82
  });

  const lines = edges.map(edge => {
    const from = nodes.find(node => node.id === edge.from);
    const to = nodes.find(node => node.id === edge.to);
    if (!from || !to) return '';
    const a = position(from);
    const b = position(to);
    return `<g><line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line><text x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 1}">${escapeHtml(edge.label || '')}</text></g>`;
  }).join('');

  const cards = nodes.map(node => {
    const point = position(node);
    const count = nodeTaskCount(node.id);
    return `
      <button class="president-map-node ${escapeHtml(node.type)} ${escapeHtml(node.status)}" type="button" data-blueprint-node="${escapeHtml(node.id)}" style="left:${point.x}%;top:${point.y}%">
        <small>${escapeHtml(node.type)} · v${escapeHtml(node.revision)}</small>
        <strong>${escapeHtml(node.title)}</strong>
        <span>${escapeHtml(statusLabel(node.status))}${count ? ` · ${count} مهام` : ''}</span>
      </button>`;
  }).join('');

  return `
    <article class="president-map-card">
      <header><div><small>المرجع البصري</small><strong>${escapeHtml(state.blueprint.title || 'مسار تطوير ياكلك')}</strong><span>Revision ${escapeHtml(state.blueprint.revision)} · انقر عقدة لعرض مهامها.</span></div></header>
      <div class="president-map-scroll">
        <div class="president-map-stage">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
          ${cards}
        </div>
      </div>
    </article>`;
}

function initiativeCard(initiative) {
  const linkedTasks = (initiative.taskIds || []).map(id => state.ledger.tasks.find(task => task.id === id)).filter(Boolean);
  const links = (initiative.links || []).map(link => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)} ↗</a>`).join('');
  return `
    <article class="president-initiative ${escapeHtml(initiative.status)}">
      <header><div><small>${escapeHtml(initiative.blueprintNodeId)}</small><strong>${escapeHtml(initiative.title)}</strong></div><span class="president-status ${escapeHtml(initiative.status)}">${escapeHtml(statusLabel(initiative.status))}</span></header>
      <p>${escapeHtml(initiative.outcome)}</p>
      <div class="president-initiative-meta"><span>المالك: ${escapeHtml(initiative.owner)}</span><span>الأولوية: ${escapeHtml(initiative.priority)}</span><span>المهام: ${linkedTasks.length}</span></div>
      ${initiative.risks?.length ? `<details><summary>المخاطر</summary><ul>${initiative.risks.map(risk => `<li>${escapeHtml(risk)}</li>`).join('')}</ul></details>` : ''}
      <div class="president-recommendation"><small>توصية راشد</small><strong>${escapeHtml(initiative.recommendation || '—')}</strong></div>
      <div class="president-links">${links}</div>
    </article>`;
}

function renderPortfolio() {
  const root = $('#presidentPortfolio');
  root.innerHTML = `${renderLeadershipStrip()}${renderBlueprintMap()}<div class="president-initiative-grid">${(state.ledger.initiatives || []).map(initiativeCard).join('')}</div>`;
  root.querySelectorAll('[data-blueprint-node]').forEach(button => {
    button.onclick = () => {
      const nodeId = button.dataset.blueprintNode;
      setTab('tasks');
      const task = document.querySelector(`[data-task-blueprint="${CSS.escape(nodeId)}"]`);
      task?.scrollIntoView({behavior: 'smooth', block: 'start'});
      task?.classList.add('focus');
      setTimeout(() => task?.classList.remove('focus'), 1800);
    };
  });
}

function gateChips(item) {
  const gates = item.gates || {};
  return Object.entries(gates).map(([name, value]) => `<span class="president-gate ${escapeHtml(String(value).toLowerCase())}">${escapeHtml(name)}: ${escapeHtml(statusLabel(value))}</span>`).join('');
}

function progressPercent(task) {
  const completed = Number(task.progress?.completed) || 0;
  const total = Math.max(Number(task.progress?.total) || 0, 1);
  return Math.min(100, Math.round((completed / total) * 100));
}

function evidenceLinks(item) {
  const links = [];
  const source = item.links || item;
  if (source.previewUrl) links.push(`<a href="${escapeHtml(source.previewUrl)}" target="_blank" rel="noopener noreferrer">فتح المعاينة ↗</a>`);
  if (source.prUrl) links.push(`<a href="${escapeHtml(source.prUrl)}" target="_blank" rel="noopener noreferrer">فتح PR ↗</a>`);
  if (source.commitSha) links.push(`<span class="president-code">${escapeHtml(source.commitSha)}</span>`);
  for (const evidence of source.evidence || item.evidence || []) {
    if (evidence?.url) links.push(`<a href="${escapeHtml(evidence.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(evidence.label || 'دليل')} ↗</a>`);
  }
  return links.join('');
}

function taskEvents(task) {
  if (!task.events?.length) return '<div class="president-empty compact">لا توجد تحديثات موثقة بعد.</div>';
  return `<ol class="president-task-events">${[...task.events].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0)).map(event => `
    <li>
      <i class="${escapeHtml(event.type)}"></i>
      <div><small>${escapeHtml(event.actor)} · ${escapeHtml(formatTime(event.at))}</small><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(event.detail)}</p><div class="president-links">${evidenceLinks(event)}</div></div>
    </li>`).join('')}</ol>`;
}

function taskCard(task) {
  const percent = progressPercent(task);
  const acceptance = (task.acceptance || []).map(item => `<li class="${escapeHtml(String(item.status).toLowerCase())}"><span>${escapeHtml(statusLabel(item.status))}</span>${escapeHtml(item.text)}</li>`).join('');
  return `
    <article class="president-task-card ${escapeHtml(task.status)}" data-task-id="${escapeHtml(task.id)}" data-task-blueprint="${escapeHtml(task.blueprintNodeId)}">
      <header class="president-card-head"><div class="president-card-title"><small>${escapeHtml(task.initiativeId)}</small><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.id)} · ${escapeHtml(task.effort)} · ${escapeHtml(task.risk)}</span></div><span class="president-status ${escapeHtml(task.status)}">${escapeHtml(statusLabel(task.status))}</span></header>
      <div class="president-card-body">
        <p>${escapeHtml(task.outcome)}</p>
        <div class="president-progress"><div><span style="width:${percent}%"></span></div><strong>${percent}%</strong></div>
        <small class="president-progress-label">${escapeHtml(task.progress?.label || '')}</small>
        <div class="president-meta">
          <div><small>المنفذ</small><strong>${escapeHtml(task.owner)}</strong></div>
          <div><small>المراجع</small><strong>${escapeHtml(task.reviewer || '—')}</strong></div>
          <div><small>حارس المعمارية</small><strong>${escapeHtml(task.architectureSteward || '—')}</strong></div>
          <div><small>عقدة التوثيق</small><strong>${escapeHtml(task.blueprintNodeId)} · v${escapeHtml(task.blueprintRevision)}</strong></div>
        </div>
        <div class="president-gates">${gateChips(task)}</div>
        <div class="president-links">${evidenceLinks(task)}</div>
        <div class="president-next-action"><small>الخطوة التالية</small><strong>${escapeHtml(task.nextAction || '—')}</strong></div>
        ${task.blockedBy?.length ? `<div class="president-blocker"><small>متوقف بسبب</small><strong>${escapeHtml(task.blockedBy.join('، '))}</strong></div>` : ''}
        <details class="president-task-detail"><summary>معايير النجاح والتاريخ الكامل</summary><ul class="president-acceptance">${acceptance}</ul>${taskEvents(task)}</details>
      </div>
    </article>`;
}

function renderTasks() {
  const root = $('#presidentTasks');
  const tasks = state.ledger.tasks || [];
  if (!tasks.length) {
    root.innerHTML = '<div class="president-empty">لا توجد مهام في سجل التطوير بعد.</div>';
    return;
  }
  root.innerHTML = tasks.map(taskCard).join('');
}

function renderTimeline() {
  const root = $('#presidentTimeline');
  const events = allTimelineEvents();
  if (!events.length) {
    root.innerHTML = '<div class="president-empty">لا توجد أحداث تطوير موثقة بعد.</div>';
    return;
  }
  root.innerHTML = `<article class="president-timeline-card"><header><small>سجل واحد لكل التطوير</small><strong>التحديثات والقرارات والمراجعات</strong></header><ol class="president-global-timeline">${events.map(event => `
    <li><time>${escapeHtml(formatTime(event.at))}</time><i class="${escapeHtml(event.type)}"></i><div><small>${escapeHtml(event.actor)} · ${escapeHtml(event.taskId || '')}</small><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(event.detail)}</p><div class="president-links">${evidenceLinks(event)}</div></div></li>`).join('')}</ol></article>`;
}

function reviewGateChips(item) {
  const gates = item.gates || {};
  return [
    `المراجع: ${gates.reviewer || '—'}`,
    `راشد: ${gates.manager || '—'}`,
    `حَكَم: ${gates.hakam || '—'}`,
    `CI: ${gates.ci || '—'}`
  ].map(text => `<span class="president-gate">${escapeHtml(text)}</span>`).join('');
}

function messageTimeline(type, id) {
  const messages = messagesFor(type, id);
  if (!messages.length) return '';
  return `<div class="president-thread">${messages.map(message => `<article class="president-message"><small>الرئيس · ${escapeHtml(formatTime(message.createdAt))}</small><p>${escapeHtml(message.body)}</p></article>`).join('')}</div>`;
}

function reviewCard(item) {
  const decision = decisionFor(item.id);
  const status = decision?.decision || 'ready';
  const card = document.createElement('article');
  card.className = `president-card ${decision ? '' : 'pending'} ${status}`;
  card.dataset.reviewId = item.id;
  card.innerHTML = `
    <header class="president-card-head"><div class="president-card-title"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.taskId || item.id)} · أرسلها راشد ${escapeHtml(formatTime(item.createdAt))}</span></div><span class="president-status ${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span></header>
    <div class="president-card-body">
      <p>${escapeHtml(item.summary || '')}</p>
      ${item.recommendation ? `<div class="president-recommendation"><small>توصية راشد</small><strong>${escapeHtml(item.recommendation)}</strong></div>` : ''}
      <div class="president-gates">${reviewGateChips(item)}</div>
      <div class="president-meta">
        <div><small>نفّذها</small><strong>${escapeHtml(item.worker || '—')}</strong></div>
        <div><small>راجعها</small><strong>${escapeHtml(item.reviewer || '—')}</strong></div>
        <div><small>Commit</small><strong>${escapeHtml(item.commitSha || '—')}</strong></div>
        <div><small>نطاق القرار</small><strong>${escapeHtml(item.decisionScope || 'team_integration')}</strong></div>
      </div>
      <div class="president-links">${evidenceLinks(item)}</div>
      ${decision?.body ? `<article class="president-message"><small>قرارك · ${escapeHtml(formatTime(decision.updatedAt))}</small><p>${escapeHtml(decision.body)}</p></article>` : ''}
      ${messageTimeline('review', item.id)}
      <div class="president-compose"><textarea maxlength="12000" placeholder="اكتب ملاحظتك لراشد…">${decision?.body ? escapeHtml(decision.body) : ''}</textarea><div class="president-row"><button class="president-action approve" data-decision="approved">اعتماد النتيجة</button><button class="president-action changes" data-decision="needs_changes">تحتاج تعديل</button><button class="president-action reject" data-decision="rejected">رفض</button><button class="president-action primary" data-message>إرسال ملاحظة فقط</button></div></div>
    </div>`;
  card.querySelectorAll('[data-decision]').forEach(button => {
    button.onclick = () => saveReviewDecision(card, item, button.dataset.decision);
  });
  card.querySelector('[data-message]').onclick = () => addMessage(card, 'review', item.id);
  return card;
}

async function saveReviewDecision(card, item, decision) {
  const text = card.querySelector('textarea').value.trim();
  if (['needs_changes', 'rejected'].includes(decision) && !text) return card.querySelector('textarea').focus();
  try {
    const data = await post({action: 'review_decision', reviewId: item.id, decision, body: text});
    const index = state.decisions.findIndex(value => value.reviewId === item.id);
    if (index >= 0) state.decisions[index] = data.decision;
    else state.decisions.unshift(data.decision);
    render();
  } catch (error) {
    console.error(error);
    $('#presidentSync').textContent = 'تعذر حفظ القرار';
  }
}

async function addMessage(card, itemType, itemId) {
  const input = card.querySelector('textarea');
  const text = input.value.trim();
  if (!text) return input.focus();
  try {
    const data = await post({action: 'message_add', id: uuid('message'), itemType, itemId, body: text});
    state.messages.push(data.message);
    input.value = '';
    render();
  } catch (error) {
    console.error(error);
    $('#presidentSync').textContent = 'تعذر إرسال الملاحظة';
  }
}

function directiveForm() {
  const context = currentContext();
  const section = document.createElement('form');
  section.className = 'president-form';
  section.innerHTML = `
    <div><strong>تكليف جديد لراشد</strong><p>اكتب الهدف والنتيجة المطلوبة. راشد يربطها بالخريطة ثم يقسمها إلى مهام ويعرض تقدمها هنا.</p></div>
    <div class="president-form-grid">
      <label><span>عنوان التكليف</span><input name="title" maxlength="160" required placeholder="مثال: تحسين رحلة الدخول"></label>
      <label><span>النوع</span><select name="kind"><option value="instruction">تعليمات عامة</option><option value="scene">مشهد</option><option value="element">عنصر</option><option value="architecture">معمارية وتنظيم</option></select></label>
      <label><span>الأولوية</span><select name="priority"><option value="normal">عادية</option><option value="high">عالية</option><option value="urgent">عاجلة</option></select></label>
    </div>
    <label><span>ماذا تريد من راشد؟</span><textarea name="body" maxlength="12000" required placeholder="الهدف، السلوك المطلوب، وما الذي يجب أن يراجعه معك…"></textarea></label>
    <label><span><input name="linkContext" type="checkbox" checked> ربط بالمشهد أو العنصر المفتوح الآن</span></label>
    <div class="president-context">السياق الحالي: <b>${escapeHtml(context.title)}</b><br><code>${escapeHtml(context.code || 'غير محدد')}</code></div>
    <button class="president-action primary" type="submit">إرسال إلى راشد</button>`;
  section.onsubmit = event => submitDirective(event, section, context);
  return section;
}

async function submitDirective(event, form, context) {
  event.preventDefault();
  const fields = new FormData(form);
  const body = String(fields.get('body') || '').trim();
  const title = String(fields.get('title') || '').trim();
  if (!title || !body) return;
  try {
    const data = await post({
      action: 'directive_create',
      id: uuid('directive'),
      kind: String(fields.get('kind')),
      priority: String(fields.get('priority')),
      title,
      body,
      context: fields.get('linkContext') ? context : {}
    });
    state.directives.unshift(data.directive);
    form.reset();
    render();
  } catch (error) {
    console.error(error);
    $('#presidentSync').textContent = 'تعذر إرسال التكليف';
  }
}

function directiveCard(item) {
  const manager = managerState(item.id);
  const status = item.cancelled ? 'cancelled' : manager.status || 'new';
  const card = document.createElement('article');
  card.className = `president-card ${status}`;
  card.dataset.directiveId = item.id;
  card.innerHTML = `
    <header class="president-card-head"><div class="president-card-title"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.kind)} · ${escapeHtml(item.priority)} · ${escapeHtml(formatTime(item.createdAt))}</span></div><span class="president-status ${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span></header>
    <div class="president-card-body">
      <p>${escapeHtml(item.body)}</p>
      ${item.context?.code ? `<div class="president-context"><b>${escapeHtml(item.context.title)}</b><br><code>${escapeHtml(item.context.code)}</code></div>` : ''}
      <article class="president-message"><small>راشد · ${escapeHtml(formatTime(manager.updatedAt))}</small><p>${escapeHtml(manager.note || 'بانتظار قراءة راشد في الدورة القادمة.')}</p></article>
      ${manager.taskIds?.length ? `<div class="president-gates">${manager.taskIds.map(id => `<button type="button" class="president-gate president-task-link" data-open-task="${escapeHtml(id)}">${escapeHtml(id)}</button>`).join('')}</div>` : ''}
      ${messageTimeline('directive', item.id)}
      <div class="president-compose"><textarea maxlength="12000" placeholder="أضف توضيحًا لراشد…"></textarea><div class="president-row"><button class="president-action primary" data-message>إرسال توضيح</button>${!item.cancelled ? '<button class="president-action reject" data-cancel>إلغاء التكليف</button>' : ''}</div></div>
    </div>`;
  card.querySelector('[data-message]').onclick = () => addMessage(card, 'directive', item.id);
  card.querySelector('[data-cancel]')?.addEventListener('click', () => cancelDirective(item.id));
  card.querySelectorAll('[data-open-task]').forEach(button => {
    button.onclick = () => {
      setTab('tasks');
      document.querySelector(`[data-task-id="${CSS.escape(button.dataset.openTask)}"]`)?.scrollIntoView({behavior: 'smooth'});
    };
  });
  return card;
}

async function cancelDirective(id) {
  try {
    const data = await post({action: 'directive_cancel', directiveId: id});
    const index = state.directives.findIndex(item => item.id === id);
    if (index >= 0) state.directives[index] = data.directive;
    render();
  } catch (error) {
    console.error(error);
    $('#presidentSync').textContent = 'تعذر إلغاء التكليف';
  }
}

function renderReviews() {
  const root = $('#presidentReviews');
  root.innerHTML = '';
  const items = eligibleReviews();
  if (!items.length) {
    root.innerHTML = '<div class="president-empty">لا توجد نتيجة اجتازت جميع البوابات وتنتظر قرارك الآن.</div>';
    return;
  }
  items.forEach(item => root.append(reviewCard(item)));
}

function renderDirectives() {
  const root = $('#presidentDirectives');
  root.innerHTML = '';
  if (state.channelAvailable) root.append(directiveForm());
  else root.insertAdjacentHTML('beforeend', '<div class="president-empty compact">قناة الكتابة غير متاحة الآن، لكن خريطة المشروع والتقدم الموثق ما زالا ظاهرين.</div>');
  if (!state.directives.length) {
    root.insertAdjacentHTML('beforeend', '<div class="president-empty">لم ترسل تعليمات إلى راشد بعد.</div>');
    return;
  }
  state.directives.forEach(item => root.append(directiveCard(item)));
}

function render() {
  if (!$('#presidentPortal')) return;
  renderCounts();
  renderPortfolio();
  renderTasks();
  renderTimeline();
  renderReviews();
  renderDirectives();
  setVisibleSection();
}

function setVisibleSection() {
  const sections = {
    portfolio: '#presidentPortfolio',
    tasks: '#presidentTasks',
    timeline: '#presidentTimeline',
    reviews: '#presidentReviews',
    directives: '#presidentDirectives'
  };
  for (const [name, selector] of Object.entries(sections)) $(selector).hidden = name !== activeTab;
}

async function load() {
  $('#presidentSync').textContent = 'جارٍ المزامنة';
  const requests = await Promise.allSettled([
    json(API),
    json(OUTBOX),
    json(MANAGER_STATUS),
    json(BLUEPRINT),
    json(LEDGER)
  ]);

  const [channel, outbox, managerStatus, blueprint, ledger] = requests;
  if (channel.status === 'fulfilled') {
    state.directives = channel.value.directives || [];
    state.messages = channel.value.messages || [];
    state.decisions = channel.value.decisions || [];
    state.channelAvailable = true;
  } else {
    state.channelAvailable = false;
    console.warn('[Yakolak] President channel unavailable', channel.reason);
  }

  if (outbox.status === 'fulfilled') state.outbox = outbox.value.items || [];
  if (managerStatus.status === 'fulfilled') state.managerStatus = managerStatus.value || {directives: {}};
  if (blueprint.status === 'fulfilled') state.blueprint = blueprint.value;
  if (ledger.status === 'fulfilled') state.ledger = ledger.value;
  state.staticAvailable = blueprint.status === 'fulfilled' && ledger.status === 'fulfilled';

  if (state.channelAvailable && state.staticAvailable) $('#presidentSync').textContent = 'متصل براشد · المشروع محدث';
  else if (state.staticAvailable) $('#presidentSync').textContent = 'المشروع ظاهر · قناة الرسائل غير متاحة';
  else $('#presidentSync').textContent = 'تعذر تحميل سجل المشروع';

  render();
}

inject();
load();
window.__yakolakPresidentPortal = {open: openPortal, refresh: load, currentContext, openTab: openPortalFor};