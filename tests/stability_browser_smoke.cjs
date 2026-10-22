// Opt-in actual web-runtime test; needs Playwright and a running web_test_server.
// Exercises normal DOM onboarding, 3/4-player local bot turns and clean exit.
// Reduced motion is intentional. This does not measure device GPU performance.
const {chromium}=require('playwright');const assert=require('node:assert/strict');
const {mkdirSync}=require('node:fs');const {resolve}=require('node:path');
const artifacts=resolve(__dirname,'../test-results/stability');mkdirSync(artifacts,{recursive:true});
const base=process.env.YAKOLAK_STABILITY_BASE||'http://127.0.0.1:8000/';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.YAKOLAK_CHROMIUM||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const results=[];
 try{
  for(const [count,width,height]of [[3,390,844],[4,1280,720]]){
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:width<500,isMobile:width<500,reducedMotion:'reduce'});
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
   try{
    await page.goto(new URL('?yakolakTestFast=1',base).href);await page.waitForFunction(()=>document.body.dataset.yakolakSetup==='visible',{},{timeout:90000});
    await page.getByRole('button',{name:'غرفة جديدة',exact:true}).click();
    await page.getByRole('textbox',{name:'رقم الجوال',exact:true}).fill('0550000000');await page.getByRole('button',{name:'متابعة',exact:true}).click();
    await page.getByRole('textbox',{name:'الاسم الكريم',exact:true}).fill('اختبار');await page.getByRole('button',{name:'متابعة',exact:true}).click();
    await page.getByRole('button',{name:'اختر أبيض',exact:true}).click();await page.getByRole('button',{name:'تأكيد',exact:true}).click();
    await page.getByRole('button',{name:count+' لاعبين',exact:true}).click();
    await page.screenshot({path:artifacts+'/setup-'+count+'.png'});
    await page.getByRole('button',{name:'ابدأ اللعب',exact:true}).click();await page.getByRole('button',{name:'الفوز بـ 3 أشواط',exact:true}).click();
    await page.waitForFunction(n=>document.body.dataset.yakolakGameplay==='ready'&&Number(document.body.dataset.yakolakPlayers)===n,count,{timeout:30000});
    await page.evaluate(()=>window.yakolakTestPlayOneMove());
    await page.waitForFunction(n=>Number(document.body.dataset.yakolakMoves)>=n&&document.body.dataset.yakolakGameplay==='ready',count,{timeout:30000});
    await page.screenshot({path:artifacts+'/played-'+count+'.png'});
    const played=await page.evaluate(()=>({moves:Number(document.body.dataset.yakolakMoves),player:document.body.dataset.yakolakCurrentPlayer,mode:document.body.dataset.yakolakMatchState}));
    assert.equal(played.player,'right');assert.equal(played.moves,count);
    await page.evaluate(()=>window.yakolakTestReturnToSetup());await page.waitForFunction(()=>document.body.dataset.yakolakSetup==='visible'&&document.body.dataset.yakolakResiduePlayed==='0'&&document.body.dataset.yakolakResidueOccupied==='0',null,{timeout:20000});
    assert.deepEqual(errors,[]);results.push({count,viewport:[width,height],normalDOMSetup:true,realMoves:played.moves,bots:count-1,cleanReturn:true,passed:true});console.log('CURRENT_UI_OK',JSON.stringify(results.at(-1)));
   }catch(error){await page.screenshot({path:artifacts+'/failed-'+count+'.png'}).catch(()=>{});throw error}finally{await context.close()}
  }
 }finally{await browser.close();console.log(JSON.stringify(results,null,2))}
})().catch(e=>{console.error(e);process.exitCode=1});
