import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const ACCESS_URL=process.env.V126_URL||'https://yakolak-git-agent-v126-clean-entry-journey-ahmdkcoms-projects.vercel.app';
const output=path.resolve('artifacts/v126-visual');
fs.mkdirSync(output,{recursive:true});
const diagnosticPath=path.join(output,'diagnostic.log');
fs.writeFileSync(diagnosticPath,`start ${new Date().toISOString()}\naccess ${new URL(ACCESS_URL).origin}\n`);
const note=text=>{fs.appendFileSync(diagnosticPath,`${new Date().toISOString()} ${text}\n`);console.log(text)};

function previewUrl(){
  const url=new URL(ACCESS_URL);
  url.pathname='/';
  url.searchParams.set('clear',Date.now().toString());
  return url.toString();
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
      loaderClass:document.getElementById('yakolakLoader')?.className||'',
      gameGroupVisible:game?.gameGroup?.visible??null,
      logoChildren:logoGroup?.children?.length||0,
      logoVisible:logoGroup?.visible??false,
      legacyVisible:['yakolakGameHud','yakolakGameScore','yakolakGameSetup','yakolakTools','yakolakEntry','yakolakHowTo'].filter(visible),
      camera:game?.camera?{x:game.camera.position.x,y:game.camera.position.y,z:game.camera.position.z,fov:game.camera.fov}:null,
      bodyEntry:document.body.dataset.yakolakEntry||'',
      ready:document.body.classList.contains('yakolak-ready'),
      htmlVersion:document.querySelector('meta[name="yakolak-version"]')?.content||''
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
  try{
    const url=previewUrl();
    note(`${name} goto ${url.replace(/_vercel_share=[^&]+/,'_vercel_share=REDACTED')}`);
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
    note(`${name} domcontentloaded ${await page.title()}`);
    await page.waitForSelector('#yakolakLoaderStar',{state:'visible',timeout:15000});
    note(`${name} loading star visible`);
    await page.screenshot({path:path.join(output,`${name}-01-loading.png`)});

    await page.waitForFunction(()=>document.getElementById('yakolakLoader')?.classList.contains('handoff'),null,{timeout:45000});
    note(`${name} transition started`);
    await page.screenshot({path:path.join(output,`${name}-02-transition-start.png`)});
    await page.waitForTimeout(1350);
    await page.screenshot({path:path.join(output,`${name}-03-transition-mid.png`)});

    await page.waitForFunction(()=>document.body.dataset.yakolakEntry==='complete',null,{timeout:45000});
    await page.waitForTimeout(150);
    await page.screenshot({path:path.join(output,`${name}-04-logo-wall.png`)});
    const state=await inspect(page);
    note(`${name} state ${JSON.stringify(state)}`);
    note(`${name} consoleErrors ${JSON.stringify(consoleErrors)}`);
    note(`${name} pageErrors ${JSON.stringify(pageErrors)}`);

    if(consoleErrors.length)throw new Error(`${name} console errors:\n${consoleErrors.join('\n')}`);
    if(pageErrors.length)throw new Error(`${name} page errors:\n${pageErrors.join('\n')}`);
    if(state.build!==126||state.phase!=='complete')throw new Error(`${name} did not complete v126: ${JSON.stringify(state)}`);
    if(state.source!=='v120-stable-room-table')throw new Error(`${name} used the wrong room source`);
    if(state.loaderPresent)throw new Error(`${name} loader remained after leaving the first wall`);
    if(state.gameGroupVisible!==false)throw new Error(`${name} table still contains the game group`);
    if(state.logoChildren!==2||!state.logoVisible)throw new Error(`${name} official logo wall is incomplete`);
    if(state.legacyVisible.length)throw new Error(`${name} legacy UI is visible: ${state.legacyVisible.join(', ')}`);
    return{name,state,consoleErrors,pageErrors};
  }catch(error){
    let state=null;
    try{state=await inspect(page)}catch{}
    note(`${name} FAILURE ${String(error?.stack||error)}`);
    note(`${name} failureState ${JSON.stringify(state)}`);
    note(`${name} failureConsole ${JSON.stringify(consoleErrors)}`);
    note(`${name} failurePageErrors ${JSON.stringify(pageErrors)}`);
    try{await page.screenshot({path:path.join(output,`${name}-error.png`)})}catch{}
    throw error;
  }finally{
    await context.close();
  }
}

const browser=await chromium.launch({headless:true});
const results=[];
const failures=[];
try{
  for(const [name,options] of [
    ['desktop',{viewport:{width:1440,height:900},deviceScaleFactor:1}],
    ['mobile',{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}]
  ]){
    try{results.push(await testViewport(browser,name,options))}
    catch(error){failures.push({name,error:String(error?.stack||error)})}
  }
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({url:new URL(ACCESS_URL).origin,results,failures},null,2));
  if(failures.length)throw new Error(`v126 visual failures: ${JSON.stringify(failures)}`);
  console.log('v126 desktop and mobile visual verification passed');
}finally{
  await browser.close();
}
