import assert from 'node:assert/strict';
import {test} from 'node:test';
import {COLORS,digits,validProfile,newSetup,chooseColor,chooseCount,changeSeat,configuration,configurationError,mountSetup} from '../ui/visual-setup.mjs';

test('Arabic/Persian telephone digits normalize and profile validates',()=>{
  assert.equal(digits('٠٥٥ ۱۲۳-٤٥٦٧'),'0551234567');
  assert.ok(validProfile({name:'أحمد',phone:'0551234567'}));
  assert.ok(!validProfile({name:'أ',phone:'055'}));
});
test('every host color keeps counterclockwise numbering and defaults to two',()=>{
  for(let start=0;start<4;start++) {
    const state=chooseColor(newSetup('أحمد'),COLORS[start].id);
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
  assert.deepEqual(configuration(state).players.map(x=>[x.seat,x.mode,x.label]),[['p1','local','أحمد'],['p2','local','ريم'],['p3','bot','لاعب 4']]);
  assert.equal(configurationError(state),'');
  assert.equal(configuration(state).tutorial,false);
  state=changeSeat(state,3,'online');assert.match(configurationError(state),/غير متاح/);
  state=changeSeat(state,3,'local','عمر','p2');assert.match(configurationError(state),/غير متاح/);
  state=changeSeat(state,3,'none');state=changeSeat(state,2,'none');assert.match(configurationError(state),/على الأقل/);
});

if(process.env.YAKOLAK_JSDOM_MODULE){
 const {JSDOM}=await import(process.env.YAKOLAK_JSDOM_MODULE);
 test('visitor through native inputs, color/count, same-device name and game start',()=>{
  const dom=new JSDOM('<body></body>',{url:'https://a7sncom.github.io/yakolak/',pretendToBeVisual:true});
  const {window}=dom;const {document}=window;const actions=[];
  window.yakolakVisualSetupAction=value=>actions.push(JSON.parse(value));
  const api=mountSetup(document,window);api.open();
  const q=s=>document.querySelector(s);
  assert.equal(q('input[type=tel]').inputMode,'numeric');
  q('input[autocomplete=given-name]').value='أحمد';
  q('input[type=tel]').value='٠٥٥۱۲۳٤٥٦٧';q('input[type=tel]').dispatchEvent(new window.Event('input'));
  assert.equal(q('input[type=tel]').value,'0551234567');
  q('form').dispatchEvent(new window.Event('submit',{cancelable:true}));
  assert.equal(q('.yk-modal').hidden,true);assert.equal(q('h1').textContent,'اختر لونك');
  q('[data-color=blue]').click();assert.equal(q('h1').textContent,'اختر عدد اللاعبين');
  q('.yk-counts button[aria-label="3 لاعبين"]').click();
  assert.equal(q('[data-color=marble] .yk-seat-status').textContent,'بدون');
  q('[data-color=gold]').click();
  [...document.querySelectorAll('.yk-mode')].find(x=>x.textContent==='على نفس جهاز أحمد').click();
  q('input').value='ريم';q('form').dispatchEvent(new window.Event('submit',{cancelable:true}));
  q('.yk-start').click();const start=actions.find(x=>x.action==='start');
  assert.equal(start.players.length,3);assert.equal(start.players[1].label,'ريم');assert.equal(start.players[1].mode,'local');
  assert.ok(!JSON.stringify(actions).includes('0551234567'));
  api.close();api.open();assert.equal(q('.yk-modal').hidden,true);assert.equal(q('.yk-seats').inert,false);
  q('[data-color=green]').click();q('[data-color=marble]').click();api.close();api.open();
  assert.equal(q('.yk-seats').inert,false);assert.equal(q('.yk-modal').hidden,true);
  dom.window.close();
 });
}
