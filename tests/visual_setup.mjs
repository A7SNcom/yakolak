import assert from 'node:assert/strict';
import {test} from 'node:test';
import {COLORS,digits,validProfile,newSetup,chooseColor,confirmColor,chooseCount,changeSeat,seatLabel,swapPlayers,configuration,configurationError,parseRoomInput,mountSetup} from '../ui/visual-setup.mjs';

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
 test('phone, entry, color, count, dropdown, win target and start are separate stages',async()=>{
  const dom=new JSDOM('<body></body>',{url:'https://a7sncom.github.io/yakolak/',pretendToBeVisual:true});
  const {window}=dom,{document}=window,events=[],copies=[];
  window.yakolakVisualSetupAction=value=>events.push(JSON.parse(value));window.navigator.clipboard={writeText:async value=>copies.push(value)};
  const api=mountSetup(document,window);api.open();const q=s=>document.querySelector(s);
  q('input[type=tel]').value='٠٥٥۱۲۳٤٥٦٧';q('input[type=tel]').dispatchEvent(new window.Event('input'));
  assert.equal(q('input[type=tel]').inputMode,'numeric');assert.equal(q('input[type=tel]').value,'0551234567');
  q('form').dispatchEvent(new window.Event('submit',{cancelable:true}));assert.equal(q('h2').textContent,'الاسم الكريم');
  q('input[autocomplete=given-name]').value='أحمد';q('form').dispatchEvent(new window.Event('submit',{cancelable:true}));
  assert.equal(q('.yk-entry').hidden,false);assert.equal(q('h1').textContent,'');assert.ok([...document.querySelectorAll('.yk-seat')].every(x=>x.hidden));
  q('.yk-entry button').click();assert.equal(q('h1').textContent,'اختر لونك');assert.equal(q('.yk-confirm').hidden,true);
  q('[data-color=blue]').click();assert.equal(q('.yk-confirm').hidden,false);assert.equal(q('.yk-start').hidden,true);
  q('.yk-confirm').click();assert.equal(q('h1').textContent,'كم لاعب؟');assert.equal(q('.yk-counts').hidden,false);
  assert.ok([...document.querySelectorAll('.yk-seat')].every(x=>x.hidden));
  q('.yk-counts button[aria-label="3 لاعبين"]').click();assert.equal(q('.yk-counts').hidden,true);assert.equal(q('h1').textContent,'');
  assert.equal(q('.yk-start').hidden,false);assert.equal(q('.yk-rounds').hidden,true);assert.equal(q('[data-color=marble] .yk-seat-status').textContent,'فاضي');
  assert.equal(q('[data-color=blue] .yk-seat-number'),null);assert.ok(parseFloat(q('[data-color=blue]').style.width)>0);assert.ok(!q('.yk-seats').textContent.includes('لاعب'));
  q('[data-color=gold]').click();assert.equal(q('.yk-sheet').getAttribute('role'),'menu');assert.equal(q('.yk-sheet').getAttribute('aria-modal'),'false');
  [...document.querySelectorAll('.yk-menu-item')].find(x=>x.textContent==='لاعب').click();assert.equal(q('input').placeholder,'اسم اللاعب');q('input').value='ريم';q('form').dispatchEvent(new window.Event('submit',{cancelable:true}));
  q('.yk-start').click();assert.equal(q('.yk-rounds').hidden,false);assert.equal(q('h1').textContent,'كم شوط للفوز؟');assert.equal(events.some(x=>x.action==='start'),false);
  q('.yk-rounds button[aria-label="الفوز بـ 5 أشواط"]').click();const start=events.find(x=>x.action==='start');assert.equal(start.rounds,5);assert.equal(start.count_chosen,true);assert.equal(start.players[1].label,'ريم');assert.equal(start.players.length,3);
  assert.ok(!JSON.stringify(events).includes('0551234567'));
  api.open();q('form').dispatchEvent(new window.Event('submit',{cancelable:true}));assert.equal(q('input[autocomplete=given-name]'),null);
  q('.yk-entry button:last-child').click();q('input').value='https://a7sncom.github.io/yakolak/?room=12';q('form').dispatchEvent(new window.Event('submit',{cancelable:true}));assert.match(q('.yk-field-error').textContent,/غير متاح/);
  q('.yk-subtle').click();q('.yk-entry button').click();q('[data-color=blue]').click();q('.yk-confirm').click();q('.yk-counts button').click();
  assert.equal(q('.yk-sharing').disabled,true);q('.yk-sharing').click();assert.equal(copies.length,0);assert.equal(q('.yk-error').textContent,'');
  api.room({code:'12',players:[]});q('.yk-sharing').click();await Promise.resolve();assert.equal(copies[0],'https://a7sncom.github.io/yakolak/?room=12');
  dom.window.close();
 });
}
