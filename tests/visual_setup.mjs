import assert from 'node:assert/strict';
import {test} from 'node:test';
import {COLORS,digits,validProfile,newSetup,chooseColor,confirmColor,chooseCount,changeSeat,seatLabel,swapPlayers,configuration,configurationError,parseRoomInput,restoreSetup,mountSetup,cylinderSample,cylinderNormal,orbitRibbonGeometry} from '../ui/visual-setup.mjs';

test('all four folded sheets follow one table-centered orbit without reversing their captions',()=>{
 const seats=[[-100,-120,-8],[100,-120,8],[-100,120,8],[100,120,-8]];
 for(const [x,y,angle] of seats){
  const normal=cylinderNormal(x,y,0,0,angle),edge=cylinderSample(112,180,normal,112);
  const worldX=Math.cos(angle*Math.PI/180)*edge.dx-Math.sin(angle*Math.PI/180)*edge.dy;
  const worldY=Math.sin(angle*Math.PI/180)*edge.dx+Math.cos(angle*Math.PI/180)*edge.dy;
  assert.ok(worldX*x+worldY*y>0,'inverse displacement follows the same outward-facing cylinder');
  assert.equal(edge.radius,180);
 }
 for(const width of [112,136,360,560]){
  const normal=cylinderNormal(0,-120,0,0);
  const center=cylinderSample(width,180,normal,width/2);assert.ok(Math.abs(center.dx)<1e-9);assert.ok(Math.abs(center.dy)<1e-9);
  const edge=cylinderSample(width,180,normal,width);assert.ok(Math.abs(edge.dy)<=7.001);
  for(let x=1;x<=width;x++){const a=cylinderSample(width,180,normal,x-1),b=cylinderSample(width,180,normal,x);assert.ok(Math.abs(a.dy-b.dy)<.5);assert.ok(Math.abs(a.dx-b.dx)<.5);}
 }
 assert.equal(cylinderSample(112,180,{x:0,y:1},112).radius,cylinderSample(560,180,{x:0,y:1},560).radius);
});

