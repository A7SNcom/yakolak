import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const baseUrl=process.env.BASE_URL||'http://127.0.0.1:4173';
const outDir=process.env.ARTIFACT_DIR||'artifacts/v093-speed';
await fs.mkdir(outDir,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const report={ok:false,results:[],diagnostics:[]};
const assert=(v,m)=>{if(!v)throw new Error(m)};
const tap=(page,p,mobile)=>mobile?page.touchscreen.tap(p.x,p.y):page.mouse.click(p.x,p.y);

async function snapshot(page,name,stage,point=null){
  const data=await page.evaluate(({stage,point})=>{
    const g=globalThis.__yakolakGame;
    const selected=g.pieces.find(p=>p.mesh?.userData?.traySelected)||null;
    return {stage,point,selectedPlayPiece:selected?{dir:selected.dir,type:selected.type,side:selected.side,placed:selected.placed}:null,inTray:g.pieces.filter(p=>p.mesh?.userData?.inTray).map(p=>({dir:p.dir,type:p.type,side:p.side})),state:{started:g.state.started,locked:g.state.locked,tutorial:g.state.tutorial,configured:g.state.configured,humanColor:g.state.humanColor,turnIndex:g.state.turnIndex,currentPlayer:g.state.players?.[g.state.turnIndex%Math.max(1,g.state.players?.length||1)]||null},board:JSON.parse(JSON.stringify(g.state.board||{}))};
  },{stage,point});
  report.diagnostics.push({scenario:name,...data});
  await fs.writeFile(`${outDir}/interaction-diagnostics.json`,JSON.stringify(report.diagnostics,null,2));
  console.log('[interaction]',JSON.stringify({scenario:name,...data}));
  return data;
}

async function setupChoice(page,type,value,mobile){
  const points=await page.evaluate(({type,value})=>{
    const g=globalThis.__yakolakGame,r=g.renderer.domElement.getBoundingClientRect(),out=[];
    g.setupGroup.traverse(o=>{const a=o?.userData?.setupAction;if(!a||a.type!==type||String(a.value)!==String(value))return;const p=new g.THREE.Vector3();o.getWorldPosition(p);p.project(g.camera);out.push({x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2})});return out;
  },{type,value});
  for(const p of points){await tap(page,p,mobile);try{await page.waitForFunction(k=>k==='color'?globalThis.__yakolakGame.state.setupStep==='bots':globalThis.__yakolakGame.state.configured,type,{timeout:2500,polling:100});return}catch{}}
  throw new Error(`setup failed ${type}:${value}`);
}

async function selectHumanPiece(page,name,mobile){
  const points=await page.evaluate(()=>{
    const g=globalThis.__yakolakGame,r=g.renderer.domElement.getBoundingClientRect(),out=[];
    g.pieces.filter(p=>p.dir===g.state.humanColor&&!p.placed&&p.mesh.visible).forEach(p=>{const v=new g.THREE.Vector3();p.mesh.getWorldPosition(v);v.project(g.camera);out.push({x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2,type:p.type,side:p.side})});
    return out;
  });
  assert(points.length,`${name}: no visible human pieces`);
  const start=Date.now();
  for(let i=0;i<points.length;i++){
    await tap(page,points[i],mobile);
    try{
      await page.waitForFunction(()=>globalThis.__yakolakGame.pieces.some(p=>p.mesh?.userData?.traySelected),null,{timeout:1500,polling:100});
      const selectionMs=Date.now()-start;
      const state=await snapshot(page,name,`piece-attempt-${i+1}-selected`,points[i]);
      return {selectionMs,point:points[i],state};
    }catch{await snapshot(page,name,`piece-attempt-${i+1}-failed`,points[i])}
  }
  throw new Error(`${name}: all visible piece points failed`);
}

async function placeSelectedPiece(page,name,mobile){
  const points=await page.evaluate(()=>{
    const g=globalThis.__yakolakGame,z=g.boardZones.find(z=>!Object.values(g.state.board?.[z.id]||{}).some(Boolean)),r=g.renderer.domElement.getBoundingClientRect();
    return [[0,0],[-18,-18],[18,-18],[-18,18],[18,18]].map(([dx,dz])=>{const v=new g.THREE.Vector3(z.px+dx,z.py+1,z.pz+dz);g.gameGroup.localToWorld(v);v.project(g.camera);return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2,zoneId:z.id,dx,dz}});
  });
  for(let i=0;i<points.length;i++){
    const start=Date.now();
    await tap(page,points[i],mobile);
    await page.waitForTimeout(120);
    const placed=await page.evaluate(id=>{const g=globalThis.__yakolakGame;return Object.values(g.state.board?.[id]||{}).includes(g.state.humanColor)},points[i].zoneId);
    if(placed){const humanMoveMs=Date.now()-start;await snapshot(page,name,`zone-attempt-${i+1}-placed`,points[i]);return{humanMoveMs,point:points[i]}}
    try{
      await page.waitForFunction(id=>{const g=globalThis.__yakolakGame;return Object.values(g.state.board?.[id]||{}).includes(g.state.humanColor)},points[i].zoneId,{timeout:1200,polling:100});
      const humanMoveMs=Date.now()-start;
      await snapshot(page,name,`zone-attempt-${i+1}-placed`,points[i]);
      return{humanMoveMs,point:points[i]};
    }catch{await snapshot(page,name,`zone-attempt-${i+1}-failed`,points[i])}
  }
  await page.screenshot({path:`${outDir}/${name}-move-failed.png`,timeout:30000});
  throw new Error(`${name}: all safe zone points failed`);
}

