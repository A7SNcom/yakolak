import { normalizeRoomName, validRoomName } from './room-name-v126.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const COLOR_INFO = {
  right: ['الأبيض', '#f1eee6'],
  back: ['الأزرق', '#3769a5'],
  left: ['الذهبي', '#b78a44'],
  front: ['الأخضر', '#2f856a']
};
const NAME_HISTORY_KEY = 'yakolak-room-name-history-v126';

async function waitForRuntime() {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const client = globalThis.__yakolakOnlineV126;
    const game = globalThis.__yakolakGame;
    const entry = globalThis.__yakolakV121Entry;
    if (client?.list && client?.create && game?.setPlayerView && game?.controls && entry?.choose) {
      return { client, game, entry };
    }
    await wait(25);
  }
  throw new Error('v126 room browser runtime unavailable');
}

function element(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function action(text, className = '', onClick = null) {
  const button = element('button', `yrb-button ${className}`.trim(), text);
  button.type = 'button';
  if (onClick) button.addEventListener('click', onClick);
  return button;
}

function loadNameHistory() {
  try {
    const values = JSON.parse(localStorage.getItem(NAME_HISTORY_KEY) || '[]');
    return Array.isArray(values)
      ? values.map(normalizeRoomName).filter(validRoomName).slice(0, 6)
      : [];
  } catch {
    return [];
  }
}

function rememberRoomName(value) {
  const name = normalizeRoomName(value);
  if (!validRoomName(name)) return;
  const next = [name, ...loadNameHistory().filter(item => item !== name)].slice(0, 6);
  try { localStorage.setItem(NAME_HISTORY_KEY, JSON.stringify(next)); } catch {}
}

function inviteUrl(code) {
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set('room', code);
  return url.toString();
}

function roomCodeFromUrl() {
  return String(new URL(location.href).searchParams.get('room') || '').toUpperCase();
}

async function installRoomBrowser() {
  const { client, game, entry } = await waitForRuntime();
  const root = element('div');
  root.id = 'yakolakRoomsV126';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'غرف اللعب الأونلاين');

  const shell = element('section', 'yrb-shell');
  const head = element('header', 'yrb-head');
  head.append(element('div', 'yrb-brand', 'YAKOLAK'));
  const close = element('button', 'yrb-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'إغلاق');
  head.append(close);
  const main = element('main', 'yrb-main');
  shell.append(head, main);
  root.append(shell);

  const hud = element('aside');
  hud.id = 'yakolakOnlineHudV126';
  hud.hidden = true;
  const hudCopy = element('div', 'yrb-hud-copy');
  const hudTitle = element('strong');
  const hudStatus = element('small');
  hudCopy.append(hudTitle, hudStatus);
  const hudActions = element('div', 'yrb-hud-actions');
  const statusButton = element('button', '', 'تفاصيل');
  statusButton.type = 'button';
  const recenterButton = element('button');
  recenterButton.type = 'button';
  recenterButton.append('◎ ', element('span', '', 'ثبت الكاميرا'));
  recenterButton.addEventListener('click', () => client.recenter());
  hudActions.append(statusButton, recenterButton);
  hud.append(hudCopy, hudActions);
  document.body.append(root, hud);

  const state = {
    screen: 'browse',
    rooms: [],
    selectedRoom: null,
    room: client.room,
    refreshing: false,
    pending: false,
    error: '',
    createName: loadNameHistory()[0] || '',
    createPlayers: 2,
    createRounds: 3,
    createColor: 'right'
  };

  function setOverlay(open) {
    root.hidden = !open;
    document.body.classList.toggle('yakolak-room-browser-open', open);
    game.controls.enabled = !open;
    if (open) requestAnimationFrame(() => main.querySelector('button, input')?.focus());
  }

  function setMain(title, note = '') {
    main.replaceChildren();
    main.append(element('h1', 'yrb-title', title));
    if (note) main.append(element('p', 'yrb-note', note));
  }

  function showError(message) {
    if (!message) return;
    main.append(element('div', 'yrb-error', message));
  }

  function friendlyError(error) {
    return client.errorMessage?.(error?.message) || 'تعذر إكمال العملية. حاول مرة أخرى.';
  }

  function optionButton(label, selected, onClick, { disabled = false, color = '' } = {}) {
    const button = element('button', `yrb-option${color ? ' yrb-color' : ''}`, label);
    button.type = 'button';
    button.disabled = disabled;
    button.setAttribute('aria-pressed', String(selected));
    if (color) button.style.setProperty('--room-color', color);
    button.addEventListener('click', onClick);
    return button;
  }

  function renderBrowse() {
    state.screen = 'browse';
    state.selectedRoom = null;
    setMain('الغرف المفتوحة', 'ادخل غرفة مباشرة من القائمة، أو أنشئ غرفة باسم تختاره. لا تحتاج إلى حفظ أي رمز.');
    const toolbar = element('div', 'yrb-toolbar');
    const create = action('إنشاء غرفة', '', () => renderCreate());
    const refresh = action(state.refreshing ? 'جاري التحديث…' : 'تحديث', 'secondary', () => void refreshRooms(true));
    refresh.disabled = state.refreshing;
    toolbar.append(create, refresh);
    main.append(toolbar);
    if (state.error) showError(state.error);
    const list = element('div', 'yrb-list');
    list.setAttribute('aria-live', 'polite');
    if (!state.rooms.length && !state.refreshing) {
      list.append(element('div', 'yrb-empty', 'لا توجد غرفة مفتوحة الآن. أنشئ أول غرفة وسمّها كما تحب.'));
    }
    state.rooms.forEach(room => {
      const button = element('button', 'yrb-room');
      button.type = 'button';
      const copy = element('span');
      copy.append(element('strong', '', room.name || 'غرفة ياكلك'));
      copy.append(element('small', '', `${room.players.length}/${room.targetPlayers} لاعبين · ${room.targetRounds || 3} جولات`));
      button.append(copy, element('span', '', 'انضم ←'));
      button.addEventListener('click', () => void selectRoom(room));
      list.append(button);
    });
    main.append(list);
  }

  async function refreshRooms(announce = false) {
    if (state.refreshing || state.screen !== 'browse') return;
    state.refreshing = true;
    state.error = '';
    renderBrowse();
    try {
      state.rooms = await client.list();
    } catch (error) {
      state.error = friendlyError(error);
    } finally {
      state.refreshing = false;
      if (state.screen === 'browse') renderBrowse();
      if (announce) main.querySelector('.yrb-list')?.setAttribute('aria-label', 'تم تحديث الغرف');
    }
  }

  function renderCreate() {
    state.screen = 'create';
    state.error = '';
    setMain('إنشاء غرفة', 'سمِّ الغرفة مرة واحدة؛ ستحفظ اللعبة أسماءك السابقة كاقتراحات عند الإنشاء مستقبلًا.');
    const form = element('form', 'yrb-form');
    const nameField = element('div', 'yrb-field');
    const nameLabel = element('label', '', 'اسم الغرفة');
    nameLabel.htmlFor = 'yakolakRoomNameV126';
    const input = element('input', 'yrb-input');
    input.id = 'yakolakRoomNameV126';
    input.maxLength = 32;
    input.autocomplete = 'off';
    input.placeholder = 'مثال: جمعة الأصدقاء';
    input.value = state.createName;
    input.addEventListener('input', () => { state.createName = normalizeRoomName(input.value); });
    nameField.append(nameLabel, input);
    const history = loadNameHistory();
    if (history.length) {
      const suggestions = element('div', 'yrb-suggestions');
      history.forEach(name => {
        const suggestion = optionButton(name, false, () => {
          state.createName = name;
          input.value = name;
          input.focus();
        });
        suggestion.classList.add('yrb-suggestion');
        suggestions.append(suggestion);
      });
      nameField.append(suggestions);
    }
    form.append(nameField);

    const addOptions = (label, values, selected, choose, format = value => String(value)) => {
      const field = element('fieldset', 'yrb-field');
      field.append(element('legend', 'yrb-label', label));
      const options = element('div', 'yrb-options');
      values.forEach(value => options.append(optionButton(format(value), selected === value, () => {
        choose(value);
        renderCreate();
      })));
      field.append(options);
      form.append(field);
    };
    addOptions('عدد اللاعبين', [2, 3, 4], state.createPlayers, value => { state.createPlayers = value; }, value => `${value} لاعبين`);
    addOptions('عدد الجولات', [3, 5], state.createRounds, value => { state.createRounds = value; }, value => `${value} جولات`);

    const colorField = element('fieldset', 'yrb-field');
    colorField.append(element('legend', 'yrb-label', 'لونك'));
    const colors = element('div', 'yrb-options');
    Object.entries(COLOR_INFO).forEach(([color, [label, css]]) => {
      colors.append(optionButton(label, state.createColor === color, () => {
        state.createColor = color;
        renderCreate();
      }, { color: css }));
    });
    colorField.append(colors);
    form.append(colorField);

    const toolbar = element('div', 'yrb-toolbar');
    const submit = action(state.pending ? 'جاري الإنشاء…' : 'إنشاء الغرفة');
    submit.type = 'submit';
    submit.disabled = state.pending;
    toolbar.append(submit, action('رجوع', 'secondary', () => renderBrowse()));
    form.append(toolbar);
    if (state.error) form.append(element('div', 'yrb-error', state.error));
    form.addEventListener('submit', event => {
      event.preventDefault();
      void createRoom();
    });
    main.append(form);
    requestAnimationFrame(() => input.focus());
  }

  async function createRoom() {
    const name = normalizeRoomName(state.createName);
    if (!validRoomName(name)) {
      state.error = 'اكتب اسمًا واضحًا للغرفة من حرفين إلى 32 حرفًا.';
      renderCreate();
      return;
    }
    state.pending = true;
    state.error = '';
    renderCreate();
    try {
      const room = await client.create(state.createColor, state.createPlayers, state.createRounds, name);
      rememberRoomName(name);
      syncRoom(room);
    } catch (error) {
      state.error = friendlyError(error);
      state.pending = false;
      renderCreate();
    }
  }

  async function selectRoom(summary) {
    state.screen = 'join';
    state.selectedRoom = summary;
    state.pending = true;
    state.error = '';
    renderJoin();
    try {
      state.selectedRoom = await client.preview(summary.code);
    } catch (error) {
      state.error = friendlyError(error);
    } finally {
      state.pending = false;
      renderJoin();
    }
  }

  function renderJoin() {
    const room = state.selectedRoom;
    setMain(room?.name || 'الغرفة', room ? `${room.players.length}/${room.targetPlayers} لاعبين · ${room.targetRounds || 3} جولات` : 'جاري تحميل الغرفة…');
    const colors = element('div', 'yrb-form');
    colors.append(element('div', 'yrb-label', 'اختر لونك للانضمام'));
    const options = element('div', 'yrb-options');
    Object.entries(COLOR_INFO).forEach(([color, [label, css]]) => {
      const enabled = Boolean(room?.availableColors?.includes(color));
      options.append(optionButton(label, false, () => void joinRoom(color), { disabled: !enabled || state.pending, color: css }));
    });
    colors.append(options);
    const toolbar = element('div', 'yrb-toolbar');
    toolbar.append(action('رجوع للغرف', 'secondary', () => {
      state.error = '';
      renderBrowse();
      void refreshRooms();
    }));
    colors.append(toolbar);
    if (state.error) colors.append(element('div', 'yrb-error', state.error));
    main.append(colors);
  }

  async function joinRoom(color) {
    if (!state.selectedRoom || state.pending) return;
    state.pending = true;
    state.error = '';
    renderJoin();
    try {
      const room = await client.join(state.selectedRoom.code, color);
      syncRoom(room);
    } catch (error) {
      state.pending = false;
      state.error = friendlyError(error);
      renderJoin();
    }
  }

  function playerRow(room, player, index) {
    const mine = player.seat === client.identity?.seat;
    const row = element('div', 'yrb-player');
    const copy = element('div');
    const dot = element('i');
    dot.style.setProperty('--room-color', COLOR_INFO[player.color]?.[1] || '#999');
    copy.append(dot, element('b', '', mine ? 'أنت' : `لاعب ${index + 1}`));
    row.append(copy, element('small', '', COLOR_INFO[player.color]?.[0] || player.color));
    return row;
  }

  function renderWaiting(room) {
    state.screen = 'waiting';
    setMain(room.name || 'الغرفة جاهزة', `انضم ${room.players.length} من ${room.targetPlayers} لاعبين · تبدأ اللعبة تلقائيًا عند اكتمال العدد.`);
    const roster = element('div', 'yrb-roster');
    room.players.forEach((player, index) => roster.append(playerRow(room, player, index)));
    for (let index = room.players.length; index < room.targetPlayers; index += 1) {
      roster.append(element('div', 'yrb-player', 'بانتظار لاعب…'));
    }
    main.append(roster);
    const toolbar = element('div', 'yrb-toolbar');
    const copy = action('نسخ رابط الدعوة', '', async () => {
      try {
        await navigator.clipboard.writeText(inviteUrl(room.code));
        status.textContent = 'تم نسخ الرابط.';
      } catch {
        status.textContent = 'تعذر النسخ. جرّب من متصفح آخر.';
      }
    });
    toolbar.append(copy, action('مغادرة الغرفة', 'danger', () => void client.leave()));
    main.append(toolbar);
    const status = element('div', 'yrb-status', `بانتظار ${room.targetPlayers - room.players.length} لاعب…`);
    status.setAttribute('aria-live', 'polite');
    main.append(status);
  }

  function scoreRows(room) {
    const scores = element('div', 'yrb-scores');
    room.players.forEach((player, index) => {
      const row = element('div', 'yrb-score');
      row.append(element('strong', '', player.seat === client.identity?.seat ? 'أنت' : `لاعب ${index + 1}`));
      row.append(element('small', '', `${Number(room.scores?.[player.seat] || 0)} فوز`));
      scores.append(row);
    });
    return scores;
  }

  function resultText(room) {
    if (room.matchWinner) {
      return room.matchWinner.seat === client.identity?.seat
        ? `فزت بالمباراة بعد ${room.completedRounds} جولات.`
        : `فاز ${COLOR_INFO[room.matchWinner.color]?.[0] || 'اللاعب'} بالمباراة.`;
    }
    if (room.matchComplete && room.matchWinners?.length > 1) return 'انتهت المباراة بالتعادل في عدد مرات الفوز.';
    if (room.draw) return 'انتهت الجولة بالتعادل.';
    return room.winner?.seat === client.identity?.seat || room.winner?.color === game.state.humanColor
      ? 'فزت بهذه الجولة.'
      : `فاز ${COLOR_INFO[room.winner?.color]?.[0] || 'اللاعب'} بهذه الجولة.`;
  }

  function renderFinished(room) {
    state.screen = 'finished';
    setMain(room.matchComplete ? 'انتهت المباراة' : `انتهت الجولة ${room.completedRounds || room.round}`, resultText(room));
    main.append(scoreRows(room));
    const mineReady = Boolean(room.rematch?.[client.identity?.seat]);
    const readyCount = room.players.filter(player => room.rematch?.[player.seat]).length;
    const toolbar = element('div', 'yrb-toolbar');
    const rematch = action(
      mineReady
        ? `جاهز · بانتظار ${room.players.length - readyCount}`
        : room.matchComplete ? 'مباراة جديدة' : 'الجولة التالية',
      '',
      () => void requestRematch()
    );
    rematch.disabled = mineReady || state.pending;
    toolbar.append(rematch, action('خروج', 'danger', () => void client.leave()));
    main.append(toolbar);
    if (state.error) showError(state.error);
  }

  async function requestRematch() {
    if (state.pending) return;
    state.pending = true;
    state.error = '';
    renderFinished(state.room);
    try {
      const room = await client.rematch();
      state.pending = false;
      syncRoom(room);
    } catch (error) {
      state.pending = false;
      state.error = friendlyError(error);
      renderFinished(state.room);
    }
  }

  function renderCancelled(room) {
    state.screen = 'cancelled';
    setMain('انتهت الغرفة', 'غادر أحد اللاعبين. يمكنك الرجوع إلى قائمة الغرف وإنشاء مباراة جديدة.');
    const toolbar = element('div', 'yrb-toolbar');
    toolbar.append(action('العودة للغرف', '', () => location.reload()));
    main.append(toolbar);
  }

  function updateHud(room) {
    if (!room || room.status === 'cancelled') {
      hud.hidden = true;
      return;
    }
    hud.hidden = false;
    hudTitle.textContent = room.name || 'غرفة ياكلك';
    if (room.status === 'waiting') hudStatus.textContent = `${room.players.length}/${room.targetPlayers} لاعبين`;
    else if (room.status === 'finished') hudStatus.textContent = 'انتهت الجولة · افتح النتائج';
    else {
      const current = room.players[room.turnIndex];
      hudStatus.textContent = current?.seat === client.identity?.seat
        ? `الجولة ${room.round}/${room.targetRounds} · دورك`
        : `الجولة ${room.round}/${room.targetRounds} · دور الخصم`;
    }
  }

  function syncRoom(nextRoom) {
    if (!nextRoom) return;
    state.room = nextRoom;
    state.pending = false;
    state.error = '';
    updateHud(nextRoom);
    if (nextRoom.status === 'playing') {
      state.screen = 'playing';
      setOverlay(false);
      return;
    }
    setOverlay(true);
    if (nextRoom.status === 'waiting') renderWaiting(nextRoom);
    else if (nextRoom.status === 'finished') renderFinished(nextRoom);
    else renderCancelled(nextRoom);
  }

  function showCurrentRoom() {
    const room = client.room || state.room;
    if (room) syncRoom(room);
    else {
      setOverlay(true);
      renderBrowse();
      void refreshRooms();
    }
  }

  function openBrowse() {
    if (client.room) {
      syncRoom(client.room);
      return Promise.resolve();
    }
    setOverlay(true);
    renderBrowse();
    void refreshRooms();
    return Promise.resolve();
  }

  close.addEventListener('click', () => {
    if (state.room?.status === 'playing') setOverlay(false);
    else if (state.room) {
      setOverlay(false);
      updateHud(state.room);
    } else {
      location.reload();
    }
  });
  statusButton.addEventListener('click', showCurrentRoom);
  addEventListener('yakolak:open-room-browser', () => void openBrowse());
  addEventListener('yakolak:online-room', event => syncRoom(event.detail?.room));

  const previousChoose = entry.choose.bind(entry);
  entry.choose = mode => mode === 'online' ? openBrowse() : previousChoose(mode);

  setInterval(() => {
    if (!root.hidden && state.screen === 'browse' && !state.refreshing) void refreshRooms();
  }, 4000);

  const directCode = roomCodeFromUrl();
  if (client.room) syncRoom(client.room);
  else if (directCode) {
    setOverlay(true);
    setMain('دعوة للعب', client.identity ? 'نعيد الاتصال بالغرفة…' : 'نجهز الغرفة والألوان المتاحة…');
    if (!client.identity) {
      try {
        state.selectedRoom = await client.preview(directCode);
        state.screen = 'join';
        renderJoin();
      } catch (error) {
        state.error = friendlyError(error);
        renderBrowse();
      }
    }
  }

  globalThis.__yakolakRoomBrowserV126 = { open: openBrowse, syncRoom };
  console.info('[Yakolak] v126 named room browser active');
}

await installRoomBrowser();
