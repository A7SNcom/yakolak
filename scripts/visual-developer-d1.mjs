import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const BASE_URL=process.env.D1_URL||'http://127.0.0.1:4173';
const output=path.resolve('artifacts/developer-d1');
fs.mkdirSync(output,{recursive:true});

const sceneIds=['loading-star','empty-table','logo-wall','board-bases','clean-entry','unboxing-intro'];
const elementIds=['base-large','base-small','stone-large','stone-medium','stone-small','loading-star-element','table','logo-yakolak','logo-mtkyf'];
const failures=[];
const results=[];

async function installStoreMock(context){
  const store=new Map();
  await context.route('**/api/developer-d1',async route=>{
    const request=route.request();
    if(request.method()==='GET'){
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,entities:[...store.values()]})});
      return;
    }
    if(request.method()==='POST'){
      const body=request.postDataJSON();
      const key=`${body.entityType}:${body.entityId}`;
      const previous=store.get(key);
      const entity={
        entityType:body.entityType,
        entityId:body.entityId,
        sourceKey:body.sourceKey||'',
        displayName:body.displayName||'',
        notes:body.notes||'',
        version:(previous?.version||0)+1,
        createdAt:previous?.createdAt||new Date().toISOString(),
        updatedAt:new Date().toISOString()
      };
      store.set(key,entity);
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,entity})});
      return;
    }
    await route.fulfill({status:405,contentType:'application/json',body:JSON.stringify({ok:false,error:'method_not_allowed'})});
  });
  return store;
}

async function waitSceneReady(page,timeout=120000){
  await page.waitForFunction(()=>document.body.dataset.sceneReady==='true'||Boolean(document.body.dataset.sceneError),null,{timeout});
  const state=await page.evaluate(()=>({...document.body.dataset}));
  if(state.sceneError)throw new Error(`${state.developerEntity||state.developerScene} failed: ${state.sceneError}`);
  if(state.sceneReady!=='true')throw new Error(`${state.developerEntity||state.developerScene} never became ready`);
  return state;
}

async function waitCardPreview(card,timeout=120000){
  await card.scrollIntoViewIfNeeded();
  await card.locator('iframe').waitFor({state:'attached'});
  const handle=await card.elementHandle();
  await card.page().waitForFunction(element=>element.classList.contains('preview-ready')||element.classList.contains('preview-error'),handle,{timeout});
  const state=await card.getAttribute('data-preview-state');
  if(state!=='ready')throw new Error(`preview ${await card.getAttribute('data-entity-id')} failed`);
}

async function openGalleryEntity(page,selector){
  await page.locator(`${selector} .scene-open`).click();
  await page.locator('#devStage.open').waitFor();
  const frame=page.frameLocator('#devStageFrame');
  await frame.locator('body[data-scene-ready="true"]').waitFor({timeout:120000});
  return frame;
}

async function closeGalleryEntity(page){
  await page.getByRole('button',{name:/العودة للمعرض/}).click();
  await page.locator('#devStage').waitFor({state:'hidden'});
}

async function openEditorFromStage(page){
  await page.getByRole('button',{name:'فتح الملاحظات والتسمية'}).click();
  await page.locator('#devEditor.open').waitFor();
}

async function saveEditor(page,name,note){
  await page.locator('#devNameInput').fill(name);
  await page.locator('#devNotesInput').fill(note);
  await page.locator('#devSave').click();
  await page.waitForFunction(()=>document.getElementById('devEditorStatus')?.textContent==='تم الحفظ في المخزن المشترك');
}

