import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const base = process.env.PRESIDENT_BASE_URL || 'http://127.0.0.1:4174';
const artifacts = path.resolve('artifacts/president-portal');
const blueprint = JSON.parse(fs.readFileSync('ops/ai-team/development-blueprint.json', 'utf8'));
const ledger = JSON.parse(fs.readFileSync('ops/ai-team/development-ledger.json', 'utf8'));
fs.mkdirSync(artifacts, {recursive: true});

const respondJson = (route, payload) => route.fulfill({
  status: 200,
  contentType: 'application/json; charset=utf-8',
  body: JSON.stringify(payload)
});

const validReview = {
  id: 'president-review:YAK-TEST-01',
  status: 'ready_for_president',
  taskId: 'YAK-TEST-01',
  title: 'رحلة دخول جاهزة للقرار',
  summary: 'تم تنفيذ المهمة واختبارها وراجعها الفريق.',
  recommendation: 'اعتماد النتيجة داخل فرع الفريق.',
  worker: 'Noor',
  reviewer: 'Sami',
  commitSha: '0123456789abcdef0123456789abcdef01234567',
  prUrl: 'https://github.com/A7SNcom/yakolak/pull/47',
  previewUrl: `${base}/developer.html`,
  decisionScope: 'team_integration',
  gates: {reviewer: 'PASS', manager: 'PASS', hakam: 'MERGE_OK', ci: 'GREEN'},
  evidence: [],
  createdAt: '2026-07-28T17:00:00.000Z'
};
const invalidReview = {...validReview, id: 'president-review:YAK-TEST-02', title: 'يجب ألا تظهر', gates: {...validReview.gates, ci: 'RED'}};
const directive = {
  id: 'directive:test-001',
  kind: 'scene',
  title: 'تطوير مشهد البداية',
  body: 'اجعل الحركة متصلة وواضحة.',
  context: {title: 'رحلة الدخول', code: 'scene.clean-entry', url: `${base}/developer.html`},
  priority: 'high',
  cancelled: false,
  createdAt: '2026-07-28T16:00:00.000Z',
  updatedAt: '2026-07-28T16:00:00.000Z'
};

