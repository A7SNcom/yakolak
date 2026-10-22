import {P2P,supportsP2P,arabicNetworkError} from './online-trystero-28e3557a98b5.mjs';
import {attachLiquidLens} from './vendor/liquefy-core-1.1.0.mjs';
const WIN_LESSONS = [{"id": "tower", "pattern": "complete-cell", "title": "البرج", "slogan": "هبطهم من برجك!", "description": "صغير ووسط وكبير، من نفس اللون وفي نفس الخانة.", "winner": "%s هبطكم من برجه", "moves": [{"cell": 4, "size": "small"}, {"cell": 4, "size": "medium"}, {"cell": 4, "size": "large"}]}, {"id": "stairs", "pattern": "graded-line", "title": "الدرج", "slogan": "دردبهم من الدرج!", "description": "كبير، وسط، صغير على خط واحد ومن نفس اللون. والعكس صحيح.", "winner": "%s دردبكم من الدرج", "moves": [{"cell": 3, "size": "large"}, {"cell": 4, "size": "medium"}, {"cell": 5, "size": "small"}]}, {"id": "line", "pattern": "same-size-line", "title": "السطر", "slogan": "سطرهم تستطير", "description": "ثلاثة من نفس الحجم واللون على خط: صف أو عمود أو قطر.", "winner": "%s سطركم تسيطير", "moves": [{"cell": 6, "size": "large"}, {"cell": 7, "size": "large"}, {"cell": 8, "size": "large"}]}];

// Invisible layout guide only. No belt is painted; the four independent
// controls share its center, spacing and mirrored tangent angles.
export function orbitRibbonGeometry(points,width,height,board=null){
  if(!Array.isArray(points)||points.length!==4||width<=0||height<=0||points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))return null;
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const validBoard=Array.isArray(board)&&board.length===4&&board.every(Number.isFinite)&&board[2]>0&&board[3]>0;
  const [bx,by,bw,bh]=validBoard?board:[Math.min(...xs)-width*.15,Math.min(...ys),Math.max(...xs)-Math.min(...xs)+width*.3,Math.max(...ys)-Math.min(...ys)];
  const thickness=Math.max(48,Math.min(92,bw*.085,height*.14));
  const rx=Math.max(90,Math.min(width/2-12,bw*(width<700?.63:.47)+8));
  const cx=Math.max(rx+12,Math.min(width-rx-12,bx+bw/2));
  const cy=Math.max(thickness+24,Math.min(height-thickness-140,by+bh*.49));
  const ry=Math.max(62,Math.min(bh*(width<700?.65:.68)+thickness*.2,cy-thickness/2-44,height-cy-thickness/2-144));
  return {cx,cy,rx,ry,thickness};
}
export function orbitY(ring,x,side){
  const u=Math.max(-1,Math.min(1,(x-ring.cx)/ring.rx));
  return ring.cy+side*ring.ry*Math.sqrt(Math.max(0,1-u*u));
}
// Smooth, equal-radius corners with a deliberately shallow bend. Offset the
// material alone; native HTML text keeps the browser's complete RTL shaping.
export function foldedSurfaceGeometry(width,height,side=1){
  const pad=5,sag=Math.min(6,height*.10,width*.034),radius=Math.min(18,height*.32);
  const fullHeight=height+2*(pad+sag),bodyWidth=width-2*pad;
  const bend=x=>side*sag*(1-((x-width/2)/(bodyWidth/2))**2);
  const slope=x=>-side*sag*8*(x-width/2)/(bodyWidth*bodyWidth);
  const project=(x,y,dx,dy)=>({x,y:y+pad+sag+bend(x),dx,dy:dy+slope(x)*dx});
  const f=n=>Number(n.toFixed(3));let path='';
  const segment=(sample,steps=1)=>{
    for(let i=0;i<steps;i++){
      const t0=i/steps,t1=(i+1)/steps,dt=t1-t0,p0=sample(t0),p1=sample(t1);
      if(!path)path=`M ${f(p0.x)} ${f(p0.y)}`;
      path+=` C ${f(p0.x+p0.dx*dt/3)} ${f(p0.y+p0.dy*dt/3)} ${f(p1.x-p1.dx*dt/3)} ${f(p1.y-p1.dy*dt/3)} ${f(p1.x)} ${f(p1.y)}`;
    }
  };
  const line=(x1,y1,x2,y2)=>segment(t=>project(x1+(x2-x1)*t,y1+(y2-y1)*t,x2-x1,y2-y1));
  const arc=(cx,cy,angle)=>segment(t=>{const a=angle+t*Math.PI/2;return project(cx+radius*Math.cos(a),cy+radius*Math.sin(a),-radius*Math.sin(a)*Math.PI/2,radius*Math.cos(a)*Math.PI/2);},6);
  const left=pad,right=width-pad;
  line(left+radius,0,right-radius,0);arc(right-radius,radius,-Math.PI/2);
  line(right,radius,right,height-radius);arc(right-radius,height-radius,0);
  line(right-radius,height,left+radius,height);arc(left+radius,height-radius,Math.PI/2);
  line(left,height-radius,left,radius);arc(left+radius,radius,Math.PI);
  return {width,height:fullHeight,path:path+' Z',bow:side*sag};
}
export function orbitPlateGeometry(ring,centerX,side,width,height){
  const surface=foldedSurfaceGeometry(width,height,side),centerY=orbitY(ring,centerX,side);
  const u=Math.max(-.9,Math.min(.9,(centerX-ring.cx)/ring.rx));
  const tangent=-side*ring.ry*u/(ring.rx*Math.sqrt(1-u*u));
  const angle=Math.max(-16,Math.min(16,Math.atan(tangent)*180/Math.PI*.65));
  return {...surface,left:centerX-width/2,top:centerY-surface.height/2,angle,side};
}

