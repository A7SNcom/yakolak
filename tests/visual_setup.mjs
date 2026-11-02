import assert from 'node:assert/strict';
import {test} from 'node:test';
import {COLORS,digits,validProfile,newSetup,chooseColor,confirmColor,changeSeat,seatLabel,swapPlayers,configuration,configurationError,parseRoomInput,restoreSetup,mountSetup,orbitRibbonGeometry,orbitPlateGeometry,orbitY} from '../ui/visual-setup.mjs';

test('invisible orbit keeps mirrored smooth plates within the viewport',()=>{
 for(const [width,height] of [[320,568],[390,844],[768,1024],[1280,900],[844,390]]){
  const points=[[width*.28,height*.3],[width*.72,height*.3],[width*.28,height*.65],[width*.72,height*.65]];
  const ring=orbitRibbonGeometry(points,width,height,[width*.08,height*.3,width*.84,height*.36]);
  assert.ok(ring.cx-ring.rx>=11.9&&ring.cx+ring.rx<=width-11.9);
  for(const side of [-1,1])for(const sign of [-1,1]){
   const x=ring.cx+sign*ring.rx*.54;
   const plate=orbitPlateGeometry(ring,x,side,ring.rx*.72,ring.thickness*.79);
   assert.ok(plate.left>=0&&plate.left+plate.width<=width);
   assert.ok(plate.top>=0&&plate.top+plate.height<=height);
   assert.ok(plate.height>=44);
   assert.ok(!/NaN|Infinity/.test(plate.path));
   assert.ok(side*(orbitY(ring,x,side)-ring.cy)>0);
  }
 }
 assert.equal(orbitRibbonGeometry([[0,0]],390,844),null);
});
test('Arabic/Persian telephone digits normalize and profile validates',()=>{
  assert.equal(digits('٠٥٥ ۱۲۳-٤٥٦٧'),'0551234567');
  assert.ok(validProfile({name:'أحمد',phone:'0551234567'}));
  assert.ok(!validProfile({name:'أ',phone:'055'}));
  assert.deepEqual(COLORS.map(x=>x.name),['أبيض','أزرق','ذهبي','أخضر']);
});
test('every host color keeps counterclockwise numbering and opens three online seats',()=>{
  for(let start=0;start<4;start++) {
    const state=chooseColor(newSetup('أحمد'),COLORS[start].id);
    assert.equal(state.step,'color');assert.equal(confirmColor(state).step,'ready');
    assert.deepEqual(state.seats.map(x=>x.color),Array.from({length:4},(_,i)=>COLORS[(start+i)%4].id));
    assert.deepEqual(state.seats.map(x=>x.mode),['local','none','none','none']);
    const ready=confirmColor(state),roster=configuration(ready).players;
    assert.equal(roster.length,4);
    assert.equal(roster[0].label,'أحمد');
    assert.deepEqual(roster.slice(1).map(x=>[x.mode,x.label]),[['online','فاضي'],['online','فاضي'],['online','فاضي']]);
  }
});
test('free seats switch to computer or same-device player without asking for names',()=>{
  let state=confirmColor(chooseColor(newSetup('أحمد'),'green'));
  state=changeSeat(state,1,'bot');state=changeSeat(state,2,'local');
  assert.deepEqual(configuration(state).players.map(x=>[x.seat,x.mode,x.label]),[['p1','local','أحمد'],['p2','bot','كمبيوتر'],['p3','local','لاعب'],['p4','online','فاضي']]);
  assert.equal(configurationError(state,{online:true}),'');
  assert.equal(configuration(state).tutorial,false);
  state=changeSeat(state,3,'local','عمر','p2');assert.match(configurationError(state,{online:false}),/غير متاح/);
  state=changeSeat(state,3,'none');assert.equal(seatLabel(state.seats[3]),'فاضي');
});
test('changing a same-device seat preserves its simple label and host color',()=>{
  let state=confirmColor(chooseColor(newSetup('أحمد'),'blue'));
  state=changeSeat(state,2,'local');
  const hostColor=state.seats[0].color,targetColor=state.seats[1].color,playerColor=state.seats[2].color;
  const next=swapPlayers(state,1,2);
  assert.equal(next.seats[1].color,playerColor);assert.equal(next.seats[2].color,targetColor);
  assert.equal(next.seats[0].color,hostColor);assert.equal(next.hostColor,hostColor);
  assert.equal(next.seats[0].name,'أحمد');assert.equal(next.seats[2].name,'');
  assert.equal(seatLabel(next.seats[1]),'فاضي');
});

