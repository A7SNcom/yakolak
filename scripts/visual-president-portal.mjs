import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const base=process.env.PRESIDENT_BASE_URL||'http://127.0.0.1:4174';
const artifacts=path.resolve('artifacts/president-portal');
fs.mkdirSync(artifacts,{recursive:true});

function respond(route,payload){return route.fulfill({status:200,contentType:'application/json; charset=utf-8',body:JSON.stringify(payload)})}
async function mock(page){
  await page.route('**/developer-scene.html*',route=>{const url=new URL(route.request().url()),entityId=url.searchParams.get('scene')||url.searchParams.get('element')||'';return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:`<!doctype html><html lang="ar" dir="rtl"><style>body{margin:0;display:grid;place-items:center;height:100vh;background:#17201e;color:#fff;font:700 26px Tahoma}</style><body>معاينة<script>parent.postMessage({type:'yakolak-developer-scene-ready',entityId:${JSON.stringify(entityId)}},'*')<\/script></body></html>`})});
  await page.route('**/api/developer-president',route=>respond(route,{
    ok:true,database:'google-sheets',databaseVersion:2,sourceOfTruth:'google-sheets',sheetUrl:'https://docs.google.com/spreadsheets/d/test/edit',tabs:['المهام','المحتوى','المعاينات','المحادثات','سجل العمل','الإعدادات'],writableInInterface:false,
    content:[
      {id:'journey-entry',kind:'journey',category:'مجموعة',title:'الدخول',description:'مشاهد الدخول.',parentId:'',order:0,variants:[{id:'current',name:'النسخة الحالية',query:{}}],scenes:[{id:'loading-star',kind:'scene',category:'single',title:'مشهد التحميل',description:'تحميل البداية.',parentId:'journey-entry',sourceKey:'scene.loading-star',previewMode:'base',variants:[{id:'current',name:'النسخة الحالية',query:{}}]}]},
      {id:'loading-star',kind:'scene',category:'single',title:'مشهد التحميل',description:'تحميل البداية.',parentId:'journey-entry',parent:'الدخول',sourceKey:'scene.loading-star',previewMode:'base',order:1,variants:[{id:'current',name:'النسخة الحالية',query:{}}]},
      {id:'base-small',kind:'element',category:'element',title:'منطقة الراحة',description:'قاعدة اللاعب.',parentId:'journey-components',parent:'المكونات',sourceKey:'meshes["3-{color}"]',previewMode:'variant',order:2,variants:[{id:'front',name:'أخضر',query:{color:'front'}},{id:'back',name:'أزرق',query:{color:'back'}}]}
    ],
    tasks:[
      {id:'YAK-TEST-01',kind:'task',parentType:'journey',parentId:'journey-entry',title:'مراجعة رحلة الدخول',description:'افحص الانتقال بين المشاهد.',owner:'نور',status:'in_progress',updatedAt:'2026-07-30T05:00:00Z',link:'https://github.com/A7SNcom/yakolak/pull/50',attachments:[]},
      {id:'YAK-TEST-02',kind:'task',parentType:'none',parentId:'واجهة التطوير',title:'تبسيط قاعدة البيانات',description:'استخدام Google Sheets كمصدر وحيد.',owner:'راشد',status:'review',updatedAt:'2026-07-30T05:10:00Z',attachments:[]}
    ],
    taskComments:[{id:'reply-1',taskId:'YAK-TEST-01',authorRole:'manager',authorName:'راشد',body:'المعاينة جاهزة للمراجعة.',updatedAt:'2026-07-30T05:20:00Z'}],
    taskWork:[{id:'update-1',taskId:'YAK-TEST-01',authorRole:'worker',authorName:'نور',body:'تم فحص البداية.',updatedAt:'2026-07-30T05:30:00Z'}],settings:{storage:'google-sheets'},contentStates:[],messages:[]
  }));
}

async function verify(viewport,name){
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',error=>errors.push(String(error)));await mock(page);
    await page.goto(`${base}/developer.html`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.body.dataset.developerReady==='true');
    if(await page.locator('#editorModal,#openGlobalTask,.drag-handle').count())throw new Error(`${name}: legacy editing controls remain`);
    if(await page.locator('#filters [data-filter]').count()!==5)throw new Error(`${name}: filters are incomplete`);
    if(await page.evaluate(()=>document.body.dataset.databaseSource)!=='google-sheets')throw new Error(`${name}: Sheets is not the source of truth`);
    await page.locator('#databaseLink').waitFor();
    await page.getByText('Google Sheets كامل • 3 محتوى • 2 مهمة',{exact:true}).waitFor();

    await page.locator('#searchInput').fill('رحله دخوول');
    await page.locator('.content-card').first().getByText('الدخول',{exact:true}).waitFor();
    await page.locator('#searchInput').fill('');

    await page.locator('[data-item-id="journey:journey-entry"]').click();
    await page.locator('#contentModal[open]').waitFor();await page.locator('.preview-frame.ready').waitFor();
    if(await page.locator('.preview-loading').count())throw new Error(`${name}: preview loader remained`);
    await page.locator('#linkedTasks').getByText('مراجعة رحلة الدخول',{exact:true}).waitFor();await page.getByText('المعاينة جاهزة للمراجعة.',{exact:true}).waitFor();await page.getByText('تم فحص البداية.',{exact:true}).waitFor();
    await page.locator('#modalClose').click();

    await page.locator('[data-item-id="element:base-small"]').click();
    if(await page.locator('#previewVersionSelect option').count()!==2)throw new Error(`${name}: Sheet variants are missing`);
    await page.locator('#modalClose').click();

    await page.locator('#filters [data-filter="task"]').click();
    if(await page.locator('.task-row').count()!==2)throw new Error(`${name}: Google Sheet tasks are missing`);
    if(await page.locator('.task-row .status-in_progress').count()!==1)throw new Error(`${name}: status mapping failed`);
    await page.locator('[data-task-id="YAK-TEST-02"] .task-copy').click();await page.locator('#modalDescription').getByText('استخدام Google Sheets كمصدر وحيد.',{exact:true}).waitFor();
    await page.screenshot({path:path.join(artifacts,`${name}-full-google-sheet-workspace.png`),fullPage:true});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);if(overflow>2)throw new Error(`${name}: horizontal overflow ${overflow}px`);
    if(errors.length)throw new Error(`${name}: ${errors.join(' | ')}`);
  }finally{await browser.close()}
}

await verify({width:1440,height:1000},'desktop');
await verify({width:390,height:844},'mobile');
console.log('Full Google Sheet content, variants, tasks, linked updates and responsive layout passed desktop/mobile verification.');