async function checkGallery(browser,name,contextOptions){
  const context=await browser.newContext(contextOptions);
  const store=await installStoreMock(context);
  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error?.stack||error)));
  await page.goto(`${BASE_URL}/developer.html`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.evaluate(()=>localStorage.removeItem('yakolak:developer-d1:shared-review:v1'));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.dataset.developerBuild==='D1'&&document.body.dataset.developerSharedReady==='true');

  const cards=page.locator('.scene-card');
  if(await cards.count()!==15)throw new Error(`${name}: expected 15 total scene and element cards`);
  if(await page.locator('.scene-card:visible').count()!==6)throw new Error(`${name}: all-scenes tab did not show 6 cards`);
  for(const id of sceneIds)await waitCardPreview(page.locator(`[data-scene="${id}"]`));
  await page.locator('.scene-card:visible').first().scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,`${name}-01-scenes.png`),fullPage:true});

  await page.getByRole('button',{name:'مشهد واحد'}).click();
  if(await page.locator('.scene-card:visible').count()!==4)throw new Error(`${name}: single filter did not show 4 cards`);
  await page.getByRole('button',{name:'مجموعة مشاهد'}).click();
  if(await page.locator('.scene-card:visible').count()!==2)throw new Error(`${name}: sequence filter did not show 2 cards`);
  await page.getByRole('button',{name:'العناصر'}).click();
  if(await page.locator('.scene-card:visible').count()!==9)throw new Error(`${name}: elements filter did not show 9 cards`);
  await waitCardPreview(page.locator('[data-element="base-large"]'));
  await waitCardPreview(page.locator('[data-element="loading-star-element"]'));
  await page.screenshot({path:path.join(output,`${name}-02-elements.png`),fullPage:true});
  await page.getByRole('button',{name:'كل المشاهد'}).click();

  const renamedScene=`إنترو العلبة ${name}`;
  const sceneNote=`${name} · افصل الإنترو عن إعداد اللاعبين`;
  const frame=await openGalleryEntity(page,'[data-scene="unboxing-intro"]');
  if(await frame.locator('body').getAttribute('data-setup-hidden')!=='true')throw new Error(`${name}: unboxing stage was not isolated`);
  await openEditorFromStage(page);
  if(await page.locator('#devCodeKey').textContent()!=='scene.unboxing-intro')throw new Error(`${name}: scene code mapping missing`);
  await saveEditor(page,renamedScene,sceneNote);
  await page.screenshot({path:path.join(output,`${name}-03-shared-editor.png`)});
  await page.getByRole('button',{name:'إغلاق المحرر'}).click();
  await closeGalleryEntity(page);
  const unboxingCard=page.locator('[data-scene="unboxing-intro"]');
  if((await unboxingCard.locator('.scene-title').textContent())!==renamedScene)throw new Error(`${name}: renamed scene did not update card`);
  if(!await unboxingCard.evaluate(element=>element.classList.contains('has-note')))throw new Error(`${name}: scene note indicator missing`);

  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.dataset.developerSharedReady==='true');
  const restoredScene=page.locator('[data-scene="unboxing-intro"]');
  if((await restoredScene.locator('.scene-title').textContent())!==renamedScene)throw new Error(`${name}: shared scene name was not restored`);
  await restoredScene.locator('.scene-edit').click();
  await page.locator('#devEditor.open').waitFor();
  if(await page.locator('#devNotesInput').inputValue()!==sceneNote)throw new Error(`${name}: shared scene note was not restored`);
  await page.getByRole('button',{name:'إغلاق المحرر'}).click();

  await page.getByRole('button',{name:'العناصر'}).click();
  const renamedElement=`القاعدة الأم ${name}`;
  const elementNote=`${name} · الاسم الجديد للقاعدة الكبيرة`;
  const baseCard=page.locator('[data-element="base-large"]');
  await baseCard.locator('.scene-edit').click();
  await page.locator('#devEditor.open').waitFor();
  if(await page.locator('#devCodeKey').textContent()!=='meshes["9"]')throw new Error(`${name}: element code mapping missing`);
  await saveEditor(page,renamedElement,elementNote);
  await page.getByRole('button',{name:'إغلاق المحرر'}).click();
  if((await baseCard.locator('.scene-title').textContent())!==renamedElement)throw new Error(`${name}: renamed element did not update card`);
  const elementFrame=await openGalleryEntity(page,'[data-element="base-large"]');
  if(await elementFrame.locator('body').getAttribute('data-developer-element')!=='base-large')throw new Error(`${name}: base element route failed`);
  await openEditorFromStage(page);
  if(await page.locator('#devNotesInput').inputValue()!==elementNote)throw new Error(`${name}: element note did not persist`);
  await page.getByRole('button',{name:'إغلاق المحرر'}).click();
  await closeGalleryEntity(page);

  if(store.size!==2)throw new Error(`${name}: expected two shared entities, got ${store.size}`);
  if(pageErrors.length)throw new Error(`${name}: page errors\n${pageErrors.join('\n')}`);
  await context.close();
  return{name,totalCards:15,scenes:6,elements:9,sharedEntities:2,renaming:true,notes:true};
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
    const projected=tableBox?[tableBox.min.clone().project(game.camera),tableBox.max.clone().project(game.camera)]:[];
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

async function checkElements(browser){
  const context=await browser.newContext({viewport:{width:1100,height:760},deviceScaleFactor:1});
  const page=await context.newPage();
  for(const id of elementIds){
    const pageErrors=[];
    page.removeAllListeners('pageerror');
    page.on('pageerror',error=>pageErrors.push(String(error?.stack||error)));
    await page.goto(`${BASE_URL}/developer-scene.html?element=${id}&d=D1`,{waitUntil:'domcontentloaded',timeout:60000});
    const state=await waitSceneReady(page);
    if(state.developerEntityKind!=='element'||state.developerElement!==id)throw new Error(`${id}: element identity missing`);
    if(id!=='loading-star-element'&&state.mode!=='element')throw new Error(`${id}: element mode missing`);
    if(!['loading-star-element','table'].includes(id)&&state.tableHidden!=='true')throw new Error(`${id}: table backdrop was not hidden`);
    if(pageErrors.length)throw new Error(`${id}: page errors\n${pageErrors.join('\n')}`);
    if(['base-large','stone-large','table','logo-yakolak'].includes(id))await page.screenshot({path:path.join(output,`element-${id}.png`)});
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
  try{await checkElements(browser)}
  catch(error){failures.push({scope:'element-catalog',error:String(error?.stack||error)})}
}finally{
  await browser.close();
}

fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({build:'D1',url:BASE_URL,results,failures},null,2));
if(failures.length)throw new Error(`Developer D1 visual failures: ${JSON.stringify(failures)}`);
console.log('Developer D1 shared notes, renaming, scenes, and isolated elements passed');
