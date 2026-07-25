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
  return `yakolak-online-v116:${code}`;
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

function setStatus(text, mode = 'idle') {
  const status = document.querySelector('#yakolakOnlineDialog .y�O{����k�w��Q���ѽ����������������ɥ�������흅������(���圵͍�ɔ�張ɽ�ѕȁ����������������퍽�յ���������퉽ɑ�ȵɅ����������(���圵͍�ɔ�張ɽ�ѕȁ������홽�еͥ�������(���圵͍�ɔ�張ɽ�ѕȁ�����͵���홽�еͥ������)�(