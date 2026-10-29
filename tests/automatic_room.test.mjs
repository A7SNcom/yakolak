import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RoomAuthority} from '../ui/p2p-authority.mjs';
const roster=(count=4)=>({rounds:3,players:Array.from({length:count},(_,i)=>({color:['marble','blue','gold','green'][i],label:`local-${i}`,mode:'local',joinable:i>0}))});
const room=config=>new RoomAuthority({code:'007',epoch:'e'.repeat(48),peerId:'host',token:'h'.repeat(48),config});
const join=(a,id,color)=>a.join(id,{token:id.repeat(48).slice(0,48),color,name:'ضيف '+id});
test('automatic human slots stay locally playable with no guests',()=>{
 for(const n of [2,3,4]){const a=room(roster(n));assert.equal(a.preview().availableColors.length,3);const r=a.start(roster(n));assert.equal(r.status,'playing');assert.ok(r.players.every(p=>p.controller==='p1'&&p.connected));assert.equal(r.paused,false);assert.equal(a.preview().availableColors.length,0);assert.throws(()=>join(a,'g','blue'),/room_not_waiting/);}
});
test('a guest atomically replaces a human placeholder and owns only that seat',()=>{
 const a=room(roster());const r=join(a,'g','gold').room;assert.equal(r.status,'waiting');assert.equal(r.players.length,4);assert.equal(r.players.find(p=>p.color==='gold').mode,'online');assert.equal(r.players.find(p=>p.color==='gold').controller,'p3');assert.equal(r.players.find(p=>p.color==='blue').controller,'p1');assert.equal(r.players.find(p=>p.color==='gold').name,'ضيف g');assert.deepEqual(a.preview().availableColors,['blue','green']);assert.throws(()=>join(a,'x','gold'),/color_taken/);
 const config={rounds:3,players:r.slots.map(s=>({...s,label:s.name}))};const started=a.start(config);assert.equal(started.status,'playing');assert.equal(started.paused,false);
 assert.throws(()=>a.command('host','move',{epoch:a.epoch,mutationId:'m'.repeat(48),version:started.version,seat:'p3',cell:0,size:'small'}),/unauthorized/);
});
test('bots and host cannot be claimed; all-local fallback does not add phantom peers',()=>{
 const c=roster(3);c.players[1].mode='bot';const a=room(c);assert.deepEqual(a.preview().availableColors,['gold','green']);assert.throws(()=>join(a,'g','blue'),/color_taken/);assert.throws(()=>join(a,'g','marble'),/color_taken/);join(a,'g','green');assert.equal(a.state.players.length,3);assert.equal(a.slots[2].color,'green');assert.equal(a.members.size,2);assert.equal(a.preview().availableColors.length,0);
});
test('concurrent claim and stale host edits cannot steal an admitted player',()=>{
 const a=room(roster(2));join(a,'g','blue');assert.throws(()=>join(a,'x','blue'),/room_full/);assert.throws(()=>a.configure(roster(2)),/seat_occupied/);assert.equal(a.slot('p2').controller,'p2');assert.equal(a.members.size,2);
});
test('strict invitation seats retain their original wait-for-guest behavior',()=>{
 const c=roster(2);c.players[1].mode='online';const a=room(c);assert.equal(a.start(c).status,'waiting');assert.equal(join(a,'g','blue').room.status,'playing');
});
import {JSDOM} from 'jsdom';
import {mountSetup} from '../ui/visual-setup.mjs';
const tick=()=>new Promise(r=>setTimeout(r,5));
test('setup advertises a real room automatically and starts without waiting for a guest',async()=>{
 const dom=new JSDOM('<body/>',{url:'https://a7sncom.github.io/yakolak/',pretendToBeVisual:true});const w=dom.window,events=[];
 w.localStorage.setItem('yakolak-visitor-v1',JSON.stringify({name:'أحمد',phone:'0551234567'}));w.yakolakVisualSetupAction=s=>events.push(JSON.parse(s));let a,prepared=0,started=0;
 const client={subscribe(){},async prepareHost(c){prepared++;a=room(c);this.role='host';this.code='007';return a.snapshot()},async dispatch(k,p){assert.equal(k,'create');started++;return {ok:true,room:a.start({players:p.players,rounds:p.targetRounds})}}};
 const api=mountSetup(w.document,w,client);api.open({online:true});const q=s=>w.document.querySelector(s);
 q('.yk-entry button').click();q('[data-color=marble]').click();q('.yk-confirm').click();q('.yk-counts button').click();await tick();
 assert.equal(prepared,1);assert.equal(q('.yk-room-code').textContent,'007');assert.equal(q('.yk-sharing').disabled,false);
 q('[data-color=blue]').click();assert.deepEqual([...w.document.querySelectorAll('.yk-menu-item')].map(x=>x.textContent),['لاعب','كمبيوتر']);
 w.document.querySelector('.yk-menu-item').click();q('input[aria-label="اسم اللاعب"]').value='ريم';q('form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
 assert.equal(a.slot('p2').joinable,true);assert.equal(a.slot('p2').mode,'local');q('.yk-start').click();q('.yk-rounds button').click();await tick();
 assert.equal(started,1);assert.equal(a.snapshot().status,'playing');assert.equal(events.find(e=>e.action==='start').automatic_room,true);dom.window.close();
});
test('failed public signaling never invents a room and preserves native local play',async()=>{
 const dom=new JSDOM('<body/>',{url:'https://a7sncom.github.io/yakolak/',pretendToBeVisual:true});const w=dom.window,events=[];w.yakolakVisualSetupAction=s=>events.push(JSON.parse(s));
 const client={subscribe(){},async prepareHost(){throw new Error('signaling_unavailable')},async dispatch(){assert.fail('failed room must not start online')}};
 const api=mountSetup(w.document,w,client);api.open({online:true,resume:roster(2)});await tick();
 const q=s=>w.document.querySelector(s);assert.equal(q('.yk-room-code').textContent,'—');assert.equal(q('.yk-sharing').disabled,true);q('.yk-start').click();q('.yk-rounds button').click();await tick();assert.equal(events.find(e=>e.action==='start').automatic_room,false);dom.window.close();
});

test('a guest leaving setup restores the same human seat to local play',()=>{
 const a=room(roster(2));let r=join(a,'g','blue').room;
 a.configure({rounds:5,players:r.slots.map(s=>({...s,label:s.name}))});
 r=a.command('g','leave',{epoch:a.epoch,mutationId:'l'.repeat(48),version:a.state.version});
 assert.equal(a.slot('p2').mode,'local');assert.equal(a.slot('p2').controller,'p1');assert.equal(a.preview().availableColors.includes('blue'),true);assert.equal(r.players.length,2);
 assert.equal(a.start({rounds:3,players:r.slots.map(s=>({...s,label:s.name}))}).status,'playing');
});
