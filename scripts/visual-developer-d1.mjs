import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const BASE_URL=process.env.D1_URL||'http://127.0.0.1:4173';
const output=path.resolve('artifacts/developer-d1');
fs.mkdirSync(output,{recursive:true});
const scenes=['loading-star','empty-table','logo-wall','board-bases','clean-entry','unboxing-intro'];
const elements=['base-large','base-small','stone-large','stone-medium','stone-small','loading-star-element','table','logo-yakolak','logo-mtkyf'];
const results=[],failures=[];

async function mockStore(context){
  const store=new Map();
  await context.route('**/api/developer-d1',async route=>{
    const request=route.request();
    if(request.method()==='GET')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,entities:[...store.values()]})});
    if(request.method()==='POST'){
      const body=request.postDataJSON(),key=`${body.entityType}:${body.entityId}`,old=store.get(key),now=new Date().toISOString();
      const entity={...body,version:(old?.version||0)+1,createdAt:old?.createdAt||now,updatedAt:now};
      store.set(key,entity);
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,entity})});
    }
    return route.fulfill({status:405,contentType:'application/json',body:'{"ok":false}'});
  });
  return store;
}

async function waitReady(page,timeout=120000){
  await page.waitForFunction(()=>document.body.dataset.sceneReady==='true'||Boolean(document.body.dataset.sceneError),null,{timeout});
  const state=await page.evaluate(()=>({...document.body.dataset}));
  if(state.sceneError||state.sceneReady!=='true')throw new Error(`${state.developerEntity||'entity'} failed: ${state.sceneError||'not ready'}`);
  return state;
}

async function waitPreview(card){
  await card.scrollIntoViewIfNeeded();
  const handle=await card.elementHandle();
  await card.page().waitForFunction(el=>el.classList.contains('preview-ready')||el.classList.contains('preview-error'),handle,{timeout:120000});
  if(await card.getAttribute('data-preview-state')!=='ready')throw new Error(`preview ${await card.getAttribute('data-entity-id')} failed`);
}

async function openEntity(page,selector){
  await page.locator(`${selector} .scene-open`).click();
  await page.locator('#devStage.open').waitFor();
  const frame=page.frameLocator('#devStageFrame');
  await frame.locator('body[data-scene-ready="true"]').waitFor({timeout:120000});
  return frame;
}

async function closeEntity(page){
  await page.getByRole('button',{name:/العودة للمعرض/}).click();
  await page.locator('#devStage').waitFor({state:'hidden'});
}

async function openEditor(page,fromStage=true){
  if(fromStage)await page.getByRole('button',{name:'فتح الملاحظات والتسمية'}).click();
  await page.locator('#devEditor.open').waitFor();
  await page.waitForTimeout(140);
}

async function saveEditor(page,name,note){
  await page.locator('#devNameInput').fill(name);
  await page.locator('#devNotesInput').fill(note);
  await page.locator('#devSave').click();
  await page.waitForFunction(()=>document.getElementById('devEditorStatus')?.textContent==='تم الحفظ في المخزن المشترك');
}

