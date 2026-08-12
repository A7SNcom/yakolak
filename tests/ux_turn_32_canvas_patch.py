from pathlib import Path
import textwrap

p = Path("tests/ux_turn_32_latency.spec.js")
s = p.read_text()

replacements = [
    (
        "requests.find(row => Number(row.version) === Number(commit.version) && row.requestAt >= commit.commitAt)",
        "requests.find(row => Number(row.version) === Number(commit.version) && row.responseAt >= commit.commitAt)",
    ),
    (
        "  const count = Number(harness.seatMoveCounts[seat] || 0);\n  const size = count % 2 === 0 ? 'small' : 'medium';",
        "  const size = ['small', 'medium', 'large'][Number(room.moveNumber || 0) % 3];",
    ),
    (
        "await client.page.evaluate(() => { window.__turn32Timeline = []; window.__turn32Net = []; window.__turn32Last = ''; });",
        "await client.page.evaluate(() => { window.__turn32Timeline = []; window.__turn32Net = []; window.__turn32Last = ''; window.__turn32LastTapMapping = null; const d = document.body.dataset; for (const k of ['yakolakTestPiece','yakolakTestPieceX','yakolakTestPieceY','yakolakTestLargeX','yakolakTestLargeY','yakolakTestMediumX','yakolakTestMediumY','yakolakTestSmallX','yakolakTestSmallY']) delete d[k]; });",
    ),
    (
        "return d.yakolakGameplay === 'ready' && Number.isFinite(Number(d.yakolakTestLargeX)) && Number.isFinite(Number(d.yakolakTestLargeY));",
        "return d.yakolakGameplay === 'ready' && Number.isFinite(Number(d.yakolakTestPieceX)) && Number.isFinite(Number(d.yakolakTestPieceY));",
    ),
    (
        "return client.page.evaluate(() => ({ x: Number(document.body.dataset.yakolakTestLargeX), y: Number(document.body.dataset.yakolakTestLargeY), at: Date.now() }));",
        "return client.page.evaluate(() => ({ x: Number(document.body.dataset.yakolakTestPieceX), y: Number(document.body.dataset.yakolakTestPieceY), at: Date.now() }));",
    ),
    (
        "await client.page.waitForFunction(() => document.body.dataset.yakolakGameplay === 'piece-selected' && document.body.dataset.yakolakSelectedSize === 'large', null, { timeout: 3000 });",
        "await client.page.waitForFunction(() => document.body.dataset.yakolakGameplay === 'piece-selected' && Boolean(document.body.dataset.yakolakSelectedSize), null, { timeout: 3000 });",
    ),
    (
        "const selectedAt = firstTime(timeline, row => row.gameplay === 'piece-selected' && row.selectedSize === 'large') || input.acceptedAt;",
        "const selectedAt = firstTime(timeline, row => row.gameplay === 'piece-selected' && Boolean(row.selectedSize)) || input.acceptedAt;",
    ),
    (
        "  const responseAt = responseSeen?.responseAt || delivered.responseAt;",
        "  const responseAt = delivered.responseAt;",
    ),
    (
        "async function runNormalMatrix(browser, viewport, playerCount, code) {\n  const harness = makeHarness(playerCount, code);\n  const clients = [];\n  try {\n    for (let i = 0; i < playerCount; i += 1) clients.push(await createClient(browser, harness, `p${i + 1}`, viewport));\n    const rows = [];\n    for (let i = 0; i < SAMPLE_COUNT; i += 1) rows.push(await measureOne(harness, clients));\n    return rows;\n  } finally { await closeClients(clients); }\n}",
        "async function runNormalMatrix(browser, viewport, playerCount, code) {\n  const rows = [];\n  while (rows.length < SAMPLE_COUNT) {\n    const harness = makeHarness(playerCount, code);\n    const clients = [];\n    try {\n      for (let i = 0; i < playerCount; i += 1) clients.push(await createClient(browser, harness, `p${i + 1}`, viewport));\n      const batch = Math.min(8, SAMPLE_COUNT - rows.length);\n      for (let i = 0; i < batch; i += 1) rows.push(await measureOne(harness, clients));\n    } finally { await closeClients(clients); }\n  }\n  return rows;\n}",
    ),
    (
        "    hitTestAcceptMs: Math.max(0, selectedAt - input.inputDispatchAt),\n    totalMs: Math.max(0, selectedAt - commit.commitAt),",
        "    hitTestAcceptMs: Math.max(0, selectedAt - input.inputDispatchAt),\n    firstProbeAfterReadyMs: Math.max(0, input.firstAttemptAt - gameplayReadyAt),\n    probeRetryMs: Math.max(0, input.inputDispatchAt - input.firstAttemptAt),\n    probeAttempts: input.attempts,\n    inputSize: input.selectedSize,\n    inputMapping: input.mapping || null,\n    turnToInteractMs: Math.max(0, gameplayReadyAt - commit.commitAt) + Math.max(0, selectedAt - input.inputDispatchAt),\n    totalMs: Math.max(0, selectedAt - commit.commitAt),",
    ),
    (
        "groups.push({ viewport: viewport.name, players: playerCount, total: stats(rows, 'totalMs'), ready: stats(rows, 'readyAfterCommitMs'), pollWait: stats(rows, 'pollWaitMs'), network: stats(rows, 'networkMs'), camera: stats(rows, 'cameraGateMs'), hitTest: stats(rows, 'hitTestAcceptMs') });",
        "groups.push({ viewport: viewport.name, players: playerCount, turnToInteract: stats(rows, 'turnToInteractMs'), rawProbe: stats(rows, 'totalMs'), ready: stats(rows, 'readyAfterCommitMs'), pollWait: stats(rows, 'pollWaitMs'), network: stats(rows, 'networkMs'), hydration: stats(rows, 'snapshotHydrationMs'), uiUpdate: stats(rows, 'uiUpdateMs'), camera: stats(rows, 'cameraGateMs'), hitTest: stats(rows, 'hitTestAcceptMs'), firstProbe: stats(rows, 'firstProbeAfterReadyMs'), probeRetry: stats(rows, 'probeRetryMs') });",
    ),
    (
        "const slowest = [...all].sort((a, b) => b.totalMs - a.totalMs).slice(0, 8);",
        "const slowest = [...all].sort((a, b) => b.turnToInteractMs - a.turnToInteractMs).slice(0, 8);",
    ),
    (
        "      totalMs: 'authoritative commit -> first actual large-piece pointer accepted as piece-selected',",
        "      turnToInteractMs: 'authoritative commit -> gameplay_ready plus measured successful pointer-to-piece-selected hit-test acceptance; excludes coordinate-observer and failed-probe overhead',\n      totalMs: 'raw probe wall-clock authoritative commit -> first actual legal-piece pointer accepted as piece-selected; includes coordinate-observer and failed-probe overhead',\n      probeRetryMs: 'measurement-only time between first projected-target probe and the successful probe; reported separately and never attributed to product latency',",
    ),
    (
        "    definitions: {",
        "    samples: all,\n    definitions: {",
    ),
]

