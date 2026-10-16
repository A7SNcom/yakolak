// Opt-in real public signaling/WebRTC smoke test. No network stubs or fake rooms.
// Needs Playwright + Chromium. Run after building web/; this is NOT a two-device test.
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {readFileSync,readdirSync}=require('node:fs');
const {resolve}=require('node:path');
const {chromium}=require('playwright');
const root=resolve(__dirname,'../web');
const bundle=readdirSync(root).find(f=>/^online-trystero-[a-f0-9]{12}\.mjs$/.test(f));
const config={rounds:3,players:[{mode:'local',color:'marble',label:'أحمد'},{mode:'online',color:'blue'},{mode:'bot',color:'gold'}]};
const server=createServer((req,res)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(`<script type="module" src="/${bundle}"></script>`);return}
 if(req.url!==`/${bundle}`){res.writeHead(404).end();return}
 res.setHeader('Content-Type','text/javascript');res.end(readFileSync(resolve(root,bundle)));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.YAKOLAK_CHROMIUM||undefined,args:['--no-sandbox']});
 const result={kind:'two-browser-contexts',physicalDevices:false,networkErrors:[],passed:false};
 try{
  const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
  const pages=await Promise.all(contexts.map(c=>c.newPage()));
  for(const p of pages){p.on('console',m=>{if(m.type()==='error')result.networkErrors.push(m.text())});p.on('pageerror',e=>result.networkErrors.push(e.message));await p.goto(`http://127.0.0.1:${server.address().port}/`);await p.waitForFunction(()=>!!window.YakolakP2P)}
  const room=await pages[0].evaluate(c=>YakolakP2P.prepareHost(c),config);result.code=room.code;assert.match(room.code,/^\d{3}$/);
  await pages[1].evaluate(code=>YakolakP2P.inspectRoom(code).then(()=>true),room.code);
  assert.equal(await pages[1].evaluate(()=>!!YakolakP2P.session.identity),false);
  await pages[1].evaluate(()=>YakolakP2P.chooseColor('green').then(()=>true));
  await pages[0].evaluate(()=>YakolakP2P.dispatch('create',{players:YakolakP2P.session.snapshot.slots.map(s=>({...s,label:s.name})),targetRounds:3}));
  await pages[1].waitForFunction(()=>YakolakP2P.session.snapshot.status==='playing');
  const move={cell:0,size:'small',mutationId:'m'.repeat(48)};
  const first=await pages[0].evaluate(m=>YakolakP2P.dispatch('move',{...m,version:YakolakP2P.session.snapshot.version}),move);assert.equal(first.ok,true);
  await pages[1].waitForFunction(()=>YakolakP2P.session.snapshot.board[0].small==='marble');
  const denied=await pages[0].evaluate(()=>YakolakP2P.dispatch('move',{cell:1,size:'small',version:YakolakP2P.session.snapshot.version}));assert.equal(denied.error,'not_your_turn');
  const second=await pages[1].evaluate(()=>YakolakP2P.dispatch('move',{cell:8,size:'large',version:YakolakP2P.session.snapshot.version}));assert.equal(second.ok,true);
  await pages[0].waitForFunction(()=>YakolakP2P.session.snapshot.board[8].large==='green');
  await pages[1].waitForFunction(()=>YakolakP2P.session.snapshot.moveNumber===3);
  assert.equal(await pages[1].evaluate(()=>YakolakP2P.session.snapshot.lastMove.seat),'p3');
  const stable=p=>p.evaluate(()=>{const r=structuredClone(YakolakP2P.session.snapshot);for(const k of ['serverNow','turnRemainingMs','continueRemainingMs'])delete r[k];return r});
  assert.deepEqual(await stable(pages[0]),await stable(pages[1]));
  await pages[1].reload();await pages[1].waitForFunction(()=>!!window.YakolakP2P);
  await pages[1].evaluate(code=>YakolakP2P.join(code,{name:'ريم'}).then(()=>true),room.code);
  await pages[0].waitForFunction(()=>!YakolakP2P.session.snapshot.paused);
  assert.equal(await pages[1].evaluate(()=>YakolakP2P.session.identity.seat),'p2');
  await pages[1].evaluate(()=>YakolakP2P.close());
  await pages[0].waitForFunction(()=>YakolakP2P.session.snapshot.paused);
  result.passed=true;
 }catch(e){result.failure=e.message;process.exitCode=1}
 finally{console.log(JSON.stringify(result,null,2));await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