async function galleryCheck(browser,label,options){
  const context=await browser.newContext(options),store=await mockStore(context),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(String(error?.stack||error)));
  await page.goto(`${BASE_URL}/developer.html`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.evaluate(()=>localStorage.removeItem('yakolak:developer-d1:shared-review:v1'));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.dataset.developerBuild==='D1'&&document.body.dataset.developerSharedReady==='true');
  if(await page.locator('.scene-card').count()!==15)throw new Error(`${label}: expected 15 cards`);
  if(await page.locator('.scene-card:visible').count()!==6)throw new Error(`${label}: expected 6 scenes`);
  await waitPreview(page.locator('[data-scene="loading-star"]'));
  await waitPreview(page.locator('[data-scene="unboxing-intro"]'));
  await page.screenshot({path:path.join(output,`${label}-01-scenes.png`),fullPage:true});
  await page.getByRole('button',{name:'مشهد واحد'}).click();
  if(await page.locator('.scene-card:visible').count()!==4)throw new Error(`${label}: single filter`);
  await page.getByRole('button',{name:'مجموعة مشاهد'}).click();
  if(await page.locator('.scene-card:visible').count()!==2)throw new Error(`${label}: sequence filter`);
  await page.getByRole('button',{name:'العناصر'}).click();
  if(await page.locator('.scene-card:visible').count()!==9)throw new Error(`${label}: elements filter`);
  await waitPreview(page.locator('[data-element="base-large"]'));
  await waitPreview(page.locator('[data-element="loading-star-element"]'));
  await page.screenshot({path:path.join(output,`${label}-02-elements.png`),fullPage:true});
  await page.getByRole('button',{name:'كل المشاهد'}).click();

  const sceneName=`إنترو العلبة ${label}`,sceneNote=`${label} · افصل الإنترو عن إعداد اللاعبين`;
  const frame=await openEntity(page,'[data-scene="unboxing-intro"]');
  if(await frame.locator('body').getAttribute('data-setup-hidden')!=='true')throw new Error(`${label}: intro setup leaked`);
  await openEditor(page);
  if(await page.locator('#devCodeKey').textContent()!=='scene.unboxing-intro')throw new Error(`${label}: scene code key`);
  await saveEditor(page,sceneName,sceneNote);
  await page.screenshot({path:path.join(output,`${label}-03-shared-editor.png`)});
  await page.getByRole('button',{name:'إغلاق المحرر'}).click();
  await closeEntity(page);
  if(await page.locator('[data-scene="unboxing-intro"] .scene-title').textContent()!==sceneName)throw new Error(`${label}: renamed scene did not update`);

  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.dataset.developerSharedReady==='true');
  const restored=page.locator('[data-scene="unboxing-intro"]');
  if(await restored.locator('.scene-title').textContent()!==sceneName)throw new Error(`${label}: scene name not restored`);
  await restored.locator('.scene-edit').click();
  await openEditor(page,false);
  if(await page.locator('#devNotesInput').inputValue()!==sceneNote)throw new Error(`${label}: scene note not restored`);
  await page.getByRole('button',{name:'إغلاق المحرر'}).click();

  await page.getByRole('button',{name:'العناصر'}).click();
  const elementName=`القاعدة الأم ${label}`,elementNote=`${label} · الاسم الجديد للقاعدة الكبيرة`,base=page.locator('[data-element="base-large"]');
  await base.locator('.scene-edit').click();
  await openEditor(page,false);
  if(await page.locator('#devCodeKey').textContent()!=='meshes["9"]')throw new Error(`${label}: element code key`);
  await saveEditor(page,elementName,elementNote);
  await page.getByRole('button',{name:'إغلاق المحرر'}).click();
  if(await base.locator('.scene-title').textContent()!==elementName)throw new Error(`${label}: renamed element did not update`);
  const elementFrame=await openEntity(page,'[data-element="base-large"]');
  if(await elementFrame.locator('body').getAttribute('data-table-hidden')!=='true')throw new Error(`${label}: element table backdrop visible`);
  await openEditor(page);
  if(await page.locator('#devNotesInput').inputValue()!==elementNote)throw new Error(`${label}: element note not restored`);
  await page.getByRole('button',{name:'إغلاق المحرر'}).click();
  await closeEntity(page);
  if(store.size!==2)throw new Error(`${label}: shared store expected 2, got ${store.size}`);
  if(errors.length)throw new Error(`${label}: page errors\n${errors.join('\n')}`);
  await context.close();
  return{label,totalCards:15,scenes:6,elements:9,sharedEntities:2,renaming:true,notes:true};
}

