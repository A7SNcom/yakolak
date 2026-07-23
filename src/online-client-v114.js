const game = globalThis.__yakolakGame;
if (!game?.state || !game?.renderer || !game?.camera) throw new Error('v114 online game hooks unavailable');

let onlineHumanColor = null;
let onlineSubmitMove = null;
let onlineInputInstalled = false;
let selectedOnlineSize = null;
let onlinePointerStart = null;
let onlineZoneMarkers = [];
let onlineLastMoveMarker = null;

function captionGame(text) {
  const caption = document.querySelector('#yakolakGameHud .yg-caption');
  if (caption) {
    caption.textContent = text;
    caption.style.setProperty('--caption-bg', '#163246');
  }
}

function colorLabel(color) {
  return COLOR_LABELS[color]?.[0] || color;
}

function setTransform(mesh, transform) {
  mesh.position.set(transform.px, transform.py, transform.pz);
  mesh.rotation.set(
    transform.rx * Math.PI / 180,
    transform.ry * Math.PI / 180,
    transform.rz * Math.PI / 180
  );
}

function renderGame() {
  game.render();
}

function clearOnlineMarkers() {
  onlineZoneMarkers.forEach(marker => {
    marker.parent?.remove(marker);
    marker.geometry?.dispose?.();
    marker.material?.dispose?.();
  });
  onlineZoneMarkers = [];
}

function clearLastMoveMarker() {
  if (!onlineLastMoveMarker) return;
  onlineLastMoveMarker.parent?.remove(onlineLastMoveMarker);
  onlineLastMoveMarker.geometry?.dispose?.();
  onlineLastMoveMarker.material?.dispose?.();
  onlineLastMoveMarker = null;
}

function makeRing(zone, color, inner = 23, outer = 30) {
  const marker = new game.THREE.Mesh(
    new game.THREE.RingGeometry(inner, outer, 48),
    new game.THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.86,
      side: game.THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    })
  );
  marker.position.set(zone.px, zone.py + 1.6, zone.pz);
  marker.rotation.x = -Math.PI / 2;
  marker.renderOrder = 10040;
  game.gameGroup.add(marker);
  return marker;
}

function showLegalZones(size) {
  clearOnlineMarkers();
  if (!size || !room || room.status !== 'playing') {
    renderGame();
    return;
  }
  game.boardZones.forEach(zone => {
    if (!room.board[String(zone.id)]?.[size]) {
      onlineZoneMarkers.push(makeRing(zone, '#d9edf7'));
    }
  });
  renderGame();
}

function showOnlineLastMove(lastMove) {
  clearLastMoveMarker();
  if (!lastMove) return;
  const zone = game.boardZones[lastMove.zone];
  if (!zone) return;
  onlineLastMoveMarker = makeRing(
    zone,
    COLOR_LABELS[lastMove.color]?.[1] || '#ffffff',
    31,
    35
  );
}

function syncOnlineScore() {
  const score = document.getElementById('yakolakGameScore');
  if (!score || !room) return;
  score.replaceChildren();
  room.players.forEach((player, index) => {
    const mine = player.seat === identity?.seat;
    const active = room.status === 'playing' && index === room.turnIndex;
    const item = document.createElement('span');
    item.textContent = `${mine ? 'أنت' : 'الخصم'} · ${colorLabel(player.color)}${active ? ' · الدور' : ''}`;
    item.style.borderColor = COLOR_LABELS[player.color]?.[1] || '#ffffff';
    if (active) item.style.outline = '2px solid rgba(255,255,255,.7)';
    score.append(item);
  });
}

