const nativeFetch = globalThis.fetch.bind(globalThis);
const ROOM_API_PATTERN = /\/api\/rooms(?=\?|$)/;
const COLOR_NAMES = {
  right: 'الأبيض',
  back: 'الأزرق',
  left: 'الذهبي',
  front: 'الأخضر'
};

let selectedTargetRounds = null;
let pendingCreate = null;
let previewRounds = null;

function routedInput(input) {
  if (typeof input === 'string') return input.replace(ROOM_API_PATTERN, '/api/rooms-v118');
  if (input instanceof URL) return new URL(input.toString().replace(ROOM_API_PATTERN, '/api/rooms-v118'));
  return input;
}

function bodyPayload(init) {
  if (!init?.body || typeof init.body !== 'string') return null;
  try {
    return JSON.parse(init.body);
  } catch {
    return null;
  }
}

globalThis.fetch = async function yakolakV118Fetch(input, init = {}) {
  const nextInput = routedInput(input);
  const payload = bodyPayload(init);
  let nextInit = init;

  if (payload?.action === 'create' && ROOM_API_PATTERN.test(String(input))) {
    if (![3, 5].includes(selectedTargetRounds)) throw new Error('invalid_round_count');
    nextInit = {
      ...init,
      body: JSON.stringify({ ...payload, targetRounds: selectedTargetRounds })
    };
  }

  const response = await nativeFetch(nextInput, nextInit);
  if (payload?.action === 'preview' && response.ok) {
    response.clone().json().then(data => {
      previewRounds = Number(data?.room?.targetRounds) || null;
      syncRoundUi();
    }).catch(() => {});
  }
  return response;
};

function addStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #yakolakRoundChoice{position:fixed;inset:0;z-index:13000;display:grid;place-items:center;padding:20px;background:rgba(2,8,13,.78);backdrop-filter:blur(10px);direction:rtl}
    #yakolakRoundChoice .yr-card{width:min(420px,100%);padding:24px;border:1px solid rgba(255,255,255,.22);border-radius:22px;background:linear-gradient(160deg,#162b3a,#0b1720);box-shadow:0 24px 80px rgba(0,0,0,.62);text-align:center;color:#fff}
    #yakolakRoundChoice h2{margin:0 0 8px;font-size:24px}
    #yakolakRoundChoice p{margin:0 0 20px;color:#cbd8e2;line-height:1.65}
    #yakolakRoundChoice .yr-options{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    #yakolakRoundChoice button{min-height:64px;border:1px solid rgba(255,255,255,.24);border-radius:16px;background:#f2f5f7;color:#10202b;font:900 20px system-ui;cursor:pointer;touch-action:manipulation}
    #yakolakRoundChoice button:active{transform:scale(.98)}
    .yo-round-summary{display:flex;justify-content:space-between;gap:10px;align-items:center;margin:10px 0 14px;padding:10px 12px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:rgba(13,34,47,.72);color:#e8f2f8;font-size:13px;font-weight:850}
    .yo-round-summary b{color:#fff;white-space:nowrap}
    .yo-round-summary span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    @media(max-width:560px){#yakolakRoundChoice{padding:14px}#yakolakRoundChoice .yr-card{padding:20px 16px}.yo-round-summary{font-size:12px}}
  `;
  document.head.append(style);
}

function showRoundChoice(details) {
  pendingCreate = details;
  selectedTargetRounds = null;
  previewRounds = null;
  document.getElementById('yakolakRoundChoice')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'yakolakRoundChoice';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'اختيار عدد جولات المباراة');
  overlay.innerHTML = `
    <div class="yr-card">
      <h2>كم جولة للمباراة؟</h2>
      <p>اختر العدد قبل إنشاء الغرفة. ستتوقف المباراة تلقائيًا بعد اكتمال الجولات.</p>
      <div class="yr-options">
        <button type="button" data-rounds="3">3 جولات</button>
        <button type="button" data-rounds="5">5 جولات</button>
      </div>
    </div>
  `;
  overlay.querySelectorAll('[data-rounds]').forEach(button => {
    button.addEventListener('click', () => {
      const rounds = Number(button.dataset.rounds);
      if (![3, 5].includes(rounds) || !pendingCreate) return;
      selectedTargetRounds = rounds;
      const next = pendingCreate;
      pendingCreate = null;
      overlay.remove();
      originalCreate(next);
    }, { once: true });
  });
  document.body.append(overlay);
  overlay.querySelector('button')?.focus();
}

const bridge = globalThis.__yakolakOnlineSetupBridge;
if (!bridge?.create) throw new Error('v118 online setup bridge unavailable');
const originalCreate = bridge.create.bind(bridge);
bridge.create = details => {
  bridge.active = false;
  showRoundChoice(details);
};

function scoreText(room) {
  if (!room?.players?.length) return '';
  return room.players.map((player, index) => {
    const label = player.seat === globalThis.__yakolakOnlineV114?.identity?.seat
      ? 'أنت'
      : `لاعب ${index + 1}`;
    return `${label} ${Number(room.scores?.[player.seat] || 0)}`;
  }).join(' · ');
}

function winnerText(room) {
  if (room.matchWinner) {
    const mine = room.matchWinner.seat === globalThis.__yakolakOnlineV114?.identity?.seat;
    return mine
      ? `انتهت المباراة — فزت بـ${room.matchWinner.wins} جولات.`
      : `انتهت المباراة — فاز ${COLOR_NAMES[room.matchWinner.color] || 'اللاعب'} بـ${room.matchWinner.wins} جولات.`;
  }
  if (room.matchWinners?.length > 1) return 'انتهت المباراة بالتعادل في عدد مرات الفوز.';
  return 'انتهت المباراة دون فائز بعد اكتمال الجولات.';
}

function ensureSummary(body) {
  let summary = body.querySelector('.yo-round-summary');
  if (!summary) {
    summary = document.createElement('div');
    summary.className = 'yo-round-summary';
    const heading = body.querySelector('.yo-step-title, h2');
    if (heading?.nextSibling) body.insertBefore(summary, heading.nextSibling);
    else body.prepend(summary);
  }
  return summary;
}

function isJoinChoice(body) {
  const title = body.querySelector('.yo-step-title, h2')?.textContent || '';
  return title.includes('للإنضمام') || title.includes('للانضمام');
}

function syncRoundUi() {
  const room = globalThis.__yakolakOnlineV114?.room;
  const body = document.querySelector('#yakolakOnlineDialog .yo-body');
  if (!body) return;

  if (!room?.targetRounds) {
    const existing = body.querySelector('.yo-round-summary');
    if (previewRounds && isJoinChoice(body)) {
      const summary = ensureSummary(body);
      const next = `<b>${previewRounds} جولات</b><span>عدد الجولات اختاره منشئ الغرفة</span>`;
      if (summary.innerHTML !== next) summary.innerHTML = next;
    } else {
      existing?.remove();
    }
    return;
  }

  const round = Math.min(Number(room.round || 1), Number(room.targetRounds));
  const summary = ensureSummary(body);
  const next = `<b>الجولة ${round}/${room.targetRounds}</b><span>${scoreText(room)}</span>`;
  if (summary.innerHTML !== next) summary.innerHTML = next;

  if (room.status === 'finished' && room.matchComplete) {
    const note = body.querySelector('.yo-note');
    if (note) note.textContent = winnerText(room);
    const primary = body.querySelector('.yo-actions .yo-button:not(.secondary)');
    if (primary) primary.textContent = 'مباراة جديدة';
  }
}

addStyles();
const observer = new MutationObserver(() => queueMicrotask(syncRoundUi));
observer.observe(document.body, { childList: true, subtree: true });
setInterval(syncRoundUi, 1000);
syncRoundUi();

globalThis.__yakolakV118Rounds = {
  version: 118,
  choices: [3, 5],
  get selectedTargetRounds() { return selectedTargetRounds; }
};
