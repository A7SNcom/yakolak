from pathlib import Path
import re

SPEC = Path("tests/ux_turn_32_latency.spec.js")
text = SPEC.read_text(encoding="utf-8")

marker = "test('UX-TURN-32 turn-to-interact diagnostic matrix', async ({ browser }) => {"
start = text.find(marker)
if start < 0:
    raise SystemExit("UX-TURN-32 test tail anchor missing")

new_tail = r'''test('UX-TURN-32 turn-to-interact diagnostic matrix', async ({ browser }) => {
  test.setTimeout(600000);
  const viewportName = String(process.env.YAKOLAK_TURN32_VIEWPORT || 'mobile-portrait');
  const playerCount = Number(process.env.YAKOLAK_TURN32_PLAYERS || 2);
  const specialMode = String(process.env.YAKOLAK_TURN32_SPECIAL || '');
  const runLiveRtt = String(process.env.YAKOLAK_TURN32_LIVE_RTT || '') === '1';
  const viewport = VIEWPORTS.find(v => v.name === viewportName);
  expect(viewport, `known viewport ${viewportName}`).toBeTruthy();
  expect([2, 3, 4]).toContain(playerCount);

  const all = [];
  let codeCounter = LABEL.startsWith('production') ? 60 : 20;
  let slow = null;
  let reconnect = null;
  if (specialMode === 'slow') {
    slow = await runP3P4Special(browser, VIEWPORTS[0], String(codeCounter++).padStart(2, '0').slice(-2), 'slow');
    all.push(slow);
  } else if (specialMode === 'reconnect') {
    reconnect = await runP3P4Special(browser, VIEWPORTS[1], String(codeCounter++).padStart(2, '0').slice(-2), 'reconnect');
    all.push(reconnect);
  } else {
    const code = String(codeCounter++).padStart(2, '0').slice(-2);
    all.push(...await runNormalMatrix(browser, viewport, playerCount, code));
  }

  const groups = [];
  if (!specialMode) {
    const rows = all.filter(row => !row.slowNetwork && !row.reconnect);
    groups.push({
      viewport: viewport.name,
      players: playerCount,
      turnToInteract: stats(rows, 'turnToInteractMs'),
      total: stats(rows, 'totalMs'),
      ready: stats(rows, 'readyAfterCommitMs'),
      pollWait: stats(rows, 'pollWaitMs'),
      network: stats(rows, 'networkMs'),
      hydration: stats(rows, 'snapshotHydrationMs'),
      uiUpdate: stats(rows, 'uiUpdateMs'),
      camera: stats(rows, 'cameraGateMs'),
      hitTest: stats(rows, 'hitTestAcceptMs'),
      authToInteract: stats(rows, 'authToInteractMs'),
    });
  }

  const slowest = [...all].sort((a, b) => b.turnToInteractMs - a.turnToInteractMs).slice(0, 8);
  const liveApi = runLiveRtt ? await liveProductionRtt() : null;
  const result = {
    job: 'JSRNA_JOB_a099c1ae-f512-4c0c-aee8-d1cfbfc34790',
    label: LABEL,
    base: BASE,
    sampleCountPerMatrixCell: specialMode ? null : SAMPLE_COUNT,
    shard: { viewport: viewportName, players: playerCount, special: specialMode || null },
    groups,
    special: { slowP3P4: slow, reconnectP3P4: reconnect },
    slowest,
    liveProductionRtt: liveApi,
    definitions: {
      turnToInteractMs: 'authoritative commit -> first explicit WebDriver probe accepted by the exact Godot _input -> _handle_pointer -> _ray_pick -> _select_piece path',
      totalMs: 'alias of turnToInteractMs for compatibility with earlier diagnostic output',
      pollWaitMs: 'commit -> next polling request begins (client transport scheduling)',
      networkMs: 'poll request -> browser response observed',
      snapshotHydrationMs: 'response observed -> accepted online-room authoritative publication',
      uiUpdateMs: 'authoritative publication -> matching turn indicator publication',
      cameraGateMs: 'camera-transition publication -> gameplay_ready when gameplay_ready is observed',
      hitTestAcceptMs: 'Godot callback dispatch -> return from the exact production input path with a piece selected',
      authToInteractMs: 'accepted authoritative turn publication -> first legal input accepted',
      targetObserverMs: 'not used by the WebDriver probe; retained as null for schema compatibility',
    },
  };
  const outDir = path.resolve('artifacts', 'ux-turn-32');
  await mkdir(outDir, { recursive: true });
  const suffix = specialMode || `${viewportName}-${playerCount}p`;
  await writeFile(path.join(outDir, `${LABEL}-${suffix}.json`), JSON.stringify(result, null, 2));
  console.log('YAKOLAK_UX_TURN_32_RESULT', JSON.stringify(result));
  if (specialMode) {
    expect(all).toHaveLength(1);
    expect(all[0].from).toBe('P3');
    expect(all[0].to).toBe('P4');
  } else {
    expect(groups).toHaveLength(1);
    expect(groups[0].turnToInteract.n).toBe(SAMPLE_COUNT);
  }
});
'''

SPEC.write_text(text[:start] + new_tail, encoding="utf-8")
print("YAKOLAK_UX_TURN_32_SHARD_PATCH_OK")