function resetOnlinePieces(remote) {
  const playerColors = new Set(remote.players.map(player => player.color));
  game.pieces.forEach(piece => {
    piece.placed = false;
    piece.zoneIndex = null;
    piece.slotSize = null;
    piece.mesh.userData.inTray = false;
    piece.mesh.userData.traySelected = false;
    piece.mesh.scale.setScalar(1);
    piece.mesh.visible = playerColors.has(piece.dir);
    setTransform(piece.mesh, piece.final);
  });

  for (let zone = 0; zone < 9; zone += 1) {
    for (const size of ['s', 'm', 'l']) {
      const color = remote.board[String(zone)]?.[size];
      if (!color) continue;
      const piece = game.pieces.find(candidate =>
        candidate.dir === color &&
        candidate.type === size &&
        !candidate.placed
      );
      if (!piece) continue;
      const target = game.boardZones[zone];
      piece.placed = true;
      piece.zoneIndex = zone;
      piece.slotSize = size;
      piece.mesh.visible = true;
      piece.mesh.position.set(target.px, target.py, target.pz);
      piece.mesh.rotation.set(
        piece.final.rx * Math.PI / 180,
        piece.final.ry * Math.PI / 180,
        piece.final.rz * Math.PI / 180
      );
    }
  }
}

function updateOnlineCaption() {
  if (!room) return;
  if (room.status === 'finished') {
    captionGame(room.winner?.color === onlineHumanColor ? 'فزت بالجولة!' : `فاز ${colorLabel(room.winner?.color)}.`);
    return;
  }
  const current = room.players[room.turnIndex];
  if (current?.seat === identity?.seat) {
    captionGame(selectedOnlineSize ? 'اختر خانة مضيئة لوضع القطعة.' : 'دورك: اختر قطعة، ثم اختر خانة متاحة.');
  } else {
    captionGame('دور الخصم — ستتحدث اللوحة تلقائيًا.');
  }
}

async function waitForGameReady() {
  const startedAt = Date.now();
  while (
    (!document.body.classList.contains('yakolak-ready') || !game.pieces.length) &&
    Date.now() - startedAt < 15000
  ) {
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  if (!game.pieces.length) throw new Error('online_game_not_ready');
}

function rayFromPointer(event) {
  const rect = game.renderer.domElement.getBoundingClientRect();
  const pointer = new game.THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new game.THREE.Raycaster();
  raycaster.setFromCamera(pointer, game.camera);
  return raycaster;
}

function pieceFromTap(event) {
  const raycaster = rayFromPointer(event);
  const available = game.pieces.filter(piece =>
    piece.dir === onlineHumanColor &&
    !piece.placed &&
    piece.mesh.visible
  );
  const hit = raycaster.intersectObjects(available.map(piece => piece.mesh), false)[0];
  return hit ? available.find(piece => piece.mesh === hit.object) || null : null;
}

function zoneFromTap(event) {
  const raycaster = rayFromPointer(event);
  const worldY = game.gameGroup.localToWorld(new game.THREE.Vector3(0, 2, 0)).y;
  const plane = new game.THREE.Plane(new game.THREE.Vector3(0, 1, 0), -worldY);
  const world = new game.THREE.Vector3();
  if (!raycaster.ray.intersectPlane(plane, world)) return null;
  const local = game.gameGroup.worldToLocal(world);
  let best = null;
  let distance = Infinity;
  game.boardZones.forEach(zone => {
    const next = Math.hypot(local.x - zone.px, local.z - zone.pz);
    if (next < distance) {
      best = zone;
      distance = next;
    }
  });
  return distance <= 42 ? best : null;
}

async function handleOnlineTap(event) {
  if (!room || room.status !== 'playing') return;
  const current = room.players[room.turnIndex];
  if (current?.seat !== identity?.seat || requestPending) return;
  const piece = pieceFromTap(event);
  if (piece) {
    selectedOnlineSize = piece.type;
    showLegalZones(selectedOnlineSize);
    updateOnlineCaption();
    return;
  }
  const zone = zoneFromTap(event);
  if (!zone) return;
  if (!selectedOnlineSize) {
    captionGame('اختر قطعة أولًا.');
    return;
  }
  if (room.board[String(zone.id)]?.[selectedOnlineSize]) {
    captionGame('هذا الحجم موجود في الخانة. اختر دائرة مضيئة.');
    return;
  }
  clearOnlineMarkers();
  const ok = await onlineSubmitMove?.({ zone: zone.id, size: selectedOnlineSize });
  if (!ok) showLegalZones(selectedOnlineSize);
  else selectedOnlineSize = null;
}

function installOnlineInput() {
  if (onlineInputInstalled) return;
  onlineInputInstalled = true;
  const canvas = game.renderer.domElement;
  canvas.addEventListener('pointerdown', event => {
    if (!started) return;
    onlinePointerStart = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      at: performance.now()
    };
  }, { passive: true });
  canvas.addEventListener('pointerup', event => {
    const start = onlinePointerStart;
    onlinePointerStart = null;
    if (!started || !start || start.id !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved > 9 || performance.now() - start.at > 650) return;
    void handleOnlineTap(event);
  }, { passive: true });
  canvas.addEventListener('pointercancel', () => { onlinePointerStart = null; }, { passive: true });
}

