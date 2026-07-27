import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const BASE_URL=process.env.D1_URL||'http://127.0.0.1:4173';
const output=path.resolve('artifacts/developer-d1');
fs.mkdirSync(output,{recursive:true});

const sceneIds=['loading-star','empty-table','logo-wall','board-bases','clean-entry','unboxing-intro'];
const failures=[];
const results=[];

async function waitSceneReady(page,timeout=90000){
  await page.waitForFunction(()=>document.body.dataset.sceneReady==='true'||Boolean(document.body.dataset.sceneError),null,{timeout});
  const state=await page.evaluate(()=>({
    scene:document.body.dataset.developerScene||'',
    ready:document.body.dataset.sceneReady||'',
    error:document.body.dataset.sceneError||'',
    preview:document.body.dataset.preview||''
  }));
  if(state.error)throw new Error(`${state.scene} failed: ${state.error}`);
  if(state.ready!=='true')throw new Error(`${state.scene} never became ready`);
  return state;
}

async function checkGallery(browser,name,contextOptions){
  const context=await browser.newContext(contextOptions);
  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error?.stack||error)));
  await page.goto(`${BASE_URL}/developer.html`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>document.body.dataset.developerBuild==='D1');
  const cards=page.locator('.scene-card');
  if(await cards.count()!==6)throw new Error(`${name}: expected 6 scene cards`);
  await page.screenshot({path:path.join(output,`${name}-01-gallery.png`),fullPage:true});

  await page.getByRole('button',{name:'مشهد واحد'}).click();
  if(await page.locator('.scene-card:visible').count()!==4)throw new Error(`${name}: single filter did not show 4 cards`);
  await page.getByRole('button',{name:'مجموعة مشاهد'}).click();
  if(await page.locator('.scene-card:visible').count()!==2)throw new Error(`${name}: sequence filter did not show 2 cards`);
  await page.getByRole('button',{name:'كل المشاهد'}).click();

  await page.locator('[data-scene="loading-star"] .scene-open').click();
  await page.locator('#devStage.open').waitFor();
  const frame=page.frameLocator('#devStageFrame');
  await frame.locator('body[data-scene-ready="true"]').waitFor({timeout:45000});
  await page.screenshot({path:path.join(output,`${name}-02-open-scene.png`)});
  await page.getByRole('button',{name:/العودة للمعرض/}).click();
  await page.locator('#devStage').waitFor({state:'hidden'});

  if(pageErrors.length)throw new Error(`${name}: page errors\n${pageErrors.join('\n')}`);
  await context.close();
  return{name,cards:6,single:4,sequence:2,back:true};
}

async function checkScenes(browser){
  const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
  const page=await context.newPage();
  for(const id of sceneIds){
    const pageErrors=[];
    page.removeAllListeners('pageerror');
    page.on('pageerror',error=>pageErrors.push(String(error?.stack||error)));
    await page.goto(`${BASE_URL}/developer-scene.html?scene=${id}&d=D1`,{waitUntil:'domcontentloaded',timeout:60000});
    const state=await waitSceneReady(page);
    if(pageErrors.length)throw new Error(`${id}: page errors\n${pageErrors.join('\n')}`);
    if(['loading-star','board-bases','clean-entry','unboxing-intro'].includes(id)){
      await page.screenshot({path:path.join(output,`scene-${id}.png`)});
    }
    results.push(state);
  }
  await context.close();
}

const browser=await chromium.launch({headless:true});
try{
  try{results.push(await checkGallery(browser,'desktop',{viewport:{width:1440,height:900},deviceScaleFactor:1}))}
  catch(error){failures.push({scope:'desktop-gallery',error:String(error?.stack||error)})}
  try{results.push(await checkGallery(browser,'mobile',{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}))}
  catch(error){failures.push({scope:'mobile-gallery',error:String(error?.stack||error)})}
  try{await checkScenes(browser)}
  catch(error){failures.push({scope:'scene-catalog',error:String(error?.stack||error)})}
}finally{
  await browser.close();
}

fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({build:'D1',url:BASE_URL,results,failures},null,2));
if(failures.length)throw new Error(`Developer D1 visual failures: ${JSON.stringify(failures)}`);
console.log('Developer D1 gallery and all six scenes passed');