async function scenario(name,viewport,mobile){
  const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce',locale:'ar-SA'}),page=await context.newPage(),pageErrors=[],consoleErrors=[];
  page.on('pageerror',e=>pageErrors.push(String(e)));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
  const startedAt=Date.now();await page.goto(`${baseUrl}/?reducedMotion=1`,{waitUntil:'domcontentloaded',timeout:45000});await page.waitForFunction(()=>document.body.classList.contains('yakolak-ready')&&globalThis.__yakolakGame?.pieces?.length===36,null,{timeout:45000,polling:100});const readyMs=Date.now()-startedAt;assert(readyMs<15000,`${name}: load too slow ${readyMs}ms`);await page.screenshot({path:`${outDir}/${name}-loaded.png`,timeout:30000});
  await setupChoice(page,'color','right',mobile);await setupChoice(page,'bots',1,mobile);await page.waitForFunction(()=>globalThis.__yakolakGame.state.tutorial,null,{timeout:30000,polling:100});
  const tutorialStart=Date.now();let prompts=0;
  while(await page.evaluate(()=>globalThis.__yakolakGame.state.tutorial)){
    await page.waitForFunction(()=>!globalThis.__yakolakGame.state.tutorial||document.querySelector('#yakolakTutorialDialog.open .yt-ok'),null,{timeout:30000,polling:100});if(!await page.evaluate(()=>globalThis.__yakolakGame.state.tutorial))break;
    const before=await page.evaluate(()=>document.querySelector('#yakolakTutorialDialog.open .yt-text')?.textContent||'');await page.evaluate(()=>document.querySelector('#yakolakTutorialDialog.open .yt-ok')?.click());prompts++;assert(prompts<=3,`${name}: too many tutorial prompts`);await page.waitForFunction(b=>{const g=globalThis.__yakolakGame,t=document.querySelector('#yakolakTutorialDialog.open .yt-text')?.textContent||'';return!g.state.tutorial||(t&&t!==b)},before,{timeout:30000,polling:100});
  }
  const tutorialMs=Date.now()-tutorialStart;assert(prompts===3,`${name}: prompts ${prompts}`);assert(tutorialMs<30000,`${name}: tutorial too slow ${tutorialMs}ms`);await page.waitForFunction(()=>{const s=globalThis.__yakolakGame.state;return s.started&&!s.tutorial&&!s.locked},null,{timeout:15000,polling:100});
  const selected=await selectHumanPiece(page,name,mobile);assert(selected.selectionMs<5000,`${name}: piece selection too slow ${selected.selectionMs}ms`);
  const placed=await placeSelectedPiece(page,name,mobile);assert(placed.humanMoveMs<5000,`${name}: human move too slow ${placed.humanMoveMs}ms`);
  const botStart=Date.now();
  let botPresent=await page.evaluate(()=>{const g=globalThis.__yakolakGame;return Object.values(g.state.board||{}).some(c=>Object.values(c||{}).some(color=>color&&color!==g.state.humanColor))});
  if(!botPresent){await page.waitForFunction(()=>{const g=globalThis.__yakolakGame;return Object.values(g.state.board||{}).some(c=>Object.values(c||{}).some(color=>color&&color!==g.state.humanColor))},null,{timeout:5000,polling:100});botPresent=true}
  const botReplyMs=Date.now()-botStart;assert(botPresent,`${name}: bot did not reply`);assert(botReplyMs<5000,`${name}: bot reply too slow ${botReplyMs}ms`);
  const wins=await page.evaluate(()=>{const g=globalThis.__yakolakGame;return{same:g.debugWin('same-size',g.state.humanColor)?.type,graded:g.debugWin('graded',g.state.humanColor)?.type,cell:g.debugWin('cell',g.state.humanColor)?.type}});assert(wins.same==='same-size'&&wins.graded==='graded'&&wins.cell==='cell',`${name}: win rules changed`);await page.evaluate(()=>globalThis.__yakolakGame.debugTriggerWin('same-size',globalThis.__yakolakGame.state.humanColor));await page.waitForFunction(()=>Boolean(globalThis.__yakolakGame.state.winner),null,{timeout:5000,polling:100});await page.screenshot({path:`${outDir}/${name}-win.png`,timeout:30000});
  const fatal=consoleErrors.filter(t=>/uncaught|syntaxerror|referenceerror|typeerror|prod stage1 error/i.test(t));assert(!pageErrors.length,`${name}: page errors ${pageErrors.join(' | ')}`);assert(!fatal.length,`${name}: console errors ${fatal.join(' | ')}`);await context.close();return{name,readyMs,tutorialMs,selectionMs:selected.selectionMs,humanMoveMs:placed.humanMoveMs,botReplyMs,prompts,wins,passed:true};
}

try{report.results.push(await scenario('desktop-1440x900',{width:1440,height:900},false));report.results.push(await scenario('mobile-390x844',{width:390,height:844},true));report.ok=true;console.log(JSON.stringify(report,null,2))}catch(error){report.error=String(error?.stack||error);console.error(error);process.exitCode=1}finally{await fs.writeFile(`${outDir}/results.json`,JSON.stringify(report,null,2));await browser.close()}