const hooks = {
  state() {
    return { ...game.state, humanColor: onlineHumanColor };
  },
  async start(remote, session) {
    await waitForGameReady();
    onlineHumanColor = session.color;
    onlineSubmitMove = session.submitMove;
    game.state.humanColor = '__online__';
    game.state.players = remote.players.map(player => player.color);
    game.state.botCount = 0;
    game.state.configured = true;
    game.state.started = true;
    game.state.tutorial = false;
    game.state.locked = false;
    game.state.winner = remote.winner?.color || null;
    game.setupGroup.visible = false;
    document.getElementById('yakolakGameSetup')?.classList.add('hidden');
    if (game.meshes['9']) game.meshes['9'].visible = true;
    for (const color of ['right', 'back', 'left', 'front']) {
      if (game.meshes[`3-${color}`]) {
        game.meshes[`3-${color}`].visible = game.state.players.includes(color);
      }
    }
    installOnlineInput();
    game.setResponsiveOverview();
    await this.apply(remote, false);
  },
  async apply(remote) {
    selectedOnlineSize = null;
    clearOnlineMarkers();
    game.clearHighlights();
    game.state.players = remote.players.map(player => player.color);
    game.state.turnIndex = remote.turnIndex;
    game.state.round = remote.round;
    game.state.board = structuredClone(remote.board);
    game.state.winner = remote.winner?.color || null;
    game.state.locked = remote.status !== 'playing';
    resetOnlinePieces(remote);
    showOnlineLastMove(remote.lastMove);
    syncOnlineScore();
    updateOnlineCaption();
    renderGame();
    if (remote.winner) void game.showWinHighlight(remote.winner);
  }
};

const API = '/api/rooms';
const POLL_BASE_MS = 1200;
const POLL_MAX_MS = 8000;
const REQUEST_TIMEOUT_MS = 6500;
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
const COLOR_LABELS = {
  right: ['الأبيض', '#f1eee6'],
  back: ['الأزرق', '#3769a5'],
  left: ['الذهبي', '#b78a44'],
  front: ['الأخضر', '#2f856a']
};

let identity = null;
let room = null;
let pollTimer = 0;
let pollDelay = POLL_BASE_MS;
let started = false;
let stopped = false;
let requestPending = false;

function node(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function normalizeCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function roomParam() {
  return normalizeCode(new URL(location.href).searchParams.get('room'));
}

function identityKey(code) {
  return `yakolak-online-v114:${code}`;
}

function loadIdentity(code) {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(identityKey(code)) || 'null');
    if (parsed?.code === code && parsed?.token && parsed?.seat) return parsed;
  } catch {}
  return null;
}

function saveIdentity(value) {
  identity = value;
  try {
    sessionStorage.setItem(identityKey(value.code), JSON.stringify(value));
  } catch {}
}

function setRoomUrl(code) {
  const url = new URL(location.href);
  url.searchParams.set('room', code);
  url.searchParams.delete('clear');
  history.replaceState(null, '', url);
}

function clearRoomUrl() {
  const url = new URL(location.href);
  url.searchParams.delete('room');
  history.replaceState(null, '', url);
}