export const COLORS = [
  { id: 'marble', name: 'أبيض', direction: 'right', hex: '#ddd7ce' },
  { id: 'blue', name: 'أزرق', direction: 'back', hex: '#3764b2' },
  { id: 'gold', name: 'ذهبي', direction: 'left', hex: '#bd7d2e' },
  { id: 'green', name: 'أخضر', direction: 'front', hex: '#267a61' },
];
export function digits(value) {
  return String(value).replace(/[٠-٩]/g, x => String(x.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, x => String(x.charCodeAt(0) - 0x6f0)).replace(/[^0-9]/g, '');
}
export function validProfile(value) {
  return !!value && typeof value.name === 'string' && value.name.trim().length >= 2 && value.name.trim().length <= 24 && /^[0-9]{7,15}$/.test(value.phone || '');
}
export function newSetup(name = '') {
  return { step: 'entry', countChosen: false, selectedColor: '', hostColor: 'marble', rounds: 3, name,
    seats: COLORS.map((color, i) => ({ color: color.id, mode: i === 0 ? 'local' : i === 1 ? 'bot' : 'none', name: i === 0 ? name : '', owner: 'p1' })) };
}
export function chooseColor(state, color) {
  const start = COLORS.findIndex(x => x.id === color);
  if (start < 0) return state;
  return { ...state, hostColor: color, selectedColor: color, step: 'color', seats: state.seats.map((seat, i) => ({ ...seat, color: COLORS[(start + i) % 4].id })) };
}
export function confirmColor(state) {
  return state.selectedColor ? { ...state, step: 'count' } : state;
}
export function chooseCount(state, count) {
  if (![2, 3, 4].includes(count)) return state;
  return { ...state, step: 'ready', countChosen: true, seats: state.seats.map((seat, i) => ({ ...seat, mode: i === 0 ? 'local' : i < count ? 'bot' : 'none', name: i === 0 ? state.name : '', owner: 'p1' })) };
}
export function changeSeat(state, index, mode, name = '', owner = 'p1') {
  if (index < 1 || index > 3 || !['bot', 'online', 'local', 'none'].includes(mode)) return state;
  return { ...state, seats: state.seats.map((seat, i) => i === index ? { ...seat, mode, name: mode === 'local' ? name.trim().slice(0, 24) : '', owner: mode === 'local' ? owner : 'p1' } : seat) };
}
export function seatLabel(seat) {
  const color = COLORS.find(x => x.id === seat.color)?.name || '';
  return seat.mode === 'none' ? 'فاضي' : seat.mode === 'bot' ? `كمبيوتر ${color}` : seat.mode === 'online' ? seat.name.trim() || 'اونلاين' : seat.name.trim() || `لاعب ${color}`;
}
export function swapPlayers(state, target, source) {
  if (target === source || !state.seats[target] || state.seats[source]?.mode !== 'local') return state;
  const seats = state.seats.map(x => ({...x}));
  const color = seats[target].color;
  seats[target] = {...seats[target],color:seats[source].color};
  seats[source] = {...seats[source],color};
  return {...state,seats,hostColor:seats[0].color};
}
export function configuration(state) {
  return { tutorial: false, rounds: state.rounds, online_join_code: '', players: state.seats.filter(x => x.mode !== 'none').sort((a,b)=>{const order=state.onlineSeatOrder||state.seats.map(x=>x.color);const rank=c=>order.includes(c)?order.indexOf(c):4+state.seats.findIndex(x=>x.color===c);return rank(a.color)-rank(b.color)}).map((seat, i) => {
    const color = COLORS.find(x => x.id === seat.color);
    return { seat: `p${i + 1}`, label: seatLabel(seat), mode: seat.mode,
      color: color.id, color_name: color.name, direction: color.direction, device_owner: seat.owner };
  }) };
}
export function configurationError(state, capabilities = {}) {
  const active = state.seats.filter(x => x.mode !== 'none');
  if (active.length < 2) return 'اختر لاعبين على الأقل';
  if (active.some(x => x.mode === 'online' || (x.mode === 'local' && x.owner !== 'p1'))) {
    if (!capabilities.online) return 'الأونلاين غير متاح حالياً';
  }
  return '';
}

export function restoreSetup(config, fallbackName='') {
  const players=Array.isArray(config?.players)?config.players:[];
  if(players.length<2||players.length>4||!COLORS.some(c=>c.id===players[0]?.color))return newSetup(fallbackName);
  let state=chooseCount(confirmColor(chooseColor(newSetup(players[0].label||fallbackName),players[0].color)),players.length);
  return {...state,rounds:[3,5].includes(config.rounds)?config.rounds:3,seats:state.seats.map(seat=>{
    const player=players.find(p=>p.color===seat.color);
    return player?{...seat,mode:['bot','online'].includes(player.mode)?player.mode:'local',name:player.mode==='bot'?'':String(player.label||'').slice(0,24),owner:player.device_owner||'p1'}:{...seat,mode:'none',name:''};
  })};
}

export function parseRoomInput(value, base = 'https://a7sncom.github.io/yakolak/') {
  const text = String(value).trim();
  if (/^[0-9٠-٩۰-۹\s]+$/.test(text)) { const code = digits(text); return /^\d{3}$/.test(code) ? code : ''; }
  try { const url = new URL(text); const origin = new URL(base); const code = digits(url.searchParams.get('room') || '');
    return url.origin === origin.origin && url.pathname === origin.pathname && /^\d{3}$/.test(code) ? code : '';
  } catch { return ''; }
}

export function mountSetup(document, window, client=P2P) {
  const STORE = 'yakolak-visitor-v1';
  let profile = null, profiles = {};
  try { const saved = JSON.parse(window.localStorage.getItem(STORE)); if (validProfile(saved)) profile = saved; } catch {}
  try { const saved = JSON.parse(window.localStorage.getItem('yakolak-profiles-v2')); if (saved && typeof saved === 'object' && !Array.isArray(saved)) profiles = saved; } catch {}
  if (profile) profiles[profile.phone] = profile.name;
  let state = newSetup(profile?.name || '');
  let capabilities = { online: false, mixed: false }, connections = [], geometry = {}, roomCode = '';
  let pending = false, returnFocus = null, sheetGeneration = 0, moving = false, nameDraft = null, flowGeneration = 0, profileContinuation = null;
  let lastEntryRequest = '',inviteHandled=false,networkBusy=false;
  let lobbySignature='',guestPhase='',guestPreview=null,guestBusy=false,hostAwaitingStart=false;
  let lessonRequest='',lessonSerial=0,lessonClosing=false;
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const button = (label, action, cls = '') => { const node = el('button',cls);if(label)node.append(el('span','yk-button-label',label)); node.type = 'button'; node.addEventListener('click',e=>{e.stopPropagation();action(e);}); return node; };
  const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const animate = (node,frames,duration=320) => { node.getAnimations?.().forEach(x=>x.cancel());if (!reduced()) return node.animate?.(frames,{duration,easing:'cubic-bezier(.4,0,.2,1)'}); };
  const root = el('section','yk-setup'); root.id = 'yakolakVisualSetup'; root.dir = 'rtl'; root.hidden = true; root.setAttribute('aria-label','إعداد اللعبة');
  const header = el('header','yk-header');
  const identity = button('',()=>{if(!guestPhase&&!hostAwaitingStart&&!pending&&!moving&&!networkBusy)openProfile();},'yk-identity');
  const prompt = el('h1','yk-sr-only'); prompt.id='ykPrompt'; prompt.setAttribute('aria-live','polite'); header.append(identity,prompt);
  const seats = el('div','yk-seats');
  const seatButtons = COLORS.map(color=>{
    const b = button('', e=>{
      if (pending||moving||networkBusy||guestBusy||hostAwaitingStart) return;
      if (state.step === 'color') {
        if(guestPhase==='color'&&!guestPreview?.availableColors?.includes(color.id))return;
        let selected=color.id;
        if (e.detail>0 && geometry.seats) selected=COLORS.reduce((best,c)=>{const p=geometry.seats[c.id],distance=Math.hypot(e.clientX-p[0]*window.innerWidth,e.clientY-p[1]*window.innerHeight);return distance<best.distance?{id:c.id,distance}:best;},{id:color.id,distance:Infinity}).id;
        if(guestPhase==='color'){if(!guestPreview?.availableColors?.includes(selected))return;state={...state,selectedColor:selected};}
        else state=chooseColor(state,selected);
        clearError();render();notify('preview');
      } else if (state.step==='ready'&&!guestPhase) openSeat(state.seats.findIndex(x=>x.color===color.id),b);
    },'yk-seat');
    b.dataset.color=color.id; b.style.setProperty('--seat-color',color.hex);
    const status=el('span','yk-seat-status'), arrow=el('span','yk-seat-arrow','⌄');arrow.setAttribute('aria-hidden','true');
    b.append(status,arrow);seats.append(b);return {b,status,color};
  });
  const actions = el('footer','yk-actions');
  const entry = el('div','yk-entry');
  const create=button('غرفة جديدة',()=>requireProfile(()=>go('color')),'yk-primary');
  const join=button('انضمام لغرفة',()=>requireProfile(openJoin),'yk-outline');
  const learn=button('كيف تفوز؟',openLesson,'yk-learn');entry.append(create,join,learn);
  const confirm=button('تأكيد',()=>{if(hostAwaitingStart){void leaveGuestLobby();return;}if(guestPhase==='color'){void chooseGuestColor();return;}if(state.selectedColor)go('count');},'yk-primary yk-confirm');
  const counts=el('div','yk-counts');counts.setAttribute('role','group');counts.setAttribute('aria-label','عدد اللاعبين');
  [2,3,4].forEach(n=>{const b=button(String(n),()=>go(chooseCount(state,n)),'yk-choice');b.setAttribute('aria-label',`${n} لاعبين`);counts.append(b);});
  const sharing=button('',copyRoom,'yk-sharing');sharing.setAttribute('aria-label','نسخ رابط الغرفة');
  const shareIcon=el('span','yk-share-icon');
  // Code-native icon, with no external asset or user HTML.
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
  for(const d of ['M12 16V3','m7 8 5-5 5 5','M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6']){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);svg.append(path);}shareIcon.append(svg);
  const code=el('span','yk-room-code','—');code.dir='ltr';sharing.append(shareIcon,code);
  const start=button('ابدأ اللعب',()=>{if(guestPhase){void leaveGuestLobby();return;}const problem=configurationError(state,capabilities);if(problem){showError(problem);return;}closeSheet();go('rounds');},'yk-primary yk-start');
  const rounds=el('div','yk-rounds');rounds.setAttribute('role','group');rounds.setAttribute('aria-label','أشواط الفوز');
  [3,5].forEach(n=>{const b=button(String(n),()=>beginMatch(n),'yk-choice');b.setAttribute('aria-label',`الفوز بـ ${n} أشواط`);rounds.append(b);});
  const errors=el('div','yk-error');errors.setAttribute('role','status');errors.setAttribute('aria-live','polite');
  actions.append(entry,confirm,counts,sharing,start,rounds,errors);
  const modal=el('div','yk-modal');modal.hidden=true;
  const sheet=el('section','yk-sheet');sheet.setAttribute('role','dialog');sheet.setAttribute('aria-labelledby','ykSheetTitle');modal.append(sheet);
  root.append(header,seats,actions,modal);document.body.append(root);
  const lesson=el('section','yk-lesson');lesson.hidden=true;lesson.setAttribute('role','dialog');lesson.setAttribute('aria-modal','true');lesson.setAttribute('aria-labelledby','ykLessonTitle');
  const lessonBack=button('رجوع',()=>lessonCommand('learn-close'),'yk-lesson-back');
  const lessonHeading=el('div','yk-lesson-heading'),lessonCount=el('span','yk-lesson-count');lessonCount.dir='ltr';
  const lessonTitle=el('h2','yk-lesson-title');lessonTitle.id='ykLessonTitle';
  const lessonSlogan=el('p','yk-lesson-slogan'),lessonDescription=el('p','yk-lesson-description');
  lessonHeading.setAttribute('aria-live','polite');lessonHeading.append(lessonCount,lessonTitle,lessonSlogan);
  const lessonFooter=el('div','yk-lesson-footer'),lessonNext=button('',()=>lessonCommand('learn-next'),'yk-primary yk-lesson-next');
  lessonFooter.append(lessonDescription,lessonNext);lesson.append(lessonBack,lessonHeading,lessonFooter);root.append(lesson);
  function lessonCommand(action){
    if(!lessonRequest||lessonClosing)return;
    if(action==='learn-next'||action==='learn-close'){lessonNext.disabled=true;lesson.setAttribute('aria-busy','true');}
    window.yakolakVisualSetupAction?.(JSON.stringify({action,request:lessonRequest}));
  }
  function openLesson(){
    if(state.step!=='entry'||pending||moving||networkBusy||!modal.hidden||lessonRequest)return;
    lessonRequest=`${lastEntryRequest}:${++lessonSerial}`;lessonClosing=false;
    for(const node of [header,seats,actions])node.inert=true;
    root.dataset.lesson='active';lesson.hidden=false;updateLesson({request:lessonRequest,stage:0,busy:true});
    animate(lesson,[{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],260);
    lessonBack.focus({preventScroll:true});lessonCommand('learn');
  }
  function resetLesson(){lessonRequest='';lessonClosing=false;lesson.hidden=true;delete root.dataset.lesson;for(const node of [header,seats,actions])node.inert=false;}
  function updateLesson(update){
    if(!lessonRequest||update.request!==lessonRequest||root.hidden)return;
    if(update.closed){
      if(lessonClosing)return;lessonClosing=true;
      const id=lessonRequest,finish=()=>{if(id!==lessonRequest)return;resetLesson();learn.focus({preventScroll:true});};
      const exit=animate(lesson,[{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(10px)'}],220);
      if(exit)exit.finished.then(finish,finish);else finish();return;
    }
    const index=Math.max(0,Math.min(WIN_LESSONS.length-1,Number(update.stage)||0)),content=WIN_LESSONS[index];
    if(lesson.dataset.stage!==content.id){
      lesson.dataset.stage=content.id;lessonCount.textContent=`${index+1} / ${WIN_LESSONS.length}`;lessonTitle.textContent=content.title;lessonSlogan.textContent=content.slogan;lessonDescription.textContent=content.description;
      animate(lessonHeading,[{opacity:0},{opacity:1}],220);
    }
    lessonNext.textContent=index===WIN_LESSONS.length-1?'يلا نلعب':`التالي: ${WIN_LESSONS[index+1].title}`;
    lessonNext.disabled=!!update.busy;lesson.setAttribute('aria-busy',String(!!update.busy));
  }
  lesson.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();lessonCommand('learn-close');}
    if(e.key==='Tab'){const controls=[lessonBack,...(!lessonNext.disabled?[lessonNext]:[])],first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  });
  const lenses=new Map();
  const ns='http://www.w3.org/2000/svg';
  const svgNode=(tag,attrs={})=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
  const gradient=(id,stops,vertical=false)=>{
    const n=svgNode('linearGradient',{id,x1:'0%',y1:'0%',x2:vertical?'0%':'100%',y2:vertical?'100%':'0%'});
    for(const [offset,color,opacity=1] of stops)n.append(svgNode('stop',{offset,'stop-color':color,'stop-opacity':opacity}));
    return n;
  };
  let surfaceSerial=0,currentOrbit=null;
  function addSurface(node,color='neutral'){
    if(node.orbit)return node.orbit;
    const svg=svgNode('svg',{class:'yk-orbit-plate','aria-hidden':'true',focusable:'false'}),defs=svgNode('defs');
    const id=`yk-surface-${++surfaceSerial}`,fill=gradient(id,[['0%','#3e4858',.94],['48%','#171d28',.97],['100%','#283242',.95]],true);
    defs.append(fill);
    const halo=svgNode('path',{class:'yk-plate-halo',fill:'none','stroke-width':'3'});
    const face=svgNode('path',{class:'yk-plate-face',fill:`url(#${id})`,'stroke-width':'1.3'});
    const edge=svgNode('path',{class:'yk-plate-edge',fill:'none',stroke:'#fff','stroke-width':'.55'});
    svg.append(defs,halo,face,edge);node.append(svg);
    return node.orbit={svg,halo,face,edge,fill,color,angle:0,side:1};
  }
  function paintSurface(node,surface,color='neutral'){
    const art=addSurface(node,color),off=node.classList.contains('is-off');
    const palette=off?['#707782','#22262e']:({blue:['#77b4ff','#102b54'],green:['#62ddc6','#143f38'],gold:['#e6be7b','#3a2e20'],marble:['#e5e7eb','#303641'],neutral:['#c7d0df','#282f3d']}[color]);
    art.svg.setAttribute('viewBox',`0 0 ${surface.width} ${surface.height}`);
    for(const path of [art.halo,art.face,art.edge])path.setAttribute('d',surface.path);
    art.halo.setAttribute('stroke',palette[0]);art.face.setAttribute('stroke',palette[0]);
    const mix=(a,b,t)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
    [...art.fill.children].forEach((stop,i)=>stop.setAttribute('stop-color',i===0?mix(palette[1],palette[0],.15):i===1?palette[1]:mix(palette[1],'#000000',.12)));
    node.style.setProperty('--yk-bow',`${surface.bow}px`);art.side=surface.side??1;art.angle=surface.angle??0;
  }
  for(const {b,color,status} of seatButtons){
    addSurface(b,color.id);status.dir='rtl';
    // Chevron is an icon, never a Unicode character participating in bidi.
    const arrowNode=b.querySelector('.yk-seat-arrow');arrowNode.textContent='';
    const icon=svgNode('svg',{viewBox:'0 0 16 16','aria-hidden':'true'});icon.append(svgNode('path',{d:'m4 6 4 4 4-4',fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round'}));arrowNode.append(icon);
  }
  function refreshOrbitLayout(){
    if(root.hidden||(state.step!=='ready'&&guestPhase!=='color')){currentOrbit=null;return;}
    const width=window.innerWidth,height=root.getBoundingClientRect().height||window.innerHeight;
    const fallback={gold:[.28,.30],blue:[.72,.30],green:[.28,.66],marble:[.72,.66]};
    const points=seatButtons.map(({color})=>{const p=geometry.seats?.[color.id]||fallback[color.id];return [p[0]*width,p[1]*height];});
    const ring=orbitRibbonGeometry(points,width,height,geometry.board);if(!ring)return;
    currentOrbit=ring;
    const middleY=(Math.min(...points.map(p=>p[1]))+Math.max(...points.map(p=>p[1])))/2;
    seatButtons.forEach(({b,status,color},i)=>{
      if(guestPhase==='color'&&guestPreview?.availableColors?.includes(color.id))return;
      const side=points[i][1]<middleY?-1:1,sign=points[i][0]<ring.cx?-1:1;
      const plateWidth=Math.min(252,Math.max(width<700?128:184,ring.rx*(width<700?.78:.66)));
      const plate=orbitPlateGeometry(ring,ring.cx+sign*ring.rx*.54,side,plateWidth,width<700?48:60);
      const radians=plate.angle*Math.PI/180,halfX=(Math.abs(Math.cos(radians))*plate.width+Math.abs(Math.sin(radians))*plate.height)/2,halfY=(Math.abs(Math.sin(radians))*plate.width+Math.abs(Math.cos(radians))*plate.height)/2;
      const x=Math.max(halfX+10,Math.min(width-halfX-10,plate.left+plate.width/2)),y=Math.max(halfY+18,Math.min(height-halfY-18,plate.top+plate.height/2));
      b.style.left=`${x}px`;b.style.top=`${y}px`;b.style.width=`${plate.width}px`;b.style.height=`${plate.height}px`;b.style.setProperty('--yk-seat-tilt',`${plate.angle}deg`);
      b.dataset.cylinder='folded-surface';paintSurface(b,plate,color.id);
      status.style.maxWidth=`${plate.width-43}px`;status.style.fontSize=width<700?'14px':`${Math.min(21,plateWidth*.084)}px`;
    });
  }

  function refreshGlass(){
    // Native blur gives Chromium and WebKit touch surfaces the same optical
    // backing; desktop retains the existing displacement lens.
    const touch=!!window.matchMedia?.('(pointer: coarse)').matches;
    const nodes=[prompt,sheet,create,join,confirm,start,sharing,...counts.children,...rounds.children,...seatButtons.map(x=>x.b)];
    for(const node of nodes){
      if(node===prompt)continue;
      const folded=node.classList.contains('yk-seat')||(node===sheet&&modal.dataset.kind==='seat');
      const visible=!root.hidden&&!node.hidden&&!node.closest('[hidden]')&&!node.classList.contains('is-color');
      if(folded||!visible||touch){
        lenses.get(node)?.destroy();lenses.delete(node);node.style.removeProperty('--lq-lens');
        if(touch&&visible&&!folded)node.style.setProperty('--lq-lens','blur(14px)');
        continue;
      }
      if(!lenses.has(node)){const lens=attachLiquidLens(node,{strength:.32,dispersion:0,blur:14,saturation:1,respectReducedTransparency:true});if(lens)lenses.set(node,lens);}
    }
  }
  root.dataset.glassEngine='liquefy-core-1.1.0';

  function clearError(){errors.textContent='';}
  function showError(text){pending=false;errors.textContent=text;render();}
  function notify(action,override={}){
    const payload={action,...configuration(state),guest_mode:guestPhase,available_colors:guestPhase==='color'?guestPreview?.availableColors:undefined,reserved_colors:guestPhase==='color'?(guestPreview?.players||[]).map(p=>p.color):undefined,all_seats:state.seats,host_name:state.name,selected_color:state.selectedColor,count_chosen:state.countChosen,step:root.dataset.profile==='active'?'profile':state.step,overlay_open:!modal.hidden,...override};
    window.yakolakVisualSetupAction?.(JSON.stringify(payload));
  }
  function viewport(){const vv=window.visualViewport;const h=vv?.height||window.innerHeight;const base=Math.max(root.getBoundingClientRect().height||0,window.innerHeight);root.style.setProperty('--yk-vv-height',`${h}px`);root.style.setProperty('--yk-vv-top',`${vv?.offsetTop||0}px`);root.classList.toggle('is-keyboard',h<base*.78);position();}
  window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);window.addEventListener('resize',viewport);
  function position(){
    const width=window.innerWidth,height=root.getBoundingClientRect().height||window.innerHeight;
    const fallback={marble:[.7,.61],blue:[.7,.40],gold:[.3,.40],green:[.3,.61]};
    for(const {b,color} of seatButtons){
      const point=geometry.seats?.[color.id]||fallback[color.id];
      if(state.step==='color'&&!(guestPhase==='color'&&!guestPreview?.availableColors?.includes(color.id))){
        const corners=geometry.hits?.[color.id]||[point];const xs=corners.map(x=>x[0]*width),ys=corners.map(x=>x[1]*height);
        delete b.dataset.cylinder;
        b.style.width=`${Math.max(104,Math.max(...xs)-Math.min(...xs)+52)}px`;b.style.height=`${Math.max(88,Math.max(...ys)-Math.min(...ys)+52)}px`;
        b.style.left=`${point[0]*width}px`;b.style.top=`${point[1]*height}px`;
      }else{
        const p=geometry.controls?.[color.id]||point,mobile=width<700;
        const seatWidth=mobile?Math.max(116,Math.min(158,width*.385)):Math.max(150,Math.min(205,width*.16));
        const seatHeight=mobile?50:62;
        const angle=Math.max(-8,Math.min(8,Number(geometry.control_angles?.[color.id])||0)),radians=angle*Math.PI/180;
        const halfWidth=seatWidth/2,halfHeight=seatHeight/2;
        // Clamp the rotated footprint rather than the unrotated button width.
        const edgeX=Math.abs(Math.cos(radians))*halfWidth+Math.abs(Math.sin(radians))*halfHeight;
        const edgeY=Math.abs(Math.sin(radians))*halfWidth+Math.abs(Math.cos(radians))*halfHeight;
        const x=Math.max(edgeX+12,Math.min(width-edgeX-12,p[0]*width+(p[0]<.5?-6:6)));
        const y=Math.max(edgeY+16,Math.min(height-edgeY-16,p[1]*height));
        b.style.width=`${seatWidth}px`;b.style.height=`${seatHeight}px`;b.style.left=`${x}px`;b.style.top=`${y}px`;b.style.setProperty('--yk-seat-tilt',`${angle}deg`);
        const caption=b.querySelector('.yk-seat-status');
        caption.style.maxWidth=`${seatWidth-30}px`;
        caption.style.fontSize=mobile?(width<355?'12px':'13px'):'16px';
      }
    }
    const target=geometry.actions||[.5,.75];
    const h=actions.getBoundingClientRect().height|| (state.step==='ready'?112:60);
    const centeredEntry=state.step==='entry';
    // The footer belongs to the layout viewport. Only the editing sheet follows
    // VisualViewport, so opening a keyboard never lifts Start/Share over the board.
    actions.style.top=`${centeredEntry?Math.max(16,(height-h)/2):Math.max(12,Math.min(target[1]*height,height-h-16))}px`;
    const heading=geometry.prompt||[.5,.25];prompt.style.top=`${Math.max(20,heading[1]*height)}px`;
    refreshOrbitLayout();
    if(currentOrbit&&(state.step==='ready'||guestPhase==='color'))actions.style.top=`${Math.min(height-h-16,Math.max(parseFloat(actions.style.top),currentOrbit.cy+currentOrbit.ry+currentOrbit.thickness/2+18))}px`;
    if(!modal.hidden && ['seat','name'].includes(modal.dataset.kind))positionSheet();

  }
  function positionSheet(){
    const anchor=returnFocus?.getBoundingClientRect();if(!anchor)return;
    const width=window.innerWidth,height=window.visualViewport?.height||window.innerHeight,top=window.visualViewport?.offsetTop||0;
    if(modal.dataset.kind==='seat'){
      const w=Math.min(width<700?178:224,width-30),side=returnFocus.orbit?.side||1,angle=Math.max(-8,Math.min(8,(returnFocus.orbit?.angle||0)*.55));
      sheet.style.width=`${w}px`;sheet.style.setProperty('--yk-menu-tilt',`${angle}deg`);
      for(const item of sheet.querySelectorAll('.yk-menu-item')){
        const surface=foldedSurfaceGeometry(w,width<700?36:42,side);item.style.height=`${surface.height}px`;paintSurface(item,{...surface,side},'neutral');
      }
      const h=sheet.offsetHeight||sheet.querySelectorAll('.yk-menu-item').length*58,radians=angle*Math.PI/180;
      const halfX=(Math.abs(Math.cos(radians))*w+Math.abs(Math.sin(radians))*h)/2,halfY=(Math.abs(Math.sin(radians))*w+Math.abs(Math.cos(radians))*h)/2;
      const onRight=(anchor.left+anchor.right)/2>width/2,sideRoom=onRight?width-anchor.right:anchor.left;
      if(width>=900&&sideRoom>=2*halfX+16){
        const centerX=onRight?anchor.right+6+halfX:anchor.left-6-halfX;
        const centerY=Math.max(halfY+10,Math.min(height-halfY-10,(anchor.top+anchor.bottom)/2-top));
        sheet.style.left=`${centerX-w/2}px`;sheet.style.top=`${centerY-h/2+top}px`;
        modal.dataset.side=onRight?'right':'left';return;
      }
      const spaceBelow=height-(anchor.bottom-top)-10,spaceAbove=anchor.top-top-10;
      const preferBelow=side>0,below=preferBelow?spaceBelow>=2*halfY||spaceBelow>spaceAbove:spaceAbove<2*halfY&&spaceBelow>=spaceAbove;
      const centerX=Math.max(halfX+10,Math.min(width-halfX-10,(anchor.left+anchor.right)/2));
      const targetY=below?anchor.bottom-top+6+halfY:anchor.top-top-6-halfY;
      const centerY=Math.max(halfY+10,Math.min(height-halfY-10,targetY));
      sheet.style.left=`${centerX-w/2}px`;sheet.style.top=`${centerY-h/2+top}px`;
      modal.dataset.side=below?'below':'above';return;
    }
    sheet.style.removeProperty('--yk-menu-tilt');
    const w=Math.min(260,width-24);sheet.style.width=`${w}px`;
    const h=sheet.getBoundingClientRect().height||64;
    sheet.style.left=`${Math.max(12,(width-w)/2)}px`;sheet.style.top=`${Math.max(12,(height-h)/2)}px`;
    modal.dataset.side='center';
  }
  async function syncOnlineLobby(){
    if(!client||networkBusy||root.hidden||state.step!=='ready'||guestPhase||hostAwaitingStart)return;
    const online=state.seats.some(s=>s.mode==='online');
    if(!online){if(client.role==='host')await client.leave();roomCode='';lobbySignature='';return;}
    const config=configuration(state),problem=configurationError(state,capabilities);
    if(problem){showError(problem);return;}
    const signature=JSON.stringify(config);if(signature===lobbySignature&&client.code)return;
    networkBusy=true;start.disabled=true;sharing.disabled=true;code.textContent='…';
    try{const room=await client.prepareHost(config);lobbySignature=signature;api.room(room);clearError();}
    catch(e){showError(arabicNetworkError(e.message));if(client.session?.snapshot)api.room(client.session.snapshot);}
    finally{networkBusy=false;start.disabled=false;render();}
  }
  function render(){
    root.dataset.step=state.step;root.dataset.guest=guestPhase;identity.textContent=state.name;
    prompt.textContent=({color:'اختر لونك',count:'كم لاعب؟',rounds:'كم شوط للفوز؟'}[state.step]||'');
    prompt.hidden=!prompt.textContent;
    entry.hidden=state.step!=='entry';confirm.hidden=!hostAwaitingStart&&(state.step!=='color'||!state.selectedColor);confirm.textContent=hostAwaitingStart?'إلغاء الانتظار':'تأكيد';
    counts.hidden=state.step!=='count';start.hidden=state.step!=='ready'&&guestPhase!=='color';sharing.hidden=state.step!=='ready';start.disabled=networkBusy||hostAwaitingStart||guestBusy||pending;rounds.hidden=state.step!=='rounds';
    start.textContent=guestPhase?'مغادرة الغرفة':hostAwaitingStart?'بانتظار اكتمال اللاعبين…':'ابدأ اللعب';confirm.disabled=guestBusy;
    code.textContent=networkBusy?'…':roomCode||'—';sharing.classList.toggle('is-unavailable',!roomCode);sharing.disabled=!roomCode||networkBusy;sharing.setAttribute('aria-disabled',String(!roomCode));
    [...rounds.children].forEach(b=>b.disabled=pending);
    for(const {b,status,color} of seatButtons){
      const index=state.seats.findIndex(x=>x.color===color.id),seat=state.seats[index];
      const reserved=guestPhase==='color'&&!guestPreview?.availableColors?.includes(color.id);
      b.hidden=!['color','ready'].includes(state.step);b.classList.toggle('is-color',state.step==='color'&&!reserved);b.classList.toggle('is-reserved',reserved);b.classList.toggle('is-off',seat.mode==='none'&&state.step!=='color');
      b.setAttribute('aria-disabled',String(reserved||guestBusy||guestPhase==='waiting'||hostAwaitingStart));
      b.setAttribute('aria-pressed',String(state.step==='color'&&state.selectedColor===color.id));
      status.textContent=seatLabel(seat);
      b.setAttribute('aria-label',state.step==='color'&&!reserved?`اختر ${color.name}`:status.textContent);
      b.setAttribute('aria-haspopup',state.step==='ready'&&!guestPhase&&!hostAwaitingStart?'menu':'false');
    }
    position();
    refreshGlass();
  }
  function go(next){
    if(moving||networkBusy)return;closeSheet();clearError();
    const target=typeof next==='string'?{...state,step:next}:next;
    const token=flowGeneration;
    const apply=()=>{if(token!==flowGeneration||root.hidden)return;state=target;moving=false;delete root.dataset.moving;render();notify('preview');animate(actions,[{opacity:0,transform:'translate(-50%,12px) scale(.985)'},{opacity:1,transform:'translate(-50%,0) scale(1)'}],420);};
    if(!reduced()&&typeof actions.animate==='function'){
      moving=true;root.dataset.moving='true';notify('preview',{step:'transition'});
      const motion=animate(actions,[{opacity:1,transform:'translate(-50%,0) scale(1)'},{opacity:0,transform:'translate(-50%,-8px) scale(.985)'}],240);motion.finished.then(apply,apply);
    }else apply();
  }
  function finishHostStart(){
    if(pending)return;
    pending=true;hostAwaitingStart=false;render();const token=++flowGeneration;
    const done=()=>{if(token===flowGeneration&&!root.hidden)notify('start');};
    if(!reduced()&&typeof actions.animate==='function'){
      animate(prompt,[{opacity:1},{opacity:0}],300);
      const motion=animate(actions,[{opacity:1,transform:'translate(-50%,0)'},{opacity:0,transform:'translate(-50%,8px)'}],480);motion.finished.then(done,done);
    }else done();
  }
  async function beginMatch(n){
    if(pending||moving||networkBusy||hostAwaitingStart)return;state.rounds=n;
    if(client&&state.seats.some(s=>s.mode==='online')){
      const token=flowGeneration;networkBusy=true;render();
      try{
        const c=configuration(state),reply=await client.dispatch('create',{players:c.players,targetRounds:n});
        if(token!==flowGeneration||root.hidden)return;
        if(!reply?.ok)throw new Error(reply?.error||'online_timeout');
        hostAwaitingStart=reply.room.status==='waiting';state={...state,step:'ready'};api.room(reply.room);
        if(!hostAwaitingStart)finishHostStart();
      }catch(e){if(token===flowGeneration){pending=false;state={...state,step:'ready'};showError(arabicNetworkError(e.message));}}
      finally{networkBusy=false;render();}
      return;
    }
    finishHostStart();
  }
  async function copyRoom(){
    if(!roomCode){showError('الأونلاين غير متاح حالياً');return;}
    const url=new URL(window.location.origin+window.location.pathname);url.searchParams.set('room',roomCode);
    try{await window.navigator.clipboard.writeText(url.toString());code.textContent='تم النسخ';window.setTimeout(()=>{if(!root.hidden)code.textContent=roomCode;},1100);}catch{showError('تعذر النسخ');}
  }
  function openSheet(title,origin,kind){
    returnFocus?.setAttribute?.('aria-expanded','false');sheetGeneration++;returnFocus=origin||document.activeElement;returnFocus?.setAttribute?.('aria-expanded','true');
    sheet.setAttribute('role','dialog');sheet.setAttribute('aria-labelledby','ykSheetTitle');sheet.removeAttribute('aria-label');sheet.getAnimations?.().forEach(x=>x.cancel());sheet.replaceChildren();sheet.style.left=sheet.style.top=sheet.style.width='';
    const h=el('h2','',title);h.id='ykSheetTitle';h.hidden=!title;sheet.append(h);
    modal.hidden=false;modal.dataset.kind=kind;root.dataset.overlay=kind;
    const blocking=!['seat','name'].includes(kind);header.inert=seats.inert=actions.inert=blocking;sheet.setAttribute('aria-modal',String(blocking));
    notify('preview');refreshGlass();animate(sheet,kind==='seat'?[{opacity:0},{opacity:1}]:[{opacity:0,transform:'translateY(8px) scale(.99)'},{opacity:1,transform:'none'}],200);
    return sheet;
  }
  function closeSheet(animated=false,after=()=>{}){
    if(modal.hidden){after();return;}
    commitName();
    const token=++sheetGeneration;
    const finish=()=>{if(token!==sheetGeneration)return;modal.hidden=true;sheet.replaceChildren();delete root.dataset.profile;delete root.dataset.overlay;header.inert=seats.inert=actions.inert=false;returnFocus?.setAttribute?.('aria-expanded','false');returnFocus?.focus?.({preventScroll:true});render();notify('preview');after();if(state.step==='ready'&&!networkBusy)void syncOnlineLobby();};
    if(animated && !reduced()&&typeof sheet.animate==='function'){
      const motion=animate(sheet,modal.dataset.kind==='seat'?[{opacity:1},{opacity:0}]:[{opacity:1,transform:'none'},{opacity:0,transform:'translateY(-6px) scale(.985)'}],160);motion.finished.then(finish,finish);
    }else finish();
  }
  function resetOverlay(){
    for(const node of [actions,prompt,sheet])node.getAnimations?.().forEach(animation=>animation.cancel());
    modal.hidden=true;sheet.replaceChildren();sheet.style.left=sheet.style.top=sheet.style.width='';
    delete modal.dataset.kind;delete modal.dataset.side;
    delete root.dataset.profile;delete root.dataset.overlay;delete root.dataset.moving;
    header.inert=seats.inert=actions.inert=false;
    returnFocus?.setAttribute?.('aria-expanded','false');returnFocus=null;
  }
  function input(label,options={}){const wrap=el('label','yk-field');const text=el('span','yk-sr-only',label);const field=el('input');Object.assign(field,options);field.setAttribute('aria-label',label);wrap.append(text,field);return {wrap,field};}
  function requireProfile(after){
    if(profile){after();return;}
    openProfile(after);
  }
  function openProfile(after=null){
    profileContinuation=typeof after==='function'?after:null;
    openSheet('رقم الجوال',identity,'profile');root.dataset.profile='active';notify('preview');
    const form=el('form','yk-form');form.noValidate=true;
    const phone=input('رقم الجوال',{value:profile?.phone||'',type:'tel',inputMode:'numeric',autocomplete:'tel',maxLength:15,required:true,dir:'ltr'});phone.field.enterKeyHint='done';
    phone.field.addEventListener('input',()=>{phone.field.value=digits(phone.field.value);});
    const error=el('div','yk-field-error');error.setAttribute('role','alert');const next=el('button','yk-primary','متابعة');next.type='submit';form.append(phone.wrap,error,next);
    form.addEventListener('submit',e=>{e.preventDefault();const number=digits(phone.field.value);if(!/^\d{7,15}$/.test(number)){error.textContent='تأكد من رقم الجوال';return;}const name=profiles[number];if(typeof name==='string'&&validProfile({name,phone:number}))finishProfile(name,number);else profileName(number);});sheet.append(form);
  }
  function profileName(number){
    sheet.replaceChildren();const title=el('h2','','الاسم الكريم');title.id='ykSheetTitle';const form=el('form','yk-form');form.noValidate=true;
    const name=input('الاسم الكريم',{maxLength:24,required:true,autocomplete:'given-name'});name.field.enterKeyHint='done';const error=el('div','yk-field-error');error.setAttribute('role','alert');const next=el('button','yk-primary','متابعة');next.type='submit';form.append(name.wrap,error,next);
    form.addEventListener('submit',e=>{e.preventDefault();if(name.field.value.trim().length<2){error.textContent='اكتب اسمك';return;}finishProfile(name.field.value.trim(),number);});sheet.append(title,form);name.field.focus();animate(sheet,[{opacity:0,transform:'translateX(8px)'},{opacity:1,transform:'none'}]);
  }
  function finishProfile(name,phone){
    profile={name,phone};profiles[phone]=name;state=newSetup(name);
    try{window.localStorage.setItem(STORE,JSON.stringify(profile));window.localStorage.setItem('yakolak-profiles-v2',JSON.stringify(profiles));}catch{}
    const after=profileContinuation;profileContinuation=null;
    closeSheet(true,()=>{render();notify('preview');if(after)after();});
  }
  function openSeat(index,origin){
    closeSheet();openSheet('',origin,'seat');sheet.setAttribute('aria-label',seatLabel(state.seats[index]));sheet.setAttribute('role','menu');sheet.removeAttribute('aria-labelledby');
    const choices=el('div','yk-menu');
    const item=(label,action,selected=false,parent=choices)=>{const b=button(label,action,'yk-menu-item');b.setAttribute('role','menuitemradio');b.setAttribute('aria-checked',String(selected));addSurface(b);parent.append(b);return b;};
    if(state.seats[index].mode!=='local')item('لاعب',()=>{if(index>0)state=changeSeat(state,index,'local',state.seats[index].name);playerName(index,origin);},state.seats[index].mode==='local');
    if(index>0&&capabilities.online)item('أونلاين',()=>{state=changeSeat(state,index,'online');closeSheet(true);},state.seats[index].mode==='online');
    if(index>0){item('الكمبيوتر (بوت)',()=>{state=changeSeat(state,index,'bot');closeSheet(true);},state.seats[index].mode==='bot');item('فاضي (بدون لاعب)',()=>{state=changeSeat(state,index,'none');closeSheet(true);},state.seats[index].mode==='none');}
    const names=el('div','yk-menu-players');
    names.classList.toggle('is-grid',state.seats.filter(seat=>seat.mode==='local').length>2);
    for(const [source,seat] of state.seats.entries())if(seat.mode==='local'){
      item(seatLabel(seat),()=>{if(source===index)playerName(index,origin);else{state=swapPlayers(state,index,source);closeSheet(true);}},source===index,names);
    }
    choices.append(names);
    sheet.append(choices);positionSheet();choices.querySelector('button').focus({preventScroll:true});
  }
  function playerName(index,origin){
    openSheet('',origin,'name');sheet.setAttribute('aria-label','اسم اللاعب');sheet.removeAttribute('aria-labelledby');
    const form=el('form','yk-form');form.noValidate=true;
    const name=input('اسم اللاعب',{value:state.seats[index].name,placeholder:'اسم اللاعب',maxLength:24,autocomplete:'off'});name.field.enterKeyHint='done';
    const inputRow=el('div','yk-name-input');inputRow.append(name.wrap);
    const clearName=button('',()=>{name.field.value='';clearName.hidden=true;name.field.focus({preventScroll:true});},'yk-input-clear');
    const clearSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');clearSvg.setAttribute('viewBox','0 0 16 16');clearSvg.setAttribute('aria-hidden','true');const clearPath=document.createElementNS(clearSvg.namespaceURI,'path');clearPath.setAttribute('d','m4 4 8 8M12 4l-8 8');clearSvg.append(clearPath);clearName.append(clearSvg);
    clearName.setAttribute('aria-label','مسح اسم اللاعب');clearName.hidden=!name.field.value;
    name.field.addEventListener('input',()=>{clearName.hidden=!name.field.value;});inputRow.append(clearName);form.append(inputRow);
    nameDraft={index,field:name.field};form.addEventListener('submit',e=>{e.preventDefault();name.field.blur();closeSheet(true);});sheet.append(form);positionSheet();name.field.focus({preventScroll:true});
  }
  function commitName(){
    if(!nameDraft)return;const {index,field}=nameDraft;nameDraft=null;const value=field.value.trim().slice(0,24);
    if(index===0){state.name=value;state.seats[0].name=value;}else state=changeSeat(state,index,'local',value);
  }
  function finishGuestJoin(code){
    if(guestPhase==='starting')return;
    const room=client?.session?.snapshot;
    if(room?.status==='waiting'||room?.status==='cancelled'){showGuestLobby(room);return;}
    guestPhase='starting';const color=room?.players.find(p=>p.seat===client.session.identity?.seat)?.color||state.selectedColor;
    closeSheet(true,()=>window.yakolakVisualSetupAction?.(JSON.stringify({action:'join',code,name:state.name,color,rounds:room?.targetRounds||state.rounds})));
  }
  function showGuestLobby(room){
    if(guestPhase==='starting')return;
    if(room.status==='playing'){finishGuestJoin(room.code);return;}
    guestPhase='waiting';state={...state,step:'ready',countChosen:true,selectedColor:''};api.room(room);notify('preview');
    try{const u=new URL(window.location.href);u.searchParams.set('room',room.code);window.history.replaceState(null,'',u);}catch{}
    if(room.status==='cancelled')showError('أغلق منشئ الغرفة الاتصال');
  }
  function renderJoinColors(preview){
    if(!preview)return;
    guestPreview=preview;guestPhase='color';roomCode=preview.code;
    state={...state,step:'color',countChosen:false,selectedColor:preview.availableColors.includes(state.selectedColor)?state.selectedColor:'',seats:COLORS.map(color=>{
      const p=preview.players.find(p=>p.color===color.id);
      return {color:color.id,mode:p?(p.mode||'online'):'none',name:p?.name||'',owner:p?.controller||'p1'};
    })};
    render();notify('preview');
    if(!preview.availableColors.length)showError('لا توجد ألوان شاغرة في الغرفة');
  }
  async function chooseGuestColor(){
    if(guestBusy||!state.selectedColor||!guestPreview?.availableColors.includes(state.selectedColor))return;
    guestBusy=true;clearError();render();const token=flowGeneration;
    try{await client.chooseColor(state.selectedColor);if(token!==flowGeneration){await client.leave();return;}finishGuestJoin(client.code||guestPreview.code);}
    catch(e){if(token===flowGeneration){renderJoinColors(client.session?.preview||guestPreview);showError(arabicNetworkError(e.message));}}
    finally{guestBusy=false;render();}
  }
  async function leaveGuestLobby(){
    const leavingCode=client?.code||roomCode;
    flowGeneration++;hostAwaitingStart=false;guestPhase='';guestPreview=null;guestBusy=false;roomCode='';state=newSetup(profile?.name||state.name);clearError();render();notify('preview');
    try{await client?.leave();for(const key of ['yakolak-p2p:','yakolak-online:'])window.sessionStorage.removeItem(key+leavingCode);const u=new URL(window.location.href);u.searchParams.delete('room');window.history.replaceState(null,'',u);}catch{}
  }
  function openJoin(invitation=''){
    openSheet('رابط أو رمز الغرفة',join,'join');const form=el('form','yk-form');form.noValidate=true;
    const value=input('رابط أو رمز الغرفة',{value:typeof invitation==='string'?invitation:'',type:'text',autocomplete:'off',required:true,dir:'ltr'});const error=el('div','yk-field-error');error.setAttribute('role','alert');const submit=el('button','yk-primary','انضمام');submit.type='submit';form.append(value.wrap,error,submit,button('إلغاء',()=>closeSheet(true),'yk-subtle'));
    form.addEventListener('submit',async e=>{
      e.preventDefault();const code=parseRoomInput(value.field.value,window.location.href);if(!code){error.textContent='تأكد من الرابط أو الرمز';return}
      if(!capabilities.online||!client){error.textContent='الأونلاين غير متاح حالياً';return}
      const token=sheetGeneration;submit.disabled=true;submit.textContent='جارٍ الاتصال…';
      try{const session=await client.inspectRoom(code);if(token!==sheetGeneration){await client.leave();return}closeSheet();if(session.identity)finishGuestJoin(code);else renderJoinColors(session.preview)}
      catch(e){if(token===sheetGeneration){error.textContent=arabicNetworkError(e.message);submit.disabled=false;submit.textContent='انضمام'}}
    });sheet.append(form);value.field.focus();
  }
  modal.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&modal.dataset.kind!=='profile'){e.preventDefault();closeSheet(true);return;}
    if(modal.dataset.kind==='seat'&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const items=[...sheet.querySelectorAll('button')];const index=items.indexOf(document.activeElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}
    if(e.key==='Tab'&&sheet.getAttribute('aria-modal')==='true'){const list=[...sheet.querySelectorAll('input,button')];if(e.shiftKey&&document.activeElement===list[0]){e.preventDefault();list.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===list.at(-1)){e.preventDefault();list[0]?.focus();}}
  });
  root.addEventListener('pointerdown',e=>{if(nameDraft&&!sheet.contains(e.target)&&!returnFocus?.contains(e.target))closeSheet();},true);
  root.addEventListener('click',e=>{if(!modal.hidden&&modal.dataset.kind!=='profile'&&!sheet.contains(e.target)&&!returnFocus?.contains(e.target))closeSheet(true);});root.addEventListener('keydown',e=>e.stopPropagation());
  const api={
    lesson:updateLesson,
    open(options={}){const request=String(options.request||'');if(request&&request===lastEntryRequest)return;lastEntryRequest=request;resetLesson();flowGeneration++;sheetGeneration++;guestPhase='';guestPreview=null;guestBusy=false;hostAwaitingStart=false;nameDraft=null;profileContinuation=null;closeSheet();resetOverlay();capabilities={online:!!options.online||supportsP2P(window),mixed:true};connections=options.resume?.players?connections:[];roomCode=options.resume?.players?roomCode:'';pending=moving=false;state=options.resume?.players?restoreSetup(options.resume,profile?.name||''):newSetup(profile?.name||'');if(options.preview_step==='color')state={...state,step:'color',selectedColor:''};geometry=options.geometry||geometry;root.hidden=false;document.body.dataset.yakolakVisualSetup='visible';clearError();render();if(request)document.body.dataset.yakolakVisualSetupAck=request;
      // Never synchronously call back into Godot while it is publishing entry.
      const token=flowGeneration;window.setTimeout(()=>{if(token!==flowGeneration||root.hidden)return;notify('preview');const invitation=parseRoomInput(new URL(window.location.href).searchParams.get('room')||'',window.location.href);if(invitation&&!inviteHandled&&!options.resume?.players&&client?.role!=='host'){inviteHandled=true;requireProfile(()=>openJoin(invitation));}},0);},
    close(){resetLesson();flowGeneration++;sheetGeneration++;guestPhase='';guestPreview=null;guestBusy=false;hostAwaitingStart=false;nameDraft=null;profileContinuation=null;pending=moving=false;resetOverlay();root.hidden=true;refreshGlass();delete window.yakolakPendingVisualSetup;document.body.dataset.yakolakVisualSetup='hidden';},
    geometry(points){geometry=points;root.dataset.world=String(!!points.world);position();},
    error(text){root.hidden=false;showError(text);},
    networkError(code){pending=moving=networkBusy=false;root.hidden=false;document.body.dataset.yakolakVisualSetup='visible';if(state.step==='rounds')state={...state,step:'ready'};roomCode=client?.code||'';lobbySignature='';render();showError(arabicNetworkError(code));},
    room(room){roomCode=/^\d{3}$/.test(String(room.code||''))?String(room.code):'';connections=(room.players||[]).filter(x=>x.connected!==false&&x.name).map(x=>({seat:String(x.seat),name:String(x.name).slice(0,24)}));if(Array.isArray(room.slots))state={...state,onlineSeatOrder:room.slots.map(s=>s.color),seats:state.seats.map(seat=>{const slot=room.slots.find(s=>s.color===seat.color);return slot?{...seat,mode:slot.mode,name:(room.players||[]).find(p=>p.color===seat.color)?.name||(slot.mode==='online'?'':slot.name)||''}:{...seat,mode:'none',name:''}})};render();const token=flowGeneration;window.setTimeout(()=>{if(token===flowGeneration&&!root.hidden)notify('preview');},0);}
  };
  window.YakolakSetup=api;viewport();
  client?.subscribe(detail=>{
    if(root.hidden)return;
    if(guestPhase==='color'&&detail.preview)renderJoinColors(detail.preview);
    else if(guestPhase==='waiting'&&detail.role==='guest'&&detail.room)showGuestLobby(detail.room);
    else if(!guestPhase&&state.step==='ready'&&detail.role==='host'){
      if(detail.room){api.room(detail.room);if(hostAwaitingStart&&detail.room.status==='playing')finishHostStart();}
      if(detail.error){roomCode='';lobbySignature='';render();showError(arabicNetworkError(detail.error));}
    }
    if(guestPhase&&detail.error)showError(arabicNetworkError(detail.error));
  });
  const acceptEntryRequest=()=>{
    const request=document.body.dataset.yakolakVisualSetupRequest||'';
    const options=window.yakolakPendingVisualSetup;
    if(request&&request!==lastEntryRequest){api.open({...options,request});delete window.yakolakPendingVisualSetup;}
    else if(!request&&options){api.open(options);delete window.yakolakPendingVisualSetup;}
  };
  // Covers engine-first/module-first loading and a missed direct bridge call.
  // Repeated requests acknowledge delivery without resetting the current step.
  new window.MutationObserver(acceptEntryRequest).observe(document.body,{attributes:true,attributeFilter:['data-yakolak-visual-setup-request']});
  acceptEntryRequest();
  if(window.yakolakPendingVisualGeometry){api.geometry(window.yakolakPendingVisualGeometry);delete window.yakolakPendingVisualGeometry;}
  return api;
}
if(typeof document!=='undefined')mountSetup(document,window);
