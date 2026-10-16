import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomAuthority,TURN_MS,CONTINUE_MS,BOT_MS} from '../ui/p2p-authority.mjs';
import {TrysteroClient} from '../ui/online-trystero.mjs';
import {COLORS,validatePlacement} from '../api/game-rules.js';
const epoch='e'.repeat(48),token='h'.repeat(48);let seq=0;
function setup(modes=['local','online']){
 let now=100000;const config={rounds:3,players:modes.map((mode,i)=>({mode,color:COLORS[i],label:'اسم '+i}))};
 const a=new RoomAuthority({code:'007',epoch,token,peerId:'host',config,now:()=>now});
 return {a,config,step(ms){now+=ms;for(const m of a.members.values())if(m.connected)m.lastSeen=now;},join(i=1,color){return a.join('peer'+i,{token:String(i).repeat(48),name:'ضيف '+i,epoch,color})}};
}
const intent=(a,extra={})=>({epoch,version:a.state.version,mutationId:String(++seq).padStart(48,'0'),...extra});
const move=(a,peer,cell,size='small',seat)=>a.command(peer,'move',intent(a,{cell,size,seat}));
function finish(a){for(const [peer,cell,size] of [['host',0,'small'],['peer1',8,'large'],['host',1,'small'],['peer1',7,'large'],['host',2,'small']])move(a,peer,cell,size)}
test('preview reserves no seat; admission atomically chooses any free color and preserves it on reconnect',()=>{
 const {a,join}=setup();const before=a.state.version;
 assert.deepEqual(a.preview().availableColors,COLORS.slice(1));assert.equal(a.members.size,1);assert.equal(a.state.version,before);
 const admitted=join(1,'green');assert.equal(admitted.room.players[1].color,'green');assert.equal(a.preview().availableColors.length,0);
 a.connected('peer1',false);assert.equal(a.join('returned',{token:'1'.repeat(48),epoch,color:'blue'}).room.players[1].color,'green');
});
test('concurrent color choices cannot duplicate a color; canonical seat order survives mixed roster',()=>{
 const {a,join}=setup(['local','online','local','online']);
 assert.deepEqual(a.state.players.map(p=>p.seat),['p1','p3']);
 assert.throws(()=>join(1,'gold'),/color_taken/);join(1,'green');
 assert.throws(()=>join(2,'green'),/color_taken/);join(2,'blue');
 assert.deepEqual(a.state.players.map(p=>p.seat),['p1','p2','p3','p4']);
 assert.deepEqual(a.snapshot().players.map(p=>p.controller),['p1','p2','p1','p4']);
});
test('host controls local co-players; guests cannot impersonate any other seat or a bot',()=>{
 const {a,config,join,step}=setup(['local','online','local','bot']);join();a.start(config);
 move(a,'host',0);move(a,'peer1',8,'large');
 assert.throws(()=>move(a,'peer1',1,'small','p3'),/unauthorized/);
 move(a,'host',1,'small','p3');assert.equal(a.state.lastMove.seat,'p3');
 assert.throws(()=>move(a,'host',2,'small','p4'),/unauthorized/);
 assert.equal(a.advance(),false);const before=structuredClone(a.state.board);step(BOT_MS);assert.equal(a.advance(),true);
 assert.equal(a.state.lastMove.seat,'p4');assert.equal(validatePlacement(before,'green',a.state.lastMove),null);assert.equal(a.state.moveNumber,4);
 assert.equal(a.advance(),false);
});
test('all 2/3/4-seat combinations admit only real guests and seed bots/locals without ghost peers',()=>{
 for(const modes of [['local','online'],['local','bot','online'],['local','local','online'],['local','online','bot','local'],['local','bot','online','online']]){
  const f=setup(modes);let n=0;for(const [i,mode] of modes.entries())if(mode==='online')f.join(++n,COLORS[i]);
  f.a.start(f.config);assert.equal(f.a.state.status,'playing');assert.equal(f.a.members.size,1+n);assert.equal(f.a.state.players.length,modes.length);assert.equal(f.a.snapshot().paused,false);
 }
});
test('host turn clock skips once at 30 seconds, presence never resets it and late moves are rejected',()=>{
 const {a,config,join,step}=setup();join();a.start(config);const deadline=a.snapshot().turnDeadlineAt;
 step(11000);a.command('peer1','ping',{epoch});assert.equal(a.snapshot().turnDeadlineAt,deadline);assert.equal(a.snapshot().turnRemainingMs,19000);
 step(TURN_MS-11000-1);assert.equal(a.advance(),false);step(1);
 assert.throws(()=>move(a,'host',0),/turn_expired/);assert.equal(a.advance(),true);const version=a.state.version;
 assert.equal(a.state.turnIndex,1);assert.equal(a.state.timedOutSeat,'p1');assert.equal(a.snapshot().turnRemainingMs,TURN_MS);assert.equal(a.advance(),false);assert.equal(a.state.version,version);
});
test('disconnect freezes remaining turn and bot time, reconnect resumes the same remaining duration',()=>{
 const {a,config,join,step}=setup(['local','bot','online']);join();a.start(config);move(a,'host',0);step(200);
 a.connected('peer1',false);const remaining=a.snapshot().turnRemainingMs;step(5000);a.advance();assert.equal(a.state.moveNumber,1);assert.equal(a.snapshot().turnRemainingMs,remaining);
 a.connected('peer1',true);assert.equal(a.snapshot().turnRemainingMs,remaining);step(BOT_MS-200-1);assert.equal(a.advance(),false);step(1);assert.equal(a.advance(),true);assert.equal(a.state.lastMove.seat,'p2');
});
test('continue is exact-once at ten seconds; a vote does not extend the common deadline',()=>{
 const {a,config,join,step}=setup();join();a.start(config);finish(a);
 const due=a.snapshot().continueDeadlineAt;step(4000);a.command('host','rematch',intent(a));assert.equal(a.state.round,1);assert.equal(a.snapshot().continueDeadlineAt,due);
 step(CONTINUE_MS-4000-1);assert.equal(a.advance(),false);step(1);assert.equal(a.advance(),true);assert.equal(a.state.round,2);assert.equal(a.state.status,'playing');
 const version=a.state.version;assert.equal(a.advance(),false);assert.equal(a.state.version,version);
});
test('one host-device vote includes its local humans and bots, but waits for the actual guest',()=>{
 const {a,config,join}=setup(['local','local','bot','online']);join();a.start(config);
 a.state={...a.state,status:'finished',completedRounds:1,rematch:{p1:false,p2:false,p3:false,p4:false}};a.commit(a.state);
 assert.equal(a.state.rematch.p3,true);a.command('host','rematch',intent(a));assert.deepEqual(a.state.rematch,{p1:true,p2:true,p3:true,p4:false});
 a.command('peer1','rematch',intent(a));assert.equal(a.state.status,'playing');assert.equal(a.state.round,2);
});
test('completed match never restarts on a timer; every human device must consent',()=>{
 const {a,config,join,step}=setup();join();a.start(config);a.state.scores.p1=2;finish(a);
 assert.equal(a.state.matchComplete,true);assert.equal(a.snapshot().continueDeadlineAt,0);step(60000);assert.equal(a.advance(),false);assert.equal(a.state.status,'finished');
 a.command('host','rematch',intent(a));assert.equal(a.state.status,'finished');a.command('peer1','rematch',intent(a));assert.equal(a.state.status,'playing');assert.equal(a.state.scores.p1,0);
});
test('guest display projects host deadlines using a monotonic anchor, independent of client wall clock',()=>{
 const {a,config,join}=setup();join();a.start(config);const client=Object.create(TrysteroClient.prototype);
 client.session={role:'guest',snapshot:a.snapshot(),clockAnchor:{host:100000,oneWay:40,local:performance.now()-1000}};
 const room=client.currentSnapshot();assert.ok(room.turnRemainingMs<=28960&&room.turnRemainingMs>28900);
 client.session.snapshot.paused=true;client.session.snapshot.turnRemainingMs=12345;assert.equal(client.currentSnapshot().turnRemainingMs,12345);
});
