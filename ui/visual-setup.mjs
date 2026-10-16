import {attachLiquidLens} from './vendor/liquefy-core-1.1.0.mjs';

// A standing cylindrical wall: equal horizontal radii, vertically separated
// rims. A thick ellipse stroke would be a flat washer, not this reference.
export function orbitRibbonGeometry(points,width,height,board=null){
  if(!Array.isArray(points)||points.length!==4||width<=0||height<=0||points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))return null;
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const validBoard=Array.isArray(board)&&board.length===4&&board.every(Number.isFinite)&&board[2]>0&&board[3]>0;
  const [bx,by,bw,bh]=validBoard?board:[Math.min(...xs)-width*.15,Math.min(...ys),Math.max(...xs)-Math.min(...xs)+width*.3,Math.max(...ys)-Math.min(...ys)];
  const thickness=Math.max(48,Math.min(92,bw*.085,height*.14));
  const rx=Math.max(90,Math.min(width/2-12,bw*(width<700?.63:.47)+8));
  const cx=Math.max(rx+12,Math.min(width-rx-12,bx+bw/2));
  const cy=Math.max(thickness+24,Math.min(height-thickness-140,by+bh*.49));
  const ry=Math.max(62,Math.min(bh*(width<700?.65:.50)+thickness*.2,cy-thickness/2-44,height-cy-thickness/2-144));
  return {cx,cy,rx,ry,thickness};
}
export function orbitY(ring,x,side){
  const u=Math.max(-1,Math.min(1,(x-ring.cx)/ring.rx));
  return ring.cy+side*ring.ry*Math.sqrt(Math.max(0,1-u*u));
}
// Project a rounded rectangle onto the same cylinder as the two glass rims.
// Keep the Arabic label a single shaped SVG text run along its own baseline.
export function orbitPlateGeometry(ring,centerX,side,width,height){
  const left=centerX-width/2,r=Math.min(20,height*.33),points=[];
  const add=(x,y)=>points.push([x,orbitY(ring,x,side)+y]);
  const line=(x1,y1,x2,y2)=>{for(let i=0;i<=20;i++)add(x1+(x2-x1)*i/20,y1+(y2-y1)*i/20);};
  const arc=(cx,cy,a)=>{for(let i=0;i<=10;i++){const t=(a+i*9)*Math.PI/180;add(cx+r*Math.cos(t),cy+r*Math.sin(t));}};
  line(left+r,-height/2,left+width-r,-height/2);arc(left+width-r,-height/2+r,-90);
  line(left+width,-height/2+r,left+width,height/2-r);arc(left+width-r,height/2-r,0);
  line(left+width-r,height/2,left+r,height/2);arc(left+r,height/2-r,90);
  line(left,height/2-r,left,-height/2+r);arc(left+r,-height/2+r,180);
  const top=Math.min(...points.map(p=>p[1]))-8,bottom=Math.max(...points.map(p=>p[1]))+8;
  const path=points.map(([x,y],i)=>`${i?'L':'M'}${(x-left).toFixed(2)},${(y-top).toFixed(2)}`).join(' ')+' Z';
  const baseline=[];for(let i=0;i<=60;i++){const x=left+12+(width-24)*i/60;baseline.push(`${i?'L':'M'}${(x-left).toFixed(2)},${(orbitY(ring,x,side)-top).toFixed(2)}`);}
  return {left,top,width,height:bottom-top,path,baseline:baseline.join(' ')};
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
  return { tutorial: false, rounds: state.rounds, online_join_code: '', players: state.seats.filter(x => x.mode !== 'none').map((seat, i) => {
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
    if (!capabilities.mixed && active.slice(1).some(x => x.mode !== 'online')) return 'الغرفة لا تدعم خلط الأجهزة حالياً';
  }
  return '';
}

export function restoreSetup(config, fallbackName='') {
  const players=Array.isArray(config?.players)?config.players:[];
  if(players.length<2||players.length>4||!COLORS.some(c=>c.id===players[0]?.color))return newSetup(fallbackName);
  let state=chooseCount(confirmColor(chooseColor(newSetup(players[0].label||fallbackName),players[0].color)),players.length);
  return {...state,rounds:[3,5].includes(config.rounds)?config.rounds:3,seats:state.seats.map(seat=>{
    const player=players.find(p=>p.color===seat.color);
    return player?{...seat,mode:player.mode==='bot'?'bot':'local',name:player.mode==='bot'?'':String(player.label||'').slice(0,24),owner:player.device_owner||'p1'}:{...seat,mode:'none',name:''};
  })};
}

export function parseRoomInput(value, base = 'https://a7sncom.github.io/yakolak/') {
  const text = String(value).trim();
  if (/^[0-9٠-٩۰-۹\s]+$/.test(text)) { const code = digits(text); return /^\d{2}$/.test(code) ? code : ''; }
  try { const url = new URL(text); const origin = new URL(base); const code = digits(url.searchParams.get('room') || '');
    return url.origin === origin.origin && url.pathname === origin.pathname && /^\d{2}$/.test(code) ? code : '';
  } catch { return ''; }
}

export function mountSetup(document, window) {
  const STORE = 'yakolak-visitor-v1';
  let profile = null, profiles = {};
  try { const saved = JSON.parse(window.localStorage.getItem(STORE)); if (validProfile(saved)) profile = saved; } catch {}
  try { const saved = JSON.parse(window.localStorage.getItem('yakolak-profiles-v2')); if (saved && typeof saved === 'object' && !Array.isArray(saved)) profiles = saved; } catch {}
  if (profile) profiles[profile.phone] = profile.name;
  let state = newSetup(profile?.name || '');
  let capabilities = { online: false, mixed: false }, connections = [], geometry = {}, roomCode = '';
  let pending = false, returnFocus = null, sheetGeneration = 0, moving = false, nameDraft = null, flowGeneration = 0, profileContinuation = null;
  let lastEntryRequest = '';
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const button = (label, action, cls = '') => { const node = el('button',cls);if(label)node.append(el('span','yk-button-label',label)); node.type = 'button'; node.addEventListener('click',e=>{e.stopPropagation();action(e);}); return node; };
  const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const animate = (node,frames,duration=320) => { node.getAnimations?.().forEach(x=>x.cancel());if (!reduced()) return node.animate?.(frames,{duration,easing:'cubic-bezier(.4,0,.2,1)'}); };
  const root = el('section','yk-setup'); root.id = 'yakolakVisualSetup'; root.dir = 'rtl'; root.hidden = true; root.setAttribute('aria-label','إعداد اللعبة');
  const header = el('header','yk-header');
  const identity = button('',openProfile,'yk-identity');
  const prompt = el('h1','yk-sr-only'); prompt.id='ykPrompt'; prompt.setAttribute('aria-live','polite'); header.append(identity,prompt);
  const seats = el('div','yk-seats');
  const seatButtons = COLORS.map(color=>{
    const b = button('', e=>{
      if (moving) return;
      if (state.step === 'color') {
        let selected=color.id;
        if (e.detail>0 && geometry.seats) selected=COLORS.reduce((best,c)=>{const p=geometry.seats[c.id],distance=Math.hypot(e.clientX-p[0]*window.innerWidth,e.clientY-p[1]*window.innerHeight);return distance<best.distance?{id:c.id,distance}:best;},{id:color.id,distance:Infinity}).id;
        state=chooseColor(state,selected);clearError();render();notify('preview');
      } else if (state.step==='ready') openSeat(state.seats.findIndex(x=>x.color===color.id),b);
    },'yk-seat');
    b.dataset.color=color.id; b.style.setProperty('--seat-color',color.hex);
    const status=el('span','yk-seat-status'), arrow=el('span','yk-seat-arrow','⌄');arrow.setAttribute('aria-hidden','true');
    b.append(status,arrow);seats.append(b);return {b,status,color};
  });
  const actions = el('footer','yk-actions');
  const entry = el('div','yk-entry');
  const create=button('غرفة جديدة',()=>requireProfile(()=>go('color')),'yk-primary');
  const join=button('انضمام لغرفة',()=>requireProfile(openJoin),'yk-outline'); entry.append(create,join);
  const confirm=button('تأكيد',()=>{if(state.selectedColor)go('count');},'yk-primary yk-confirm');
  const counts=el('div','yk-counts');counts.setAttribute('role','group');counts.setAttribute('aria-label','عدد اللاعبين');
  [2,3,4].forEach(n=>{const b=button(String(n),()=>go(chooseCount(state,n)),'yk-choice');b.setAttribute('aria-label',`${n} لاعبين`);counts.append(b);});
  const sharing=button('',copyRoom,'yk-sharing');sharing.setAttribute('aria-label','نسخ رابط الغرفة');
  const shareIcon=el('span','yk-share-icon');
  // Code-native icon, with no external asset or user HTML.
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
  for(const d of ['M12 16V3','m7 8 5-5 5 5','M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6']){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);svg.append(path);}shareIcon.append(svg);
  const code=el('span','yk-room-code','—');code.dir='ltr';sharing.append(shareIcon,code);
  const start=button('ابدأ اللعب',()=>{const problem=configurationError(state,capabilities);if(problem){showError(problem);return;}closeSheet();go('rounds');},'yk-primary yk-start');
  const rounds=el('div','yk-rounds');rounds.setAttribute('role','group');rounds.setAttribute('aria-label','أشواط الفوز');
  [3,5].forEach(n=>{const b=button(String(n),()=>beginMatch(n),'yk-choice');b.setAttribute('aria-label',`الفوز بـ ${n} أشواط`);rounds.append(b);});
  const errors=el('div','yk-error');errors.setAttribute('role','status');errors.setAttribute('aria-live','polite');
  actions.append(entry,confirm,counts,sharing,start,rounds,errors);
  const modal=el('div','yk-modal');modal.hidden=true;
  const sheet=el('section','yk-sheet');sheet.setAttribute('role','dialog');sheet.setAttribute('aria-labelledby','ykSheetTitle');modal.append(sheet);
  root.append(header,seats,actions,modal);document.body.append(root);
  const lenses=new Map();
  const ns='http://www.w3.org/2000/svg';
  const svgNode=(tag,attrs={})=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
  const gradient=(id,stops,vertical=false)=>{
    const n=svgNode('linearGradient',{id,x1:'0%',y1:'0%',x2:vertical?'0%':'100%',y2:vertical?'100%':'0%'});
    for(const [offset,color,opacity=1] of stops)n.append(svgNode('stop',{offset,'stop-color':color,'stop-opacity':opacity}));
    return n;
  };
  const orbitRibbon=svgNode('svg',{class:'yk-orbit-ribbon','aria-hidden':'true'}),defs=svgNode('defs');
  defs.append(
    gradient('yk-orbit-back', [['0%','#f4f6ff',.8],['5%','#9ca6b8',.55],['18%','#30333b',.72],['48%','#0a1729',.9],['75%','#063a9b',.8],['95%','#3c8eff',.8],['100%','#d7ecff',.9]]),
    gradient('yk-orbit-front',[['0%','#92fff0',.9],['10%','#006e60',.85],['32%','#09352e',.85],['50%','#18232e',.85],['70%','#3d434b',.85],['91%','#c5c6cb',.8],['100%','#f4f6ff',.9]]),
    gradient('yk-orbit-sheen',[['0%','#fff',.23],['12%','#fff',.03],['55%','#000',.08],['88%','#030810',.3],['100%','#fff',.2]],true)
  );
  orbitRibbon.append(defs);
  const walls=[-1,1].map(side=>{
    const group=svgNode('g',{'data-side':side<0?'back':'front'});
    const wall=svgNode('path',{fill:`url(#yk-orbit-${side<0?'back':'front'})`}),sheen=svgNode('path',{fill:'url(#yk-orbit-sheen)'});
    const rims=[-1,1].map(()=>svgNode('path',{fill:'none',stroke:side<0?'#dbeaff':'#edffff','stroke-width':'1.5','stroke-opacity':'.8'}));
    const seam=svgNode('path',{fill:'none',stroke:'#b5d8ff','stroke-width':'.8','stroke-opacity':'.38'});
    group.append(wall,sheen,...rims,seam);orbitRibbon.append(group);return {side,wall,sheen,rims,seam};
  });
  orbitRibbon.setAttribute('hidden','');seats.prepend(orbitRibbon);
  for(const {b,color} of seatButtons){
    const svg=svgNode('svg',{class:'yk-orbit-plate','aria-hidden':'true'}),d=svgNode('defs');
    const glow=color.id==='blue'?'#1985ff':color.id==='green'?'#00e1bc':'#fff';
    const dark=color.id==='blue'?'#031331':color.id==='green'?'#002e27':'#22252b';
    d.append(gradient(`yk-plate-${color.id}`,[['0%',dark,.82],['42%',dark,.96],['100%',dark,.82]],true));
    const baseline=svgNode('path',{id:`yk-baseline-${color.id}`,fill:'none'});d.append(baseline);
    const halo=svgNode('path',{class:'yk-plate-halo',fill:'none',stroke:glow,'stroke-width':'5'});
    const face=svgNode('path',{class:'yk-plate-face',fill:`url(#yk-plate-${color.id})`,stroke:glow,'stroke-width':'1.7'});
    const edge=svgNode('path',{class:'yk-plate-edge',fill:'none',stroke:'#fff','stroke-width':'1.1','stroke-opacity':'.96'});
    const text=svgNode('text',{'text-anchor':'middle',direction:'rtl',fill:'#fff',dy:'.34em'});
    const caption=svgNode('textPath',{href:`#yk-baseline-${color.id}`,startOffset:'50%'});text.append(caption);
    svg.append(d,halo,face,edge,text);b.append(svg);b.orbit={svg,baseline,halo,face,edge,text,caption};
  }
  let currentOrbit=null;
  function refreshOrbitRibbon(){
    if(root.hidden||state.step!=='ready'){orbitRibbon.setAttribute('hidden','');currentOrbit=null;return;}
    const width=window.innerWidth,height=root.getBoundingClientRect().height||window.innerHeight;
    const fallback={gold:[.28,.30],blue:[.72,.30],green:[.28,.66],marble:[.72,.66]};
    const points=seatButtons.map(({color})=>{const p=geometry.seats?.[color.id]||fallback[color.id];return [p[0]*width,p[1]*height];});
    const ring=orbitRibbonGeometry(points,width,height,geometry.board);if(!ring)return;
    currentOrbit=ring;orbitRibbon.removeAttribute('hidden');orbitRibbon.setAttribute('viewBox',`0 0 ${width} ${height}`);
    const {cx,cy,rx,ry,thickness}=ring;
    // Each half is a vertically extruded arc, never a stroked ellipse.
    const arc=(side,offset)=>`M ${cx-rx},${cy+offset} A ${rx},${ry} 0 0 ${side<0?1:0} ${cx+rx},${cy+offset}`;
    for(const {side,wall,sheen,rims,seam} of walls){
      const d=arc(side,-thickness/2)+` L ${cx+rx},${cy+thickness/2} A ${rx},${ry} 0 0 ${side<0?0:1} ${cx-rx},${cy+thickness/2} Z`;
      wall.setAttribute('d',d);sheen.setAttribute('d',d);
      rims[0].setAttribute('d',arc(side,-thickness/2));rims[1].setAttribute('d',arc(side,thickness/2));seam.setAttribute('d',arc(side,-thickness/2+4));
    }
    const middleY=(Math.min(...points.map(p=>p[1]))+Math.max(...points.map(p=>p[1])))/2;
    seatButtons.forEach(({b,status,color},i)=>{
      const side=points[i][1]<middleY?-1:1,sign=points[i][0]<cx?-1:1;
      const plateWidth=rx*(width<700?.72:.65),plateHeight=thickness*.79;
      const plate=orbitPlateGeometry(ring,cx+sign*rx*.54,side,plateWidth,plateHeight);
      b.style.left=`${plate.left+plate.width/2}px`;b.style.top=`${plate.top+plate.height/2}px`;b.style.width=`${plate.width}px`;b.style.height=`${plate.height}px`;b.style.setProperty('--yk-seat-tilt','0deg');
      b.dataset.cylinder='standing-orbit';
      const art=b.orbit;art.svg.setAttribute('viewBox',`0 0 ${plate.width} ${plate.height}`);
      for(const path of [art.halo,art.face,art.edge])path.setAttribute('d',plate.path);
      art.baseline.setAttribute('d',plate.baseline);
      // The DOM label remains the accessible source. One text run preserves
      // Arabic joining; textPath bends it without splitting letters or strips.
      const label=status.textContent,short=label.length>23?label.slice(0,22)+'…':label;
      art.caption.textContent=short+'  ⌄';
      const fontSize=Math.max(12,Math.min(24,plateWidth/(short.length>18?12:9.1)));
      art.text.setAttribute('font-size',String(fontSize));
      art.text.removeAttribute('textLength');
      // Only fit unusually long names; never stretch short names or Arabic spaces.
      const measured=typeof art.text.getComputedTextLength==='function'?art.text.getComputedTextLength():0;
      if(measured>plateWidth-28){art.text.setAttribute('textLength',String(plateWidth-28));art.text.setAttribute('lengthAdjust','spacingAndGlyphs');}
    });
    orbitRibbon.dataset.shape='standing-cylinder';
  }

  function refreshGlass(){
    // Actual Liquefy Core optics. WebKit uses the same neutral CSS material:
    // it cannot render SVG displacement in backdrop-filter. No RGB dispersion
    // or spring transforms: the board anchors and text must remain steady.
    const nodes=[prompt,sheet,create,join,confirm,start,sharing,...counts.children,...rounds.children,...seatButtons.map(x=>x.b)];
    for(const node of nodes){
      if(node===prompt)continue;
      if(node.classList.contains('yk-seat')){lenses.get(node)?.destroy();lenses.delete(node);continue;}
      const visible=!root.hidden&&!node.hidden&&!node.closest('[hidden]')&&!node.classList.contains('is-color');
      if(!visible){lenses.get(node)?.destroy();lenses.delete(node);continue;}
      if(!lenses.has(node)){const desktop=window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;const lens=attachLiquidLens(node,{strength:.32,dispersion:0,blur:desktop?12:1,saturation:1,respectReducedTransparency:true});if(lens)lenses.set(node,lens);}
    }
  }
  root.dataset.glassEngine='liquefy-core-1.1.0';

  function clearError(){errors.textContent='';}
  function showError(text){pending=false;errors.textContent=text;render();}
  function notify(action,override={}){
    const payload={action,...configuration(state),all_seats:state.seats,host_name:state.name,selected_color:state.selectedColor,count_chosen:state.countChosen,step:root.dataset.profile==='active'?'profile':state.step,overlay_open:!modal.hidden,...override};
    window.yakolakVisualSetupAction?.(JSON.stringify(payload));
  }
  function viewport(){const vv=window.visualViewport;const h=vv?.height||window.innerHeight;const base=Math.max(root.getBoundingClientRect().height||0,window.innerHeight);root.style.setProperty('--yk-vv-height',`${h}px`);root.style.setProperty('--yk-vv-top',`${vv?.offsetTop||0}px`);root.classList.toggle('is-keyboard',h<base*.78);position();}
  window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);window.addEventListener('resize',viewport);
  function position(){
    const width=window.innerWidth,height=root.getBoundingClientRect().height||window.innerHeight;
    const fallback={marble:[.7,.61],blue:[.7,.40],gold:[.3,.40],green:[.3,.61]};
    for(const {b,color} of seatButtons){
      const point=geometry.seats?.[color.id]||fallback[color.id];
      if(state.step==='color'){
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
    refreshOrbitRibbon();
    if(currentOrbit&&state.step==='ready')actions.style.top=`${Math.min(height-h-16,Math.max(parseFloat(actions.style.top),currentOrbit.cy+currentOrbit.ry+currentOrbit.thickness/2+18))}px`;
    if(!modal.hidden && ['seat','name'].includes(modal.dataset.kind))positionSheet();

  }
  function positionSheet(){
    const anchor=returnFocus?.getBoundingClientRect();if(!anchor)return;
    const width=window.innerWidth,height=window.visualViewport?.height||window.innerHeight,top=window.visualViewport?.offsetTop||0;
    const w=Math.min(modal.dataset.kind==='seat'?(width<700?184:210):260,width-24);sheet.style.width=`${w}px`;
    const h=sheet.getBoundingClientRect().height|| (modal.dataset.kind==='seat'?172:64);
    const centered=modal.dataset.kind==='name';
    const x=centered?Math.max(12,(width-w)/2):Math.max(12,Math.min(width-w-12,anchor.left+anchor.width/2-w/2));
    const spaceBelow=height-12-(anchor.bottom-top+4),spaceAbove=anchor.top-top-16;
    const preferBelow=(anchor.top+anchor.bottom)/2-top>=height/2;
    const below=preferBelow?spaceBelow>=h||spaceBelow>spaceAbove:spaceAbove<h&&spaceBelow>=spaceAbove;
    const y=centered?Math.max(12,(height-h)/2):Math.max(12,Math.min(height-h-12,below?anchor.bottom+4-top:anchor.top-h-4-top));
    sheet.style.left=`${x}px`;sheet.style.top=`${y}px`;
    modal.dataset.side=centered?'center':below?'below':'above';

  }
  function render(){
    root.dataset.step=state.step;identity.textContent=state.name;
    prompt.textContent=({color:'اختر لونك',count:'كم لاعب؟',rounds:'كم شوط للفوز؟'}[state.step]||'');
    prompt.hidden=!prompt.textContent;
    entry.hidden=state.step!=='entry';confirm.hidden=state.step!=='color'||!state.selectedColor;
    counts.hidden=state.step!=='count';start.hidden=sharing.hidden=state.step!=='ready';rounds.hidden=state.step!=='rounds';
    code.textContent=roomCode||'—';sharing.classList.toggle('is-unavailable',!roomCode);sharing.disabled=!roomCode;sharing.setAttribute('aria-disabled',String(!roomCode));
    [...rounds.children].forEach(b=>b.disabled=pending);
    for(const {b,status,color} of seatButtons){
      const index=state.seats.findIndex(x=>x.color===color.id),seat=state.seats[index];
      b.hidden=!['color','ready'].includes(state.step);b.classList.toggle('is-color',state.step==='color');b.classList.toggle('is-off',seat.mode==='none');
      b.setAttribute('aria-pressed',String(state.step==='color'&&state.selectedColor===color.id));
      status.textContent=seatLabel(seat);
      b.setAttribute('aria-label',state.step==='color'?`اختر ${color.name}`:status.textContent);
      b.setAttribute('aria-haspopup',state.step==='ready'?'menu':'false');
    }
    position();
    refreshGlass();
  }
  function go(next){
    if(moving)return;closeSheet();clearError();
    const target=typeof next==='string'?{...state,step:next}:next;
    const token=flowGeneration;
    const apply=()=>{if(token!==flowGeneration||root.hidden)return;state=target;moving=false;delete root.dataset.moving;render();notify('preview');animate(actions,[{opacity:0,transform:'translate(-50%,12px) scale(.985)'},{opacity:1,transform:'translate(-50%,0) scale(1)'}],420);};
    if(!reduced()&&typeof actions.animate==='function'){
      moving=true;root.dataset.moving='true';notify('preview',{step:'transition'});
      const motion=animate(actions,[{opacity:1,transform:'translate(-50%,0) scale(1)'},{opacity:0,transform:'translate(-50%,-8px) scale(.985)'}],240);motion.finished.then(apply,apply);
    }else apply();
  }
  function beginMatch(n){
    if(pending||moving)return;state.rounds=n;pending=true;render();const token=++flowGeneration;
    const done=()=>{if(token===flowGeneration&&!root.hidden)notify('start');};
    if(!reduced()&&typeof actions.animate==='function'){
      animate(prompt,[{opacity:1},{opacity:0}],300);
      const motion=animate(actions,[{opacity:1,transform:'translate(-50%,0)'},{opacity:0,transform:'translate(-50%,8px)'}],480);motion.finished.then(done,done);
    }else done();
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
    notify('preview');refreshGlass();animate(sheet,[{opacity:0,transform:kind==='seat'?'scale(.98) translateY(-4px)':'translateY(8px) scale(.99)'},{opacity:1,transform:'none'}],280);
    return sheet;
  }
  function closeSheet(animated=false,after=()=>{}){
    if(modal.hidden){after();return;}
    commitName();
    const token=++sheetGeneration;
    const finish=()=>{if(token!==sheetGeneration)return;modal.hidden=true;sheet.replaceChildren();delete root.dataset.profile;delete root.dataset.overlay;header.inert=seats.inert=actions.inert=false;returnFocus?.setAttribute?.('aria-expanded','false');returnFocus?.focus?.({preventScroll:true});render();notify('preview');after();};
    if(animated && !reduced()&&typeof sheet.animate==='function'){
      const motion=animate(sheet,[{opacity:1,transform:'none'},{opacity:0,transform:'translateY(-6px) scale(.985)'}],190);motion.finished.then(finish,finish);
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
    const item=(label,action,selected=false,parent=choices)=>{const b=button(label,action,'yk-menu-item');b.setAttribute('role','menuitemradio');b.setAttribute('aria-checked',String(selected));parent.append(b);return b;};
    if(state.seats[index].mode!=='local')item('لاعب',()=>{if(index>0)state=changeSeat(state,index,'local',state.seats[index].name);playerName(index,origin);},state.seats[index].mode==='local');
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
  function openJoin(){
    openSheet('رابط أو رمز الغرفة',join,'join');const form=el('form','yk-form');form.noValidate=true;
    const value=input('رابط أو رمز الغرفة',{type:'text',autocomplete:'off',required:true,dir:'ltr'});const error=el('div','yk-field-error');error.setAttribute('role','alert');const submit=el('button','yk-primary','انضمام');submit.type='submit';form.append(value.wrap,error,submit,button('إلغاء',()=>closeSheet(true),'yk-subtle'));
    form.addEventListener('submit',e=>{e.preventDefault();const code=parseRoomInput(value.field.value,window.location.href);if(!code){error.textContent='تأكد من الرابط أو الرمز';return;}if(!capabilities.online){error.textContent='الأونلاين غير متاح حالياً';return;}closeSheet(true,()=>window.yakolakVisualSetupAction?.(JSON.stringify({action:'join',code})));});sheet.append(form);value.field.focus();
  }
  modal.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&modal.dataset.kind!=='profile'){e.preventDefault();closeSheet(true);return;}
    if(modal.dataset.kind==='seat'&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const items=[...sheet.querySelectorAll('button')];const index=items.indexOf(document.activeElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}
    if(e.key==='Tab'&&sheet.getAttribute('aria-modal')==='true'){const list=[...sheet.querySelectorAll('input,button')];if(e.shiftKey&&document.activeElement===list[0]){e.preventDefault();list.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===list.at(-1)){e.preventDefault();list[0]?.focus();}}
  });
  root.addEventListener('pointerdown',e=>{if(nameDraft&&!sheet.contains(e.target)&&!returnFocus?.contains(e.target))closeSheet();},true);
  root.addEventListener('click',e=>{if(!modal.hidden&&modal.dataset.kind!=='profile'&&!sheet.contains(e.target)&&!returnFocus?.contains(e.target))closeSheet(true);});root.addEventListener('keydown',e=>e.stopPropagation());
  const api={
    open(options={}){const request=String(options.request||'');if(request&&request===lastEntryRequest)return;lastEntryRequest=request;flowGeneration++;sheetGeneration++;nameDraft=null;profileContinuation=null;closeSheet();resetOverlay();capabilities={online:!!options.online,mixed:!!options.mixed};connections=options.resume?.players?connections:[];roomCode=options.resume?.players?roomCode:'';pending=moving=false;state=options.resume?.players?restoreSetup(options.resume,profile?.name||''):newSetup(profile?.name||'');if(options.preview_step==='color')state={...state,step:'color',selectedColor:''};geometry=options.geometry||geometry;root.hidden=false;document.body.dataset.yakolakVisualSetup='visible';clearError();render();if(request)document.body.dataset.yakolakVisualSetupAck=request;
      // Never synchronously call back into Godot while it is publishing entry.
      const token=flowGeneration;window.setTimeout(()=>{if(token===flowGeneration&&!root.hidden)notify('preview');},0);},
    close(){flowGeneration++;sheetGeneration++;nameDraft=null;profileContinuation=null;pending=moving=false;resetOverlay();root.hidden=true;refreshGlass();delete window.yakolakPendingVisualSetup;document.body.dataset.yakolakVisualSetup='hidden';},
    geometry(points){geometry=points;root.dataset.world=String(!!points.world);position();},
    error(text){root.hidden=false;showError(text);},
    room(room){roomCode=/^\d{2}$/.test(String(room.code||''))?String(room.code):'';connections=(room.players||[]).filter(x=>x.connected!==false&&x.name).map(x=>({seat:String(x.seat),name:String(x.name).slice(0,24)}));render();}
  };
  window.YakolakSetup=api;viewport();
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
