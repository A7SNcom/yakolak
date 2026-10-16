import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomAuthority,validCode,normalizeCode,cleanName,validateRoster} from '../ui/p2p-authority.mjs';
import {COLORS} from '../api/game-rules.js';
const epoch='e'.repeat(48),hostToken='h'.repeat(48),guestToken='g'.repeat(48);
const config=(count=2)=>({rounds:3,players:COLORS.slice(0,count).map((color,i)=>({color,mode:i?'online':'local',label:i?'':'أحمد'}))});
function setup(count=2){let time=100000;const a=new RoomAuthority({code:'007',epoch,peerId:'host',token:hostToken,config:config(count),now:()=>time});return {a,advance:ms=>{time+=ms}}}
let sequence=0;
const intent=(a,extra={})=>({epoch,version:a.state.version,mutationId:String(++sequence).padStart(48,'0'),...extra});
const join=(a,peer='guest',token=guestToken)=>a.join(peer,{token,name:'ريم',epoch});
test('three digits preserve leading zeroes and normalize Arabic; no partial/link coercion',()=>{
 for(const code of ['000','007','999','٠٠٧','۰۰۷'])assert.ok(validCode(code));
 for(const code of ['','00','0000','7','00x','1 23','?room=123'])assert.ok(!validCode(code));
 assert.equal(normalizeCode(' ٠٠٧ '),'007');assert.equal(cleanName('\u202eريم\u0000'),'ريم');
 assert.equal(validateRoster({...config(),players:[{color:COLORS[0],mode:'local'},{color:COLORS[1],mode:'bot'}]})[1].controller,'p1');
});
test('real admissions assign configured seats and names; snapshots never leak credentials',()=>{
 const {a}=setup(3);const r=join(a);assert.equal(r.seat,'p2');assert.equal(r.room.status,'waiting');
 assert.equal(r.room.players[1].name,'ريم');assert.equal(r.room.players[1].color,COLORS[1]);
 assert.throws(()=>join(a,'guest', 'x'.repeat(48)),/seat_in_use/);
 join(a,'third','t'.repeat(48));assert.equal(a.state.status,'waiting');a.start(config(3));assert.equal(a.state.status,'playing');
 assert.throws(()=>join(a,'fourth','f'.repeat(48)),/room_not_waiting/);
 const snapshot=JSON.stringify(a.snapshot());for(const secret of [hostToken,guestToken,'peerId','token','_mutations'])assert.ok(!snapshot.includes(secret));
});
test('only admitted channel owner can move; host applies canonical rules and exact-once immutable IDs',()=>{
 const {a}=setup();join(a);a.start(config());
 assert.throws(()=>a.command('stranger','move',intent(a,{cell:0,size:'small',seat:'p1'})),/unauthorized/);
 assert.throws(()=>a.command('guest','move',intent(a,{cell:0,size:'small',seat:'p1'})),/unauthorized/);
 assert.throws(()=>a.command('host','move',intent(a,{cell:99,size:'small'})),/invalid_move/);
 const move=intent(a,{cell:0,size:'small',seat:'p1',color:COLORS[1],board:{}}),first=a.command('host','move',move);
 assert.equal(first.board[0].small,COLORS[0]);assert.equal(first.moveNumber,1);
 assert.deepEqual(a.command('host','move',move),first);
 assert.throws(()=>a.command('host','move',{...move,cell:1}),/invalid_mutation/);
 assert.throws(()=>a.command('guest','move',intent(a,{version:move.version,cell:1,size:'small'})),/version_conflict/);
 assert.throws(()=>a.command('guest','move',intent(a,{cell:0,size:'small'})),/occupied_slot/);
 assert.throws(()=>a.command('guest','edit',intent(a,{changes:{targetRounds:5}})),/unauthorized/);
 a.command('guest','move',intent(a,{cell:8,size:'large'}));assert.equal(a.state.turnIndex,0);
});
test('disconnection pauses moves, stable identity recovers seat, expiry cancels active match',()=>{
 const {a,advance}=setup();join(a);a.start(config());a.connected('guest',false);
 assert.equal(a.snapshot().paused,true);assert.throws(()=>a.command('host','move',intent(a,{cell:0,size:'small'})),/player_disconnected/);
 const before=a.state.version;join(a,'replacement');assert.equal(a.snapshot().paused,false);assert.ok(a.state.version>before);
 assert.throws(()=>join(a,'different'),/seat_in_use/);
 assert.throws(()=>a.join('replacement',{token:guestToken,epoch:'other'}),/room_closed/);
 assert.throws(()=>a.command('replacement','ping',{epoch:'other'}),/room_closed/);
 advance(12001);assert.ok(a.expire());assert.equal(a.snapshot().paused,true);
 a.command('replacement','ping',{epoch});assert.equal(a.snapshot().paused,false);
 a.connected('replacement',false);advance(60001);a.expire();assert.equal(a.state.status,'cancelled');
});
test('waiting slot expires safely and host cannot change a joined seat color',()=>{
 const {a,advance}=setup(3);join(a);
 const c=config(3);[c.players[1].color,c.players[2].color]=[c.players[2].color,c.players[1].color];
 assert.throws(()=>a.configure(c),/seat_occupied/);
 a.connected('guest',false);advance(60001);a.expire();assert.equal(a.state.players.length,1);assert.equal(join(a,'new','n'.repeat(48)).seat,'p2');
});
test('canonical wins, consent and round restart run at host',()=>{
 const {a}=setup();join(a);a.start(config());
 for(const [peer,cell,size] of [['host',0,'small'],['guest',8,'large'],['host',1,'small'],['guest',7,'large'],['host',2,'small']])a.command(peer,'move',intent(a,{cell,size}));
 assert.equal(a.state.status,'finished');assert.equal(a.state.scores.p1,1);
 a.command('host','rematch',intent(a));assert.equal(a.state.round,1);
 a.command('guest','rematch',intent(a));assert.equal(a.state.round,2);assert.equal(a.state.status,'playing');assert.equal(a.state.turnIndex,1);
});
