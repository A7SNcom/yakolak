// Actual shipping runtime + offline PWA shell. Optional Playwright dependency.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const base=process.env.YAKOLAK_PWA_BASE||'http://127.0.0.1:8000/';
 let server;
 if(!process.env.YAKOLAK_PWA_BASE){server=require('node:child_process').spawn(process.execPath,[require('node:path').join(__dirname,'web_test_server.mjs')]);await new Promise((resolve,reject)=>{server.stdout.on('data',s=>{if(String(s).includes('READY'))resolve()});server.once('exit',code=>reject(Error('Test server exit '+code)))});}
 const browser=await chromium.launch({executablePath:process.env.YAKOLAK_CHROMIUM||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 try{
  const c=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'reduce'}),p=await c.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'?yakolakTestFast=1');
  await p.waitForFunction(()=>document.body.dataset.yakolakSetup==='visible',null,{timeout:90000});
  const manifest=await p.evaluate(async()=>await(await fetch(document.querySelector('link[rel=manifest]').href)).json());
  assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'./');assert.deepEqual(manifest.icons.map(i=>i.sizes),['192x192','512x512']);assert.ok(await p.locator('link[rel=apple-touch-icon]').getAttribute('href'));
  const session=await c.newCDPSession(p);await session.send('Page.enable');const install=await session.send('Page.getInstallabilityErrors');assert.deepEqual(install.installabilityErrors,[]);
  await p.evaluate(async()=>{const r=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('App worker activation timed out')),60000))]);if(!r.active)throw Error('No active app worker')});
  await p.reload();await p.waitForFunction(()=>!!navigator.serviceWorker.controller&&document.body.dataset.yakolakSetup==='visible',null,{timeout:90000});
  await c.setOffline(true);await p.reload();await p.waitForFunction(()=>document.body.dataset.yakolakSetup==='visible',null,{timeout:90000});
  await p.evaluate(()=>window.yakolakTestStartPassPlay());await p.waitForFunction(()=>document.body.dataset.yakolakGameplay==='ready'&&document.body.dataset.yakolakPlayers==='2',null,{timeout:30000});
  await p.evaluate(()=>window.yakolakTestPlayOneMove());await p.waitForFunction(()=>Number(document.body.dataset.yakolakMoves)>=1,null,{timeout:20000});
  await p.evaluate(()=>window.yakolakTestForceRoundComplete());await p.waitForFunction(()=>document.body.dataset.yakolakWinPhrase, null,{timeout:15000});
  fs.mkdirSync('test-results/pwa',{recursive:true});await p.screenshot({path:'test-results/pwa/offline-win-mobile.png'});
  assert.deepEqual(errors,[]);console.log('YAKOLAK_PWA_OK installable=true offlineRuntime=true realMove=true namedResult=true errors=0');await c.close();
 }finally{await browser.close();server?.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
