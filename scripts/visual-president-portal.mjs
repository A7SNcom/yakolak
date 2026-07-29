import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const base=process.env.PRESIDENT_BASE_URL||'http://127.0.0.1:4174';
const artifacts=path.resolve('artifacts/president-portal');
const ledger=JSON.parse(fs.readFileSync('ops/ai-team/development-ledger.json','utf8'));
fs.mkdirSync(artifacts,{recursive:true});

const initialMessage={
  id:'message-test-ahmad',itemType:'content',itemId:'content:task:YAK-008-01',authorRole:'president',
  body:'أريد أن تبقى هذه الصفحة بسيطة.',createdAt:'2026-07-29T15:10:00.000Z'
};

function json(route,payload){return route.fulfill({status:200,contentType:'application/json; charset=utf-8',body:JSON.stringify(payload)})}

async function mock(page){
  await page.route('**/ops/ai-team/development-ledger.json',route=>json(route,ledger));
  await page.route('**/developer-scene.html*',route=>route.fulfill({
    status:200,contentType:'text/html; charset=utf-8',
    body:'<!doctype html><html lang="ar" dir="rtl"><style>body{margin:0;display:grid;place-items:center;height:100vh;background:#18211f;color:white;font:700 28px Tahoma}</style><body>معاينة المشهد</body></html>'
  }));
  await page.route('**/api/developer-president',async route=>{
    const request=route.request();
    if(request.method()==='GET')return json(route,{ok:true,channelVersion:1,directives:[],messages:[initialMessage],decisions:[]});
    const body=request.postDataJSON();
    if(body.action==='message_add')return json(route,{ok:true,message:{id:body.id,itemType:body.itemType,itemId:body.itemId,authorRole:'president',body:body.body,createdAt:new Date().toISOString()}});
    return route.fulfill({status:400,contentType:'application/json',body:'{"ok":false}'});
  });
}

async function verify(viewport,name){
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport});
    const errors=[];page.on('pageerror',error=>errors.push(String(error)));
    await mock(page);
    await page.goto(`${base}/developer.html`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.body.dataset.developerReady==='true');
    if(await page.title()!=='ياكلك')throw new Error(`${name}: wrong title`);
    if(await page.locator('.content-card').count()<10)throw new Error(`${name}: cards did not render`);
    if(await page.locator('#filters [data-filter]').count()!==5)throw new Error(`${name}: filters are incomplete`);
    if(await page.locator('.president-kanban,.d4-shell,#presidentPortal').count())throw new Error(`${name}: legacy interface is visible`);
    await page.screenshot({path:path.join(artifacts,`${name}-cards.png`),fullPage:true});

    await page.locator('[data-item-id="journey:journey-1"]').click();
    await page.locator('#contentModal[open]').waitFor();
    await page.locator('#modalTitle').getByText('رحلة الدخول',{exact:true}).waitFor();
    if(await page.locator('#mediaViewport iframe').count()!==1)throw new Error(`${name}: journey preview is missing`);
    if(await page.locator('.media-arrow:not([hidden])').count()!==2)throw new Error(`${name}: journey carousel arrows are missing`);
    const firstSource=await page.locator('#mediaViewport iframe').getAttribute('src');
    await page.locator('#mediaNext').click();
    const secondSource=await page.locator('#mediaViewport iframe').getAttribute('src');
    if(firstSource===secondSource)throw new Error(`${name}: carousel did not move`);
    await page.screenshot({path:path.join(artifacts,`${name}-journey.png`)});
    await page.locator('#modalClose').click();

    await page.locator('#filters [data-filter="task"]').click();
    if(await page.locator('.content-card:not(.task)').count())throw new Error(`${name}: task filter leaked other cards`);
    await page.locator('[data-item-id="task:YAK-008-01"]').click();
    await page.locator('#contentModal[open]').waitFor();
    if(!(await page.locator('#mediaSection').isHidden()))throw new Error(`${name}: image-less task shows empty media`);
    await page.getByText('راشد',{exact:true}).first().waitFor();
    await page.getByText('أحمد',{exact:true}).waitFor();
    if(await page.locator('.comment-name').count()<2)throw new Error(`${name}: Ahmad/Rashed conversation is incomplete`);
    const names=await page.locator('.comment-name').allTextContents();
    if(names.some(value=>!['أحمد','راشد'].includes(value)))throw new Error(`${name}: unexpected conversation role`);
    await page.locator('#commentInput').fill('التجربة واضحة.');
    await page.locator('#commentForm button').click();
    await page.getByText('التجربة واضحة.',{exact:true}).waitFor();
    await page.screenshot({path:path.join(artifacts,`${name}-comments.png`)});

    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    if(overflow>2)throw new Error(`${name}: horizontal overflow ${overflow}px`);
    if(errors.length)throw new Error(`${name}: ${errors.join(' | ')}`);
  }finally{await browser.close()}
}

await verify({width:1440,height:1000},'desktop');
await verify({width:390,height:844},'mobile');
console.log('Minimal cards, journey carousel, image-less task, and Ahmad/Rashed comments passed desktop/mobile verification.');
