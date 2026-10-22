import {joinRoom,selfId,getRelaySockets} from 'trystero';
import {COLORS} from '../api/game-rules.js';
import {RoomAuthority,normalizeCode,validCode,cleanName,P2P_PROTOCOL,validateRoster} from './p2p-authority.mjs';
export {normalizeCode,validCode};
const APP_ID='sa.yakolak.webrtc.v1';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const secret=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
const randomCode=()=>{const a=new Uint16Array(1);do{crypto.getRandomValues(a)}while(a[0]>=65000);return String(a[0]%1000).padStart(3,'0')};
const fail=code=>{throw new Error(code)};
export const supportsP2P=(w=globalThis)=>typeof w.RTCPeerConnection==='function'&&!!w.crypto?.subtle;
export const arabicNetworkError=code=>({signaling_unavailable:'تعذر الاتصال بخدمة اكتشاف اللاعبين. تحقق من الشبكة وحاول مجددًا.',room_unreachable:'تعذر الوصول للغرفة. تأكد من الرمز وبقاء منشئها متصلًا.',room_collision:'تعارض رمز الغرفة. أنشئ غرفة برمز جديد.',host_disconnected:'انقطع اتصال منشئ الغرفة؛ ننتظر عودته.',player_disconnected:'انقطع اتصال أحد اللاعبين؛ ننتظر عودته.',room_closed:'انتهت الغرفة أو أغلق منشئها الصفحة.',seat_in_use:'هذا المقعد مستخدم في صفحة أخرى.',seat_occupied:'المقعد متصل بلاعب؛ لا يمكن تغييره الآن.',room_full:'الغرفة ممتلئة.',room_not_waiting:'بدأت المباراة؛ لا تقبل الغرفة لاعبين جددًا.',invalid_roster:'راجع أنواع اللاعبين وألوانهم.',color_taken:'اختار لاعب آخر هذا اللون؛ اختر لونًا متاحًا.',invalid_color:'اختر لونًا متاحًا.',online_unavailable:'الأونلاين غير متاح في هذا المتصفح.',online_timeout:'تأخر الاتصال؛ حاول مجددًا.'}[code]||'تعذر إكمال الاتصال. حاول مجددًا.');
const safeError=e=>e?.kind||e?.name==='AbortError'?'online_timeout':String(e?.message||e||'online_timeout');

