// Verify gameplay state first, then accept fast onboarding transitions.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const baseUrl=process.env.BASE_URL||'http://127.0.0.1:4173';
const outDir=process.env.ARTIFACT_DIR||'artifacts/v094-onboarding';
await fs.mkdir(outDir,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const report={ok:false,results:[],errors:[]};
const assert=(value,message)=>{if(!value)throw new Error(message)};
const tap=(page,p,mobile)=>mobile?page.touchscreen.tap(p.x,p.y):page.mouse.click(p.x,p.y);

async function waitReady(page){
  await page.waitForFunction(()=>document.body.classList.contains('yakolak-ready')&&globalThis.__yakolakGame?.pieces?.length===36&&globalThis.__yakolakOnboarding,null,{timeout:90000,polling:100});
}
async function setupPoints(page,type,value){return page.evaluate(({type,value})=>{const g=globalThis.__yakolakGame,r=g.renderer.domElement.getBoundingClientRect(),out=[];g.setupGroup.traverse(o=>{const a=o?.userData?.setupAction;if(!a||a.type!==type||String(a.value)!==String(value))return;const p=new g.THREE.Vector3();o.getWorldPosition(p);p.project(g.camera);out.push({x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2})});return out},{type,value})}
async function choose(page,type,value,mobile){for(const point of await setupPoints(page,type,value)){await tap(page,point,mobile);await page.waitForTimeout(250);const ok=await page.evaluate(kind=>kind==='color'?globalThis.__yakolakGame.state.setupStep==='bots':globalThis.__yakolakGame.state.configured,type);if(ok)return}throw new Error(`setup failed ${type}:${value}`)}
async function visibleHumanPoints(page){return page.evaluate(()=>{const g=globalThis.__yakolakGame,r=g.renderer.domElement.getBoundingClientRect();return g.pieces.filter(p=>p.dir===g.state.humanColor&&!p.placed&&p.mesh.visible).map(p=>{const v=new g.THREE.Vector3();p.mesh.getWorldPosition(v);v.project(g.camera);return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2}})})}
async function openTray(page,mobile){for(const p of await visibleHumanPoints(page)){await tap(page,p,mobile);await page.waitForTimeout(250);if(await page.evaluate(()=>globalThis.__yakolakGame.pieces.some(x=>x.mesh?.userData?.inTray)))return}throw new Error('tray did not open')}
async function placePiece(page,mobile){const points=await page.evaluate(()=>{const g=globalThis.__yakolakGame,z=g.boardZones.find(z=>!Object.values(g.state.board?.[z.id]||{}).some(Boolean)),r=g.renderer.domElement.getBoundingClientRect();return [[0,0],[-16,-16],[16,-16],[-16,16],[16,16]].map(([dx,dz])=>{const v=new g.THREE.Vector3(z.px+dx,z.py+1,z.pz+dz);g.gameGroup.localToWorld(v);v.project(g.camera);return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2,zoneId:z.id}})});for(const p of points){await tap(page,p,mobile);await page.waitForTimeout(300);if(await page.evaluate(id=>{const g=globalThis.__yakolakGame;return Object.values(g.state.board?.[id]||{}).includes(g.state.humanColor)},p.zoneId))return}throw new Error('piece placement failed')}
async function lessonId(page){return page.evaluate(()=>globalThis.__yakolakOnboarding?.current?.id||null)}
async function waitLesson(page,id,timeout=15000){await page.waitForFunction(expected=>globalThis.__yakolakOnboarding?.current?.id===expected,id,{timeout,polling:100})}
async function clickNext(page){await page.locator('#yo-next').click();await page.waitForTimeout(120)}

async function scenario(name,viewport,mobile){
  const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce',locale:'ar-SA'});
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(`${name}: ${e}`));
  await page.goto(`${baseUrl}/?clear=${Date.now()}&reducedMotion=1`,{waitUntil:'domcontentloaded',timeout:90000});
  await page.evaluate(()=>localStorage.removeItem('yakolak:v094:onboarding'));
  await page.reload({waitUntil:'domcontentloaded'});await waitReady(page);
  assert(await lessonId(page)==='welcome',`${name}: welcome missing`);
  assert(await page.locator('#yo-skip-step').isVisible(),`${name}: skip step missing`);
  assert(await page.locator('#yo-skip').isVisible(),`${name}: skip all missing`);
  await page.screenshot({path:`${outDir}/${name}-welcome.png`,timeout:30000});
  await clickNext(page);await waitLesson(page,'goal');await clickNext(page);await waitLesson(page,'choose-color');
  await choose(page,'color','right',mobile);await waitLesson(page,'choose-rivals');
  await choose(page,'bots',1,mobile);await waitLesson(page,'open-stack',30000);
  await openTray(page,mobile);
  await page.waitForFunction(()=>['choose-size','place-piece'].includes(globalThis.__yakolakOnboarding?.current?.id),null,{timeout:15000,polling:100});
  const selected=await page.evaluate(()=>globalThis.__yakolakGame.pieces.some(p=>p.mesh?.userData?.traySelected));assert(selected,`${name}: no selected piece`);
  if(await lessonId(page)==='choose-size')await waitLesson(page,'place-piece');
  await placePiece(page,mobile);
  await page.waitForFunction(()=>Object.values(globalThis.__yakolakGame.state.board||{}).some(c=>Object.values(c||{}).some(v=>v&&v!==globalThis.__yakolakGame.state.humanColor)),null,{timeout:20000,polling:100});
  await page.waitForFunction(()=>['bot-reply','sizes'].includes(globalThis.__yakolakOnboarding?.current?.id),null,{timeout:15000,polling:100});
  if(await lessonId(page)==='bot-reply')await waitLesson(page,'sizes',15000);
  await page.locator('#yo-help').click();const feedback=await page.locator('#yo-feedback').textContent();assert(feedback?.trim(),`${name}: smart hint empty`);
  await page.screenshot({path:`${outDir}/${name}-exercise.png`,timeout:30000});
  await page.locator('#yo-skip').click();assert(!await page.locator('#yo-card').evaluate(el=>el.classList.contains('open')),`${name}: skip did not close`);
  await page.locator('#yo-replay').click();await waitLesson(page,'welcome');
  await page.screenshot({path:`${outDir}/${name}-replay.png`,timeout:30000});
  const result={name,passed:true,lessonCount:await page.evaluate(()=>globalThis.__yakolakOnboarding.lessons.length),mobile};
  await context.close();return result;
}

try{report.results.push(await scenario('desktop-1440x900',{width:1440,height:900},false));report.results.push(await scenario('mobile-390x844',{width:390,height:844},true));report.ok=true}catch(error){report.error=String(error?.stack||error);process.exitCode=1}finally{await fs.writeFile(`${outDir}/results.json`,JSON.stringify(report,null,2));await browser.close()}
