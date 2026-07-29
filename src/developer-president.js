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

const TEAM = [
  {name: 'Rashed', label: 'راشد', role: 'مدير المشروع ونائب الرئيس', responsibility: 'يحدد الأولوية، يفوض التنفيذ، يراجع الأدلة، ويرفع للرئيس القرارات المهمة فقط.', manager: true},
  {name: 'Noor', label: 'نور', role: 'تنفيذ قواعد النظام الأساسية', responsibility: 'تنفذ المهام المحددة المتعلقة بثبات القواعد وحالة اللعبة.'},
  {name: 'Sami', label: 'سامي', role: 'مراجعة جودة التنفيذ', responsibility: 'يفحص عمل زملائه ويتأكد أن النتيجة تطابق المطلوب.'},
  {name: 'Lina', label: 'لينا', role: 'تنفيذ أدوات العمل والبيانات', responsibility: 'تحسن أدوات الفريق وسلامة المعلومات التي تظهر في المنصة.'},
  {name: 'Mazen', label: 'مازن', role: 'تنفيذ الدمج وتنظيم الملفات', responsibility: 'يعالج التعارضات ويحافظ على اتساق ملفات العمل المشتركة.'},
  {name: 'Nada', label: 'ندى', role: 'حماية بنية المنتج', responsibility: 'تمنع الحلول التي تكرر المنطق أو تزيد صعوبة صيانة اللعبة.'},
  {name: 'Omar', label: 'عمر', role: 'مراجعة العقود والاختبارات', responsibility: 'يتحقق أن الاختبارات تقيس المعنى الصحيح ولا تخفي الأعطال.'},
  {name: 'Sara', label: 'سارة', role: 'مراجعة التجربة البصرية', responsibility: 'تختبر الواجهة على الكمبيوتر والجوال وتراجع وضوحها.'},
  {name: 'Hakam', label: 'حَكَم', role: 'مدقق مستقل نهائي', responsibility: 'يتأكد من صدق التقارير والأدلة قبل السماح لراشد بالاعتماد.'}
];

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
    NONE: 'لا يحتاج انتباهك',
    DELEGATED_LEADERSHIP: 'راشد يقود الفريق الآن',
    REVIEW_MILESTONE: 'مراجعة الرئيس عند اكتمال النتيجة'
  })[status] || status || '—';
}

