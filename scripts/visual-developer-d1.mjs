import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const BASE_URL=process.env.D1_URL||'http://127.0.0.1:4173';
const output=path.resolve('artifacts/developer-d1');
fs.mkdirSync(output,{recursive:true});

const sceneIds=['loading-star','empty-table','logo-wall','board-bases','clean-entry','unboxing-intro'];
const failures=[];
const results=[];

async function waitSceneReady(page,timeout=120000){
  await page.waitForFunction(()=>document.body.dataset.sceneReady==='true'||Boolean(document.body.dataset.sceneError),null,{timeout});
  const state=await page.evaluate(()=>({...document.body.dataset}));
  if(state.sceneError)throw new Error(`${state.developerScene} failed: ${state.sceneError}`);
  if(state.sceneReady!=='true')throw new Error(`${state.developerScene} never became ready`);
  return state;
}

async function waitCardPreview(card,timeout=120000){
  await card.scrollIntoViewIfNeeded();
  await card.locator('iframe').waitFor({state:'attached'});
  await card.page().waitForFunction(element=>element.classList.contains('preview-ready')||element.classList.contains('preview-error'),await card.elementHandle(),{timeout});
  const state=await card.getAttribute('data-preview-state');
  if(state!=='ready')throw new Error(`preview ${await card.getAttribute('data-scene')} failed`);
}

async function openGalleryScene(page,id){
  await page.locator(`[data-scene="${id}"] .scene-open`).click();
  await page.locator('#devStage.open').waitFor();
  const frame=page.frameLocator('#devStageFrame');
  await frame.locator('body[data-scene-ready="true"]').waitFor({timeout:120000});
  return frame;
}

async function closeGalleryScene(page){
  await page.getByRole('button',{name:/العودة للمعرض/}).click();
  await page.locator('#devStage').waitFor({state:'hidden'});
  await page.waitForFunction(()=>!location.hash.startsWith('#scene='));
}

async function writeSceneNote(page,text){
  await page.getByRole('button',{name:'فتح الملاحظات'}).click();
  await page.locator('#devNotesPanel.open').waitFor();
  await page.locator('#devNotesInput').fill(text);
  await page.waitForFunction(()=>document.getElementById('devNotesStatus')?.textContent==='تم الحفظ');
}

async function checkGallery(browser,name,contextOptions){
  const context=await browser.newContext(contextOptions);
  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error?.stack||error)));
  await page.goto(`${BASE_URL}/developer.html`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('yakolak:developer-d1:scene-note:')).forEach(key=>localStorage.removeItem(key)));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.dataset.developerBuild==='D1');
  const cards=page.locator('.scene-card');
  if(await cards.count()!==6)throw new Error(`${name}: expected 6 scene cards`);
  for(let index=0;index<6;index++)await waitCardPreview(cards.nth(index));
  await page.locator('.scene-card').first().scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,`${name}-01-gallery.png`),fullPage:true});

  await page.getByRole('button',{name:'مشهد واحد'}).click();
  if(await page.locator('.scene-card:visible').count()!==4)throw new Error(`${name}: single filter did not show 4 cards`);
  await page.getByRole('button',{name:'مجموعة مشاهد'}).click();
  if(await page.locator('.scene-card:visible').count()!==2)throw new Error(`${name}: sequence filter did not show 2 cards`);
  await page.getByRole('button',{name:'كل المشاهد'}).click();

  const unboxingNote=`${name} · ملاحظة إنترو فك العلبة`;
  const loadingNote=`${name} · ملاحظة مشهد التحميل`;
  const frame=await openGalleryScene(page,'unboxing-intro');
  const setupHidden=await frame.locator('body').getAttribute('data-setup-hidden');
  if(setupHidden!=='true')throw new Error(`${name}: unboxing stage was not isolated`);
  await writeSceneNote(page,unboxingNote);
  await page.waitForTimeout(300);
  await page.screenshot({path:path.join(output,`${name}-02-notes-panel.png`)});
  await page.getByRole('button',{name:'إغلاق الملاحظات'}).click();
  await closeGalleryScene(page);
  const unboxingCard=page.locator('[data-scene="unboxing-intro"]');
  if(!await unboxingCard.evaluate(element=>element.classList.contains('has-note')))throw new Error(`${name}: unboxing note indicator missing`);

  await openGalleryScene(page,'loading-star');
  await page.getByRole('button',{name:'فتح الملاحظات'}).click();
  if(await page.locator('#devNotesInput').inputValue()!=='')throw new Error(`${name}: notes leaked between scenes`);
  await page.locator('#devNotesInput').fill(loadingNote);
  await page.waitForFunction(()=>document.getElementById('devNotesStatus')?.textContent==='تم الحفظ');
  await page.getByRole('button',{name:'إغلاق الملاحظات'}).click();
  await closeGalleryScene(page);

  await openGalleryScene(page,'unboxing-intro');
  await page.getByRole('button',{name:'فتح الملاحظات'}).click();
  const restored=await page.locator('#devNotesInput').inputValue();
  if(restored!==unboxingNote)throw new Error(`${name}: unboxing note was not restored`);
  await page.getByRole('button',{name:'إغلاق الملاحظات'}).click();
  await closeGalleryScene(page);

  if(pageErrors.length)throw new Error(`${name}: page errors\n${pageErrors.join('\n')}`);
  await context.close();
  return{name,cards:6,previews:6,single:4,sequence:2,back:true,notes:true,notesIsolated:true};
}