for old, new in replacements:
    if old not in s:
        raise RuntimeError(f"expected source fragment missing: {old[:120]}")
    s = s.replace(old, new)

old_tap = """async function tap(client, x, y) {
  if (client.viewport.hasTouch) await client.page.touchscreen.tap(x, y);
  else await client.page.mouse.click(x, y);
}
"""
new_tap = """async function tap(client, x, y) {
  const mapping = await client.page.evaluate(({ x, y }) => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { valid: false, reason: 'canvas-missing', rawX: x, rawY: y };
    const rect = canvas.getBoundingClientRect();
    const backingWidth = Number(canvas.width) || rect.width;
    const backingHeight = Number(canvas.height) || rect.height;
    const cssX = rect.left + (x / backingWidth) * rect.width;
    const cssY = rect.top + (y / backingHeight) * rect.height;
    const result = {
      valid: Number.isFinite(cssX) && Number.isFinite(cssY) && rect.width > 0 && rect.height > 0,
      rawX: x, rawY: y, cssX, cssY,
      backingWidth, backingHeight,
      rectLeft: rect.left, rectTop: rect.top, rectWidth: rect.width, rectHeight: rect.height,
      innerWidth: window.innerWidth, innerHeight: window.innerHeight, dpr: window.devicePixelRatio,
    };
    window.__turn32LastTapMapping = result;
    return result;
  }, { x, y });
  if (!mapping.valid) return mapping;
  if (mapping.cssX < 0 || mapping.cssY < 0 || mapping.cssX > mapping.innerWidth || mapping.cssY > mapping.innerHeight) {
    mapping.valid = false;
    mapping.reason = 'mapped-point-outside-css-viewport';
    return mapping;
  }
  if (client.viewport.hasTouch) await client.page.touchscreen.tap(mapping.cssX, mapping.cssY);
  else await client.page.mouse.click(mapping.cssX, mapping.cssY);
  return mapping;
}
"""
if old_tap not in s:
    raise RuntimeError("tap helper boundary missing")
