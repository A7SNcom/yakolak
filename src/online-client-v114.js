const game = globalThis.__yakolakGame;
if (!game?.state || !game?.renderer || !game?.camera) throw new Error('v114 online game hooks unavailable');

let onlineHumanColor = null;
let onlineSubmitMove = null;
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
  score.classList.add('yo-roster');
  score.replaceChildren();
  room.players.forEach((player, index) => {
    const mine = player.seat === identity?.seat;
    const active = room.status === 'playing' && index === room.turnIndex;
    const item = document.createElement('span');
    item.className = `${mine ? 'mine' : ''} ${active ? 'active' : ''}`.trim();
    const dot = document.createElement('i');
    dot.style.background = COLOR_LABELS[player.color]?.[1] || '#ffffff';
    const label = document.createElement('b');
    label.textContent = mine ? 'أنت' : `لاعب ${index + 1}`;
    const detail = document.createElement('small');
    detail.textContent = active ? 'الدور الآن' : colorLabel(player.color);
    item.append(dot, label, detail);
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
    if (room.draw) captionGame('تعادل — انتهت الحركات القانونية.');
    else captionGame(room.winner?.color === onlineHumanColor ? 'فزت بالجولة!' : `فاز ${colorLabel(room.winner?.color)}.`);
    return;
  }
  if (room.status === 'cancelled') {
    captionGame('انتهت الغرفة لأن أحد اللاعبين غادر.');
    return;
  }
  const current = room.players[room.turnIndex];
  if (current?.seat === identity?.seat) {
    captionGame('دورك: افتح طقمك، اختر الحجم، ثم اختر خانة متاحة.');
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

const hooks = {
  state() {
    return { ...game.state, humanColor: onlineHumanColor };
  },
  async wait(remote, session) {
    await waitForGameReady();
    globalThis.__yakolakV125WhiteWall?.deactivate?.();
    onlineHumanColor = session.color;
    game.state.humanColor = onlineHumanColor;
    game.state.players = remote.players.map(player => player.color);
    game.state.botCount = 0;
    game.state.configured = true;
    game.state.started = false;
    game.state.tutorial = false;
    game.state.locked = true;
    game.state.winner = null;
    game.state.board = structuredClone(remote.board);
    game.setupGroup.visible = false;
    document.getElementById('yakolakGameSetup')?.classList.add('hidden');
    if (game.meshes['9']) game.meshes['9'].visible = true;
    resetOnlinePieces(remote);
    game.syncActiveReadinessBases();
    game.setPlayerView(onlineHumanColor);
    captionGame(`الغرفة ${remote.code}: ${remote.players.length} من ${remote.targetPlayers} جاهزون.`);
    renderGame();
  },
  async start(remote, session) {
    await waitForGameReady();
    globalThis.__yakolakV125WhiteWall?.deactivate?.();
    onlineHumanColor = session.color;
    onlineSubmitMove = session.submitMove;
    game.state.humanColor = onlineHumanColor;
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
    globalThis.__yakolakOnlineGameplayBridge.active = true;
    game.setPlayerView(onlineHumanColor);
    await this.apply(remote, false);
  },
  async apply(remote) {
    game.closePieceTray();
    game.clearHighlights();
    game.state.players = remote.players.map(player => player.color);
    game.state.turnIndex = remote.turnIndex;
    game.state.round = remote.round;
    game.state.board = structuredClone(remote.board);
    game.state.winner = remote.winner?.color || null;
    game.state.locked = remote.status !== 'playing' || requestPending;
    resetOnlinePieces(remote);
    game.syncActiveReadinessBases();
    showOnlineLastMove(remote.lastMove);
    syncOnlineScore();
    updateOnlineCaption();
    game.updateTurnGlow();
    renderGame();
    if (remote.winner) void game.showWinHighlight(remote.winner);
  }
};

const API = '/api/rooms-v126';
const POLL_BASE_MS = 900;
const POLL_MAX_MS = 8000;
const REQUEST_TIMEOUT_MS = 6500;
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
const PLAYER_COUNTS = [2, 3, 4];
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
let selectedPlayerCount = 2;
let invitePreview = null;

const onlineSetupBridge = {
  active: false,
  mode: 'create',
  color: null,
  availableColors: null,
  create({ color, targetPlayers, targetRounds = 3, roomName = 'غرفة جديدة' }) {
    this.active = false;
    void createRoom(color, targetPlayers, targetRounds, roomName).catch(() => {});
  },
  join(color) {
    this.active = false;
    void joinRoom(invitePreview?.code || roomParam(), color).catch(() => {});
  }
};
globalThis.__yakolakOnlineSetupBridge = onlineSetupBridge;
globalThis.__yakolakOnlineGameplayBridge = {
  active: false,
  submit(move) {
    void submitMove(move);
  }
};

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
  return `yakolak-online-v117:${code}`;
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
    room_full: 'اكتمل عدد اللاعبين في هذه الغرفة.',
    color_taken: 'اختار لاعب آخر هذا اللون. اختر لونًا متاحًا.',
    invalid_player_count: 'اختر عدد لاعبين بين 2 و4.',
    invalid_round_count: 'اختر 3 أو 5 جولات.',
    invalid_room_name: 'اكتب اسمًا واضحًا للغرفة من حرفين إلى 32 حرفًا.',
    room_cancelled: 'أُغلقت هذه الغرفة.',
    not_your_turn: 'انتظر دورك؛ تم تحديث اللوحة.',
    occupied_slot: 'هذا الحجم موجود في الخانة بالفعل.',
    no_piece_remaining: 'استخدمت قطعك الثلاث من هذا الحجم. اختر حجمًا آخر.',
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

async function listRooms() {
  const payload = await post('list');
  return Array.isArray(payload.rooms) ? payload.rooms : [];
}

async function previewRoom(value) {
  const code = normalizeCode(value);
  if (!CODE_PATTERN.test(code)) throw new Error('invalid_room_code');
  const payload = await post('preview', { code });
  return payload.room;
}

function publishRoom() {
  dispatchEvent(new CustomEvent('yakolak:online-room', {
    detail: { room: room ? structuredClone(room) : null }
  }));
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
  document.getElementById('yakolakOnlineDialog')?.classList.remove('open');
}

function beginNativeOnlineSetup(mode, availableColors = null) {
  onlineSetupBridge.active = true;
  onlineSetupBridge.mode = mode;
  onlineSetupBridge.color = null;
  onlineSetupBridge.availableColors = availableColors;
  globalThis.__yakolakOnlineGameplayBridge.active = false;
  game.state.configured = false;
  game.state.started = false;
  game.state.locked = false;
  game.state.humanColor = null;
  game.state.players = [];
  game.state.setupStep = 'color';
  closeDialog();
  document.body.classList.add('yakolak-online-native-setup');
  const entry = document.getElementById('yakolakOnlineEntry');
  if (entry) entry.textContent = 'إلغاء الأونلاين';
  game.renderSetup3D();
}

function renderHome(message = '') {
  const body = document.querySelector('#yakolakOnlineDialog .yo-body');
  if (!body) return;
  body.replaceChildren();
  body.append(node('p', 'yo-note', 'تصفح الغرف المفتوحة أو أنشئ غرفة باسم تتذكره اللعبة لك.'));
  const browse = node('button', 'yo-button', 'تصفح الغرف');
  browse.type = 'button';
  browse.addEventListener('click', () => dispatchEvent(new CustomEvent('yakolak:open-room-browser')));
  body.append(browse);
  const status = node('div', 'yo-status', message);
  body.append(status);
}

function choiceHeading(title, note) {
  const fragment = document.createDocumentFragment();
  fragment.append(node('h2', 'yo-step-title', title), node('p', 'yo-note', note));
  return fragment;
}

function renderPlayerCountChoice() {
  const body = document.querySelector('#yakolakOnlineDialog .yo-body');
  if (!body) return;
  body.replaceChildren(choiceHeading('كم لاعبًا؟', 'تبدأ المباراة تلقائيًا عندما يكتمل العدد.'));
  const counts = node('div', 'yo-counts');
  PLAYER_COUNTS.forEach(count => {
    const button = node('button', `yo-count${count === selectedPlayerCount ? ' selected' : ''}`, String(count));
    button.type = 'button';
    button.setAttribute('aria-pressed', String(count === selectedPlayerCount));
    button.addEventListener('click', () => {
      selectedPlayerCount = count;
      renderPlayerCountChoice();
    });
    counts.append(button);
  });
  const next = node('button', 'yo-button', 'اختيار اللون');
  next.type = 'button';
  next.addEventListener('click', () => renderColorChoice('create'));
  const back = node('button', 'yo-button secondary', 'رجوع');
  back.type = 'button';
  back.addEventListener('click', () => renderHome());
  const actions = node('div', 'yo-actions');
  actions.append(next, back);
  body.append(counts, actions, node('div', 'yo-status'));
}

function renderColorButtons(availableColors, onChoose) {
  const grid = node('div', 'yo-colors');
  Object.entries(COLOR_LABELS).forEach(([color, [label, css]]) => {
    const button = node('button', 'yo-color', label);
    button.type = 'button';
    button.style.setProperty('--yo-color', css);
    const enabled = availableColors.includes(color);
    button.disabled = !enabled;
    if (!enabled) button.setAttribute('aria-label', `${label} محجوز`);
    button.addEventListener('click', () => enabled && onChoose(color));
    grid.append(button);
  });
  return grid;
}

function renderColorChoice(mode = 'create') {
  const body = document.querySelector('#yakolakOnlineDialog .yo-body');
  if (!body) return;
  const joining = mode === 'join';
  const available = joining ? (invitePreview?.availableColors || []) : Object.keys(COLOR_LABELS);
  body.replaceChildren(choiceHeading(
    joining ? 'اختر لونك للانضمام' : 'اختر لونك',
    joining
      ? `الغرفة ${invitePreview?.code || roomParam()} · ${invitePreview?.players?.length || 0}/${invitePreview?.targetPlayers || '?'} لاعبين`
      : `غرفة من ${selectedPlayerCount} لاعبين`
  ));
  body.append(renderColorButtons(
    available,
    color => void (joining
      ? joinRoom(invitePreview?.code || roomParam(), color)
      : createRoom(color, selectedPlayerCount, 3, 'غرفة جديدة')).catch(() => {})
  ));
  const back = node('button', 'yo-button secondary yo-back', 'رجوع');
  back.type = 'button';
  back.addEventListener('click', joining ? () => leaveInvite() : renderPlayerCountChoice);
  body.append(back, node('div', 'yo-status'));
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
    choiceHeading('الغرفة جاهزة', `انضم ${room.players.length} من ${room.targetPlayers} لاعبين`)
  );
  body.append(node('strong', 'yo-code', room.code));
  const roster = node('div', 'yo-lobby-roster');
  room.players.forEach(player => {
    const item = node('div', 'yo-lobby-player');
    const dot = node('i');
    dot.style.background = COLOR_LABELS[player.color]?.[1] || '#fff';
    item.append(dot, node('b', '', player.seat === identity?.seat ? 'أنت' : `لاعب ${room.players.indexOf(player) + 1}`), node('small', '', colorLabel(player.color)));
    roster.append(item);
  });
  for (let index = room.players.length; index < room.targetPlayers; index += 1) {
    roster.append(node('div', 'yo-lobby-player empty', 'بانتظار لاعب…'));
  }
  body.append(roster);
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
  const leave = node('button', 'yo-button secondary', identity?.seat === 'p1' ? 'إلغاء الغرفة' : 'مغادرة الغرفة');
  leave.type = 'button';
  leave.addEventListener('click', leaveOnline);
  const actions = node('div', 'yo-actions');
  actions.append(copy, leave);
  body.append(actions, node('div', 'yo-status', `بانتظار ${room.targetPlayers - room.players.length} لاعب…`));
}

function renderFinished() {
  const body = document.querySelector('#yakolakOnlineDialog .yo-body');
  if (!body || !room) return;
  const humanWon = room.winner?.color === hooks.state().humanColor;
  body.replaceChildren(
    node(
      'p',
      'yo-note',
      room.draw
        ? 'تعادل: لم تعد هناك حركة قانونية. يمكنكم بدء جولة جديدة في الغرفة نفسها.'
        : humanWon
          ? 'أحسنت! اكتمل نمط الفوز.'
          : 'انتهت الجولة. يمكنكم بدء جولة جديدة مع بقاء الغرفة نفسها.'
    )
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

function renderPlayingRoom() {
  const body = document.querySelector('#yakolakOnlineDialog .yo-body');
  if (!body || !room) return;
  const current = room.players[room.turnIndex];
  body.replaceChildren(
    choiceHeading(
      `الغرفة ${room.code}`,
      current?.seat === identity?.seat ? 'دورك الآن.' : `الدور عند ${colorLabel(current?.color)}.`
    )
  );
  const roster = node('div', 'yo-lobby-roster');
  room.players.forEach((player, index) => {
    const item = node('div', `yo-lobby-player${index === room.turnIndex ? ' active' : ''}`);
    const dot = node('i');
    dot.style.background = COLOR_LABELS[player.color]?.[1] || '#fff';
    item.append(
      dot,
      node('b', '', player.seat === identity?.seat ? 'أنت' : `لاعب ${index + 1}`),
      node('small', '', index === room.turnIndex ? 'الدور الآن' : colorLabel(player.color))
    );
    roster.append(item);
  });
  const leave = node('button', 'yo-button secondary', 'مغادرة المباراة');
  leave.type = 'button';
  leave.addEventListener('click', leaveOnline);
  body.append(
    roster,
    node('p', 'yo-caution', 'مغادرة مباراة بدأت ستنهي هذه الجولة لجميع اللاعبين.'),
    leave,
    node('div', 'yo-status')
  );
}

function rematchText() {
  if (!room?.rematch) return '';
  const mine = room.rematch[identity?.seat];
  const ready = room.players.filter(player => room.rematch[player.seat]).length;
  if (mine && ready < room.players.length) return `جاهز. بانتظار ${room.players.length - ready} لاعب…`;
  if (!mine && ready > 0) return `${ready} من ${room.players.length} جاهزون لجولة جديدة.`;
  return '';
}

async function applyRoom(nextRoom) {
  if (!nextRoom) return;
  const previousMove = room?.moveNumber || 0;
  room = nextRoom;
  pollDelay = POLL_BASE_MS;
  if (room.status === 'waiting') {
    const player = room.players.find(item => item.seat === identity?.seat);
    if (player) await hooks.wait(room, { color: player.color });
    onlineSetupBridge.active = false;
    document.body.classList.remove('yakolak-online-native-setup');
    document.body.classList.add('yakolak-online-waiting');
    const entry = document.getElementById('yakolakOnlineEntry');
    if (entry) {
      entry.hidden = true;
      entry.textContent = 'لعب أونلاين';
    }
    renderWaiting();
    openDialog();
    setStatus('بانتظار اللاعب الآخر…', 'online');
    publishRoom();
    return;
  }
  if (room.status === 'cancelled') {
    stopped = true;
    clearTimeout(pollTimer);
    const body = document.querySelector('#yakolakOnlineDialog .yo-body');
    body?.replaceChildren(
      choiceHeading('انتهت الغرفة', 'غادر أحد اللاعبين. يمكنك العودة وإنشاء غرفة جديدة.'),
      node('button', 'yo-button', 'العودة للبداية')
    );
    const back = body?.querySelector('button');
    back?.addEventListener('click', leaveOnline);
    openDialog();
    setStatus('انتهت الغرفة', 'offline');
    publishRoom();
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
    document.body.classList.remove('yakolak-online-waiting', 'yakolak-online-native-setup');
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
  publishRoom();
}

async function createRoom(color, targetPlayers, targetRounds = 3, roomName = '') {
  setButtonsDisabled(true);
  setStatus('ننشئ الغرفة…');
  try {
    const payload = await post('create', { color, targetPlayers, targetRounds, roomName });
    saveIdentity({
      code: payload.room.code,
      token: payload.token,
      seat: payload.seat
    });
    setRoomUrl(payload.room.code);
    await applyRoom(payload.room);
    schedulePoll(0);
    return payload.room;
  } catch (error) {
    renderHome(errorMessage(error.message));
    throw error;
  } finally {
    setButtonsDisabled(false);
  }
}

async function prepareInvite(value) {
  const code = normalizeCode(value);
  if (!CODE_PATTERN.test(code)) {
    setStatus(errorMessage('invalid_room_code'), 'error');
    return;
  }
  setButtonsDisabled(true);
  setStatus('نتحقق من الدعوة…');
  try {
    invitePreview = await previewRoom(code);
    if (invitePreview.status !== 'waiting') throw new Error(invitePreview.status === 'cancelled' ? 'room_cancelled' : 'room_full');
    beginNativeOnlineSetup('join', invitePreview.availableColors || []);
  } catch (error) {
    renderHome(errorMessage(error.message));
    const input = document.getElementById('yakolakRoomCode');
    if (input) input.value = code;
  } finally {
    setButtonsDisabled(false);
  }
}

async function joinRoom(value, color) {
  const code = normalizeCode(value);
  if (!CODE_PATTERN.test(code)) {
    setStatus(errorMessage('invalid_room_code'), 'error');
    return;
  }
  setButtonsDisabled(true);
  setStatus('ندخل الغرفة…');
  try {
    const payload = await post('join', { code, color });
    saveIdentity({ code, token: payload.token, seat: payload.seat });
    setRoomUrl(code);
    await applyRoom(payload.room);
    schedulePoll(0);
    return payload.room;
  } catch (error) {
    if (error.message === 'color_taken' || error.message === 'version_conflict') {
      await prepareInvite(code);
      setStatus(errorMessage(error.message), 'error');
    } else {
      setStatus(errorMessage(error.message), 'error');
    }
    throw error;
  } finally {
    setButtonsDisabled(false);
  }
}

async function submitMove(move) {
  if (!identity || !room || requestPending || room.status !== 'playing') return false;
  requestPending = true;
  game.state.locked = true;
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
    if (room?.status === 'playing') {
      game.state.locked = false;
      game.updateTurnGlow();
    }
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
    return payload.room;
  } catch (error) {
    if (error.payload?.room) await applyRoom(error.payload.room);
    else setStatus(errorMessage(error.message), 'error');
    throw error;
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

function leaveInvite() {
  clearRoomUrl();
  invitePreview = null;
  renderHome();
}

async function leaveOnline() {
  stopped = true;
  clearTimeout(pollTimer);
  if (identity && room && room.status !== 'cancelled') {
    try {
      await post('leave', { code: identity.code, version: room.version });
    } catch {}
  }
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
    if (onlineSetupBridge.active) {
      onlineSetupBridge.active = false;
      onlineSetupBridge.availableColors = null;
      document.body.classList.remove('yakolak-online-native-setup');
      entry.textContent = 'لعب أونلاين';
      game.state.humanColor = null;
      game.state.setupStep = 'color';
      game.renderSetup3D();
      return;
    }
    if (room?.status === 'waiting') renderWaiting();
    else if (invitePreview) renderColorChoice('join');
    else renderHome();
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

  const pill = node('button');
  pill.id = 'yakolakOnlinePill';
  pill.type = 'button';
  pill.setAttribute('aria-label', 'حالة غرفة الأونلاين');
  pill.setAttribute('aria-live', 'polite');
  pill.addEventListener('click', () => {
    if (room?.status === 'waiting') renderWaiting();
    else if (room?.status === 'finished') renderFinished();
    else if (room?.status === 'playing') renderPlayingRoom();
    else return;
    openDialog();
  });
  document.body.append(entry, dialog, pill);
}

async function restoreInvite() {
  const code = roomParam();
  if (!CODE_PATTERN.test(code)) return;
  const saved = loadIdentity(code);
  openDialog();
  if (!saved) {
    const body = document.querySelector('#yakolakOnlineDialog .yo-body');
    body?.replaceChildren(
      choiceHeading('دعوة للعب', 'نجهز الغرفة ونقرأ الألوان المتاحة…'),
      node('div', 'yo-loader', '•••'),
      node('div', 'yo-status', 'جارٍ التحقق من الدعوة…')
    );
    await prepareInvite(code);
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

const onlineApi = {
  protocol: 4,
  get identity() { return identity ? { code: identity.code, seat: identity.seat } : null; },
  get room() { return room ? structuredClone(room) : null; },
  list: listRooms,
  preview: previewRoom,
  create: createRoom,
  join: joinRoom,
  rematch: requestRematch,
  leave: leaveOnline,
  poll,
  errorMessage,
  recenter() { game.setPlayerView(onlineHumanColor || game.state.humanColor); }
};
globalThis.__yakolakOnlineV114 = onlineApi;
globalThis.__yakolakOnlineV126 = onlineApi;
