import {chromium} from 'playwright';
import fs from 'node:fs';

fs.mkdirSync('artifacts/developer-d2',{recursive:true});
const browser=await chromium.launch({headless:true});
const sampleThread={id:'thread:demo',entityType:'scene',entityId:'clean-entry',status:'ready_for_review',title:'استمرارية حركة الكاميرا',createdAt:'2026-07-28T08:00:00.000Z',updatedAt:'2026-07-28T08:10:00.000Z',comments:[{id:'comment:1',authorRole:'reviewer',body:'تأكد أن الطاولة تمر عابرًا دون توقف.',createdAt:'2026-07-28T08:00:00.000Z'},{id:'comment:2',authorRole:'developer',body:'تم توحيد الحركة وأصبحت جاهزة للمراجعة.',createdAt:'2026-07-28T08:10:00.000Z'}]};
const sampleRequest={id:7,kind:'scene',title:'مشهد نهاية الجولة',description:'إضافة مشهد واضح لنهاية الجولة.',scenario:'بعد إعلان الفائز.',status:'requested',createdAt:'2026-07-28T08:00:00.000Z',updatedAt:'2026-07-28T08:00:00.000Z',comments:[]};

async function setup(page){
  await page.route('**/api/developer-d1',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,entities:[],threads:[sampleThread]})}));
  await page.route('**/api/developer-d1-workspace',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,board:null,requests:[sampleRequest]})}));
  await page.route('**/api/developer-d1-comparisons',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,comparisons:[]})}));
  await page.route('**/developer-scene.html?**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ar" dir="rtl"><style>html,body{margin:0;height:100%;display:grid;place-items:center;background:#f7f7f4;font:700 28px system-ui;color:#242421}</style><body>معاينة رحلة الدخول</body></html>'}));
}

const desktop=await browser.newPage({viewport:{width:1440,height:900}});
await setup(desktop);
await desktop.goto('http://127.0.0.1:4173/developer.html');
await desktop.waitForSelector('body[data-developer-build="D2-workbench"]');
if(await desktop.locator('#d2PreviewFrame').count()!==1)throw new Error('Expected one preview iframe');
for(const selector of['#d2Navigator','.d2-canvas-shell','#d2Inspector'])if(!(await desktop.locator(selector).isVisible()))throw new Error(`${selector} is not visible`);
await desktop.screenshot({path:'artifacts/developer-d2/desktop-workbench.png',fullPage:true});
await desktop.click('#d2Compare');
await desktop.waitForSelector('#d2ComparePane:not([hidden])');
await desktop.screenshot({path:'artifacts/developer-d2/desktop-before-after.png',fullPage:true});
await desktop.click('[data-nav-mode="queue"]');
await desktop.getByText('مشهد نهاية الجولة').click();
await desktop.waitForFunction(()=>document.querySelector('#d2SelectionCode')?.textContent==='request:7');

const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await setup(mobile);
await mobile.goto('http://127.0.0.1:4173/developer.html');
await mobile.waitForSelector('body[data-developer-build="D2-workbench"]');
await mobile.screenshot({path:'artifacts/developer-d2/mobile-preview.png',fullPage:true});
await mobile.click('.d2-mobile-nav [data-mobile-view="navigator"]');
if(!(await mobile.locator('#d2Navigator').isVisible()))throw new Error('Mobile navigator not visible');
await mobile.click('.d2-mobile-nav [data-mobile-view="inspector"]');
if(!(await mobile.locator('#d2Inspector').isVisible()))throw new Error('Mobile inspector not visible');
await mobile.screenshot({path:'artifacts/developer-d2/mobile-review.png',fullPage:true});

await browser.close();
console.log('Developer D2 visual verification passed.');
