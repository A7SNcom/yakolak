import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RoomAuthority} from '../ui/p2p-authority.mjs';
import {JSDOM} from 'jsdom';
import {mountSetup,restoreSetup,configuration} from '../ui/visual-setup.mjs';

const roster=(count=4)=>({rounds:3,players:Array.from({length:count},(_,i)=>({color:['marble','blue','gold','green'][i],label:`local-${i}`,mode:'local',joinable:i>0}))});
const room=config=>new RoomAuthority({code:'007',epoch:'e'.repeat(48),peerId:'host',token:'h'.repeat(48),config});
const join=(a,id,color)=>a.join(id,{token:id.repeat(48).slice(0,48),color,name:'ضيف '+id});
const tick=()=>new Promise(r=>setTimeout(r,5));

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

test('new room opens three online seats and accepts a mixed online, computer, and same-device roster',async()=>{
 const dom=new JSDOM('<body/>',{url:'https://a7sncom.github.io/yakolak/',pretendToBeVisual:true});const w=dom.window,events=[];
 w.localStorage.setItem('yakolak-visitor-v1',JSON.stringify({name:'أحمد',phone:'0551234567'}));w.yakolakVisualSetupAction=s=>events.push(JSON.parse(s));let a,prepared=0,started=0,listener;
 const client={role:'',code:'',subscribe(fn){listener=fn},async prepareHost(c){prepared++;if(a)a.configure(c);else a=room(c);this.role='host';this.code='007';return a.snapshot()},async dispatch(k,p){assert.equal(k,'create');started++;return {ok:true,room:a.start({players:p.players,rounds:p.targetRounds})}}};
 const api=mountSetup(w.document,w,client);api.open({online:true});const q=s=>w.document.querySelector(s);
 q('.yk-entry button').click();q('[data-color=marble]').click();q('.yk-confirm').click();await tick();
 assert.ok(prepared>=1);assert.equal(q('#yakolakVisualSetup').dataset.step,'ready');assert.equal(q('.yk-room-code').textContent,'007');assert.equal(q('.yk-sharing').disabled,false);
 assert.equal([...w.document.querySelectorAll('.yk-seat-status')].filter(x=>x.textContent==='فاضي').length,3);
 const admitted=join(a,'g','blue').room;listener({role:'host',room:admitted});
 assert.equal(q('[data-color=blue] .yk-seat-status').textContent,'ضيف g');
 q('[data-color=gold]').click();assert.deepEqual([...w.document.querySelectorAll('.yk-menu-item')].map(x=>x.textContent),['كمبيوتر','لاعب في نفس الجهاز']);q('.yk-menu-item:first-child').click();await tick();
 q('[data-color=green]').click();q('.yk-menu-item').at(-1).click();await tick();assert.equal(q('[data-color=green] .yk-seat-status').textContent,'لاعب');
 q('.yk-start').click();q('.yk-rounds button').click();await tick();
 const startedEvent=events.find(e=>e.action==='start');assert.equal(started,1);assert.equal(a.snapshot().status,'playing');assert.equal(startedEvent.automatic_room,true);assert.equal(startedEvent.players.length,4);assert.equal(startedEvent.players[1].label,'ضيف g');assert.equal(startedEvent.players[2].label,'كمبيوتر');assert.equal(startedEvent.players[3].label,'لاعب');dom.window.close();
});

test('failed public signaling never invents a room and preserves native local play',async()=>{
 const dom=new JSDOM('<body/>',{url:'https://a7sncom.github.io/yakolak/',pretendToBeVisual:true});const w=dom.window,events=[];w.yakolakVisualSetupAction=s=>events.push(JSON.parse(s));
 const client={subscribe(){},async prepareHost(){throw new Error('signaling_unavailable')},async dispatch(){assert.fail('a fully local match must not use online dispatch')}};
 const api=mountSetup(w.document,w,client);api.open({online:true,resume:roster(2)});await tick();
 const q=s=>w.document.querySelector(s);assert.equal(q('.yk-room-code').textContent,'—');assert.equal(q('.yk-sharing').disabled,true);
 q('[data-color=gold]').click();q('.yk-menu-item:first-child').click();await tick();q('[data-color=green]').click();q('.yk-menu-item').at(-1).click();await tick();
 q('.yk-start').click();q('.yk-rounds button').click();await tick();assert.equal(events.find(e=>e.action==='start').automatic_room,false);dom.window.close();
});

test('a guest leaving setup restores the same human seat to local play',()=>{
 const a=room(roster(2));let r=join(a,'g','blue').room;
 a.configure({rounds:5,players:r.slots.map(s=>({...s,label:s.name}))});
 r=a.command('g','leave',{epoch:a.epoch,mutationId:'l'.repeat(48),version:a.state.version});
 assert.equal(a.slot('p2').mode,'local');assert.equal(a.slot('p2').controller,'p1');assert.equal(a.preview().availableColors.includes('blue'),true);assert.equal(r.players.length,2);
 assert.equal(a.start({rounds:3,players:r.slots.map(s=>({...s,label:s.name}))}).status,'playing');
});

test('returning from an automatic room restores simple labels and releases old guest ownership',()=>{
 const state=restoreSetup({rounds:3,players:[{seat:'p1',color:'marble',mode:'local',kind:'local',label:'أحمد'},{seat:'p2',color:'blue',mode:'online',kind:'bot',label:'كمبيوتر أزرق'},{seat:'p3',color:'gold',mode:'online',kind:'online',controller:'p3',label:'ريم'}]});
 const c=configuration(state);assert.deepEqual(c.players.map(p=>p.mode),['local','bot','local','online']);assert.deepEqual(c.players.map(p=>p.label),['أحمد','كمبيوتر','لاعب','فاضي']);assert.equal(c.players[2].device_owner,'p1');
});

test('host can leave from settings and a stale room preparation cannot reopen setup',async()=>{
 const dom=new JSDOM('<body/>',{url:'https://a7sncom.github.io/yakolak/',pretendToBeVisual:true});const w=dom.window,events=[];
 w.yakolakVisualSetupAction=s=>events.push(JSON.parse(s));let finish,leaves=0;
 const client={role:'host',code:'007',subscribe(){},prepareHost(){return new Promise(resolve=>{finish=resolve})},async leave(){leaves++;this.role='';this.code='';}};
 const api=mountSetup(w.document,w,client);api.open({online:true,resume:roster(2)});await tick();
 api.room({code:'007',players:[],slots:[]});w.document.querySelector('.yk-settings-toggle').click();
 const exit=w.document.querySelector('.yk-setting-leave');assert.ok(exit);exit.click();await tick();
 assert.equal(leaves,1);assert.equal(w.document.querySelector('#yakolakVisualSetup').dataset.step,'entry');
 finish({code:'007',players:[],slots:[]});await tick();assert.equal(w.document.querySelector('#yakolakVisualSetup').dataset.step,'entry');assert.equal(w.document.querySelector('.yk-room-code').textContent,'—');
 assert.equal(events.some(e=>e.action==='start'),false);dom.window.close();
});
