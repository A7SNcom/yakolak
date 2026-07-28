import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const base=process.env.PRESIDENT_BASE_URL||'http://127.0.0.1:4174';
const artifacts=path.resolve('artifacts/president-portal');
fs.mkdirSync(artifacts,{recursive:true});
const json=(route,payload)=>route.fulfill({status:200,contentType:'application/json; charset=utf-8',body:JSON.stringify(payload)});
const validReview={
  id:'president-review:YAK-TEST-01',status:'ready_for_president',taskId:'YAK-TEST-01',title:'رحلة دخول جاهزة للقرار',
  summary:'تم تنفيذ المهمة واختبارها وراجعها الفريق.',worker:'Noor',reviewer:'Sami',commitSha:'0123456789abcdef0123456789abcdef01234567',
  prUrl:'https://github.com/A7SNcom/yakolak/pull/38',previewUrl:`${base}/developer.html`,decisionScope:'team_integration',
  gates:{reviewer:'PASS',manager:'PASS',hakam:'MERGE_OK',ci:'GREEN'},evidence:[],createdAt:'2026-07-28T17:00:00.000Z'
};
const invalidReview={...validReview,id:'president-review:YAK-TEST-02',title:'يجب ألا تظهر',gates:{...validReview.gates,ci:'RED'}};
const directive={id:'directive:test-001',kind:'scene',title:'تطوير مشهد البداية',body:'اجعل الحركة متصلة وواضحة.',context:{title:'رحلة الدخول',code:'scene.clean-entry',url:`${base}/developer.html`},priority:'high',cancelled:false,createdAt:'2026-07-28T16:00:00.000Z',updatedAt:'2026-07-28T16:00:00.000Z'};

async function mock(page){
  await page.route('**/api/developer-d1',route=>json(route,{ok:true,entities:[],threads:[],statuses:[]}));
  await page.route('**/api/developer-d1-workspace',route=>json(route,{ok:true,board:null,requests:[]}));
  await page.route('**/api/developer-d1-comparisons',route=>json(route,{ok:true,comparisons:[]}));
  await page.route('**/ops/ai-team/president-outbox.json',route=>json(route,{version:1,manager:'Rashed',items:[validReview,invalidReview]}));
  await page.route('**/ops/ai-team/president-status.json',route=>json(route,{version:1,updatedAt:'2026-07-28T17:00:00.000Z',directives:{[directive.id]:{status:'planned',note:'استلم راشد التكليف وقسّمه إلى مهمة محدودة.',taskIds:['YAK-TEST-03'],updatedAt:'2026-07-28T17:00:00.000Z'}}}));
  await page.route('**/api/developer-president',async route=>{
    const request=route.request();
    if(request.method()==='GET')return json(route,{ok:true,channelVersion:1,directives:[directive],messages:[],decisions:[]});
    const body=request.postDataJSON();
    if(body.action==='directive_create')return json(route,{ok:true,directive:{...directive,id:body.id,title:body.title,body:body.body,kind:body.kind,priority:body.priority,context:body.context,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}});
    if(body.action==='review_decision')return json(route,{ok:true,decision:{reviewId:body.reviewId,decision:body.decision,body:body.body||'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}});
    if(body.action==='message_add')return json(route,{ok:true,message:{id:body.id,itemType:body.itemType,itemId:body.itemId,authorRole:'president',body:body.body,createdAt:new Date().toISOString()}});
    if(body.action==='directive_cancel')return json(route,{ok:true,directive:{...directive,id:body.directiveId,cancelled:true}});
    return route.fulfill({status:400,contentType:'application/json',body:'{"ok":false,"error":"invalid_test_action"}'});
  });
}

async function verify(viewport,name){
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewportSize:viewport});
  await mock(page);
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(`${base}/developer.html`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.dataset.developerRole==='president');
  if(await page.title()!=='ياكلك · واجهة الرئيس')throw new Error(`${name}: wrong title`);
  if(!(await page.locator('#d4NewRequest').isHidden()))throw new Error(`${name}: legacy direct-request channel remains visible`);
  if(!String(await page.locator('#d4StartTask').textContent()).includes('راشد'))throw new Error(`${name}: main task action does not name Rashed`);
  await page.locator('#d4StartTask').click();
  await page.locator('#presidentPortal.open').waitFor();
  if(await page.locator('#presidentDirectives').isHidden())throw new Error(`${name}: scene task did not route to Rashed directives`);
  await page.locator('#presidentClose').click();
  await page.getByRole('button',{name:/مكتب الرئيس/}).click();
  await page.locator('#presidentPortal.open').waitFor();
  await page.getByText('رحلة دخول جاهزة للقرار').waitFor();
  if(await page.getByText('يجب ألا تظهر').count())throw new Error(`${name}: invalid review was exposed`);
  if(await page.locator('#presidentReviewCount').textContent()!=='1')throw new Error(`${name}: review gate count is not 1`);
  await page.screenshot({path:path.join(artifacts,`${name}-reviews.png`),fullPage:true});
  await page.getByRole('button',{name:/تعليماتي لراشد/}).click();
  await page.getByText('تطوير مشهد البداية').waitFor();
  await page.getByText('استلم راشد التكليف').waitFor();
  await page.locator('.president-form input[name="title"]').fill('اختبار تكليف الرئيس');
  await page.locator('.president-form textarea[name="body"]').fill('نفّذ نتيجة واحدة قابلة للمراجعة.');
  await page.locator('.president-form button[type="submit"]').click();
  await page.getByText('اختبار تكليف الرئيس').waitFor();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  if(overflow>2)throw new Error(`${name}: horizontal overflow ${overflow}px`);
  await page.screenshot({path:path.join(artifacts,`${name}-directives.png`),fullPage:true});
  if(errors.length)throw new Error(`${name}: page errors: ${errors.join(' | ')}`);
  await browser.close();
}

await verify({width:1440,height:1000},'desktop');
await verify({width:390,height:844},'mobile');
console.log('President portal desktop/mobile browser verification passed');
