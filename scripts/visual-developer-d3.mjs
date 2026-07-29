import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const base=process.env.DEVELOPER_D3_BASE_URL||'http://127.0.0.1:4173';
const artifacts=path.resolve('artifacts/developer-d3');
const ledger=JSON.parse(fs.readFileSync('ops/ai-team/development-ledger.json','utf8'));
fs.mkdirSync(artifacts,{recursive:true});

const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1365,height:900}});
  await page.route('**/ops/ai-team/development-ledger.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(ledger)}));
  await page.route('**/api/developer-president',route=>route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"messages":[],"directives":[],"decisions":[]}'}));
  await page.goto(`${base}/developer.html`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.dataset.developerReady==='true');
  if(await page.locator('[id^="d3"],.d3-shell').count())throw new Error('Legacy D3 interface is still live');
  if(await page.locator('.content-card').count()<1)throw new Error('Minimal card page did not render');
  if(await page.locator('#filters [data-filter]').count()!==5)throw new Error('Minimal filters are incomplete');
  await page.screenshot({path:path.join(artifacts,'d3-retired-minimal-page.png'),fullPage:true});
}finally{await browser.close()}

console.log('Developer D3 is retired from the live page; the minimal card page rendered successfully.');
