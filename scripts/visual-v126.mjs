import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const BASE_URL=process.env.V126_URL||'https://yakolak-git-agent-v126-clean-entry-journey-ahmdkcoms-projects.vercel.app';
const output=path.resolve('artifacts/v126-visual');
fs.mkdirSync(output,{recursive:true});

async function waitForPreview(){
  const deadline=Date.now()+180000;
  while(Date.now()<deadline){
    try{
      const response=await fetch(`${BASE_URL}/version.json?check=${Date.now()}`,{cache:'no-store'});
      if(response.ok){
        const version=await response.json();
        if(Number(version.build)===126)return;
      }
    }catch(error){}
    await new Promise(resolve=>setTimeout(resolve,3000));
  }
  throw new Error('Build 126 preview did not become ready');
}

async function inspect(page){
  return page.evaluate(()=>{
    const visible=id=>{
      const element=document.getElementById(id);
      if(!element)return false;
      const style=getComputedStyle(element);
      const rect=element.getBoundingClientRect();
      return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity||1)>.01&&rect.width>0&&rect.height>0;
    };
    const game=globalThis.__yakolakGame;
    const scene=game?.gameGroup?.parent;
    const logoGroup=scene?.getObjectByName?.('yakolak-v126-official-logo-wall');
    return{
      build:globalThis.__yakolakV126Entry?.build||null,
      phase:globalThis.__yakolakV126Entry?.phase||null,
      source:globalThis.__yakolakV126Entry?.source||null,
      loaderPresent:Boolean(document.getElementById('yakolakLoader')),
      gameGroupVisible:game?.gameGroup?.visible??null,
      logoChildren:logoGroup?.children?.length||0,
      logoVisible:logoGroup?.visible??false,
      legacyVisible:['yakolakGameHud','yakolakGameScore','yakolakGameSetup','yakolakTools','yakolakEntry','yakolakHowTo'].filter(visible),
      camera:game?.camera?{x:game.camera.position.x,y:game.camera.position.y,z:game.camera.position.z,fov:game.camera.fov}:null,
      bodyEntry:document.body.dataset.yakolakEntry||''
    };
  });
}

async function testViewport(browser,name,options){
  const context=await browser.newContext(options);
  const page=await context.newPage();
  const consoleErrors=[];
  const pageErrors=[];
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())});
  page.on('pageerror',error=>pageErrors.push(String(error?.stack||error)));

  await page.goto(`${BASE_URL}/?clear=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('#yakolakLoaderStar',{state:'visible',timeout:15000});
  await page.screenshot({path:path.join(output,`${name}-01-loading.png`)});

  await page.waitForFunction(()=>document.getElementById('yakolakLoader')?.classList.contains('handoff'),null,{timeout:45000});
  await page.screenshot({path:path.join(output,`${name}-02-transition-start.png`)});
  await page.waitForTimeout(1350);
  await page.screenshot({path:path.join(output,`${name}-03-transition-mid.png`)});

  await page.waitForFunction(()=>document.body.dataset.yakolakEntry==='complete',null,{timeout:45000});
  await page.waitForTimeout(150);
  await page.screenshot({path:path.join(output,`${name}-04-logo-wall.png`)});
  const state=await inspect(page);

  if(consoleErrors.length)throw new Error(`${name} console errors:\n${consoleErrors.join('\n')}`);
  if(pageErrors.length)throw new Error(`${name} page errors:\n${pageErrors.join('\n')}`);
  if(state.build!==126||state.phase!=='complete')throw new Error(`${name} did not complete v126: ${JSON.stringify(state)}`);
  if(state.source!=='v120-stable-room-table')throw new Error(`${name} used the wrong room source`);
  if(state.loaderPresent)throw new Error(`${name} loader remained after leaving the first wall`);
  if(state.gameGroupVisible!==false)throw new Error(`${name} table still contains the game group`);
  if(state.logoChildren!==2||!state.logoVisible)throw new Error(`${name} official logo wall is incomplete`);
  if(state.legacyVisible.length)throw new Error(`${name} legacy UI is visible: ${state.legacyVisible.join(', ')}`);

  await context.close();
  return{name,state,consoleErrors,pageErrors};
}

await waitForPreview();
const browser=await chromium.launch({headless:true});
try{
  const results=[];
  results.push(await testViewport(browser,'desktop',{
    viewport:{width:1440,height:900},
    deviceScaleFactor:1
  }));
  results.push(await testViewport(browser,'mobile',{
    viewport:{width:390,height:844},
    deviceScaleFactor:2,
    isMobile:true,
    hasTouch:true
  }));
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({url:BASE_URL,results},null,2));
  console.log('v126 desktop and mobile visual verification passed');
}finally{
  await browser.close();
}