async function sceneRuntime(page,id,state){
  const runtime=await page.evaluate(()=>{
    const game=globalThis.__yakolakGame,scene=game?.gameGroup?.parent,wall=scene?.getObjectByName?.('yakolak-developer-d1-logo-wall');
    const colors=[];let logoMeshes=0;
    wall?.traverse?.(o=>{if(o.isMesh&&o.material){logoMeshes++;(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.color&&colors.push(m.color.getHexString()))}});
    return{gameVisible:game?.gameGroup?.visible,setupVisible:game?.setupGroup?.visible,visibleBases:['9','3-right','3-left','3-front','3-back'].filter(k=>game?.meshes?.[k]?.visible).length,logoChildren:wall?.children?.length||0,logoMeshes,logoColors:new Set(colors).size,setupDom:[...document.querySelectorAll('#yakolakGameSetup,#yakolakGameHud,#yakolakGameScore')].some(e=>getComputedStyle(e).display!=='none')};
  });
  if(id==='empty-table'&&runtime.gameVisible!==false)throw new Error('empty table leaked game');
  if(id==='board-bases'&&(state.visibleObjects!=='5'||runtime.visibleBases!==5))throw new Error('board bases not five');
  if(id==='logo-wall'&&(state.logoRendering!=='svg-geometry-two-tone'||runtime.logoChildren!==2||runtime.logoMeshes<2||runtime.logoColors<2))throw new Error('logo wall not two-tone');
  if(id==='unboxing-intro'&&(state.setupHidden!=='true'||runtime.setupVisible!==false||runtime.setupDom))throw new Error('intro setup leaked');
  if(id==='clean-entry'&&!await page.evaluate(()=>globalThis.__yakolakV126Entry?.phase==='complete'))throw new Error('clean entry incomplete');
}

async function catalogCheck(browser){
  const context=await browser.newContext({viewport:{width:1100,height:760},deviceScaleFactor:1}),page=await context.newPage();
  for(const id of scenes){
    const errors=[];page.removeAllListeners('pageerror');page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(`${BASE_URL}/developer-scene.html?scene=${id}&d=D1`,{waitUntil:'domcontentloaded',timeout:60000});
    const state=await waitReady(page);if(id==='unboxing-intro')await page.waitForTimeout(1600);if(errors.length)throw new Error(`${id}: ${errors.join('\n')}`);
    await sceneRuntime(page,id,state);await page.screenshot({path:path.join(output,`scene-${id}.png`)});results.push(state);
  }
  for(const id of elements){
    const errors=[];page.removeAllListeners('pageerror');page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(`${BASE_URL}/developer-scene.html?element=${id}&d=D1`,{waitUntil:'domcontentloaded',timeout:60000});
    const state=await waitReady(page);
    if(state.developerEntityKind!=='element'||state.developerElement!==id)throw new Error(`${id}: identity`);
    if(id!=='loading-star-element'&&state.mode!=='element')throw new Error(`${id}: mode`);
    if(!['loading-star-element','table'].includes(id)&&state.tableHidden!=='true')throw new Error(`${id}: table backdrop visible`);
    if(errors.length)throw new Error(`${id}: ${errors.join('\n')}`);
    if(['base-large','stone-large','table','logo-yakolak'].includes(id))await page.screenshot({path:path.join(output,`element-${id}.png`)});
    results.push(state);
  }
  await context.close();
}

const browser=await chromium.launch({headless:true});
try{
  try{results.push(await galleryCheck(browser,'desktop',{viewport:{width:1440,height:900},deviceScaleFactor:1}))}catch(error){failures.push({scope:'desktop-gallery',error:String(error?.stack||error)})}
  try{results.push(await galleryCheck(browser,'mobile',{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}))}catch(error){failures.push({scope:'mobile-gallery',error:String(error?.stack||error)})}
  try{await catalogCheck(browser)}catch(error){failures.push({scope:'catalog',error:String(error?.stack||error)})}
}finally{await browser.close()}
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({build:'D1',url:BASE_URL,results,failures},null,2));
if(failures.length)throw new Error(`Developer D1 visual failures: ${JSON.stringify(failures)}`);
console.log('Developer D1 shared notes, renaming, scenes, and isolated elements passed');
