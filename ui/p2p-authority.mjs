import {COLORS,SIZES,RULES,isValidWinsToMatch,validatePlacement,winner} from '../api/game-rules.js';
import {createState,joinState,applyMove,rematchState,leaveState,applyRoomEdit,nextPlayablePlayer,finishRound} from '../api/room-state.js';
export const P2P_PROTOCOL=1;
export const TURN_MS=RULES.turnTimeoutMs??30000, CONTINUE_MS=RULES.continueTimeoutMs??10000, BOT_MS=RULES.botThinkMs??650;
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
  if(players[0]?.mode!=='local'||players.some(p=>!p||!COLORS.includes(p.color)||!['local','bot','online'].includes(p.mode))||new Set(players.map(p=>p.color)).size!==players.length)fail('invalid_roster');
  return players.map((p,i)=>({seat:`p${i+1}`,color:p.color,name:cleanName(p.label||p.name)||(p.mode==='bot'?'كمبيوتر':'لاعب'),mode:p.mode,controller:p.mode==='online'?`p${i+1}`:'p1'}));
}
// One host owns rules, bot decisions, deadlines and seat permissions. Peers
// submit intentions only; local co-players share their device's controller.
export class RoomAuthority{
  constructor({code,epoch,peerId,token,config,now=Date.now}){
    if(!validCode(code)||!credential(token))fail('invalid_room_code');
    this.now=now;this.code=normalizeCode(code);this.epoch=epoch;this.owner=peerId;this.slots=validateRoster(config);this.started=false;this.mutations=new Map();this.members=new Map();
    this.clock={key:'',deadline:0,started:0,remaining:TURN_MS,paused:false,botDue:0,botRemaining:BOT_MS,continueKey:'',continueDeadline:0,continueStarted:0};
    this.state={...createState(this.slots[0].color,this.slots.length,config.rounds),code:this.code,epoch,transport:'trystero',version:1,turnSerial:0};
    this.members.set(token,{token,seat:'p1',peerId,name:this.slots[0].name,connected:true,lastSeen:now(),disconnectedAt:0});
    this.seedRoster();this.syncTimers();
  }
  member(peerId){return [...this.members.values()].find(m=>m.peerId===peerId)}
  slot(seat){return this.slots.find(s=>s.seat===seat)}
  memberForSeat(seat){const controller=this.slot(seat)?.controller;return [...this.members.values()].find(m=>m.seat===controller)}
  paused(){return this.state.status==='playing'&&this.state.players.some(p=>!this.memberForSeat(p.seat)?.connected)}
  seedRoster(){
    const occupied=this.slots.filter(s=>s.mode!=='online'||[...this.members.values()].some(m=>m.seat===s.seat));
    this.state.players=occupied.map(s=>({seat:s.seat,color:s.color}));
    this.state.scores=Object.fromEntries(occupied.map(s=>[s.seat,this.state.scores[s.seat]||0]));
    this.state.rematch=Object.fromEntries(occupied.map(s=>[s.seat,false]));
    this.state.targetPlayers=this.slots.length;
  }
  preview(){
    const availableColors=COLORS.filter(c=>!this.state.players.some(p=>p.color===c));
    return {code:this.code,epoch:this.epoch,status:this.state.status,availableColors:this.state.status==='waiting'&&this.slots.some(s=>s.mode==='online'&&!this.state.players.some(p=>p.seat===s.seat))?availableColors:[],players:this.snapshot().players};
  }
  snapshot(){
    const state=clone(this.state);delete state._mutations;
    state.players=state.players.map(p=>{const slot=this.slot(p.seat),member=this.memberForSeat(p.seat);return {...p,mode:slot.mode,controller:slot.controller,name:slot.mode==='online'||p.seat==='p1'?member?.name||slot.name:slot.name,connected:!!member?.connected}});
    state.paused=this.paused();state.slots=this.slots.map(s=>{const p=state.players.find(p=>p.seat===s.seat);return {...s,name:p?.name||s.name,connected:!!p?.connected}});
    const now=this.now(),c=this.clock;
    return {...state,serverNow:now,turnStartedAt:c.started,turnDeadlineAt:c.deadline,turnRemainingMs:state.paused?c.remaining:Math.max(0,c.deadline-now),continueStartedAt:c.continueStarted,continueDeadlineAt:c.continueDeadline,continueRemainingMs:Math.max(0,c.continueDeadline-now)};
  }
  syncTimers(){
    const c=this.clock,now=this.now(),state=this.state;
    if(state.status==='playing'){
      const key=`${state.round}:${state.moveNumber}:${state.turnIndex}:${state.turnSerial}`;
      if(c.key!==key){c.key=key;c.started=now;c.remaining=TURN_MS;c.deadline=now+TURN_MS;c.botDue=now+BOT_MS;c.botRemaining=BOT_MS;c.paused=false}
      const paused=this.paused();
      if(paused&&!c.paused){c.remaining=Math.max(0,c.deadline-now);c.botRemaining=Math.max(0,c.botDue-now);c.deadline=0;c.botDue=0;c.paused=true}
      if(!paused&&c.paused){c.deadline=now+Math.max(1,c.remaining);c.botDue=now+Math.max(1,c.botRemaining);c.started=c.deadline-TURN_MS;c.paused=false}
    }else{c.key='';c.deadline=0;c.started=0;c.botDue=0;c.paused=false}
    if(state.status==='finished'&&!state.matchComplete){
      const key=`${state.round}:${state.completedRounds}`;
      if(c.continueKey!==key){c.continueKey=key;c.continueStarted=now;c.continueDeadline=now+CONTINUE_MS}
    }else{c.continueKey='';c.continueStarted=0;c.continueDeadline=0}
  }
  bump(){this.state={...this.state,version:this.state.version+1};this.syncTimers();return this.snapshot()}
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
    const free=this.slots.filter(s=>s.mode==='online'&&!this.state.players.some(p=>p.seat===s.seat));
    if(!free.length)fail('room_full');
    const color=request.color||free[0].color;
    if(!COLORS.includes(color))fail('invalid_color');
    if(this.state.players.some(p=>p.color===color))fail('color_taken');
    const slot=free.find(s=>s.color===color)||free[0];slot.color=color;
    member={token:request.token,seat:slot.seat,peerId,name:cleanName(request.name)||'لاعب',connected:true,lastSeen:this.now(),disconnectedAt:0};
    this.state=joinState(this.state,slot.seat,color);
    this.state.players.sort((a,b)=>Number(a.seat.slice(1))-Number(b.seat.slice(1)));
    if(!this.started)this.state.status='waiting';
    this.members.set(request.token,member);this.bump();return {room:this.snapshot(),seat:slot.seat,token:request.token};
  }
  configure(config){
    const slots=validateRoster(config);
    if(this.started||this.state.status!=='waiting')fail('room_edit_forbidden');
    for(const member of this.members.values())if(member.seat!=='p1'&&!slots.some(s=>s.seat===member.seat&&s.mode==='online'&&s.color===this.slot(member.seat)?.color))fail('seat_occupied');
    this.slots=slots;this.member(this.owner).name=slots[0].name;
    this.state.targetRounds=this.state.winsToMatch=Number(config.rounds);this.seedRoster();return this.bump();
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
      if(m.connected&&this.now()-m.lastSeen>12000){this.connected(m.peerId,false);changed=true}
      if(!m.connected&&this.now()-m.disconnectedAt>60000){this.state=leaveState(this.state,m.seat);this.members.delete(token);this.bump();changed=true}
    }
    return changed;
  }
  acknowledge(controller){
    for(const player of [...this.state.players]){
      const slot=this.slot(player.seat);
      if(this.state.status==='finished'&&(slot.mode==='bot'||slot.controller===controller)&&!this.state.rematch[player.seat])this.state=rematchState(this.state,player.seat);
    }
  }
  commit(next,turnChanged=false){
    this.state={...next,turnSerial:(this.state.turnSerial||0)+(turnChanged?1:0)};
    if(this.state.status==='finished')for(const p of [...this.state.players])if(this.slot(p.seat).mode==='bot'&&!this.state.rematch[p.seat])this.state=rematchState(this.state,p.seat);
    return this.bump();
  }
  command(peerId,kind,payload){
    const member=this.member(peerId);if(!member)fail('unauthorized');
    if(!payload||payload.epoch!==this.epoch)fail('room_closed');
    if(kind==='ping'){this.connected(peerId,true);member.lastSeen=this.now();return this.snapshot()}
    if(!['move','rematch','leave','edit'].includes(kind))fail('invalid_action');
    const mutationId=payload.mutationId;if(!credential(mutationId))fail('invalid_mutation');
    const seat=kind==='move'?(payload.seat||member.seat):member.seat;
    if(this.slot(seat)?.controller!==member.seat)fail('unauthorized');
    const key=member.seat+':'+mutationId,signature=JSON.stringify([kind,payload.version,seat,payload.cell,payload.size,payload.changes]);
    const prior=this.mutations.get(key);if(prior){if(prior!==signature)fail('invalid_mutation');return this.snapshot()}
    if(payload.version!==this.state.version)fail('version_conflict');
    if(this.paused()&&kind!=='leave')fail('player_disconnected');
    let next=this.state;
    if(kind==='move'){
      if(this.slot(seat).mode==='bot')fail('unauthorized');
      if(this.clock.deadline&&this.now()>=this.clock.deadline)fail('turn_expired');
      next=applyMove(this.state,seat,payload);
    }
    if(kind==='rematch'){
      if(this.state.status!=='finished')fail('round_not_finished');
      this.acknowledge(member.seat);next=this.state;
    }
    if(kind==='leave')next=leaveState(this.state,member.seat);
    if(kind==='edit'){
      if(peerId!==this.owner)fail('unauthorized');
      next=applyRoomEdit(this.state,member.seat,payload.changes);
      if(next.targetPlayers!==this.slots.length||payload.changes?.color){
        const roster=this.slots.slice(0,next.targetPlayers).map(s=>({...s,label:s.name}));
        while(roster.length<next.targetPlayers)roster.push({mode:'online',color:COLORS.find(c=>!roster.some(s=>s.color===c))});
        if(payload.changes?.color)roster[0].color=next.players[0].color;
        this.slots=validateRoster({players:roster,rounds:next.winsToMatch});
      }
    }
    this.mutations.set(key,signature);
    if(kind==='leave'&&member.seat!=='p1'&&next.status==='waiting')this.members.delete(member.token);
    return this.commit(next,kind==='move');
  }
  advance(){
    let changed=this.expire();this.syncTimers();
    if(this.state.status==='playing'&&!this.paused()){
      const current=this.state.players[this.state.turnIndex],slot=this.slot(current.seat);
      if(slot.mode==='bot'&&this.now()>=this.clock.botDue){
        const move=this.botMove(current.color);
        if(move){this.commit(applyMove(this.state,current.seat,move),true);changed=true}
      }else if(this.now()>=this.clock.deadline){
        const index=nextPlayablePlayer(this.state,this.state.turnIndex);
        this.commit(index<0?finishRound(this.state,{draw:true}):{...this.state,turnIndex:index,skippedSeat:current.seat,timedOutSeat:current.seat},true);changed=true;
      }
    }
    if(this.state.status==='finished'&&!this.state.matchComplete&&this.now()>=this.clock.continueDeadline){
      for(const player of [...this.state.players])if(this.state.status==='finished'&&!this.state.rematch[player.seat])this.state=rematchState(this.state,player.seat);
      this.commit(this.state,true);changed=true;
    }
    return changed;
  }
  botMove(color){
    let best=null,bestScore=-Infinity;
    for(const cell of [4,0,2,6,8,1,3,5,7])for(const size of [...SIZES].reverse()){
      const move={cell,size};if(validatePlacement(this.state.board,color,move))continue;
      const board=clone(this.state.board);board[cell][size]=color;
      let score=winner(board,color)?100000:0;
      for(const opponent of this.state.players.filter(p=>p.color!==color)){
        const threat=clone(this.state.board);threat[cell][size]=opponent.color;
        if(!validatePlacement(this.state.board,opponent.color,move)&&winner(threat,opponent.color))score+=5000;
      }
      for(const line of RULES.lines)if(line.includes(cell)){
        for(const sizes of [...SIZES.map(s=>[s,s,s]),...RULES.gradedOrders])score+=line.reduce((sum,c,i)=>sum+(board[c]?.[sizes[i]]===color?1:0),0)**2;
      }
      if(score>bestScore){bestScore=score;best=move}
    }
    return best;
  }
}