s = s.replace(old_tap, new_tap)

start = s.index("async function selectFirstLegalPiece(client, expectedPlayer) {")
end = s.index("\nasync function measureOne", start)
robust_probe = textwrap.dedent(r'''
async function selectFirstLegalPiece(client, expectedPlayer) {
  await client.page.waitForFunction(player => {
    const d = document.body.dataset;
    return d.yakolakAuthoritativeTurnValid === 'true' && Number(d.yakolakAuthoritativeTurnPlayer) === player && d.yakolakGameplay === 'ready';
  }, expectedPlayer, { timeout: 20000 });
  const firstTarget = await waitLargeTarget(client);
  const firstAttemptAt = Date.now();
  const deadline = firstAttemptAt + 8000;
  let attempts = 0;
  let lastMapping = null;
  while (Date.now() < deadline) {
    const targets = await client.page.evaluate(() => {
      const d = document.body.dataset;
      const rows = [];
      const add = (size, xRaw, yRaw) => {
        const x = Number(xRaw);
        const y = Number(yRaw);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (rows.some(row => Math.abs(row.x - x) < 1 && Math.abs(row.y - y) < 1)) return;
        rows.push({ size, x, y });
      };
      add('large', d.yakolakTestLargeX, d.yakolakTestLargeY);
      add('medium', d.yakolakTestMediumX, d.yakolakTestMediumY);
      add('small', d.yakolakTestSmallX, d.yakolakTestSmallY);
      add('generic', d.yakolakTestPieceX, d.yakolakTestPieceY);
      return rows;
    });
    for (const target of targets) {
      attempts += 1;
      const inputDispatchAt = Date.now();
      const mapping = await tap(client, target.x, target.y);
      lastMapping = mapping;
      if (!mapping?.valid) continue;
      try {
        await client.page.waitForFunction(() => document.body.dataset.yakolakGameplay === 'piece-selected' && Boolean(document.body.dataset.yakolakSelectedSize), null, { timeout: 180 });
        const accepted = await client.page.evaluate(() => ({ acceptedAt: Date.now(), selectedSize: document.body.dataset.yakolakSelectedSize || '' }));
        return { targetReadyAt: firstTarget.at, firstAttemptAt, inputDispatchAt, acceptedAt: accepted.acceptedAt, selectedSize: accepted.selectedSize, attempts, mapping };
      } catch {}
    }
    await client.page.waitForTimeout(targets.length > 1 ? 24 : 130);
  }
  const diagnostics = await client.page.evaluate(() => ({ data: { ...document.body.dataset }, mapping: window.__turn32LastTapMapping || null, canvas: (() => { const c = document.querySelector('canvas'); if (!c) return null; const r = c.getBoundingClientRect(); return { width: c.width, height: c.height, rectLeft: r.left, rectTop: r.top, rectWidth: r.width, rectHeight: r.height, innerWidth, innerHeight, dpr: devicePixelRatio }; })() }));
  const d = diagnostics.data;
  throw new Error(`no legal pointer accepted after ${attempts} canvas-mapped probes: ${JSON.stringify({ gameplay: d.yakolakGameplay, authPlayer: d.yakolakAuthoritativeTurnPlayer, currentPlayer: d.yakolakCurrentPlayer, largeX: d.yakolakTestLargeX, largeY: d.yakolakTestLargeY, mediumX: d.yakolakTestMediumX, mediumY: d.yakolakTestMediumY, smallX: d.yakolakTestSmallX, smallY: d.yakolakTestSmallY, canvas: diagnostics.canvas, lastMapping: diagnostics.mapping || lastMapping })}`);
}
''').lstrip()
s = s[:start] + robust_probe + s[end:]

p.write_text(s)
print("UX-TURN-32 canvas-coordinate diagnostic patch applied")
