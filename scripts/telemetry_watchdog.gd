extends Node

# Semantic watchdog on top of the raw black-box recorder. It turns suspicious
# states into high-signal diagnostic events: residue in a fresh game, a move
# counter going backwards inside the same round, or a gameplay/reconnect wait
# that lasts far longer than a normal turn handoff.

func _ready() -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval(
		"""
(() => {
  if (window.__yakolakTelemetryWatchdogInstalled) return;
  window.__yakolakTelemetryWatchdogInstalled = true;
  let lastMoves = null;
  let lastRound = null;
  let waitingSince = 0;
  let reconnectSince = 0;
  let lastResidueSignature = '';
  let lastStallReport = 0;
  let lastReconnectReport = 0;

  const emit = (name, level, details) => {
    try {
      if (typeof window.yakolakTelemetry === 'function') {
        window.yakolakTelemetry(name, level, details, { source: 'integrity' });
      }
    } catch (_) {}
  };

  setInterval(() => {
    const d = document.body.dataset;
    const moves = Number(d.yakolakMoves || 0);
    const round = Number(d.yakolakRound || 0);
    const played = Number(d.yakolakResiduePlayed || 0);
    const occupied = Number(d.yakolakResidueOccupied || 0);
    const stray = Number(d.yakolakResidueStray || 0);
    const gameplay = String(d.yakolakGameplay || '');
    const setup = String(d.yakolakSetup || '');
    const player = String(d.yakolakCurrentPlayer || '');
    const players = Number(d.yakolakPlayers || 0);
    const now = Date.now();

    const freshState = setup === 'visible' || (moves === 0 && (gameplay === 'ready' || gameplay === 'waiting'));
    if (freshState && (played > 0 || occupied > 0 || stray > 0)) {
      const signature = `${setup}:${gameplay}:${moves}:${played}:${occupied}:${stray}`;
      if (signature !== lastResidueSignature) {
        lastResidueSignature = signature;
        emit('game.integrity.residue_detected', 'error', {
          setup, gameplay, moves, played, occupied, stray, round, player, players,
        });
      }
    } else {
      lastResidueSignature = '';
    }

    if (lastMoves != null && lastRound === round && moves < lastMoves && setup !== 'visible') {
      emit('game.integrity.move_counter_regressed', 'error', {
        previousMoves: lastMoves, moves, round, gameplay, player, players,
      });
    }
    lastMoves = moves;
    lastRound = round;

    if (gameplay === 'waiting' && setup !== 'visible') {
      if (!waitingSince) waitingSince = now;
      const waited = now - waitingSince;
      if (waited >= 8000 && now - lastStallReport >= 8000) {
        lastStallReport = now;
        emit('gameplay.waiting_too_long', 'warn', {
          waitedMs: waited, moves, round, player, players,
          online: navigator.onLine, visibility: document.visibilityState,
        });
      }
    } else {
      waitingSince = 0;
      lastStallReport = 0;
    }

    const reconnect = document.getElementById('yakolak-online-status');
    const reconnectVisible = !!(reconnect && getComputedStyle(reconnect).display !== 'none');
    if (reconnectVisible) {
      if (!reconnectSince) reconnectSince = now;
      const waited = now - reconnectSince;
      if (waited >= 6000 && now - lastReconnectReport >= 6000) {
        lastReconnectReport = now;
        emit('online.reconnect_too_long', 'error', {
          waitedMs: waited,
          statusText: String(reconnect.textContent || '').slice(0, 120),
          gameplay, moves, round, player, players,
          online: navigator.onLine, visibility: document.visibilityState,
        });
      }
    } else {
      reconnectSince = 0;
      lastReconnectReport = 0;
    }

    if ((gameplay === 'ready' || gameplay === 'waiting') && players > 0 && !player) {
      emit('game.integrity.missing_current_player', 'error', { gameplay, moves, round, players });
    }
  }, 1000);
})();
""",
		true
	)
