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
  return { step: 'color', selectedColor: '', hostColor: 'marble', rounds: 3, name,
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
  return { ...state, step: 'ready', seats: state.seats.map((seat, i) => ({ ...seat, mode: i === 0 ? 'local' : i < count ? 'bot' : 'none', name: i === 0 ? state.name : '', owner: 'p1' })) };
}
export function changeSeat(state, index, mode, name = '', owner = 'p1') {
  if (index < 1 || index > 3 || !['bot', 'online', 'local', 'none'].includes(mode)) return state;
  return { ...state, seats: state.seats.map((seat, i) => i === index ? { ...seat, mode, name: mode === 'local' ? name.trim().slice(0, 24) : '', owner: mode === 'local' ? owner : 'p1' } : seat) };
}
export function configuration(state) {
  return { tutorial: false, rounds: state.rounds, online_join_code: '', players: state.seats.filter(x => x.mode !== 'none').map((seat, i) => {
    const color = COLORS.find(x => x.id === seat.color);
    return { seat: `p${i + 1}`, label: i === 0 ? state.name : seat.name || `لاعب ${state.seats.indexOf(seat) + 1}`, mode: seat.mode,
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

export function mountSetup(document, window) {
  const STORE = 'yakolak-visitor-v1';
  let profile = null;
  try { const saved = JSON.parse(window.localStorage.getItem(STORE)); if (validProfile(saved)) profile = saved; } catch {}
  let profiles = {};
  try { profiles = JSON.parse(window.localStorage.getItem('yakolak-profiles-v2')) || {}; } catch {}
  if (profile) profiles[profile.phone] = profile.name;
  let state = newSetup(profile?.name || '');
  let capabilities = { online: false, mixed: false };
  let connections = [];
  let pending = false;
  let returnFocus = null;
  let geometry = {};
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label, action, className = '') => {
    const node = el('button', className, label); node.type = 'button'; node.addEventListener('click', e => { e.stopPropagation(); action(e); }); return node;
  };
  const root = el('section', 'yk-setup'); root.id = 'yakolakVisualSetup'; root.dir = 'rtl'; root.hidden = true;
  root.setAttribute('aria-label', 'إعداد اللعبة');
  const bar = el('header', 'yk-header');
  const identity = button('', () => openProfile(true), 'yk-identity');
  const prompt = el('h1', 'yk-prompt'); prompt.id = 'ykPrompt';
  const counts = el('div', 'yk-segment yk-counts'); counts.setAttribute('role', 'group'); counts.setAttribute('aria-label', 'عدد اللاعبين');
  const countButtons = [2, 3, 4].map(n => {
    const b = button(String(n), () => { closeSheet(); state = chooseCount(state, n); clearError(); render(); notify('preview'); });
    b.setAttribute('aria-label', `${n} لاعبين`); counts.append(b); return b;
  });
  prompt.classList.add('yk-sr-only');
  const confirm = button('تأكيد', () => { state = confirmColor(state); render(); notify('preview'); }, 'yk-primary yk-confirm');
  bar.append(identity, prompt); root.append(counts, confirm);
  const seats = el('div', 'yk-seats');
  const seatButtons = COLORS.map(color => {
    const b = button('', e => {
      if (state.step === 'color') {
        let selected = color.id;
        if (e.detail > 0 && geometry.seats) selected = COLORS.reduce((best,c) => {
          const p = geometry.seats[c.id]; const d = Math.hypot(e.clientX-p[0]*window.innerWidth,e.clientY-p[1]*window.innerHeight);
          return d < best.distance ? {id:c.id,distance:d} : best;
        },{id:color.id,distance:Infinity}).id;
        state = chooseColor(state, selected); clearError(); render(); notify('preview'); }
      else { const index = state.seats.findIndex(x => x.color === color.id); if (index === 0) { state.step = 'color'; render(); notify('preview'); } else openSeat(index, b); }
    }, 'yk-seat');
    b.dataset.color = color.id; b.style.setProperty('--seat-color', color.hex);
    const number = el('span', 'yk-seat-number'); const name = el('span', 'yk-seat-name'); const status = el('span', 'yk-seat-status');
    b.append(number, name, status); seats.append(b); return { b, number, name, status, color };
  });
  const footer = el('footer', 'yk-footer');
  const colorAgain = button('اللون', () => { closeSheet(); state.step = 'color'; render(); notify('preview'); }, 'yk-subtle');
  const rounds = el('div', 'yk-rounds');
  rounds.append(el('span', 'yk-caption', 'أشواط الفوز'));
  const roundGroup = el('div', 'yk-segment'); roundGroup.setAttribute('role', 'group'); roundGroup.setAttribute('aria-label', 'أشواط الفوز');
  const roundButtons = [3, 5].map(n => { const b = button(String(n), () => { state.rounds = n; render(); }); b.setAttribute('aria-label', `الفوز بـ ${n} أشواط`); roundGroup.append(b); return b; });
  rounds.append(roundGroup);
  const start = button('ابدأ اللعب', () => {
    const problem = configurationError(state, capabilities); if (problem) { showError(problem); return; }
    if (pending) return;
    pending = true; render(); notify('start');
  }, 'yk-primary yk-start');
  const join = button('دخول بدعوة', openJoin, 'yk-subtle');
  const errors = el('div', 'yk-error'); errors.setAttribute('role', 'status'); errors.setAttribute('aria-live', 'polite');
  footer.append(colorAgain, rounds, start, join, errors);
  const modal = el('div', 'yk-modal'); modal.hidden = true;
  const sheet = el('section', 'yk-sheet'); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-labelledby', 'ykSheetTitle');
  modal.append(sheet); root.append(bar, seats, footer, modal); document.body.append(root);

  function viewport() {
    const h = window.visualViewport?.height || window.innerHeight;
    root.style.setProperty('--yk-vh', `${h}px`);
    root.classList.toggle('is-keyboard', h < 360);
    if (!modal.hidden && modal.dataset.kind !== 'profile') positionSheet();
  }
  window.visualViewport?.addEventListener('resize', viewport);
  window.addEventListener('resize', () => { viewport(); positionSeats(); }); viewport();
  function clearError() { errors.textContent = ''; }
  function showError(text) { pending = false; errors.textContent = text; render(); }
  function notify(action) {
    const payload = { action, selected_color: state.selectedColor, ...configuration(state), all_seats: state.seats, host_name: state.name, step: root.dataset.profile === 'active' ? 'profile' : state.step };
    // The telephone number stays in this device's profile storage only.
    if (typeof window.yakolakVisualSetupAction === 'function') window.yakolakVisualSetupAction(JSON.stringify(payload));
  }
  function positionSeats() {
    const fallback = { marble: [.66, .59], blue: [.66, .40], gold: [.34, .40], green: [.34, .59] };
    const width = window.innerWidth, height = window.innerHeight;
    for (const { b, color } of seatButtons) {
      const point = geometry.seats?.[color.id] || fallback[color.id];
      if (state.step === 'color') {
        const corners = geometry.hits?.[color.id] || [point];
        const xs = corners.map(x=>x[0]*width), ys = corners.map(x=>x[1]*height);
        const w = Math.max(88,Math.max(...xs)-Math.min(...xs)+24);
        const h = Math.max(72,Math.max(...ys)-Math.min(...ys)+24);
        b.style.width = `${w}px`; b.style.height = `${h}px`;
        b.style.left = `${point[0]*100}%`; b.style.top = `${point[1]*100}%`;
      } else {
        b.style.width = ''; b.style.height = '';
        const control = geometry.controls?.[color.id] || point;
        b.style.left = `${control[0]*100}%`; b.style.top = `${control[1]*100}%`;
      }
    }
    const center = geometry.prompt || [.5,.47];
    confirm.style.left = counts.style.left = `${center[0]*100}%`;
    confirm.style.top = counts.style.top = `${center[1]*height+32}px`;
    if (!modal.hidden && modal.dataset.kind !== 'profile' && returnFocus?.getBoundingClientRect) positionSheet();
  }
  function positionSheet() {
    const anchor = returnFocus?.getBoundingClientRect();
    if (!anchor) return;
    const width = window.innerWidth, height = window.visualViewport?.height || window.innerHeight;
    const w = Math.min(288,width-24), h = sheet.getBoundingClientRect().height || 230;
    sheet.style.width = `${w}px`;
    const beside = anchor.right+10+w <= width-12 ? anchor.right+10 : anchor.left-10-w >= 12 ? anchor.left-10-w : anchor.left+anchor.width/2-w/2;
    const below = anchor.bottom+10+h <= height-12 ? anchor.bottom+10 : anchor.top-10-h;
    sheet.style.left = `${Math.max(12,Math.min(width-w-12,beside))}px`;
    sheet.style.top = `${Math.max(12,Math.min(height-h-12,below))}px`;
  }

  function render() {
    identity.textContent = state.name;
    prompt.textContent = state.step === 'color' ? 'اختر لونك' : 'اختر عدد اللاعبين';
    root.dataset.step = state.step;
    counts.hidden = state.step === 'color';
    confirm.hidden = state.step !== 'color' || !state.selectedColor;
    const total = state.seats.filter(x => x.mode !== 'none').length;
    countButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(total === i + 2)));
    roundButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(state.rounds === [3, 5][i])));
    for (const { b, number, name, status, color } of seatButtons) {
      const index = state.seats.findIndex(x => x.color === color.id); const seat = state.seats[index];
      b.classList.toggle('is-off', state.step !== 'color' && seat.mode === 'none');
      b.classList.toggle('is-host', state.step !== 'color' && index === 0);
      b.classList.toggle('is-color', state.step === 'color');
      b.classList.toggle('is-selected', state.step === 'color' && state.selectedColor === color.id);
      b.setAttribute('aria-pressed', String(state.step === 'color' && state.selectedColor === color.id));
      number.textContent = state.step === 'color' ? '' : String(index + 1);
      name.textContent = state.step === 'color' ? '' : index === 0 ? state.name : seat.name || `لاعب ${index + 1}`;
      status.textContent = state.step === 'color' ? '' : index === 0 ? 'أنت' : ({ bot: 'بوت', online: 'أونلاين', local: 'على نفس الجهاز', none: 'بدون' }[seat.mode]);
      b.setAttribute('aria-label', state.step === 'color' ? `اختر ${color.name}` : `${name.textContent}، ${status.textContent}`);
    }
    rounds.hidden = state.step === 'color'; colorAgain.hidden = state.step === 'color';
    start.hidden = state.step === 'color'; start.disabled = pending;
    start.textContent = pending ? 'جارٍ البدء…' : 'ابدأ اللعب';
    join.hidden = state.step !== 'color';
    positionSeats();
  }
  function openSheet(title, origin) {
    returnFocus = origin || document.activeElement;
    sheet.replaceChildren(); const h = el('h2', '', title); h.id = 'ykSheetTitle'; sheet.append(h);
    modal.hidden = false; modal.classList.remove('is-closing');
    sheet.style.left = ''; sheet.style.top = ''; sheet.style.width = '';
    bar.inert = false; seats.inert = false; footer.inert = false;
    sheet.setAttribute('aria-modal', 'false');
    return sheet;
  }
  function closeSheet(animated = false, after = () => {}) {
    const finish = () => {
      modal.hidden = true; sheet.replaceChildren(); modal.classList.remove('is-closing');
      delete root.dataset.profile; bar.inert = false; seats.inert = false; footer.inert = false;
      if (returnFocus?.isConnected) returnFocus.focus();
      after();
    };
    if (animated && typeof sheet.animate === 'function' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const motion = sheet.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-12px)'}],{duration:180,easing:'ease-in',fill:'forwards'});
      motion.finished.then(()=>{motion.cancel();finish();},finish);
    } else finish();
  }

  function input(label, options = {}) {
    const wrap = el('label', 'yk-field'); wrap.append(el('span', '', label));
    const field = el('input'); Object.assign(field, options); field.setAttribute('aria-label', label); wrap.append(field); return { wrap, field };
  }
  function openProfile() {
    openSheet('رقم الجوال', identity); modal.dataset.kind = 'profile'; root.dataset.profile = 'active';
    bar.inert = true; seats.inert = true; footer.inert = true; sheet.setAttribute('aria-modal','true');
    notify('preview');
    const form = el('form', 'yk-profile-form'); form.noValidate = true;
    const phone = input('رقم الجوال', { value: profile?.phone || '', type:'tel', inputMode:'numeric', autocomplete:'tel', maxLength:15, required:true, dir:'ltr' });
    phone.field.pattern = '[0-9]{7,15}'; phone.field.enterKeyHint = 'done';
    phone.field.addEventListener('input',()=>{ const cursor=phone.field.selectionStart; phone.field.value=digits(phone.field.value); try{phone.field.setSelectionRange(cursor,cursor);}catch{} });
    const error = el('div','yk-field-error'); error.setAttribute('role','alert');
    const next = el('button','yk-primary','متابعة'); next.type='submit';
    form.append(phone.wrap,error,next);
    form.addEventListener('submit',e=>{
      e.preventDefault(); const number=digits(phone.field.value);
      if(!/^[0-9]{7,15}$/.test(number)){error.textContent='تأكد من رقم الجوال';phone.field.focus();return;}
      const savedName=profiles[number];
      if(typeof savedName==='string' && validProfile({name:savedName,phone:number})) finishProfile(savedName,number);
      else openProfileName(number);
    });
    sheet.append(form); window.requestAnimationFrame(()=>phone.field.focus());
  }
  function openProfileName(number) {
    sheet.replaceChildren(); const title=el('h2','','الاسم الكريم');title.id='ykSheetTitle';sheet.append(title);
    const form=el('form','yk-profile-form');form.noValidate=true;
    const name=input('الاسم الكريم',{maxLength:24,required:true,autocomplete:'given-name'});name.field.enterKeyHint='done';
    const error=el('div','yk-field-error');error.setAttribute('role','alert');
    const next=el('button','yk-primary','متابعة');next.type='submit';form.append(name.wrap,error,next);
    form.addEventListener('submit',e=>{e.preventDefault();if(name.field.value.trim().length<2){error.textContent='اكتب اسمك';return;}finishProfile(name.field.value.trim(),number);});
    sheet.append(form);name.field.focus();
    sheet.animate?.([{opacity:0,transform:'translateX(10px)'},{opacity:1,transform:'translateX(0)'}],{duration:220,easing:'ease-out'});
  }
  function finishProfile(name,phone) {
    profile={name,phone};profiles[phone]=name;state.name=name;state.seats[0].name=name;
    try{window.localStorage.setItem(STORE,JSON.stringify(profile));window.localStorage.setItem('yakolak-profiles-v2',JSON.stringify(profiles));}catch{}
    closeSheet(true,()=>{render();notify('preview');});
  }

  function openSeat(index, origin) {
    openSheet(`لاعب ${index + 1}`, origin); modal.dataset.kind = 'seat';
    const choices = el('div', 'yk-mode-grid');
    const choose = (label, mode, owner = 'p1') => {
      const b = button(label, () => {
        if (mode === 'local') { openPlayerName(index, owner, origin); return; }
        state = changeSeat(state, index, mode); clearError(); closeSheet(); render(); notify('preview');
      }, 'yk-mode');
      const seat = state.seats[index]; b.setAttribute('aria-pressed', String(seat.mode === mode && (mode !== 'local' || seat.owner === owner))); choices.append(b);
    };
    choose('بوت', 'bot'); choose('أونلاين', 'online');
    choose(`على نفس جهاز ${state.name}`, 'local');
    for (const connection of connections) if (connection.seat !== 'p1') choose(`على نفس جهاز ${connection.name}`, 'local', connection.seat);
    choose('بدون', 'none'); sheet.append(choices, button('تم', closeSheet, 'yk-subtle'));
    positionSheet(); choices.querySelector('button').focus();
  }
  function openPlayerName(index, owner, origin) {
    openSheet(`لاعب ${index + 1}`, origin); modal.dataset.kind = 'name';
    const form = el('form', 'yk-profile-form');
    const name = input('اسم اللاعب', { value: state.seats[index].name, maxLength: 24, minLength: 2, required: true, autocomplete: 'off' });
    const save = el('button', 'yk-primary', 'حفظ'); save.type = 'submit';
    form.append(name.wrap, save, button('الحالات', () => openSeat(index, origin), 'yk-subtle'));
    form.addEventListener('submit', e => {
      e.preventDefault(); if (name.field.value.trim().length < 2) return;
      state = changeSeat(state, index, 'local', name.field.value, owner); clearError(); closeSheet(); render(); notify('preview');
    }); sheet.append(form); positionSheet(); name.field.focus();
  }
  function openJoin() {
    openSheet('رقم الغرفة', join); modal.dataset.kind = 'join';
    const form = el('form', 'yk-profile-form'); const code = input('رقم الغرفة', { type: 'tel', inputMode: 'numeric', maxLength: 2, required: true, dir: 'ltr' });
    code.field.addEventListener('input', () => { code.field.value = digits(code.field.value); });
    const error = el('div', 'yk-field-error'); error.setAttribute('role', 'alert');
    const submit = el('button', 'yk-primary', 'دخول'); submit.type = 'submit';
    form.append(code.wrap, error, submit, button('إلغاء', closeSheet, 'yk-subtle'));
    form.addEventListener('submit', e => {
      e.preventDefault(); if (!capabilities.online) { error.textContent = 'الأونلاين غير متاح حالياً'; return; }
      if (!/^\d{2}$/.test(code.field.value)) { error.textContent = 'رقم الغرفة من خانتين'; return; }
      closeSheet(); window.yakolakVisualSetupAction?.(JSON.stringify({ action: 'join', code: code.field.value }));
    }); sheet.append(form); positionSheet(); code.field.focus();
  }
  modal.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.dataset.kind !== 'profile') { e.preventDefault(); e.stopPropagation(); closeSheet(); }
    if (e.key !== 'Tab' || modal.dataset.kind !== 'profile') return;
    const items = [...sheet.querySelectorAll('input,button')].filter(x => !x.disabled && !x.hidden);
    const first = items[0], last = items.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  });
  root.addEventListener('click',e=>{ if(!modal.hidden && modal.dataset.kind!=='profile' && !sheet.contains(e.target) && !returnFocus?.contains(e.target)) closeSheet(); });
  // Keep DOM keyboard input away from the canvas's legacy dialog key handler.
  root.addEventListener('keydown', e => e.stopPropagation());
  const api = {
    open(options = {}) {
      capabilities = { online: !!options.online, mixed: !!options.mixed };
      closeSheet(); connections = [];
      pending = false; state = newSetup(profile?.name || ''); geometry = options.geometry || geometry;
      root.hidden = false; clearError(); render();
      document.body.dataset.yakolakVisualSetup = 'visible';
      openProfile();
    },
    close() { root.hidden = true; modal.hidden = true; document.body.dataset.yakolakVisualSetup = 'hidden'; },
    geometry(points) { geometry = points; root.dataset.world = String(!!points.world); positionSeats(); },
    error(text) { root.hidden = false; showError(text); },
    room(room) { connections = (room.players || []).filter(x => x.connected !== false && x.name).map(x => ({ seat: String(x.seat), name: String(x.name).slice(0,24) })); },
  };
  window.YakolakSetup = api;
  if (window.yakolakPendingVisualSetup) { api.open(window.yakolakPendingVisualSetup); delete window.yakolakPendingVisualSetup; }
  if (window.yakolakPendingVisualGeometry) { api.geometry(window.yakolakPendingVisualGeometry); delete window.yakolakPendingVisualGeometry; }
  return api;
}
if (typeof document !== 'undefined') mountSetup(document, window);