function errorMessage(code) {
  return {
    invalid_room_code: 'تأكد من كتابة رمز الغرفة المكوّن من 6 خانات.',
    room_not_found: 'الغرفة غير موجودة أو انتهت صلاحيتها.',
    room_full: 'دخل اللاعب الآخر إلى هذه الغرفة بالفعل.',
    not_your_turn: 'انتظر دورك؛ تم تحديث اللوحة.',
    occupied_slot: 'هذا الحجم موجود في الخانة بالفعل.',
    version_conflict: 'وصلت حركة أخرى أولًا؛ تم تحديث اللوحة.',
    online_unavailable: 'اللعب الأونلاين غير متاح مؤقتًا.',
    online_server_error: 'تعذر مزامنة الغرفة الآن. سنحاول مجددًا.',
    request_timeout: 'الاتصال بطيء. تحقق من الشبكة وحاول مرة أخرى.'
  }[code] || 'تعذر إكمال العملية. حاول مرة أخرى.';
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      ...options,
      headers: {
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(identity?.token ? { authorization: `Bearer ${identity.token}` } : {}),
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    if (response.status === 204) return { unchanged: true };
    const payload = await response.json().catch(() => ({ ok: false, error: 'online_server_error' }));
    if (!response.ok) {
      const error = new Error(payload.error || 'online_server_error');
      error.payload = payload;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('request_timeout');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function post(action, payload = {}) {
  return requestJson(API, {
    method: 'POST',
    body: JSON.stringify({ action, ...payload })
  });
}

function setStatus(text, mode = 'idle') {
  const status = document.querySelector('#yakolakOnlineDialog .yo-status');
  if (status) {
    status.textContent = text;
    status.classList.toggle('error', mode === 'error');
  }
  const pill = document.getElementById('yakolakOnlinePill');
  if (!pill) return;
  pill.textContent = text;
  pill.className = room ? `show ${mode}` : '';
}

function setButtonsDisabled(value) {
  document.querySelectorAll('#yakolakOnlineDialog button').forEach(button => {
    if (!button.classList.contains('yo-close')) button.disabled = value;
  });
}

function openDialog() {
  document.getElementById('yakolakOnlineDialog')?.classList.add('open');
}

function closeDialog() {
  if (room?.status === 'waiting') return;
  document.getElementById('yakolakOnlineDialog')?.classList.remove('open');
}

function renderHome(message = '') {
  const body = document.querySelector('#yakolakOnlineDialog .yo-body');
  if (!body) return;
  body.replaceChildren();
  body.append(
    node('p', 'yo-note', 'أنشئ غرفة وشارك الرابط، أو أدخل رمز غرفة أرسله لك صديق. المباراة بين لاعبين في هذا الإصدار.')
  );
  const create = node('button', 'yo-button', 'إنشاء غرفة');
  create.type = 'button';
  create.addEventListener('click', renderColorChoice);
  const join = node('button', 'yo-button secondary', 'دخول برمز');
  join.type = 'button';
  const actions = node('div', 'yo-actions');
  actions.append(create, join);
  body.append(actions);

  const divider = node('div', 'yo-divider');
  const field = node('div', 'yo-field');
  const label = node('label', '', 'رمز الغرفة');
  const input = document.createElement('input');
  input.id = 'yakolakRoomCode';
  input.inputMode = 'text';
  input.autocomplete = 'one-time-code';
  input.maxLength = 6;
  input.value = roomParam();
  input.setAttribute('aria-label', 'رمز الغرفة');
  input.addEventListener('input', () => { input.value = normalizeCode(input.value); });
  field.append(label, input);
  body.append(divider, field);
  join.addEventListener('click', () => joinRoom(input.value));
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') joinRoom(input.value);
  });
  const status = node('div', 'yo-status', message);
  body.append(status);
}

function renderColorChoice() {
  const body = document.querySelector('#yakolakOnlineDialog .yo-body');
  if (!body) return;
  body.replaceChildren(
    node('p', 'yo-note', 'اختر لونك. سيحصل صديقك على اللون التالي تلقائيًا كي تبدأ المباراة فور دخوله.')
  );
  const colors = node('div', 'yo-colors');
  Object.entries(COLOR_LABELS).forEach(([color, [label, css]]) => {
    const button = node('button', 'yo-color', label);
    button.type = 'button';
    button.style.setProperty('--yo-color', css);
    button.addEventListener('click', () => createRoom(color));
    colors.append(button);
  });
  body.append(colors, node('div', 'yo-status'));
}

function inviteUrl(code) {
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set('room', code);
  return url.toString();
}

function renderWaiting() {
  const body = document.querySelector('#yakolakOnlineDialog .yo-body');
  if (!body || !room) return;
  body.replaceChildren(
    node('p', 'yo-note', 'الغرفة جاهزة. أرسل الرابط لصديقك واترك هذه الصفحة مفتوحة.')
  );
  body.append(node('strong', 'yo-code', room.code));
  const copy = node('button', 'yo-button', 'نسخ رابط الدعوة');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl(room.code));
      setStatus('تم نسخ رابط الدعوة.', 'online');
    } catch {
      setStatus(`شارك الرمز ${room.code} مع صديقك.`, 'online');
    }
  });
  const leave = node('button', 'yo-button secondary', 'إلغاء الغرفة');
  leave.type = 'button';
  leave.addEventListener('click', leaveOnline);
  const actions = node('div', 'yo-actions');
  actions.append(copy, leave);
  body.append(actions, node('div', 'yo-status', 'بانتظار اللاعب الآخر…'));
}