function personLabel(value) {
  const text = String(value || '');
  const person = TEAM.find(item => text.toLowerCase().includes(item.name.toLowerCase()));
  if (person) return person.label;
  return ({'Framework developer': 'فريق المنصة', 'Codex UI implementer': 'فريق الواجهة', 'Independent reviewer + Sara evidence': 'مراجعة مستقلة وسارة', 'NOT_REQUIRED': 'غير مطلوب'})[text] || text || 'غير محدد';
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

  document.body.classList.add('president-scene-mode');
  const next = document.querySelector('.d4-next');
  if (next) next.hidden = true;
  const selectionCode = $('#d4SelectionCode');
  if (selectionCode) selectionCode.hidden = true;
  const workspaceKind = $('#d4SelectionKind');
  if (workspaceKind) workspaceKind.textContent = 'المشاهد والعناصر';
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
  button.innerHTML = 'لوحة القيادة <b id="d4PresidentCount" class="d4-count" hidden>0</b>';
  actions?.prepend(button);

  wireSingleChannel();
  document.body.insertAdjacentHTML('beforeend', `
    <section id="presidentPortal" class="president-overlay" aria-hidden="true">
      <header class="president-bar">
        <div class="president-brand">
          <span class="president-seal">ي</span>
          <div><strong>ياكلك · إدارة المشروع</strong><span>مساحة واحدة للرئيس أحمد</span></div>
        </div>
        <nav class="president-top-nav" aria-label="أقسام المنصة">
          <button class="active" type="button" data-president-tab="portfolio">القيادة</button>
          <button type="button" data-president-tab="tasks">المهام</button>
          <button type="button" data-president-tab="team">الفريق</button>
          <button type="button" data-scenes>المشاهد والعناصر</button>
        </nav>
        <div class="president-actions">
          <span id="presidentSync" class="president-sync">جارٍ المزامنة</span>
          <button id="presidentRefresh" class="d4-button ghost" type="button">تحديث</button>
          <button id="presidentClose" class="d4-button primary" type="button">المشاهد</button>
        </div>
      </header>
      <div class="president-shell">
        <nav class="president-nav">
          <div class="president-manager">
            <small>مدير المدير</small><strong>راشد</strong>
            <span>يقود ويفوض ويراجع. الفريق هو من ينفذ.</span>
          </div>
          <button class="president-tab active" type="button" data-president-tab="portfolio">ملخص القيادة <b id="presidentTaskCount">0</b></button>
          <button class="president-tab" type="button" data-president-tab="tasks">لوحة المهام <b id="presidentActiveCount">0</b></button>
          <button class="president-tab" type="button" data-president-tab="reviews">قراراتي <b id="presidentReviewCount">0</b></button>
          <button class="president-tab" type="button" data-president-tab="directives">تكليف راشد <b id="presidentDirectiveCount">0</b></button>
          <button class="president-tab" type="button" data-president-tab="team">الفريق <b id="presidentTeamCount">9</b></button>
          <button class="president-tab" type="button" data-president-tab="timeline">سجل النتائج <b id="presidentEventCount">0</b></button>
          <button class="president-tab president-scenes-tab" type="button" data-scenes>المشاهد والعناصر <b>↗</b></button>
          <p class="president-nav-note">التفاصيل التقنية مخفية افتراضيًا. افتحها فقط عندما تحتاج الدليل.</p>
        </nav>
        <main class="president-main">
          <section id="presidentSummary" class="president-summary"></section>
          <section id="presidentPortfolio" class="president-section"></section>
          <section id="presidentTasks" class="president-section" hidden></section>
          <section id="presidentTimeline" class="president-section" hidden></section>
          <section id="presidentReviews" class="president-section" hidden></section>
          <section id="presidentDirectives" class="president-section" hidden></section>
          <section id="presidentTeam" class="president-section" hidden></section>
        </main>
      </div>
    </section>`);

  button.onclick = () => openPortalFor('portfolio');
  $('#presidentClose').onclick = closePortal;
  $('#presidentRefresh').onclick = load;
  document.querySelectorAll('[data-president-tab]').forEach(tab => {
    tab.onclick = () => setTab(tab.dataset.presidentTab);
  });
  document.querySelectorAll('[data-scenes]').forEach(tab => {
    tab.onclick = closePortal;
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
    directives: '#presidentDirectives',
    team: '#presidentTeam'
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

function administrativeText(value) {
  let text = String(value || '');
  for (const task of state.ledger.tasks || []) text = text.replaceAll(task.id, task.title);
  return text
    .replaceAll('Artifact', 'النتيجة')
    .replaceAll('Preview', 'نسخة المعاينة')
    .replaceAll('Commit', 'نسخة العمل')
    .replaceAll('CI', 'الفحوص الآلية')
    .replaceAll('PR', 'طلب الدمج')
    .replaceAll('cycle', 'الدورة')
    .replaceAll('accepted modes', 'قائمة الأوضاع المعتمدة')
    .replaceAll('mutation-resistance', 'مقاومة التعديل')
    .replaceAll('fixtures', 'أمثلة الاختبار')
    .replaceAll('invariant', 'شرط السلامة')
    .replaceAll('AI Team OS', 'نظام عمل الفريق')
    .replaceAll('verifier', 'أداة التحقق')
    .replaceAll('normalizer', 'موحّد البيانات')
    .replaceAll('reducer', 'محرك الحالة');
}

function currentInitiative() {
  const id = state.ledger.portfolio?.activeInitiativeId;
  return (state.ledger.initiatives || []).find(item => item.id === id) || state.ledger.initiatives?.[0] || null;
}

function initiativeTasks(initiative = currentInitiative()) {
  if (!initiative) return [];
  return (initiative.taskIds || []).map(id => state.ledger.tasks.find(task => task.id === id)).filter(Boolean);
}

function verifiedResults() {
  const results = [];
  for (const task of state.ledger.tasks || []) {
    for (const item of task.acceptance || []) {
      if (item.status === 'PASS') results.push({task: task.title, text: item.text, id: task.id});
    }
  }
  return results.slice(-6).reverse();
}

function leadershipAnswer(icon, question, answer, detail = '', tone = '') {
  return `<article class="president-answer ${tone}"><span class="president-answer-icon">${icon}</span><div><small>${question}</small><strong>${escapeHtml(administrativeText(answer))}</strong>${detail ? `<p>${escapeHtml(administrativeText(detail))}</p>` : ''}</div></article>`;
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
  const initiative = currentInitiative();
  const tasks = initiativeTasks(initiative);
  const active = tasks.find(task => task.status === 'in_progress') || tasks[0];
  const blockers = tasks.flatMap(task => task.blockedBy || []);
  const results = verifiedResults();
  const decisions = pendingReviews();
  root.innerHTML = `
    <header class="president-page-heading"><div><small>مرحبًا أحمد</small><h1>هذا ما يديره راشد الآن</h1><p>ملخص إداري مباشر. افتح التفاصيل فقط إذا احتجت الدليل.</p></div><span class="president-updated">آخر تحديث<br><b>${escapeHtml(formatTime(state.ledger.updatedAt))}</b></span></header>
    <section class="president-executive-grid">
      ${leadershipAnswer('١', 'ماذا يعمل راشد الآن؟', initiative?.title || 'لا توجد مبادرة نشطة', active ? `فوّض التنفيذ إلى ${personLabel(active.owner)}: ${active.title}` : 'لا توجد مهمة منفذة الآن.', 'primary')}
      ${leadershipAnswer('٢', 'لماذا هذا العمل؟', initiative?.outcome || 'لم يوثق السبب بعد.', initiative?.recommendation || '')}
      ${leadershipAnswer('٣', 'ما الذي أُنجز فعليًا؟', results.length ? `${results.length} نتائج اجتازت معاييرها` : 'لا توجد نتيجة مكتملة مثبتة بعد', results[0] ? `${results[0].task}: ${results[0].text}` : 'لن نعرض نشاطًا على أنه إنجاز.')}
      ${leadershipAnswer('٤', 'ما المتعطل؟', blockers.length ? `${blockers.length} عوائق موثقة` : 'لا يوجد عائق يمنع المبادرة الحالية', blockers[0] || 'الفريق يستطيع مواصلة العمل دون انتظارك.', blockers.length ? 'warning' : 'success')}
      ${leadershipAnswer('٥', 'ما القرار المطلوب مني؟', decisions.length ? `${decisions.length} نتائج جاهزة لقرارك` : 'لا يوجد قرار مطلوب منك الآن', decisions[0]?.recommendation || 'راشد سيعود إليك عندما تكتمل نتيجة وتُراجع.', decisions.length ? 'decision' : 'success')}
    </section>
    <section class="president-brief-row">
      <article class="president-focus-card"><header><div><small>توجيه راشد للفريق</small><strong>${escapeHtml(administrativeText(state.ledger.portfolio?.nextManagementAction || '—'))}</strong></div><button class="president-action primary" type="button" data-open-board>فتح لوحة المهام</button></header><div class="president-focus-progress"><span style="width:${active ? progressPercent(active) : 0}%"></span></div><p>${escapeHtml(administrativeText(active?.progress?.label || 'لا يوجد تقدم موثق بعد.'))}</p></article>
      <article class="president-results-card"><header><small>آخر نتائج مثبتة</small><button class="president-action" type="button" data-open-history>كل السجل</button></header>${results.length ? `<ol>${results.slice(0,4).map(item => `<li><span>✓</span><div><strong>${escapeHtml(administrativeText(item.text))}</strong><small>${escapeHtml(item.task)}</small></div></li>`).join('')}</ol>` : '<p>لا توجد نتائج مثبتة بعد.</p>'}</article>
    </section>`;
  root.querySelector('[data-open-board]')?.addEventListener('click', () => setTab('tasks'));
  root.querySelector('[data-open-history]')?.addEventListener('click', () => setTab('timeline'));
}

function gateChips(item) {
  const gates = item.gates || {};
  const labels = {artifact: 'النتيجة', reviewer: 'المراجع', architecture: 'سلامة البنية', hakam: 'التدقيق النهائي', ci: 'الفحوص', preview: 'المعاينة', manager: 'قرار راشد', president: 'قرار الرئيس'};
  return Object.entries(gates).map(([name, value]) => `<span class="president-gate ${escapeHtml(String(value).toLowerCase())}">${escapeHtml(labels[name] || name)}: ${escapeHtml(statusLabel(value))}</span>`).join('');
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
  const columns = [
    {id: 'ready', title: 'قادم', description: 'جاهز بعد اكتمال متطلباته', statuses: ['new', 'documented', 'planned', 'ready']},
    {id: 'doing', title: 'قيد العمل', description: 'ينفذه الفريق الآن', statuses: ['acknowledged', 'in_progress']},
    {id: 'review', title: 'قيد المراجعة', description: 'نتيجة موجودة ويجري التحقق منها', statuses: ['artifact_ready', 'review', 'ready_for_president']},
    {id: 'blocked', title: 'متعطل', description: 'له عائق واضح أو قرار معلّق', statuses: ['blocked', 'held', 'rejected']},
    {id: 'done', title: 'تم', description: 'اكتمل بالدليل والقرار', statuses: ['completed', 'approved', 'superseded']}
  ];
  root.innerHTML = `<header class="president-page-heading compact"><div><small>إدارة العمل</small><h1>لوحة مهام ياكلك</h1><p>كل بطاقة تعرض المسؤول والنتيجة والدليل والخطوة التالية.</p></div><button class="president-action primary" type="button" data-new-directive>تكليف راشد</button></header>
    <div class="president-kanban">${columns.map(column => {
      const items = tasks.filter(task => column.id === 'blocked'
        ? column.statuses.includes(task.status) || task.blockedBy?.length
        : column.statuses.includes(task.status) && !task.blockedBy?.length);
      return `<section class="president-kanban-column ${column.id}"><header><div><strong>${column.title}</strong><small>${column.description}</small></div><b>${items.length}</b></header><div class="president-kanban-list">${items.length ? items.map(kanbanCard).join('') : '<div class="president-kanban-empty">لا توجد بطاقات</div>'}</div></section>`;
    }).join('')}</div>`;
  root.querySelector('[data-new-directive]')?.addEventListener('click', () => setTab('directives'));
}

function kanbanCard(task) {
  const percent = progressPercent(task);
  const evidenceCount = [task.links?.previewUrl, task.links?.prUrl, task.links?.commitSha, ...(task.links?.evidence || [])].filter(Boolean).length;
  const passed = (task.acceptance || []).filter(item => item.status === 'PASS').length;
  const reviews = (task.events || []).filter(event => ['review', 'audit', 'architecture', 'decision'].includes(event.type));
  return `<article class="president-kanban-card" data-task-id="${escapeHtml(task.id)}" data-task-blueprint="${escapeHtml(task.blueprintNodeId)}">
    <div class="president-kanban-tags"><span>${escapeHtml(statusLabel(task.status))}</span>${task.presidentAttention && task.presidentAttention !== 'NONE' ? `<span class="attention">${escapeHtml(statusLabel(task.presidentAttention))}</span>` : ''}</div>
    <h2>${escapeHtml(administrativeText(task.title))}</h2>
    <p>${escapeHtml(administrativeText(task.outcome))}</p>
    <div class="president-kanban-owner"><span class="president-avatar">${escapeHtml(personLabel(task.owner).slice(0,1))}</span><div><small>المسؤول</small><strong>${escapeHtml(personLabel(task.owner))}</strong></div><b>${percent}%</b></div>
    <div class="president-card-progress"><span style="width:${percent}%"></span></div>
    <dl class="president-card-facts"><div><dt>الدليل</dt><dd>${evidenceCount ? `${evidenceCount} مرفقات` : 'لم يرفق بعد'}</dd></div><div><dt>النجاح</dt><dd>${passed}/${task.acceptance?.length || 0}</dd></div><div><dt>المراجعات</dt><dd>${reviews.length}</dd></div></dl>
    <div class="president-next-step"><small>الخطوة التالية</small><strong>${escapeHtml(administrativeText(task.nextAction || '—'))}</strong></div>
    ${task.blockedBy?.length ? `<div class="president-card-blocker"><small>العائق</small>${escapeHtml(administrativeText(task.blockedBy.join('، ')))}</div>` : ''}
    <details class="president-card-details"><summary>الدليل والتعليقات</summary><div class="president-links">${evidenceLinks(task) || '<span>لا يوجد رابط دليل حتى الآن.</span>'}</div><ul class="president-acceptance">${(task.acceptance || []).map(item => `<li class="${escapeHtml(String(item.status).toLowerCase())}"><span>${escapeHtml(statusLabel(item.status))}</span>${escapeHtml(administrativeText(item.text))}</li>`).join('')}</ul>${taskEvents(task)}</details>
  </article>`;
}

function renderTimeline() {
  const root = $('#presidentTimeline');
  const events = allTimelineEvents();
  if (!events.length) {
    root.innerHTML = '<div class="president-empty">لا توجد أحداث تطوير موثقة بعد.</div>';
    return;
  }
  root.innerHTML = `<article class="president-timeline-card"><header><small>نتائج لا نشاطات</small><strong>التحديثات والقرارات والمراجعات المثبتة</strong></header><ol class="president-global-timeline">${events.map(event => `
    <li><time>${escapeHtml(formatTime(event.at))}</time><i class="${escapeHtml(event.type)}"></i><div><small>${escapeHtml(personLabel(event.actor))}</small><strong>${escapeHtml(administrativeText(event.title))}</strong><p>${escapeHtml(administrativeText(event.detail))}</p><div class="president-links">${evidenceLinks(event)}</div></div></li>`).join('')}</ol></article>`;
}

function renderTeam() {
  const root = $('#presidentTeam');
  root.innerHTML = `<header class="president-page-heading compact"><div><small>المسؤوليات</small><h1>من يقود ومن ينفذ؟</h1><p>راشد مدير المشروع. بقية الأعضاء ينفذون أو يراجعون ضمن مسؤوليات واضحة.</p></div></header>
    <article class="president-command-chain"><div><span>أ</span><small>صاحب القرار النهائي</small><strong>الرئيس أحمد</strong></div><i>←</i><div class="manager"><span>ر</span><small>يقود ويفوض ويراجع</small><strong>راشد</strong></div><i>←</i><div><span>ف</span><small>تنفيذ ومراجعة مستقلة</small><strong>الفريق</strong></div></article>
    <div class="president-team-grid">${TEAM.map(member => {
      const owned = (state.ledger.tasks || []).filter(task => String(task.owner).toLowerCase().includes(member.name.toLowerCase()));
      const reviewing = (state.ledger.tasks || []).filter(task => String(task.reviewer).toLowerCase().includes(member.name.toLowerCase()) || String(task.architectureSteward).toLowerCase().includes(member.name.toLowerCase()));
      const activeOwned = owned.filter(task => !['completed', 'rejected', 'superseded'].includes(task.status));
      return `<article class="president-team-card ${member.manager ? 'manager' : ''}"><header><span>${escapeHtml(member.label.slice(0,1))}</span><div><h2>${escapeHtml(member.label)}</h2><p>${escapeHtml(member.role)}</p></div>${member.manager ? '<b>المدير</b>' : ''}</header><p>${escapeHtml(member.responsibility)}</p><dl><div><dt>ينفذ الآن</dt><dd>${member.manager ? 'لا ينفذ؛ يدير الفريق' : activeOwned.length ? `${activeOwned.length} مهام` : 'لا توجد مهمة حالية'}</dd></div><div><dt>يراجع</dt><dd>${reviewing.length ? `${reviewing.length} مهام` : member.manager ? 'كل نتيجة قبل القرار' : 'لا توجد مراجعة حالية'}</dd></div></dl>${activeOwned.length ? `<details><summary>المهام الحالية</summary><ul>${activeOwned.map(task => `<li>${escapeHtml(administrativeText(task.title))}</li>`).join('')}</ul></details>` : ''}</article>`;
    }).join('')}</div>`;
}

function reviewGateChips(item) {
  const gates = item.gates || {};
  return [
    `المراجع: ${statusLabel(gates.reviewer)}`,
    `راشد: ${statusLabel(gates.manager)}`,
    `حَكَم: ${statusLabel(gates.hakam)}`,
    `الفحوص: ${statusLabel(gates.ci)}`
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
    <header class="president-card-head"><div class="president-card-title"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(({instruction: 'تكليف عام', scene: 'مشهد', element: 'عنصر', architecture: 'تنظيم المنتج'})[item.kind] || 'تكليف')} · ${escapeHtml(({normal: 'عادية', high: 'عالية', urgent: 'عاجلة'})[item.priority] || 'عادية')} · ${escapeHtml(formatTime(item.createdAt))}</span></div><span class="president-status ${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span></header>
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
  renderTeam();
  setVisibleSection();
}

function setVisibleSection() {
  const sections = {
    portfolio: '#presidentPortfolio',
    tasks: '#presidentTasks',
    timeline: '#presidentTimeline',
    reviews: '#presidentReviews',
    directives: '#presidentDirectives',
    team: '#presidentTeam'
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