test('room code or same-origin invitation link normalizes',()=>{
 assert.equal(parseRoomInput('١٢٣'),'123');assert.equal(parseRoomInput('https://a7sncom.github.io/yakolak/?room=123'),'123');
 assert.equal(parseRoomInput('https://example.com/?room=123'),'');assert.equal(parseRoomInput('12'),'');
});
if(process.env.YAKOLAK_JSDOM_MODULE){
 const {JSDOM}=await import(process.env.YAKOLAK_JSDOM_MODULE);
 test('returning from ready to color restores large plain touch targets and unfragmented names',()=>{
  const dom=new JSDOM('<body></body>',{url:'https://a7sncom.github.io/yakolak/',pretendToBeVisual:true});
  const {document}=dom.window,api=mountSetup(document,dom.window),resume={players:[{color:'green',label:'أحمد',mode:'local'},{color:'blue',label:'كمبيوتر أزرق',mode:'bot'}]};
  api.open({resume,request:'ready-1'});assert.equal(document.querySelector('.yk-orbit-ribbon'),null);assert.equal(document.querySelector('textPath'),null);const blue=document.querySelector('[data-color=blue]');
  assert.equal(blue.querySelector('.yk-seat-status').parentElement,blue);assert.equal(blue.querySelector('.yk-seat-status').namespaceURI,'http://www.w3.org/1999/xhtml');assert.equal(blue.querySelector('.yk-seat-status').dir,'rtl');assert.equal(blue.querySelector('.yk-fold-strip'),null);
  api.open({resume,preview_step:'color',request:'color-2'});assert.equal(document.querySelector('.yk-orbit-ribbon'),null);
  for(const target of document.querySelectorAll('.yk-seat')){assert.ok(parseFloat(target.style.width)>=104);assert.ok(parseFloat(target.style.height)>=88);assert.equal(target.classList.contains('yk-cylinder'),false);assert.equal(target.style.getPropertyValue('--yk-cylinder-filter'),'');}
  blue.click();assert.equal(blue.getAttribute('aria-pressed'),'true');assert.equal(document.querySelector('.yk-confirm').hidden,false);
  dom.window.close();
 });
 test('real engine entry request opens room choices without a click or direct API call',async()=>{
  const dom=new JSDOM('<body></body>',{url:'https://a7sncom.github.io/yakolak/',pretendToBeVisual:true});
  const {window}=dom,{document}=window,events=[];
  window.yakolakVisualSetupAction=value=>events.push(JSON.parse(value));
  mountSetup(document,window);
  const root=document.getElementById('yakolakVisualSetup');
  assert.equal(root.hidden,true);
  // This is the exact durable request published by SessionSetup after handoff.
  window.yakolakPendingVisualSetup={online:false,mixed:false,request:'1'};
  document.body.dataset.yakolakVisualSetupRequest='1';
  assert.equal(events.length,0,'engine publication must not reenter its callback');
  await new Promise(resolve=>window.setTimeout(resolve,0));
  assert.equal(root.hidden,false);assert.equal(root.dataset.step,'entry');
  assert.equal(root.querySelector('.yk-entry').hidden,false);
  assert.deepEqual([...root.querySelectorAll('.yk-entry button')].map(x=>x.textContent),['غرفة جديدة','انضمام لغرفة','كيف تنلعب؟','الإعدادات']);
  assert.equal(document.body.dataset.yakolakVisualSetupAck,'1');
  root.querySelector('.yk-entry button').click();
  assert.equal(root.querySelector('.yk-modal').dataset.kind,'profile');
  document.body.dataset.yakolakVisualSetupRequest='1';
  await new Promise(resolve=>window.setTimeout(resolve,0));
  assert.equal(root.querySelector('.yk-modal').hidden,false,'retry must preserve visitor input');
  window.YakolakSetup.close();
  document.body.dataset.yakolakVisualSetupRequest='1';
  await new Promise(resolve=>window.setTimeout(resolve,0));
  assert.equal(root.hidden,true,'stale request cannot reopen setup during play');
  document.body.dataset.yakolakVisualSetupRequest='2';
  await new Promise(resolve=>window.setTimeout(resolve,0));
  assert.equal(root.hidden,false);assert.equal(root.querySelector('.yk-entry').hidden,false);
  assert.equal(document.body.dataset.yakolakVisualSetupAck,'2');
  dom.window.close();
 });
 test('a late-loaded setup module consumes an already published engine request',async()=>{
  const dom=new JSDOM('<body data-yakolak-visual-setup-request="7"></body>',{url:'https://a7sncom.github.io/yakolak/',pretendToBeVisual:true});
  const {window}=dom,{document}=window;
  window.yakolakPendingVisualSetup={online:false,mixed:false,request:'7'};
  mountSetup(document,window);
  assert.equal(document.getElementById('yakolakVisualSetup').hidden,false);
  assert.equal(document.querySelector('.yk-entry').hidden,false);
  assert.equal(document.body.dataset.yakolakVisualSetupAck,'7');
  assert.equal(window.yakolakPendingVisualSetup,undefined);
  dom.window.close();
 });
test('four home actions lead from profile and color directly to the editable roster',async()=>{
  const dom=new JSDOM('<body></body>',{url:'https://a7sncom.github.io/yakolak/',pretendToBeVisual:true});
  const {window}=dom,{document}=window,events=[],copies=[];
  window.yakolakVisualSetupAction=value=>events.push(JSON.parse(value));window.navigator.clipboard={writeText:async value=>copies.push(value)};
  const api=mountSetup(document,window);api.open();const q=s=>document.querySelector(s);
  assert.equal(q('.yk-entry').hidden,false);
  assert.equal(q('.yk-modal').hidden,true);
  assert.deepEqual([...document.querySelectorAll('.yk-entry button')].map(x=>x.textContent),['غرفة جديدة','انضمام لغرفة','كيف تنلعب؟','الإعدادات']);
  q('.yk-settings-home').click();
  assert.deepEqual([...q('.yk-settings-options').children].map(x=>x.textContent),['عالية','متوسطة','منخفضة']);
  assert.equal(q('.yk-settings-options [data-quality=high]').getAttribute('aria-pressed'),'true');
  q('.yk-settings-options [data-quality=low]').click();assert.equal(window.localStorage.getItem('yakolak-graphics-quality'),'low');
  q('.yk-setting-sound').click();assert.equal(window.localStorage.getItem('yakolak-sound-enabled'),'false');
  q('.yk-modal').dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  api.open();
  q('.yk-entry button').click();
  q('input[type=tel]').value='٠٥٥۱۲۳٤٥٦٧';q('input[type=tel]').dispatchEvent(new window.Event('input'));
  assert.equal(q('input[type=tel]').inputMode,'numeric');assert.equal(q('input[type=tel]').value,'0551234567');
  q('form').dispatchEvent(new window.Event('submit',{cancelable:true}));assert.equal(q('h2').textContent,'الاسم الكريم');
  q('input[autocomplete=given-name]').value='أحمد';q('form').dispatchEvent(new window.Event('submit',{cancelable:true}));
  assert.equal(q('h1').textContent,'اختر لونك');assert.equal(q('.yk-confirm').hidden,true);
  q('[data-color=blue]').click();assert.equal(q('.yk-confirm').hidden,false);assert.equal(q('[data-color=blue]').getAttribute('aria-pressed'),'true');assert.equal(q('[data-color=gold]').getAttribute('aria-pressed'),'false');assert.equal(q('.yk-start').hidden,true);
  q('.yk-confirm').click();assert.equal(q('h1').textContent,'');assert.equal(q('#yakolakVisualSetup').dataset.step,'ready');
  assert.ok([...document.querySelectorAll('.yk-seat')].every(x=>!x.hidden));
  assert.equal(q('.yk-start').hidden,false);assert.equal(q('.yk-rounds').hidden,true);assert.equal(q('[data-color=marble] .yk-seat-status').textContent,'فاضي');
  assert.equal([...document.querySelectorAll('.yk-seat-status')].filter(x=>x.textContent==='فاضي').length,3);
  assert.equal(q('[data-color=blue] .yk-seat-number'),null);assert.ok(parseFloat(q('[data-color=blue]').style.left)>0);assert.ok(!q('.yk-seats').textContent.includes('لاعب'));
  q('[data-color=gold]').click();assert.equal(q('.yk-sheet').getAttribute('role'),'menu');assert.equal(q('.yk-sheet').getAttribute('aria-modal'),'false');
  assert.deepEqual([...document.querySelectorAll('.yk-menu-item')].map(x=>x.textContent),['كمبيوتر','لاعب في نفس الجهاز']);
  [...document.querySelectorAll('.yk-menu-item')][1].click();assert.equal(q('[data-color=gold] .yk-seat-status').textContent,'لاعب');
  q('[data-color=green]').click();document.querySelectorAll('.yk-menu-item')[0].click();assert.equal(q('[data-color=green] .yk-seat-status').textContent,'كمبيوتر');
  q('[data-color=marble]').click();document.querySelectorAll('.yk-menu-item')[0].click();assert.equal(q('[data-color=marble] .yk-seat-status').textContent,'كمبيوتر');
  q('.yk-start').click();assert.equal(q('.yk-rounds').hidden,false);assert.equal(q('h1').textContent,'كم شوط للفوز؟');assert.equal(events.some(x=>x.action==='start'),false);
  q('.yk-rounds button[aria-label="الفوز بـ 5 أشواط"]').click();await Promise.resolve();const start=events.find(x=>x.action==='start');assert.equal(start.rounds,5);assert.equal(start.players[1].label,'لاعب');assert.equal(start.players[2].label,'كمبيوتر');assert.equal(start.players.length,4);
  assert.ok(!JSON.stringify(events).includes('0551234567'));
  api.open();assert.equal(q('.yk-entry').hidden,false);assert.equal(q('.yk-modal').hidden,true);assert.equal(q('input[autocomplete=given-name]'),null);
  q('.yk-entry .yk-outline').click();q('input').value='https://a7sncom.github.io/yakolak/?room=123';q('form').dispatchEvent(new window.Event('submit',{cancelable:true}));assert.match(q('.yk-field-error').textContent,/غير متاح/);
  q('.yk-subtle').click();q('.yk-entry button').click();q('[data-color=blue]').click();q('.yk-confirm').click();
  assert.equal(q('.yk-sharing').disabled,true);q('.yk-sharing').click();assert.equal(copies.length,0);assert.equal(q('.yk-error').textContent,'');
  api.room({code:'123',players:[]});q('.yk-sharing').click();await Promise.resolve();assert.equal(copies[0],'https://a7sncom.github.io/yakolak/?room=123');
  dom.window.close();
 });
 test('closing and reopening during the profile step clears stale overlay state',()=>{
  const dom=new JSDOM('<head><style>#yakolakVisualSetup[data-overlay=profile] .yk-actions{visibility:hidden}#yakolakVisualSetup[data-moving=true] button{pointer-events:none}</style></head><body></body>',{url:'https://a7sncom.github.io/yakolak/',pretendToBeVisual:true});
  const {window}=dom,{document}=window;const api=mountSetup(document,window);api.open();const q=s=>document.querySelector(s);
  q('.yk-entry button:first-child').click();
  assert.equal(q('.yk-modal').hidden,false);assert.equal(q('#yakolakVisualSetup').dataset.overlay,'profile');
  assert.equal(window.getComputedStyle(q('.yk-actions')).visibility,'hidden');
  api.close();api.open();
  assert.equal(q('.yk-entry').hidden,false);assert.equal(q('.yk-modal').hidden,true);
  assert.equal(q('#yakolakVisualSetup').dataset.overlay,undefined);assert.equal(q('#yakolakVisualSetup').dataset.profile,undefined);
  assert.equal(q('#yakolakVisualSetup').dataset.moving,undefined);assert.equal(q('.yk-actions').inert,false);
  assert.equal(window.getComputedStyle(q('.yk-actions')).visibility,'visible');
  q('.yk-entry button:first-child').click();assert.equal(q('.yk-modal').hidden,false);
  dom.window.close();
 });
 test('a late screen transition cannot overwrite a newly opened setup',async()=>{
  const dom=new JSDOM('<body></body>',{url:'https://a7sncom.github.io/yakolak/',pretendToBeVisual:true});
  const {window}=dom,{document}=window;window.localStorage.setItem('yakolak-visitor-v1',JSON.stringify({name:'أحمد',phone:'0551234567'}));
  const api=mountSetup(document,window);api.open();const q=s=>document.querySelector(s);let finish;
  q('.yk-actions').animate=()=>({finished:new Promise(resolve=>{finish=resolve;})});
  q('.yk-entry button:first-child').click();assert.equal(q('#yakolakVisualSetup').dataset.moving,'true');
  api.close();api.open();finish();await new Promise(resolve=>window.setTimeout(resolve,0));
  assert.equal(q('#yakolakVisualSetup').dataset.step,'entry');assert.equal(q('.yk-entry').hidden,false);
  assert.equal(q('#yakolakVisualSetup').dataset.moving,undefined);
  dom.window.close();
 });

test('new settings restore the same roster directly to ready without visitor onboarding',()=>{
 const config={rounds:5,players:[{color:'green',label:'أحمد',mode:'local'},{color:'blue',label:'ريم',mode:'local'},{color:'gold',label:'كمبيوتر ذهبي',mode:'bot'}]};
 const restored=restoreSetup(config);assert.equal(restored.step,'ready');assert.equal(restored.rounds,5);assert.equal(restored.hostColor,'green');
  assert.equal(restored.seats.find(x=>x.color==='marble').mode,'none');const localPlayer=restored.seats.find(x=>x.color==='blue');assert.equal(localPlayer.name,'');assert.equal(seatLabel(localPlayer),'لاعب');
 const dom=new JSDOM('<body></body>',{url:'https://a7sncom.github.io/yakolak/',pretendToBeVisual:true});
 const api=mountSetup(dom.window.document,dom.window);api.open({resume:config,request:'resume-1'});
 const root=dom.window.document.getElementById('yakolakVisualSetup');assert.equal(root.dataset.step,'ready');assert.equal(root.querySelector('.yk-modal').hidden,true);assert.equal(root.querySelector('.yk-start').hidden,false);
  assert.equal(root.querySelector('[data-color=blue] .yk-seat-status').textContent,'لاعب');dom.window.close();
});

test('online error releases a pending start and keeps the roster available for retry',()=>{
 const dom=new JSDOM('<body></body>',{url:'https://a7sncom.github.io/yakolak/',pretendToBeVisual:true});
 const {window}=dom;window.matchMedia=()=>({matches:true});
 const api=mountSetup(window.document,window);api.open({online:true,resume:{rounds:3,players:[{color:'marble',label:'أحمد',mode:'local'},{color:'blue',label:'ريم',mode:'online'}]}});
 const q=s=>window.document.querySelector(s);
 q('.yk-start').click();q('.yk-rounds button').click();assert.ok(q('.yk-rounds button').disabled);
 api.close();api.networkError('signaling_unavailable');
 assert.equal(q('#yakolakVisualSetup').dataset.step,'ready');assert.equal(q('#yakolakVisualSetup').hidden,false);
 assert.equal(q('.yk-start').disabled,false);assert.equal(q('.yk-sharing').disabled,true);
  assert.match(q('.yk-error').textContent,/خدمة اكتشاف/);assert.equal(q('[data-color=blue] .yk-seat-status').textContent,'فاضي');
 dom.window.close();
});

test('guest reuses table color targets, occupied name plates and the same ready screen until host starts',async()=>{
 const {RoomAuthority}=await import('../ui/p2p-authority.mjs');
 const config={rounds:3,players:[{color:'marble',mode:'local',label:'أحمد'},{color:'blue',mode:'online'},{color:'gold',mode:'bot'}]},authority=new RoomAuthority({code:'007',epoch:'e'.repeat(48),peerId:'host',token:'h'.repeat(48),config});
 // Canonical UI component adapter only; this is not a connection test.
 let listener;const client={role:'',code:'007',session:null,subscribe(fn){listener=fn},async inspectRoom(){this.role='guest';return this.session={preview:authority.preview()}},async chooseColor(color){const r=authority.join('guest',{token:'g'.repeat(48),name:'ريم',color});this.session={snapshot:r.room,identity:{seat:r.seat}};},async leave(){},async close(){this.session=null}};
 const dom=new JSDOM('<body></body>',{url:'https://a7sncom.github.io/yakolak/',pretendToBeVisual:true});const {window}=dom,{document}=window;window.localStorage.setItem('yakolak-visitor-v1',JSON.stringify({name:'ريم',phone:'0551234567'}));const events=[];window.yakolakVisualSetupAction=v=>events.push(JSON.parse(v));const q=s=>document.querySelector(s);
 const api=mountSetup(document,window,client),original=[...document.querySelectorAll('.yk-seat')];api.open({online:true});q('.yk-entry .yk-outline').click();q('input').value='٠٠٧';q('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await new Promise(r=>window.setTimeout(r,0));
 assert.equal(q('.yk-modal').hidden,true);assert.equal(q('#yakolakVisualSetup').dataset.step,'color');assert.equal(q('.yk-guest-color'),null);assert.deepEqual([...document.querySelectorAll('.yk-seat')],original);assert.equal(authority.members.size,1);
 assert.equal(q('.yk-seat[data-color=marble] .yk-seat-status').textContent,'أحمد');assert.equal(q('.yk-seat[data-color=marble]').getAttribute('aria-disabled'),'true');assert.ok(!q('.yk-seat[data-color=marble]').classList.contains('is-color'));q('.yk-seat[data-color=marble]').click();assert.equal(q('.yk-confirm').hidden,true);
 q('.yk-seat[data-color=green]').click();assert.equal(q('.yk-seat[data-color=green]').getAttribute('aria-pressed'),'true');assert.equal(authority.members.size,1,'rack selection keeps the existing confirm boundary');q('.yk-confirm').click();await new Promise(r=>window.setTimeout(r,0));
 assert.equal(authority.snapshot().players.find(p=>p.seat==='p2').color,'green');assert.equal(q('#yakolakVisualSetup').dataset.step,'ready');assert.equal(q('.yk-seat[data-color=green] .yk-seat-status').textContent,'ريم');assert.equal(q('.yk-seat[data-color=green]').getAttribute('aria-haspopup'),'false');q('.yk-seat[data-color=green]').click();assert.equal(q('.yk-modal').hidden,true);assert.equal(events.filter(e=>e.action==='join').length,0,'guest waits on the established setup surface');
 const c={...config,players:authority.slots.map(s=>({...s,label:s.name}))};client.session.snapshot=authority.start(c);listener({role:'guest',room:client.session.snapshot});listener({role:'guest',room:client.session.snapshot});const joined=events.filter(e=>e.action==='join');assert.equal(joined.length,1);assert.equal(joined[0].color,'green');assert.equal(joined[0].code,'007');dom.window.close();
});
test('host start waits on the same editable-roster layout and hands off once seats fill',async()=>{
 const {RoomAuthority}=await import('../ui/p2p-authority.mjs');const config={rounds:3,players:[{seat:'p1',color:'marble',mode:'local',label:'أحمد'},{seat:'p2',color:'blue',mode:'online',label:'فاضي'},{seat:'p3',color:'gold',mode:'bot',label:'كمبيوتر'},{seat:'p4',color:'green',mode:'local',label:'لاعب'}]},authority=new RoomAuthority({code:'007',epoch:'e'.repeat(48),peerId:'host',token:'h'.repeat(48),config});let listener;
 const client={role:'host',code:'007',session:{},subscribe(fn){listener=fn},async prepareHost(c){return authority.configure(c)},async dispatch(_kind,p){return {ok:true,room:authority.start({players:p.players,rounds:p.targetRounds})}},async leave(){}};
 const dom=new JSDOM('<body></body>',{url:'https://a7sncom.github.io/yakolak/',pretendToBeVisual:true}),{window}=dom;window.matchMedia=()=>({matches:true});const events=[];window.yakolakVisualSetupAction=v=>events.push(JSON.parse(v));const api=mountSetup(window.document,window,client),q=s=>window.document.querySelector(s);api.open({online:true,resume:config});await new Promise(r=>window.setTimeout(r,0));q('.yk-start').click();q('.yk-rounds button').click();await new Promise(r=>window.setTimeout(r,0));
 assert.equal(q('#yakolakVisualSetup').dataset.step,'ready');assert.equal(q('.yk-start').disabled,true);assert.match(q('.yk-start').textContent,/بانتظار/);assert.equal(events.filter(e=>e.action==='start').length,0);
 const room=authority.join('guest',{token:'g'.repeat(48),name:'ريم',color:'blue'}).room;listener({role:'host',room});listener({role:'host',room});assert.equal(events.filter(e=>e.action==='start').length,1);assert.equal(events.find(e=>e.action==='start').players[1].label,'ريم');dom.window.close();
});
test('host UI preserves canonical mixed-seat order and generic local labels',async()=>{
 const dom=new JSDOM('<body></body>',{url:'https://a7sncom.github.io/yakolak/',pretendToBeVisual:true});const {window}=dom,events=[];window.yakolakVisualSetupAction=v=>events.push(JSON.parse(v));
 const players=[{seat:'p1',color:'marble',mode:'local',label:'أحمد'},{seat:'p2',color:'green',mode:'online',label:'ضيف'},{seat:'p3',color:'gold',mode:'local',label:'ريم'},{seat:'p4',color:'blue',mode:'bot',label:'كمبيوتر'}];
 const slots=players.map((p,i)=>({seat:p.seat,color:p.color,mode:p.mode,name:p.mode==='online'?'ضيف':p.label,connected:i<3}));
 const snapshot={code:'007',status:'waiting',players:players.slice(0,3).map(p=>({...p,name:p.label,connected:true})),slots};
 const client={role:'host',code:'007',subscribe(){},async prepareHost(){return snapshot},async dispatch(){return {ok:true,room:{...snapshot,status:'playing'}}}};
 const api=mountSetup(window.document,window,client);api.open({online:true,resume:{rounds:3,players}});await new Promise(r=>window.setTimeout(r,0));api.room(snapshot);
 const q=s=>window.document.querySelector(s);assert.equal(q('[data-color=gold] .yk-seat-status').textContent,'لاعب');
 q('.yk-start').click();q('.yk-rounds button').click();await new Promise(r=>window.setTimeout(r,0));const start=events.find(e=>e.action==='start');assert.ok(start);assert.deepEqual(start.players.map(p=>p.color),['marble','green','gold','blue']);assert.deepEqual(start.players.map(p=>p.mode),['local','online','local','bot']);assert.equal(start.players[2].label,'لاعب');dom.window.close();
});

}
