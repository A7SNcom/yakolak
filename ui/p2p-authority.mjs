import {COLORS,isValidWinsToMatch} from '../api/game-rules.js';
import {createState,joinState,applyMove,rematchState,leaveState,applyRoomEdit} from '../api/room-state.js';

export const P2P_PROTOCOL=1;
export const normalizeCode=value=>String(value??'').replace(/[٠-٩]/g,x=>String(x.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,x=>String(x.charCodeAt(0)-0x6f0)).trim();
export const validCode=value=>/^\d{3}$/.test(normalizeCode(value));
export const cleanName=value=>String(value??'').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').trim().slice(0,24);
const fail=code=>{throw new Error(code)};
const clone=x=>structuredClone(x);
const credential=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{32,96}$/.test(x);
export function validateRoster(config){
  const players=config?.players;
  if(!Array.isArray(players)||players.length<2||players.length>4)fail('invalid_player_count');
  if(!isValidWinsToMatch(config.rounds))fail('invalid_round_count');
  if(players.some((p,i)=>!p||!COLORS.includes(p.color)||p.mode!==(i?'online':'local'))||new Set(players.map(p=>p.color)).size!==players.length)fail('mixed_not_supported');
  return players.map((p,i)=>({seat:`p${i+1}`,color:p.color,name:i?'':cleanName(p.label||p.name)||'لاعب',mode:i?'online':'local'}));
}

// The only game authority. Remote packets never supply their seat, color,
// board or scores: the encrypted channel's admitted peer owns exactly one seat.
export class RoomAuthority{
  constructor({code,epoch,peerId,token,config,now=Date.now}){
    if(!validCode(code)||!credential(token))fail('invalid_room_code');
    this.now=now;this.code=normalizeCode(code);this.epoch=epoch;this.owner=peerId;this.slots=validateRoster(config);this.started=false;this.mutations=new Map();this.members=new Map();
    this.state={...createState(this.slots[0].color,this.slots.length,config.rounds),code:this.code,epoch,transport:'trystero',version:1};
    this.members.set(token,{token,seat:'p1',peerId,name:this.slots[0].name,connected:true,lastSeen:now(),disconnectedAt:0});
    this.state.players[0].name=this.slots[0].name;
  }
  member(peerId){return [...this.members.values()].find(m=>m.peerId===peerId)}
  snapshot(){
    const state=clone(this.state);delete state._mutations;
    state.players=state.players.map(p=>{const m=[...this.members.values()].find(x=>x.seat===p.seat);return {...p,name:m?.name||'لاعب',connected:!!m?.connected}});
    state.paused=state.status==='playing'&&state.players.some(p=>!p.connected);
    state.slots=this.slots.map(s=>{const p=state.players.find(p=>p.seat===s.seat);return {...s,name:p?.name||s.name,connected:!!p?.connected}});
    return state;
  }
  bump(){this.state={...this.state,version:this.state.version+1};return this.snapshot()}
  join(peerId,request){
    if(!request||!credential(request.token))fail('unauthorized');
    if(request.epoch&&request.epoch!==this.epoch)fail('room_closed');
    let member=this.members.get(request.token);
    if(!member&&this.member(peerId))fail('seat_in_use');
    if(member){
      if(member.seat==='p1')fail('unauthorized');
      if(member.connected&&member.peerId!==peerId)fail('seat_in_use');
      member.peerId=peerId;member.connected=true;member.lastSeen=this.now();member.disconnectedAt=0;member.name=cleanName(request.name)||member.name;
      this.bump();return {room:this.snapshot(),seat:member.seat,token:request.token};
    }
    if(this.state.status!=='waiting')fail('room_not_waiting');
    const slot=this.slots.find(s=>!this.state.players.some(p=>p.seat===s.seat));if(!slot)fail('room_full');
    member={token:request.token,seat:slot.seat,peerId,name:cleanName(request.name)||'لاعب',connected:true,lastSeen:this.now(),disconnectedAt:0};
    this.state=joinState(this.state,slot.seat,slot.color);
    if(!this.started)this.state.status='waiting';
    this.members.set(request.token,member);this.bump();return {room:this.snapshot(),seat:slot.seat,token:request.token};
  }
  configure(config){
    const slots=validateRoster(config);
    if(this.started||this.state.status!=='waiting')fail('room_edit_forbidden');
    for(const p of this.state.players.slice(1))if(!slots.some(s=>s.seat===p.seat&&s.color===p.color))fail('seat_occupied');
    this.slots=slots;this.state.players[0].color=slots[0].color;
    const host=this.member(this.owner);host.name=slots[0].name;
    this.state.targetPlayers=slots.length;this.state.targetRounds=this.state.winsToMatch=Number(config.rounds);
    return this.bump();
  }
  start(config){
    if(this.started)return this.snapshot();
    this.configure(config);this.started=true;
    if(this.state.players.length===this.state.targetPlayers)this.state.status='playing';
    return this.bump();
  }
  connected(peerId,value){
    const m=this.member(peerId);if(!m||m.seat==='p1')return false;
    m.lastSeen=this.now();if(m.connected===value)return false;
    m.connected=value;m.disconnectedAt=value?0:this.now();this.bump();return true;
  }
  expire(){
    let changed=false;
    for(const [token,m] of this.members){
      if(m.seat==='p1')continue;
      if(m.connected&&this.now()-m.lastSeen>12000){this.connected(m.peerId,false);changed=true;}
      if(!m.connected&&this.now()-m.disconnectedAt>60000){
        this.state=leaveState(this.state,m.seat);this.members.delete(token);this.bump();changed=true;
      }
    }
    return changed;
  }
  command(peerId,kind,payload){
    const m=this.member(peerId);if(!m)fail('unauthorized');
    if(!payload||payload.epoch!==this.epoch)fail('room_closed');
    if(kind==='ping'){this.connected(peerId,true);m.lastSeen=this.now();return this.snapshot()}
    if(!['move','rematch','leave','edit'].includes(kind))fail('invalid_action');
    const mutationId=payload.mutationId;
    if(!credential(mutationId))fail('invalid_mutation');
    const key=m.seat+':'+mutationId,signature=JSON.stringify([kind,payload.version,payload.cell,payload.size,payload.changes]);
    const prior=this.mutations.get(key);
    if(prior){if(prior!==signature)fail('invalid_mutation');return this.snapshot()}
    if(payload.version!==this.state.version)fail('version_conflict');
    if(this.snapshot().paused&&kind!=='leave')fail('player_disconnected');
    let state;
    if(kind==='move')state=applyMove(this.state,m.seat,payload);
    if(kind==='rematch')state=rematchState(this.state,m.seat);
    if(kind==='leave')state=leaveState(this.state,m.seat);
    if(kind==='edit'){
      if(peerId!==this.owner)fail('unauthorized');
      state=applyRoomEdit(this.state,m.seat,payload.changes);
      this.slots=this.slots.slice(0,state.targetPlayers);while(this.slots.length<state.targetPlayers)this.slots.push({seat:`p${this.slots.length+1}`,color:COLORS.find(c=>!this.slots.some(s=>s.color===c)),name:'',mode:'online'});
      this.slots[0].color=state.players[0].color;
    }
    this.state=state;this.mutations.set(key,signature);
    if(kind==='leave'&&m.seat!=='p1'&&state.status==='waiting')this.members.delete(m.token);
    return this.bump();
  }
}
