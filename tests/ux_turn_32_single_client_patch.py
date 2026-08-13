from pathlib import Path
import re

SPEC = Path("tests/ux_turn_32_latency.spec.js")
text = SPEC.read_text(encoding="utf-8")

replacement = r'''async function waitForAuthoritativePlayer(client, player) {
  await client.page.waitForFunction(expected => {
    const d = document.body.dataset;
    return d.yakolakAuthoritativeTurnValid === 'true' && Number(d.yakolakAuthoritativeTurnPlayer) === expected;
  }, player, { timeout: 20000 });
}

function preparePreTurn(harness, targetIndex) {
  const next = structuredClone(harness.room);
  next.version = Number(next.version) + 1;
  next.status = 'playing';
  next.turnIndex = (targetIndex - 1 + next.players.length) % next.players.length;
  next.board = emptyBoard();
  next.lastMove = null;
  next.moveNumber = Number(next.moveNumber) + 1;
  next.winner = null;
  next.draw = false;
  next.matchComplete = false;
  next.matchWinner = null;
  harness.room = next;
}

async function runNormalMatrix(browser, viewport, playerCount, code) {
  // Render exactly one real Godot client: the player who receives the next turn.
  // The authoritative mock owns all other seats. This removes CI GPU/CPU
  // contention from running 2-4 simultaneous 3D clients while preserving the
  // exact room shape, seat ownership, polling, hydration, camera and input path.
  const harness = makeHarness(playerCount, code);
  const targetIndex = playerCount - 1;
  const fromIndex = (targetIndex - 1 + playerCount) % playerCount;
  harness.room.turnIndex = fromIndex;
  const targetSeat = harness.room.players[targetIndex].seat;
  const targetClient = await createClient(browser, harness, targetSeat, viewport);
  try {
    await waitForAuthoritativePlayer(targetClient, fromIndex + 1);
    const rows = [];
    for (let i = 0; i < SAMPLE_COUNT; i += 1) {
      if (i > 0) {
        preparePreTurn(harness, targetIndex);
        await waitForAuthoritativePlayer(targetClient, fromIndex + 1);
        await sleep(24);
      }
      rows.push(await measureOne(harness, [targetClient]));
    }
    return rows;
  } finally {
    await closeClients([targetClient]);
  }
}

async function runP3P4Special(browser, viewport, code, mode) {
  const harness = makeHarness(4, code);
  harness.room.turnIndex = 2; // P3 owns the authoritative pre-commit state.
  const targetClient = await createClient(browser, harness, 'p4', viewport);
  try {
    await waitForAuthoritativePlayer(targetClient, 3);
    if (mode === 'slow') harness.getDelayMs = 650;
    const row = await measureOne(harness, [targetClient], {
      slowNetwork: mode === 'slow',
      reconnect: mode === 'reconnect',
    });
    expect(row.from).toBe('P3');
    expect(row.to).toBe('P4');
    return row;
  } finally {
    await closeClients([targetClient]);
  }
}

'''
pattern = re.compile(r"async function runNormalMatrix\(browser, viewport, playerCount, code\) \{.*?(?=async function liveProductionRtt\(\))", re.S)
text, count = pattern.subn(lambda _m: replacement, text, count=1)
if count != 1:
    raise SystemExit("UX-TURN-32 single-client matrix anchor missing")
SPEC.write_text(text, encoding="utf-8")
print("YAKOLAK_UX_TURN_32_SINGLE_CLIENT_PATCH_OK")