test('elliptical cylindrical ribbon tracks the four corner selectors',()=>{
 for(const [width,height,points] of [
  [390,844,[[95,260],[295,260],[95,575],[295,575]]],
  [320,568,[[76,170],[244,170],[76,383],[244,383]]],
  [1366,768,[[350,170],[1016,170],[350,586],[1016,586]]]
 ]){
  const ring=orbitRibbonGeometry(points,width,height);
  assert.ok(ring&&ring.rx>0&&ring.ry>0&&ring.thickness>=36);
  for(const [x,y] of points){
   const radius=(x-ring.cx)**2/ring.rx**2+(y-ring.cy)**2/ring.ry**2;
   assert.ok(Math.abs(radius-1)<1e-8,'ring touches each plate center');
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
test('every host color keeps counterclockwise numbering and defaults to two',()=>{
  for(let start=0;start<4;start++) {
    const state=chooseColor(newSetup('أحمد'),COLORS[start].id);
    assert.equal(state.step,'color');assert.equal(confirmColor(state).step,'count');
    assert.deepEqual(state.seats.map(x=>x.color),Array.from({length:4},(_,i)=>COLORS[(start+i)%4].id));
    assert.deepEqual(state.seats.map(x=>x.mode),['local','bot','none','none']);
    for(const n of [2,3,4]) {
      const chosen=chooseCount(state,n);
      assert.equal(configuration(chosen).players.length,n);
      assert.equal(chosen.seats[0].name,'أحمد');
      assert.ok(chosen.seats.slice(1,n).every(x=>x.mode==='bot'));
      assert.ok(chosen.seats.slice(n).every(x=>x.mode==='none'));
    }
  }
});
test('seat types, absent middle seats, names and offline limits',()=>{
  let state=chooseCount(chooseColor(newSetup('أحمد'),'green'),4);
  state=changeSeat(state,1,'none');state=changeSeat(state,2,'local','ريم');
  assert.deepEqual(configuration(state).players.map(x=>[x.seat,x.mode,x.label]),[['p1','local','أحمد'],['p2','local','ريم'],['p3','bot','كمبيوتر ذهبي']]);
  assert.equal(configurationError(state),'');
  assert.equal(configuration(state).tutorial,false);
  state=changeSeat(state,3,'local');
  assert.equal(configuration(state).players.at(-1).label,'لاعب ذهبي');
  assert.equal(configurationError(state),'');
  state=changeSeat(state,3,'online');assert.match(configurationError(state),/غير متاح/);
  state=changeSeat(state,3,'local','عمر','p2');assert.match(configurationError(state),/غير متاح/);
  state=changeSeat(state,3,'none');state=changeSeat(state,2,'none');assert.match(configurationError(state),/على الأقل/);
});
test('selecting a named local player swaps colors while preserving identities and the host seat',()=>{
  let state=chooseCount(chooseColor(newSetup('أحمد'),'blue'),3);
  state=changeSeat(state,2,'local','ريم');
  const hostColor=state.seats[0].color,targetColor=state.seats[1].color,playerColor=state.seats[2].color;
  const next=swapPlayers(state,1,2);
  assert.equal(next.seats[1].color,playerColor);assert.equal(next.seats[2].color,targetColor);
  assert.equal(next.seats[0].color,hostColor);assert.equal(next.hostColor,hostColor);
  assert.equal(next.seats[0].name,'أحمد');assert.equal(next.seats[2].name,'ريم');
  assert.equal(seatLabel(next.seats[1]),'كمبيوتر أخضر');
});

test('room code or same-origin invitation link normalizes',()=>{
 assert.equal(parseRoomInput('١٢'),'12');assert.equal(parseRoomInput('https://a7sncom.github.io/yakolak/?room=12'),'12');
 assert.equal(parseRoomInput('https://example.com/?room=12'),'');assert.equal(parseRoomInput('123'),'');
});
if(process.env.YAKOLAK_JSDOM_MODULE){
 const {JSDOM}=await import(process.env.YAKOLAK_JSDOM_MODULE);
 test('returning from ready to color restores large plain touch targets and unfragmented names',()=>{
  const dom=new JSDOM('<body></body>',{url:'https://a7sncom.github.io/yakolak/',pretendToBeVisual:true});
  const {document}=dom.window,api=mountSetup(document,dom.window),resume={players:[{color:'green',label:'أحمد',mode:'local'},{color:'blue',label:'كمبيوتر أزرق',mode:'bot'}]};
  api.open({resume,request:'ready-1'});const blue=document.querySelector('[data-color=blue]');
  assert.equal(blue.querySelector('.yk-seat-status').parentElement,blue);assert.equal(blue.querySelector('.yk-fold-strip'),null);
  api.open({resume,preview_step:'color',request:'color-2'});
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
  assert.deepEqual([...root.querySelectorAll('.yk-entry button')].map(x=>x.textContent),['غرفة جديدة','انضمام لغرفة']);
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
 test('phone, entry, color, count, dropdown, win target and start are separate stages',async()=>{
  const dom=new JSDOM('<body></body>',{url:'https://a7sncom.github.io/yakolak/',pretendToBeVisual:true});
  const {window}=dom,{document}=window,events=[],copies=[];
  window.yakolakVisualSetupAction=value=>events.push(JSON.parse(value));window.navigator.clipboard={writeText:async value=>copies.push(value)};
  const api=mountSetup(document,window);api.open();const q=s=>document.querySelector(s);
  assert.equal(q('.yk-entry').hidden,false);
  assert.equal(q('.yk-modal').hidden,true);
  assert.equal(q('.yk-entry button').textContent,'غرفة جديدة');
  q('.yk-entry button').click();
  q('input[type=tel]').value='٠٥٥۱۲۳٤٥٦٧';q('input[type=tel]').dispatchEvent(new window.Event('input'));
  assert.equal(q('input[type=tel]').inputMode,'numeric');assert.equal(q('input[type=tel]').value,'0551234567');
  q('form').dispatchEvent(new window.Event('submit',{cancelable:true}));assert.equal(q('h2').textContent,'الاسم الكريم');
  q('input[autocomplete=given-name]').value='أحمد';q('form').dispatchEvent(new window.Event('submit',{cancelable:true}));
  assert.equal(q('h1').textContent,'اختر لونك');assert.equal(q('.yk-confirm').hidden,true);
  q('[data-color=blue]').click();assert.equal(q('.yk-confirm').hidden,false);assert.equal(q('[data-color=blue]').getAttribute('aria-pressed'),'true');assert.equal(q('[data-color=gold]').getAttribute('aria-pressed'),'false');assert.equal(q('.yk-start').hidden,true);
  q('.yk-confirm').click();assert.equal(q('h1').textContent,'كم لاعب؟');assert.equal(q('.yk-counts').hidden,false);
  assert.ok([...document.querySelectorAll('.yk-seat')].every(x=>x.hidden));
  q('.yk-counts button[aria-label="3 لاعبين"]').click();assert.equal(q('.yk-counts').hidden,true);assert.equal(q('h1').textContent,'');
  assert.equal(q('.yk-start').hidden,false);assert.equal(q('.yk-rounds').hidden,true);assert.equal(q('[data-color=marble] .yk-seat-status').textContent,'فاضي');
  assert.equal(q('[data-color=blue] .yk-seat-number'),null);assert.ok(parseFloat(q('[data-color=blue]').style.left)>0);assert.ok(!q('.yk-seats').textContent.includes('لاعب'));
  q('[data-color=gold]').click();assert.equal(q('.yk-sheet').getAttribute('role'),'menu');assert.equal(q('.yk-sheet').getAttribute('aria-modal'),'false');
  [...document.querySelectorAll('.yk-menu-item')].find(x=>x.textContent==='لاعب').click();assert.equal(q('input').placeholder,'اسم اللاعب');assert.equal(q('.yk-modal').dataset.side,'center');
  const footerTop=q('.yk-actions').style.top;
  const viewport=new window.EventTarget();viewport.height=340;viewport.offsetTop=20;
  Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
  window.dispatchEvent(new window.Event('resize'));
  assert.equal(q('.yk-actions').style.top,footerTop,'keyboard leaves Start/Share below its overlay');
  assert.ok(q('#yakolakVisualSetup').classList.contains('is-keyboard'));
  assert.ok(parseFloat(q('.yk-sheet').style.top)<340,'editing sheet stays inside visible viewport');
  q('input').value='ريم';q('input').dispatchEvent(new window.Event('input'));assert.equal(q('.yk-input-clear').hidden,false);q('.yk-input-clear').click();assert.equal(q('input').value,'');assert.equal(q('.yk-input-clear').hidden,true);
  q('input').value='ريم';q('form').dispatchEvent(new window.Event('submit',{cancelable:true}));
  q('.yk-start').click();assert.equal(q('.yk-rounds').hidden,false);assert.equal(q('h1').textContent,'كم شوط للفوز؟');assert.equal(events.some(x=>x.action==='start'),false);
  q('.yk-rounds button[aria-label="الفوز بـ 5 أشواط"]').click();const start=events.find(x=>x.action==='start');assert.equal(start.rounds,5);assert.equal(start.count_chosen,true);assert.equal(start.players[1].label,'ريم');assert.equal(start.players.length,3);
  assert.ok(!JSON.stringify(events).includes('0551234567'));
  api.open();assert.equal(q('.yk-entry').hidden,false);assert.equal(q('.yk-modal').hidden,true);assert.equal(q('input[autocomplete=given-name]'),null);
  q('.yk-entry button:last-child').click();q('input').value='https://a7sncom.github.io/yakolak/?room=12';q('form').dispatchEvent(new window.Event('submit',{cancelable:true}));assert.match(q('.yk-field-error').textContent,/غير متاح/);
  q('.yk-subtle').click();q('.yk-entry button').click();q('[data-color=blue]').click();q('.yk-confirm').click();q('.yk-counts button').click();
  assert.equal(q('.yk-sharing').disabled,true);q('.yk-sharing').click();assert.equal(copies.length,0);assert.equal(q('.yk-error').textContent,'');
  api.room({code:'12',players:[]});q('.yk-sharing').click();await Promise.resolve();assert.equal(copies[0],'https://a7sncom.github.io/yakolak/?room=12');
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
 assert.equal(restored.seats.find(x=>x.color==='marble').mode,'none');assert.equal(restored.seats.find(x=>x.color==='blue').name,'ريم');
 const dom=new JSDOM('<body></body>',{url:'https://a7sncom.github.io/yakolak/',pretendToBeVisual:true});
 const api=mountSetup(dom.window.document,dom.window);api.open({resume:config,request:'resume-1'});
 const root=dom.window.document.getElementById('yakolakVisualSetup');assert.equal(root.dataset.step,'ready');assert.equal(root.querySelector('.yk-modal').hidden,true);assert.equal(root.querySelector('.yk-start').hidden,false);
 assert.equal(root.querySelector('[data-color=blue] .yk-seat-status').textContent,'ريم');dom.window.close();
});

}