export class TrysteroClient{
  constructor(w){
    this.window=w;this.session=null;this.generation=0;this.listeners=new Set();this.requests=new Map();this.preparing=null;this.joining=null;
    this.timer=w.setInterval(()=>this.tick(),250);
    const wake=()=>{if(!w.document?.hidden)this.tick(true)};w.addEventListener?.('online',wake);w.addEventListener?.('pageshow',wake);w.document?.addEventListener('visibilitychange',wake);
  }
  get role(){return this.session?.role||''}
  get code(){return this.session?.code||''}
  subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn)}
  emit(){const s=this.session;const detail={role:s?.role||'',room:s?.snapshot||null,connected:!!s?.connected,error:s?.error||'',preview:s?.preview||null};for(const fn of this.listeners)fn(detail)}
  name(){try{return cleanName(JSON.parse(this.window.localStorage.getItem('yakolak-visitor-v1'))?.name)||'لاعب'}catch{return 'لاعب'}}
  saved(code){try{return JSON.parse(this.window.sessionStorage.getItem('yakolak-p2p:'+code))||{}}catch{return {}}}
  save(){const s=this.session;if(!s?.identity)return;try{this.window.sessionStorage.setItem('yakolak-p2p:'+s.code,JSON.stringify({...s.identity,epoch:s.epoch,role:s.role}))}catch{}}
  async close(abortRequests=true){
    const old=this.session;this.session=null;this.generation++;this.preparing=null;this.joining=null;
    if(abortRequests){for(const controller of this.requests.values())controller.abort();this.requests.clear();}
    if(old){old.closed=true;clearTimeout(old.discoveryTimer);clearTimeout(old.selectionTimer);old.reject?.(new Error('room_closed'));await old.room.leave();}
    this.emit();
  }
  async open(code,role){
    if(!supportsP2P(this.window))fail('online_unavailable');
    const s={code,role,connected:role==='host',phase:'candidate',epoch:role==='host'?secret():'',hostId:role==='host'?selfId:'',snapshot:null,identity:null,candidates:new Map(),collision:false,closed:false,hostLostAt:0,error:'',pingBusy:false,budget:new Map()};
    this.session=s;
    s.room=joinRoom({appId:APP_ID,maxReceiveBytes:65536,relayConfig:{redundancy:3}},code,{onJoinError:()=>{if(this.session===s){s.error='room_unreachable';this.emit()}}});
    s.beacon=s.room.makeAction('yk-beacon');s.hello=s.room.makeAction('yk-hello',{kind:'request'});s.intent=s.room.makeAction('yk-intent',{kind:'request'});s.states=s.room.makeAction('yk-state');
    s.beacon.onReceive=({byteLength})=>byteLength<=2048;s.hello.onReceive=s.intent.onReceive=({byteLength,kind})=>byteLength<=(kind==='response'?65536:4096);s.states.onReceive=({byteLength})=>byteLength<=65536;
    s.beacon.onMessage=(data,{peerId})=>this.beacon(s,data,peerId);
    s.states.onMessage=(data,{peerId})=>{if(peerId===s.hostId&&s.role==='guest')this.accept(s,data)};
    s.hello.onRequest=(data,{peerId})=>{
      if(s.role!=='host'||!s.authority||s.phase!=='ready')return {ok:false,error:'room_unreachable'};
      if(!data||data.protocol!==P2P_PROTOCOL)return {ok:false,error:'online_protocol_mismatch'};
      if(data.preview)return {ok:true,preview:s.authority.preview(),epoch:s.epoch};
      try{const response=s.authority.join(peerId,data);s.snapshot=response.room;this.broadcast(s);return {ok:true,...response,epoch:s.epoch};}catch(e){return {ok:false,error:safeError(e)}}
    };
    s.intent.onRequest=(data,{peerId})=>{
      if(s.role!=='host'||!s.authority||s.phase!=='ready')return {ok:false,error:'room_unreachable'};
      const now=Date.now(),rate=s.budget.get(peerId)||{since:now,count:0};if(now-rate.since>1000){rate.since=now;rate.count=0}rate.count++;s.budget.set(peerId,rate);
      if(rate.count>24)return {ok:false,error:'online_timeout'};
      try{const previous=s.authority.state.version,room=s.authority.command(peerId,data?.kind,data?.payload);s.snapshot=room;if(room.version!==previous)this.broadcast(s);return {ok:true,room};}catch(e){return {ok:false,error:safeError(e),room:s.authority.snapshot()}}
    };
    s.room.onPeerJoin=peerId=>{
      if(s.role==='host')this.sendBeacon(s,peerId);else s.beacon.send({protocol:P2P_PROTOCOL,type:'seek'},{target:peerId}).catch(()=>{});
    };
    s.room.onPeerLeave=peerId=>{
      s.candidates.delete(peerId);s.budget.delete(peerId);
      if(s.role==='host'&&s.authority?.connected(peerId,false)){s.snapshot=s.authority.snapshot();this.broadcast(s)}
      if(s.role==='guest'&&peerId===s.hostId){s.connected=false;s.hostLostAt||=Date.now();s.error='host_disconnected';this.emit()}
    };
    return s;
  }
  sendBeacon(s,target){return s.beacon.send({protocol:P2P_PROTOCOL,type:'host',epoch:s.epoch,settled:s.phase==='ready'},{target}).catch(()=>{})}
  beacon(s,data,peerId){
    if(this.session!==s||!data||data.protocol!==P2P_PROTOCOL)return;
    if(data.type==='seek'){if(s.role==='host')this.sendBeacon(s,peerId);return}
    if(data.type!=='host'||typeof data.epoch!=='string')return;
    if(s.role==='host'){
      if(data.epoch!==s.epoch&&(s.phase==='ready'?data.settled:(data.settled||data.epoch<s.epoch))){
        s.collision=true;
        if(s.phase==='ready'){s.error='room_collision';s.connected=false;s.authority.state={...s.authority.state,status:'cancelled',cancelledBy:'p1'};s.snapshot=s.authority.bump();this.broadcast(s)}
      }
      return;
    }
    if(s.epoch){
      if(data.epoch!==s.epoch)return;
      s.hostId=peerId;this.admit(s).catch(e=>{s.error=safeError(e);this.emit()});return;
    }
    s.candidates.set(peerId,data);
    clearTimeout(s.selectionTimer);s.selectionTimer=setTimeout(()=>{
      if(this.session!==s||s.identity)return;
      const candidates=[...s.candidates].filter(([,c])=>c.settled);
      if(candidates.length>1){s.reject?.(new Error('room_collision'));return}
      if(candidates.length===1){[s.hostId]=candidates[0];s.epoch=candidates[0][1].epoch;this.admit(s).catch(e=>s.reject?.(e));}
    },350);
  }
  async waitSignaling(s){
    const until=Date.now()+8000;
    while(Date.now()<until){
      if(s.closed||this.session!==s)fail('room_closed');
      if(Object.values(getRelaySockets()).some(socket=>socket.readyState===1)||Object.keys(s.room.getPeers()).length)return;
      await sleep(150);
    }
    fail('signaling_unavailable');
  }
  async prepareHost(config){
    validateRoster(config);
    if(this.session?.role==='host'&&this.session.phase==='ready'&&!this.session.error){
      this.session.snapshot=this.session.authority.configure(config);this.broadcast(this.session);return this.session.snapshot;
    }
    if(this.preparing)return this.preparing;
    const prepare=(async()=>{
      for(let attempt=0;attempt<8;attempt++){
        if(this.session)await this.close(false);
        const s=await this.open(randomCode(),'host');const token=secret();
        s.authority=new RoomAuthority({code:s.code,epoch:s.epoch,peerId:selfId,token,config});s.identity={token,seat:'p1',code:s.code};
        try{
          await this.waitSignaling(s);await sleep(3200);
          if(s.closed||this.session!==s)fail('room_closed');
          if(s.collision){await this.close(false);continue}
          s.phase='ready';s.snapshot=s.authority.snapshot();this.save();await this.sendBeacon(s);this.emit();return s.snapshot;
        }catch(e){if(this.session===s)await this.close(false);throw e}
      }
      fail('room_collision');
    })();this.preparing=prepare;
    try{return await prepare}finally{if(this.preparing===prepare)this.preparing=null}
  }
  async join(code,{token='',epoch='',name=this.name(),chooseColor=false}={}){
    code=normalizeCode(code);if(!validCode(code))fail('invalid_room_code');
    if(this.session?.role==='guest'&&this.session.code===code&&this.session.identity&&this.session.connected)return this.session;
    if(this.joining)return this.joining;
    const connect=(async()=>{
      if(this.session)await this.close(false);
      const saved=this.saved(code);if(saved.role==='host'&&saved.token===token)fail('room_closed');
      const s=await this.open(code,'guest');s.token=token||saved.token||secret();s.epoch=epoch||saved.epoch||'';s.name=cleanName(name)||'لاعب';s.chooseColor=chooseColor&&!saved.seat;s.color='';
      const connected=new Promise((resolve,reject)=>{s.resolve=resolve;s.reject=reject;s.discoveryTimer=setTimeout(()=>reject(new Error('room_unreachable')),25000)});connected.catch(()=>{});
      try{await this.waitSignaling(s);await connected;return s}catch(e){if(this.session===s)await this.close(false);throw e}
    })();this.joining=connect;
    try{return await connect}finally{if(this.joining===connect)this.joining=null}
  }
  async admit(s){
    if(s.admitting||s.closed||this.session!==s)return;
    s.admitting=true;
    try{
      const reply=await s.hello.request({protocol:P2P_PROTOCOL,token:s.token,name:s.name,epoch:s.epoch,preview:s.chooseColor&&!s.color,color:s.color||undefined},{target:s.hostId,timeoutMs:8000});
      if(!reply?.ok)fail(reply?.error||'room_unreachable');
      if(reply.epoch!==s.epoch)fail('room_closed');
      if(reply.preview){s.preview=reply.preview;s.phase='choosing';clearTimeout(s.discoveryTimer);s.resolve?.(s);s.resolve=s.reject=null;this.emit();return;}
      s.phase='ready';s.preview=null;
      s.identity={token:s.token,seat:reply.seat,code:s.code};
      if(!this.accept(s,reply.room))fail('online_protocol_mismatch');
      clearTimeout(s.discoveryTimer);s.resolve?.(s);s.resolve=s.reject=null;this.save();
    }finally{s.admitting=false}
  }
  accept(s,room,oneWayMs=0){
    if(s.closed||this.session!==s||!room||room.protocol!==5||room.epoch!==s.epoch||room.code!==s.code||!Number.isSafeInteger(room.version)||!Array.isArray(room.players)||room.players.length<1||room.players.length>4||!room.board)return false;
    if(!['waiting','playing','finished','cancelled'].includes(room.status)||new Set(room.players.map(p=>p.seat)).size!==room.players.length||room.players.some(p=>!/^p[1-4]$/.test(p.seat)||!COLORS.includes(p.color))||typeof room.board!=='object'||Array.isArray(room.board))return false;
    if(room.status==='playing'&&(!Number.isInteger(room.turnIndex)||!room.players[room.turnIndex]))return false;
    if(s.snapshot&&room.version<s.snapshot.version)return false;
    if(s.identity&&!room.players.some(p=>p.seat===s.identity.seat))return false;
    s.snapshot=structuredClone(room);s.clockAnchor={host:Number(room.serverNow)||Date.now(),local:performance.now(),oneWay:oneWayMs};s.connected=true;s.hostLostAt=0;s.error='';this.emit();return true;
  }
  broadcast(s){
    if(s.closed||this.session!==s)return;
    const targets=[...s.authority.members.values()].filter(m=>m.seat!=='p1'&&m.connected).map(m=>m.peerId);
    const delivery=targets.length?s.states.send(s.snapshot,{target:targets}).catch(()=>{}):Promise.resolve();this.emit();return delivery;
  }
  async inspectRoom(code){return this.join(code,{chooseColor:true})}
  async refreshPreview(){
    const s=this.session;if(!s||s.role!=='guest'||s.identity)return;
    const reply=await s.hello.request({protocol:P2P_PROTOCOL,preview:true},{target:s.hostId,timeoutMs:6000});
    if(!reply?.ok)fail(reply?.error||'room_unreachable');
    if(reply.epoch!==s.epoch)fail('room_closed');s.preview=reply.preview;this.emit();return s.preview;
  }
  async chooseColor(color){
    const s=this.session;if(!s||s.phase!=='choosing'||!COLORS.includes(color))fail('invalid_color');
    s.color=color;
    try{await this.admit(s);if(!s.identity)fail('room_unreachable');return s}
    catch(e){if(this.session===s){s.color='';s.phase='choosing';await this.refreshPreview().catch(()=>{})}throw e}
  }
  currentSnapshot(s=this.session){
    if(!s)return null;
    if(s.role==='host')return s.authority.snapshot();
    const room=s.snapshot;if(!room)return null;
    const anchor=s.clockAnchor,now=anchor?anchor.host+anchor.oneWay+performance.now()-anchor.local:Date.now();
    return {...room,serverNow:now,turnRemainingMs:room.paused?room.turnRemainingMs:Math.max(0,(room.turnDeadlineAt||0)-now),continueRemainingMs:Math.max(0,(room.continueDeadlineAt||0)-now)};
  }
  async tick(){
    const s=this.session;if(!s||s.closed||s.phase==='candidate'&&s.role==='host')return;
    if(s.role==='host'){if(s.error==='room_collision')return;if(s.authority.advance()){s.snapshot=s.authority.snapshot();this.broadcast(s)}return}
    if(s.pingBusy||!s.room.getPeers()[s.hostId])return;
    const now=performance.now();if(now<(s.nextPingAt||0))return;s.nextPingAt=now+2500;s.pingBusy=true;
    try{
      if(s.phase==='choosing'){await this.refreshPreview();return}
      if(!s.identity)return;
      const sent=performance.now(),reply=await s.intent.request({kind:'ping',payload:{epoch:s.epoch}},{target:s.hostId,timeoutMs:5000});
      if(reply?.ok)this.accept(s,reply.room,(performance.now()-sent)/2);else throw new Error(reply?.error||'host_disconnected');
    }catch{if(this.session===s){s.connected=false;s.error='host_disconnected';s.hostLostAt||=Date.now();this.emit()}}finally{s.pingBusy=false}
  }
  async dispatch(kind,payload,identity,signal){
    if(kind==='create'){
      const config={players:payload.players,rounds:payload.targetRounds};
      if(this.session?.role!=='host'||this.session.phase!=='ready'||this.session.error)await this.prepareHost(config);
      const s=this.session;s.snapshot=s.authority.start(config);this.broadcast(s);return {ok:true,room:this.currentSnapshot(s),...s.identity};
    }
    if(kind==='join'){
      const s=await this.join(payload.code,{token:payload.clientToken,name:payload.name||this.name()});return {ok:true,room:this.currentSnapshot(s),...s.identity};
    }
    if(!this.session&&kind==='poll')await this.join(identity.code||payload.code,{token:identity.token});
    const s=this.session;if(!s?.identity)fail('room_closed');
    if(s.error==='room_collision')fail('room_collision');
    if(kind==='poll'){
      if(!s.connected){if(s.hostLostAt&&Date.now()-s.hostLostAt>60000)fail('room_closed');fail('host_disconnected')}
      return payload.since===s.snapshot?.version?{ok:true,unchanged:true}:{ok:true,room:this.currentSnapshot(s)};
    }
    const intent={...payload,epoch:s.epoch,mutationId:payload.mutationId||secret()};
    let reply;
    if(s.role==='host'){
      try{s.snapshot=s.authority.command(selfId,kind,intent);await this.broadcast(s);reply={ok:true,room:this.currentSnapshot(s)}}catch(e){reply={ok:false,error:safeError(e),room:s.authority.snapshot()}}
    }else{
      if(!s.connected)fail('host_disconnected');
      reply=await s.intent.request({kind,payload:intent},{target:s.hostId,timeoutMs:6000,signal});
      if(reply?.room)this.accept(s,reply.room);
    }
    return reply;
  }
  async leave(){
    const s=this.session;
    if(s?.identity&&s.snapshot){try{await this.dispatch('leave',{version:s.snapshot.version,mutationId:secret()},s.identity)}catch{}}
    await this.close();
  }
  async bridge(id,kind,payload={},identity={}){
    const controller=new AbortController();this.requests.set(id,controller);
    if(kind==='create'||kind==='join')controller.signal.addEventListener('abort',()=>queueMicrotask(()=>this.close()),{once:true});
    const controllers=this.window.__yakolakOnlineControllers||={};controllers[id]=controller;
    try{
      const response=await this.dispatch(kind,payload,identity,controller.signal);
      if(controller.signal.aborted)return;
      const transient=['host_disconnected','player_disconnected','online_timeout'].includes(response?.error);
      (this.window.__yakolakOnlineQueue||=[]).push({id,kind,ok:!!response?.ok,status:response?.ok?200:transient?503:409,data:response});
    }catch(e){
      if(controller.signal.aborted)return;
      const error=safeError(e),transient=['host_disconnected','player_disconnected','online_timeout'].includes(error);
      (this.window.__yakolakOnlineQueue||=[]).push({id,kind,ok:false,status:transient?503:400,data:{ok:false,error}});
    }finally{this.requests.delete(id);delete controllers[id]}
  }
}
export const P2P=typeof window!=='undefined'?new TrysteroClient(window):null;
if(P2P)window.YakolakP2P=P2P;