function renderFinished() {
  const body = document.querySelector('#yakolakOnlineDialog .yo-body');
  if (!body || !room) return;
  const humanWon = room.winner?.color === hooks.state().humanColor;
  body.replaceChildren(
    node('p', 'yo-note', humanWon ? 'أحسنت! اكتمل نمط الفوز.' : 'انتهت الجولة. يمكنكما بدء جولة جديدة مع بقاء الغرفة نفسها.')
  );
  const rematch = node('button', 'yo-button', 'جولة أخرى');
  rematch.type = 'button';
  rematch.addEventListener('click', requestRematch);
  const leave = node('button', 'yo-button secondary', 'خروج');
  leave.type = 'button';
  leave.addEventListener('click', leaveOnline);
  const actions = node('div', 'yo-actions');
  actions.append(rematch, leave);
  body.append(actions, node('div', 'yo-status', rematchText()));
}

function rematchText() {
  if (!room?.rematch) return '';
  const mine = room.rematch[identity?.seat];
  const otherSeat = identity?.seat === 'host' ? 'guest' : 'host';
  const other = room.rematch[otherSeat];
  if (mine && !other) return 'جاهز. بانتظار موافقة اللاعب الآخر…';
  if (!mine && other) return 'اللاعب الآخر جاهز لجولة جديدة.';
  return '';
}

async function applyRoom(nextRoom) {
  if (!nextRoom) return;
  const previousMove = room?.moveNumber || 0;
  room = nextRoom;
  pollDelay = POLL_BASE_MS;
  if (room.status === 'waiting') {
    renderWaiting();
    openDialog();
    setStatus('بانتظار اللاعب الآخر…', 'online');
    return;
  }
  if (!started) {
    const player = room.players.find(item => item.seat === identity.seat);
    if (!player) throw new Error('unauthorized');
    await hooks.start(room, {
      seat: identity.seat,
      color: player.color,
      submitMove
    });
    started = true;
    document.getElementById('yakolakOnlineEntry').hidden = true;
  } else {
    await hooks.apply(room, room.moveNumber > previousMove);
  }
  if (room.status === 'finished') {
    renderFinished();
    openDialog();
    setStatus('انتهت الجولة', 'online');
  } else {
    closeDialog();
    setStatus(room.turnIndex != null && room.players[room.turnIndex]?.seat === identity.seat ? 'دورك الآن' : 'متصل · دور الخصم', 'online');
  }
}

async function createRoom(color) {
  setButtonsDisabled(true);
  setStatus('ننشئ الغرفة…');
  try {
    const payload = await post('create', { color });
    saveIdentity({
      code: payload.room.code,
      token: payload.token,
      seat: payload.seat
    });
    setRoomUrl(payload.room.code);
    await applyRoom(payload.room);
    schedulePoll(0);
  } catch (error) {
    renderHome(errorMessage(error.message));
  } finally {
    setButtonsDisabled(false);
  }
}

async function joinRoom(value) {
  const code = normalizeCode(value);
  if (!CODE_PATTERN.test(code)) {
    setStatus(errorMessage('invalid_room_code'), 'error');
    return;
  }
  setButtonsDisabled(true);
  setStatus('ندخل الغرفة…');
  try {
    const payload = await post('join', { code });
    saveIdentity({ code, token: payload.token, seat: payload.seat });
    setRoomUrl(code);
    await applyRoom(payload.room);
    schedulePoll(0);
  } catch (error) {
    setStatus(errorMessage(error.message), 'error');
  } finally {
    setButtonsDisabled(false);
  }
}

