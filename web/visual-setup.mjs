export const COLORS = [
  { id: 'marble', name: 'أبيض', direction: 'right', hex: '#f1efdf' },
  { id: 'blue', name: 'أزرق', direction: 'back', hex: '#3984e4' },
  { id: 'gold', name: 'ذهبي', direction: 'left', hex: '#d49a39' },
  { id: 'green', name: 'أخضر', direction: 'front', hex: '#35aa7d' },
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
export function configuration(state) {
  return { tutorial: false, rounds: state.rounds, online_join_code: '', players: state.seats.filter(x => x.mode !== 'none').map((seat, i) => {
    const color = COLORS.find(x => x.id === seat.color);
    return { seat: `p${i + 1}`, label: i === 0 ? state.name : seat.name || String(state.seats.indexOf(seat) + 1), mode: seat.mode,
      color: color.id, color_name: color.name, direction: color.direction, device_owner: seat.owner };
  }) };
}
export function configurationError(state, capabilities = {}) {
  const active = state.seats.filter(x => x.mode !== 'none');
  if (active.length < 2) return 'اختر لاعبين على الأقل';
  if (active.some((x, i) => i > 0 && x.mode === 'local' && x.name.trim().length < 2)) return 'اكتب اسم اللاعب';
  if (active.some(x => x.mode === 'online' || (x.mode === 'local' && x.owner !== 'p1'))) {
    if (!capabilities.online) return 'الأونلاين غير متاح حالياً';
    if (!capabilities.mixed && active.slice(1).some(x => x.mode !== 'online')) return 'الغرفة لا تدعم خلط الأجهزة حالياً';
  }
  return '';
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
  let pending = false, returnFocus = null, sheetGeneration = 0, moving = false;
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const button = (label, action, cls = '') => { const node = el('button',cls,label); node.type = 'button'; node.addEventListener('click',e=>{e.stopPropagation();action(e);}); return node; };
  const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const animate = (node,frames,duration=220) => { if (!reduced()) return node.animate?.(frames,{duration,easing:'cubic-bezier(.2,.8,.2,1)'}); };
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
    const status=el('span','yk-seat-status'), number=el('span','yk-seat-number'), arrow=el('span','yk-seat-arrow','⌄');arrow.setAttribute('aria-hidden','true');
    const line=el('span','yk-seat-line');line.append(number,arrow);b.append(status,line);seats.append(b);return {b,status,number,color};
  });
  const actions = el('footer','yk-actions');
  const entry = el('div','yk-entry');
  const create=button('غرفة جديدة',()=>go('color'),'yk-primary');
  const join=button('انضمام لغرفة',openJoin,'yk-outline'); entry.append(create,join);
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
  [3,5].forEach(n=>{const b=button(String(n),()=>{if(pending)return;state.rounds=n;pending=true;render();notify('start');},'yk-choice');b.setAttribute('aria-label',`الفوز بـ ${n} أشواط`);rounds.append(b);});
  const errors=el('div','yk-error');errors.setAttribute('role','status');errors.setAttribute('aria-live','polite');
  actions.append(entry,confirm,counts,sharing,start,rounds,errors);
  const modal=el('div','yk-modal');modal.hidden=true;
  const sheet=el('section','yk-sheet');sheet.setAttribute('role','dialog');sheet.setAttribute('aria-labelledby','ykSheetTitle');modal.append(sheet);
  root.append(header,seats,actions,modal);document.body.append(root);

  function clearError(){errors.textContent='';}
  function showError(text){pending=false;errors.textContent=text;render();}
  function notify(action,override={}){
    const payload={action,...configuration(state),all_seats:state.seats,host_name:state.name,selected_color:state.selectedColor,count_chosen:state.countChosen,step:root.dataset.profile==='active'?'profile':state.step,overlay_open:!modal.hidden,...override};
    window.yakolakVisualSetupAction?.(JSON.stringify(payload));
  }
  function viewport(){const h=window.visualViewport?.height||window.innerHeight;root.style.setProperty('--yk-vh',`${h}px`);root.classList.toggle('is-keyboard',h<360);position();}
  window.visualViewport?.addEventListener('resize',viewport);window.addEventListener('resize',viewport);
  function position(){
    const width=window.innerWidth,height=window.innerHeight;
    const fallback={marble:[.7,.61],blue:[.7,.40],gold:[.3,.40],green:[.3,.61]};
    for(const {b,color} of seatButtons){
      const point=geometry.seats?.[color.id]||fallback[color.id];
      if(state.step==='color'){
        const corners=geometry.hits?.[color.id]||[point];const xs=corners.map(x=>x[0]*width),ys=corners.map(x=>x[1]*height);
        b.style.width=`${Math.max(80,Math.max(...xs)-Math.min(...xs)+20)}px`;b.style.height=`${Math.max(68,Math.max(...ys)-Math.min(...ys)+20)}px`;
        b.style.left=`${point[0]*100}%`;b.style.top=`${point[1]*100}%`;
      }else{const p=geometry.controls?.[color.id]||point;b.style.width='';b.style.height='';b.style.left=`${p[0]*100}%`;b.style.top=`${p[1]*100}%`;}
    }
    const target=geometry.actions||[.5,.75];
    const h=actions.getBoundingClientRect().height|| (state.step==='ready'?112:60);
    const visibleHeight=window.visualViewport?.height||height;
    actions.style.top=`${Math.max(12,Math.min(target[1]*height,visibleHeight-h-16))}px`;
    if(!modal.hidden && ['seat','name'].includes(modal.dataset.kind))positionSheet();
  }
  function positionSheet(){
    const anchor=returnFocus?.getBoundingClientRect();if(!anchor)return;
    const width=window.innerWidth,height=window.visualViewport?.height||window.innerHeight;
    const w=Math.min(modal.dataset.kind==='seat'?190:240,width-24);sheet.style.width=`${w}px`;
    const h=sheet.getBoundingClientRect().height|| (modal.dataset.kind==='seat'?172:160);
    const x=Math.max(12,Math.min(width-w-12,anchor.left+anchor.width/2-w/2));
    const below=anchor.bottom+4+h<=height-12;
    sheet.style.left=`${x}px`;sheet.style.top=`${Math.max(12,Math.min(height-h-12,below?anchor.bottom+4:anchor.top-h-4))}px`;
    modal.dataset.side=below?'below':'above';
  }
  function render(){
    root.dataset.step=state.step;identity.textContent=state.name;
    prompt.textContent=({color:'اختر لونك',count:'كم لاعب؟',rounds:'كم شوط للفوز؟'}[state.step]||'');
    entry.hidden=state.step!=='entry';confirm.hidden=state.step!=='color'||!state.selectedColor;
    counts.hidden=state.step!=='count';start.hidden=sharing.hidden=state.step!=='ready';rounds.hidden=state.step!=='rounds';
    code.textContent=roomCode||'—';sharing.classList.toggle('is-unavailable',!roomCode);sharing.setAttribute('aria-disabled',String(!roomCode));
    [...rounds.children].forEach(b=>b.disabled=pending);
    for(const {b,status,number,color} of seatButtons){
      const index=state.seats.findIndex(x=>x.color===color.id),seat=state.seats[index];
      b.hidden=!['color','ready'].includes(state.step);b.classList.toggle('is-color',state.step==='color');b.classList.toggle('is-off',seat.mode==='none');
      b.setAttribute('aria-pressed',String(state.step==='color'&&state.selectedColor===color.id));
      status.textContent=index===0?'أنت':({bot:'بوت',online:'أونلاين',local:'نفس الجهاز',none:'بدون'}[seat.mode]);number.textContent=String(index+1);
      b.setAttribute('aria-label',state.step==='color'?`اختر ${color.name}`:`${index+1}، ${status.textContent}${seat.name?'، '+seat.name:''}`);
      b.setAttribute('aria-haspopup',state.step==='ready'?'menu':'false');
    }
    position();
  }
  function go(next){
    if(moving)return;closeSheet();clearError();
    const target=typeof next==='string'?{...state,step:next}:next;
    const apply=()=>{state=target;moving=false;delete root.dataset.moving;render();notify('preview');animate(actions,[{opacity:0,transform:'translate(-50%,10px)'},{opacity:1,transform:'translate(-50%,0)'}]);};
    if(!reduced()&&typeof actions.animate==='function'){
      moving=true;root.dataset.moving='true';notify('preview',{step:'transition'});
      const motion=animate(actions,[{opacity:1,transform:'translate(-50%,0)'},{opacity:0,transform:'translate(-50%,-6px)'}],120);motion.finished.then(apply,apply);
    }else apply();
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
    notify('preview');animate(sheet,[{opacity:0,transform:kind==='seat'?'scaleY(.92) translateY(-4px)':'translateY(10px)'},{opacity:1,transform:'none'}]);
    return sheet;
  }
  function closeSheet(animated=false,after=()=>{}){
    if(modal.hidden){after();return;}
    const token=++sheetGeneration;
    const finish=()=>{if(token!==sheetGeneration)return;modal.hidden=true;sheet.replaceChildren();delete root.dataset.profile;delete root.dataset.overlay;header.inert=seats.inert=actions.inert=false;returnFocus?.setAttribute?.('aria-expanded','false');returnFocus?.focus?.();render();notify('preview');after();};
    if(animated && !reduced()&&typeof sheet.animate==='function'){
      const motion=animate(sheet,[{opacity:1,transform:'none'},{opacity:0,transform:'translateY(-8px)'}],140);motion.finished.then(finish,finish);
    }else finish();
  }
  function input(label,options={}){const wrap=el('label','yk-field');const text=el('span','yk-sr-only',label);const field=el('input');Object.assign(field,options);field.setAttribute('aria-label',label);wrap.append(text,field);return {wrap,field};}
  function openProfile(){
    openSheet('رقم الجوال',identity,'profile');root.dataset.profile='active';notify('preview');
    const form=el('form','yk-form');form.noValidate=true;
    const phone=input('رقم الجوال',{value:profile?.phone||'',type:'tel',inputMode:'numeric',autocomplete:'tel',maxLength:15,required:true,dir:'ltr'});phone.field.enterKeyHint='done';
    phone.field.addEventListener('input',()=>{phone.field.value=digits(phone.field.value);});
    const error=el('div','yk-field-error');error.setAttribute('role','alert');const next=el('button','yk-primary','متابعة');next.type='submit';form.append(phone.wrap,error,next);
    form.addEventListener('submit',e=>{e.preventDefault();const number=digits(phone.field.value);if(!/^\d{7,15}$/.test(number)){error.textContent='تأكد من رقم الجوال';return;}const name=profiles[number];if(typeof name==='string'&&validProfile({name,phone:number}))finishProfile(name,number);else profileName(number);});sheet.append(form);window.requestAnimationFrame(()=>phone.field.focus());
  }
  function profileName(number){
    sheet.replaceChildren();const title=el('h2','','الاسم الكريم');title.id='ykSheetTitle';const form=el('form','yk-form');form.noValidate=true;
    const name=input('الاسم الكريم',{maxLength:24,required:true,autocomplete:'given-name'});name.field.enterKeyHint='done';const error=el('div','yk-field-error');error.setAttribute('role','alert');const next=el('button','yk-primary','متابعة');next.type='submit';form.append(name.wrap,error,next);
    form.addEventListener('submit',e=>{e.preventDefault();if(name.field.value.trim().length<2){error.textContent='اكتب اسمك';return;}finishProfile(name.field.value.trim(),number);});sheet.append(title,form);name.field.focus();animate(sheet,[{opacity:0,transform:'translateX(8px)'},{opacity:1,transform:'none'}]);
  }
  function finishProfile(name,phone){
    profile={name,phone};profiles[phone]=name;state=newSetup(name);
    try{window.localStorage.setItem(STORE,JSON.stringify(profile));window.localStorage.setItem('yakolak-profiles-v2',JSON.stringify(profiles));}catch{}
    closeSheet(true,()=>{render();notify('preview');});
  }
  function openSeat(index,origin){
    openSheet('',origin,'seat');sheet.setAttribute('aria-label',`حالة ${index+1}`);sheet.setAttribute('role','menu');sheet.removeAttribute('aria-labelledby');
    const choices=el('div','yk-menu');
    const choose=(label,mode,owner='p1')=>{const b=button(label,()=>{if(mode==='local'){playerName(index,owner,origin);return;}state=changeSeat(state,index,mode);clearError();closeSheet(true);render();notify('preview');},'yk-menu-item');b.setAttribute('role','menuitemradio');b.setAttribute('aria-checked',String(state.seats[index].mode===mode&&(mode!=='local'||state.seats[index].owner===owner)));choices.append(b);};
    if(index===0)choose('تغيير الاسم','local');
    else{choose('بوت','bot');choose('أونلاين','online');choose(`نفس جهاز ${state.name}`,'local');for(const c of connections)if(c.seat!=='p1')choose(`نفس جهاز ${c.name}`,'local',c.seat);choose('بدون','none');}
    sheet.append(choices);positionSheet();choices.querySelector('button').focus();
  }
  function playerName(index,owner,origin){
    openSheet('الاسم',origin,'name');const form=el('form','yk-form');const name=input('اسم اللاعب',{value:state.seats[index].name,maxLength:24,minLength:2,required:true,autocomplete:'off'});const save=el('button','yk-primary','حفظ');save.type='submit';form.append(name.wrap,save);
    form.addEventListener('submit',e=>{e.preventDefault();const value=name.field.value.trim();if(value.length<2)return;if(index===0){state.name=value;state.seats[0].name=value;profile.name=value;profiles[profile.phone]=value;try{window.localStorage.setItem(STORE,JSON.stringify(profile));window.localStorage.setItem('yakolak-profiles-v2',JSON.stringify(profiles));}catch{}}else state=changeSeat(state,index,'local',value,owner);closeSheet(true);});sheet.append(form);positionSheet();name.field.focus();
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
  root.addEventListener('click',e=>{if(!modal.hidden&&modal.dataset.kind!=='profile'&&!sheet.contains(e.target)&&!returnFocus?.contains(e.target))closeSheet(true);});root.addEventListener('keydown',e=>e.stopPropagation());
  const api={
    open(options={}){closeSheet();capabilities={online:!!options.online,mixed:!!options.mixed};connections=[];roomCode='';pending=moving=false;state=newSetup(profile?.name||'');geometry=options.geometry||geometry;root.hidden=false;document.body.dataset.yakolakVisualSetup='visible';clearError();render();openProfile();},
    close(){sheetGeneration++;root.hidden=true;modal.hidden=true;document.body.dataset.yakolakVisualSetup='hidden';},
    geometry(points){geometry=points;root.dataset.world=String(!!points.world);position();},
    error(text){root.hidden=false;showError(text);},
    room(room){roomCode=/^\d{2}$/.test(String(room.code||''))?String(room.code):'';connections=(room.players||[]).filter(x=>x.connected!==false&&x.name).map(x=>({seat:String(x.seat),name:String(x.name).slice(0,24)}));render();}
  };
  window.YakolakSetup=api;viewport();
  if(window.yakolakPendingVisualSetup){api.open(window.yakolakPendingVisualSetup);delete window.yakolakPendingVisualSetup;}
  if(window.yakolakPendingVisualGeometry){api.geometry(window.yakolakPendingVisualGeometry);delete window.yakolakPendingVisualGeometry;}
  return api;
}
if(typeof document!=='undefined')mountSetup(document,window);