async function assertScene(page,id,state){
  const runtime=await page.evaluate(()=>{
    const game=globalThis.__yakolakGame;
    const scene=game?.gameGroup?.parent;
    const logoWall=scene?.getObjectByName?.('yakolak-developer-d1-logo-wall');
    const named=['9','3-right','3-left','3-front','3-back'];
    const logoColors=[];
    let logoMeshes=0;
    logoWall?.traverse?.(object=>{
      if(!object.isMesh||!object.material)return;
      logoMeshes++;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      materials.forEach(material=>{if(material.color)logoColors.push(`#${material.color.getHexString()}`)});
    });
    const table=scene?.getObjectByName?.('yakolak-svg-table')||scene?.getObjectByName?.('yakolak-fallback-simple-table');
    const tableBox=table?new game.THREE.Box3().setFromObject(table):null;
    const projected=tableBox?[
      tableBox.min.clone().project(game.camera),tableBox.max.clone().project(game.camera)
    ]:[];
    return{
      gameGroupVisible:game?.gameGroup?.visible,
      setupVisible:game?.setupGroup?.visible,
      visibleBases:named.filter(name=>game?.meshes?.[name]?.visible).length,
      logoChildren:logoWall?.children?.length||0,
      logoMeshes,
      distinctLogoColors:[...new Set(logoColors)].length,
      tableProjection:projected.map(point=>({x:point.x,y:point.y,z:point.z})),
      setupDomVisible:[...document.querySelectorAll('#yakolakGameSetup,#yakolakGameHud,#yakolakGameScore')].some(element=>getComputedStyle(element).display!=='none')
    };
  });
  if(id==='empty-table'){
    if(runtime.gameGroupVisible!==false)throw new Error('empty-table: game objects are visible');
    const points=runtime.tableProjection;
    if(points.length===2&&points.some(point=>Math.abs(point.x)>1.25||Math.abs(point.y)>1.25))throw new Error(`empty-table: table is badly cropped ${JSON.stringify(points)}`);
  }
  if(id==='board-bases'&&(state.visibleObjects!=='5'||runtime.visibleBases!==5))throw new Error(`board-bases: expected five named objects, got ${state.visibleObjects}/${runtime.visibleBases}`);
  if(id==='logo-wall'&&(state.logoRendering!=='svg-geometry-two-tone'||runtime.logoChildren!==2||runtime.logoMeshes<2||runtime.distinctLogoColors<2))throw new Error(`logo-wall: approved two-tone geometry is incomplete ${JSON.stringify(runtime)}`);
  if(id==='unboxing-intro'&&(state.setupHidden!=='true'||runtime.setupVisible!==false||runtime.setupDomVisible))throw new Error(`unboxing-intro: setup leaked into intro ${JSON.stringify(runtime)}`);
  if(id==='clean-entry'){
    const complete=await page.evaluate(()=>globalThis.__yakolakV126Entry?.phase==='complete');
    if(!complete)throw new Error('clean-entry: sequence did not complete');
  }
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
    if(id==='unboxing-intro')await page.waitForTimeout(1600);
    if(pageErrors.length)throw new Error(`${id}: page errors\n${pageErrors.join('\n')}`);
    await assertScene(page,id,state);
    await page.screenshot({path:path.join(output,`scene-${id}.png`)});
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
console.log('Developer D1 gallery, isolated scenes, and per-scene notes passed');