async function submitMove(move) {
  if (!identity || !room || requestPending || room.status !== 'playing') return false;
  requestPending = true;
  setStatus('نثبت الحركة…');
  try {
    const payload = await post('move', {
      code: identity.code,
      version: room.version,
      zone: move.zone,
      size: move.size
    });
    await applyRoom(payload.room);
    return true;
  } catch (error) {
    if (error.payload?.room) await applyRoom(error.payload.room);
    else setStatus(errorMessage(error.message), 'error');
    schedulePoll(0);
    return false;
  } finally {
    requestPending = false;
  }
}

async function requestRematch() {
  if (!identity || !room || requestPending) return;
  requestPending = true;
  setButtonsDisabled(true);
  try {
    const payload = await post('rematch', {
      code: identity.code,
      version: room.version
    });
    await applyRoom(payload.room);
  } catch (error) {
    if (error.payload?.room) await applyRoom(error.payload.room);
    else setStatus(errorMessage(error.message), 'error');
  } finally {
    requestPending = false;
    setButtonsDisabled(false);
  }
}

async function poll() {
  if (stopped || !identity) return;
  try {
    const payload = await requestJson(
      `${API}?code=${encodeURIComponent(identity.code)}&since=${encodeURIComponent(room?.version || 0)}`
    );
    if (!payload.unchanged) await applyRoom(payload.room);
    pollDelay = POLL_BASE_MS;
  } catch (error) {
    pollDelay = Math.min(POLL_MAX_MS, Math.max(POLL_BASE_MS, pollDelay * 1.8));
    setStatus(errorMessage(error.message), 'offline');
  } finally {
    schedulePoll(document.hidden ? Math.max(4000, pollDelay) : pollDelay);
  }
}

function schedulePoll(delay) {
  clearTimeout(pollTimer);
  if (!stopped) pollTimer = setTimeout(poll, delay);
}

function leaveOnline() {
  stopped = true;
  clearTimeout(pollTimer);
  if (identity) {
    try { sessionStorage.removeItem(identityKey(identity.code)); } catch {}
  }
  clearRoomUrl();
  location.reload();
}

function buildUi() {
  const entry = node('button', '', 'لعب أونلاين');
  entry.id = 'yakolakOnlineEntry';
  entry.type = 'button';
  entry.addEventListener('click', () => {
    renderHome();
    openDialog();
  });

  const dialog = node('div');
  dialog.id = 'yakolakOnlineDialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'اللعب أونلاين');
  const card = node('div', 'yo-card');
  const head = node('div', 'yo-head');
  head.append(node('div', 'yo-title', 'اللعب أونلاين'));
  const close = node('button', 'yo-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'إغلاق');
  close.addEventListener('click', closeDialog);
  head.append(close);
  card.append(head, node('div', 'yo-body'));
  dialog.append(card);

  const pill = node('div');
  pill.id = 'yakolakOnlinePill';
  pill.setAttribute('aria-live', 'polite');
  document.body.append(entry, dialog, pill);
}

async function restoreInvite() {
  const code = roomParam();
  if (!CODE_PATTERN.test(code)) return;
  const saved = loadIdentity(code);
  renderHome();
  openDialog();
  if (!saved) {
    const input = document.getElementById('yakolakRoomCode');
    if (input) input.value = code;
    setStatus('رمز الدعوة جاهز. اضغط «دخول برمز».');
    return;
  }
  identity = saved;
  setStatus('نعيد الاتصال بالغرفة…');
  schedulePoll(0);
}

buildUi();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && identity) schedulePoll(0);
});
addEventListener('online', () => { if (identity) schedulePoll(0); });
addEventListener('offline', () => setStatus('لا يوجد اتصال بالإنترنت', 'offline'));
restoreInvite();

globalThis.__yakolakOnlineV114 = {
  get identity() { return identity ? { code: identity.code, seat: identity.seat } : null; },
  get room() { return room ? structuredClone(room) : null; },
  create: createRoom,
  join: joinRoom,
  poll
};