async function mock(page) {
  await page.route('**/api/developer-d1', route => respondJson(route, {ok: true, entities: [], threads: [], statuses: []}));
  await page.route('**/api/developer-d1-workspace', route => respondJson(route, {ok: true, board: null, requests: []}));
  await page.route('**/api/developer-d1-comparisons', route => respondJson(route, {ok: true, comparisons: []}));
  await page.route('**/ops/ai-team/development-blueprint.json', route => respondJson(route, blueprint));
  await page.route('**/ops/ai-team/development-ledger.json', route => respondJson(route, ledger));
  await page.route('**/ops/ai-team/president-outbox.json', route => respondJson(route, {version: 1, manager: 'Rashed', items: [validReview, invalidReview]}));
  await page.route('**/ops/ai-team/president-status.json', route => respondJson(route, {
    version: 1,
    updatedAt: '2026-07-28T17:00:00.000Z',
    leadershipMode: 'DELEGATED_LEADERSHIP',
    blueprint: {canonicalRevision: blueprint.revision},
    directives: {
      [directive.id]: {
        status: 'planned',
        note: 'استلم راشد التكليف وقسّمه إلى مهمة محدودة.',
        taskIds: ['YAK-006-01'],
        updatedAt: '2026-07-28T17:00:00.000Z'
      }
    }
  }));
  await page.route('**/api/developer-president', async route => {
    const request = route.request();
    if (request.method() === 'GET') return respondJson(route, {ok: true, channelVersion: 1, directives: [directive], messages: [], decisions: []});
    const body = request.postDataJSON();
    if (body.action === 'directive_create') return respondJson(route, {ok: true, directive: {...directive, id: body.id, title: body.title, body: body.body, kind: body.kind, priority: body.priority, context: body.context, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()}});
    if (body.action === 'review_decision') return respondJson(route, {ok: true, decision: {reviewId: body.reviewId, decision: body.decision, body: body.body || '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()}});
    if (body.action === 'message_add') return respondJson(route, {ok: true, message: {id: body.id, itemType: body.itemType, itemId: body.itemId, authorRole: 'president', body: body.body, createdAt: new Date().toISOString()}});
    if (body.action === 'directive_cancel') return respondJson(route, {ok: true, directive: {...directive, id: body.directiveId, cancelled: true}});
    return route.fulfill({status: 400, contentType: 'application/json', body: '{"ok":false,"error":"invalid_test_action"}'});
  });
}

async function openOffice(page, name) {
  if (name === 'mobile') await page.locator('.d4-mobile-nav [data-mobile-view="work"]').click();
  else await page.getByRole('button', {name: /قيادة المشروع/}).click();
  await page.locator('#presidentPortal.open').waitFor();
}

async function verify(viewport, name) {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage({viewport});
    await mock(page);
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`${base}/developer.html`, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => document.body.dataset.developerRole === 'president');
    if (await page.title() !== 'ياكلك · واجهة الرئيس') throw new Error(`${name}: wrong title`);
    if (!(await page.locator('#d4NewRequest').isHidden())) throw new Error(`${name}: legacy direct-request channel remains visible`);
    if (!String(await page.locator('#d4StartTask').textContent()).includes('راشد')) throw new Error(`${name}: main task action does not name Rashed`);

    if (name === 'desktop') {
      await page.locator('#d4StartTask').click();
      await page.locator('#presidentPortal.open').waitFor();
      if (await page.locator('#presidentDirectives').isHidden()) throw new Error(`${name}: scene task did not route to Rashed directives`);
      await page.locator('#presidentClose').click();
    }

    await openOffice(page, name);
    const portfolioPanel = page.locator('#presidentPortfolio');
    await portfolioPanel.getByText('مسار تطوير ياكلك', {exact: true}).waitFor();
    await portfolioPanel.getByText('إغلاق العيبين المثبتين قبل توسيع التطوير', {exact: true}).waitFor();
    if (await portfolioPanel.locator('[data-blueprint-node]').count() < 5) throw new Error(`${name}: project map did not render enough nodes`);
    await page.screenshot({path: path.join(artifacts, `${name}-portfolio.png`), fullPage: true});

    await page.getByRole('button', {name: /^المهام/}).click();
    const correctionTask = page.locator('#presidentTasks [data-task-id="YAK-006-01"]');
    await correctionTask.waitFor();
    if (!String(await correctionTask.locator('.president-card-title strong').textContent()).includes('إغلاق قابلية تعديل عقد الأوضاع')) throw new Error(`${name}: expected correction task title is missing`);
    const progress = String(await correctionTask.locator('.president-progress-label').textContent());
    if (!progress.includes('Noor') && !progress.includes('Artifact')) throw new Error(`${name}: task progress is not visible`);
    await page.screenshot({path: path.join(artifacts, `${name}-tasks.png`), fullPage: true});

    await page.getByRole('button', {name: /^السجل/}).click();
    const timelinePanel = page.locator('#presidentTimeline');
    await timelinePanel.getByText('إسناد التصحيح إلى Noor', {exact: true}).waitFor();
    await page.screenshot({path: path.join(artifacts, `${name}-timeline.png`), fullPage: true});

    await page.getByRole('button', {name: /بانتظار قراري/}).click();
    const reviewPanel = page.locator('#presidentReviews');
    await reviewPanel.getByText('رحلة دخول جاهزة للقرار', {exact: true}).waitFor();
    if (await reviewPanel.getByText('يجب ألا تظهر', {exact: true}).count()) throw new Error(`${name}: invalid review was exposed`);
    if (await page.locator('#presidentReviewCount').textContent() !== '1') throw new Error(`${name}: review gate count is not 1`);

    await page.getByRole('button', {name: /تعليماتي لراشد/}).click();
    const directivePanel = page.locator('#presidentDirectives');
    await directivePanel.getByText('تطوير مشهد البداية', {exact: true}).waitFor();
    await directivePanel.getByText('استلم راشد التكليف وقسّمه إلى مهمة محدودة.', {exact: true}).waitFor();
    await directivePanel.locator('.president-form input[name="title"]').fill('اختبار تكليف الرئيس');
    await directivePanel.locator('.president-form textarea[name="body"]').fill('نفّذ نتيجة واحدة قابلة للمراجعة.');
    await directivePanel.locator('.president-form button[type="submit"]').click();
    await directivePanel.getByText('اختبار تكليف الرئيس', {exact: true}).waitFor();

    const documentOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (documentOverflow > 2) throw new Error(`${name}: horizontal document overflow ${documentOverflow}px`);
    if (errors.length) throw new Error(`${name}: page errors: ${errors.join(' | ')}`);
  } finally {
    await browser.close();
  }
}

await verify({width: 1440, height: 1000}, 'desktop');
await verify({width: 390, height: 844}, 'mobile');
console.log('President project map, tasks, timeline, reviews, and directives passed desktop/mobile verification');