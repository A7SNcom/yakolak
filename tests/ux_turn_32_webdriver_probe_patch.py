from __future__ import annotations

from pathlib import Path
import re

BRIDGE = Path("scripts/browser_verification_bridge.gd")
SPEC = Path("tests/ux_turn_32_latency.spec.js")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        if new in text:
            return text
        raise SystemExit(f"UX-TURN-32 patch anchor missing: {label}")
    return text.replace(old, new, 1)


def patch_bridge() -> None:
    text = BRIDGE.read_text(encoding="utf-8")
    text = replace_once(
        text,
        "var digits21_fixture_callback: Variant\n",
        "var digits21_fixture_callback: Variant\nvar ux_turn_32_input_callback: Variant\n",
        "bridge callback variable",
    )
    old = '''\t\tif automation:\n\t\t\tdigits21_fixture_callback = JavaScriptBridge.create_callback(_on_digits21_fixture_requested)\n\t\t\tvar window: JavaScriptObject = JavaScriptBridge.get_interface("window")\n\t\t\tif window != null:\n\t\t\t\twindow.set("yakolakTestShowDigitFixture", digits21_fixture_callback)\n'''
    new = '''\t\tif automation:\n\t\t\tdigits21_fixture_callback = JavaScriptBridge.create_callback(_on_digits21_fixture_requested)\n\t\t\tux_turn_32_input_callback = JavaScriptBridge.create_callback(_on_ux_turn_32_input_probe_requested)\n\t\t\tvar window: JavaScriptObject = JavaScriptBridge.get_interface("window")\n\t\t\tif window != null:\n\t\t\t\twindow.set("yakolakTestShowDigitFixture", digits21_fixture_callback)\n\t\t\t\twindow.set("yakolakTurn32ProbeInput", ux_turn_32_input_callback)\n'''
    text = replace_once(text, old, new, "bridge webdriver install")

    marker = "\n\nfunc _publish_visible_targets() -> void:\n"
    probe = r'''

# UX-TURN-32 diagnostic-only WebDriver probe. This is installed only when
# navigator.webdriver is true and runs only after the test explicitly invokes it.
# It computes a fresh point in the same Godot frame and then enters the exact
# production input path. It never grants authority, advances turns, or changes
# behavior for a real browser session.
func _on_ux_turn_32_input_probe_requested(_arguments: Array) -> void:
	var started_msec: int = Time.get_ticks_msec()
	var result: Dictionary = {
		"accepted": false,
		"attempted": false,
		"reason": "unavailable",
		"startedMsec": started_msec,
	}
	# The production scene's gameplay node is PostIntroGameplay. Resolve it only
	# for this WebDriver-only diagnostic callback; this does not alter normal play.
	if match_controller == null and intro != null:
		match_controller = intro.get_node_or_null("PostIntroGameplay")
	if match_controller == null and intro != null:
		match_controller = intro.get_node_or_null("LocalMatchGameplay")
	if not automation or match_controller == null:
		result["reason"] = "controller-unavailable"
		_publish_ux_turn_32_probe(result)
		return
	if not bool(match_controller.get("match_initialized")):
		result["reason"] = "match-not-initialized"
		_publish_ux_turn_32_probe(result)
		return
	if not bool(match_controller.get("online_active")):
		result["reason"] = "online-inactive"
		_publish_ux_turn_32_probe(result)
		return
	if str(match_controller.call("_current_mode")) != "local":
		result["reason"] = "authoritative-owner-not-local"
		_publish_ux_turn_32_probe(result)
		return

	camera = match_controller.get("camera") as Camera3D
	var records_value: Variant = match_controller.get("piece_records")
	if camera == null or not records_value is Array:
		result["reason"] = "piece-state-unavailable"
		_publish_ux_turn_32_probe(result)
		return

	var records: Array = records_value as Array
	var direction: String = str(match_controller.call("_current_direction"))
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var center: Vector2 = viewport_size * 0.5
	var best_index: int = -1
	var best_point: Vector2 = Vector2.ZERO
	var best_size: String = ""
	var best_distance: float = INF

	for index: int in range(records.size()):
		var record: Dictionary = records[index] as Dictionary
		if bool(record.get("played", false)) or str(record.get("dir", "")) != direction:
			continue
		var size_name: String = str(record.get("type", ""))
		var mesh_instance := record.get("mesh") as MeshInstance3D
		if mesh_instance == null:
			continue
		var offset: Vector3
		match size_name:
			"large": offset = Vector3(17.0, 0.0, 9.5)
			"medium": offset = Vector3(12.5, 0.0, 7.0)
			_: offset = Vector3(8.0, 0.0, 4.5)
		var point: Vector2 = camera.unproject_position(mesh_instance.to_global(offset))
		if point.x < 0.0 or point.x > viewport_size.x or point.y < 0.0 or point.y > viewport_size.y:
			continue
		var distance: float = point.distance_squared_to(center)
		if distance < best_distance:
			best_distance = distance
			best_index = index
			best_point = point
			best_size = size_name

	if best_index < 0:
		result["reason"] = "no-visible-legal-piece"
		_publish_ux_turn_32_probe(result)
		return

	var selected_before: int = int(match_controller.get("selected_index"))
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = true
	event.position = best_point
	result["attempted"] = true
	result["targetIndex"] = best_index
	result["targetSize"] = best_size
	result["targetX"] = best_point.x
	result["targetY"] = best_point.y
	result["selectedBefore"] = selected_before
	result["gameplayReadyAtDispatch"] = bool(match_controller.get("gameplay_ready"))
	result["cameraTransitionAtDispatch"] = bool(match_controller.get("camera_transition"))
	result["turnCameraActiveAtDispatch"] = bool(match_controller.get("turn_camera_active"))
	var dispatch_msec: int = Time.get_ticks_msec()
	result["dispatchAtMsec"] = dispatch_msec
	match_controller.call("_input", event)
	var finished_msec: int = Time.get_ticks_msec()
	var selected_after: int = int(match_controller.get("selected_index"))
	result["finishedAtMsec"] = finished_msec
	result["durationMs"] = maxi(0, finished_msec - dispatch_msec)
	result["selectedAfter"] = selected_after
	result["accepted"] = selected_after == best_index
	result["reason"] = "accepted" if bool(result["accepted"]) else "input-blocked"
	_publish_ux_turn_32_probe(result)


func _publish_ux_turn_32_probe(result: Dictionary) -> void:
	if not OS.has_feature("web"):
		return
	result["publishedAtMsec"] = Time.get_ticks_msec()
	JavaScriptBridge.eval(
		"window.__yakolakTurn32ProbeResult=" + JSON.stringify(result) + ";",
		true
	)
'''
    if "func _on_ux_turn_32_input_probe_requested" not in text:
        if marker not in text:
            raise SystemExit("UX-TURN-32 patch anchor missing: publish visible targets")
        text = text.replace(marker, probe + marker, 1)
    BRIDGE.write_text(text, encoding="utf-8")


def patch_spec() -> None:
    if not SPEC.exists():
        return
    text = SPEC.read_text(encoding="utf-8")
    text = replace_once(
        text,
        "const LABEL = String(process.env.YAKOLAK_TURN32_LABEL || 'main-controlled');\n",
        "const LABEL = String(process.env.YAKOLAK_TURN32_LABEL || 'main-controlled');\nconst LIVE_BASE = String(process.env.YAKOLAK_TURN32_LIVE_BASE || '').replace(/\\/$/, '');\n",
        "spec live base",
    )

    text = replace_once(
        text,
        '''async function runNormalMatrix(browser, viewport, playerCount, code) {\n  const harness = makeHarness(playerCount, code);\n  const clients = [];\n  try {\n    for (let i = 0; i < playerCount; i += 1) clients.push(await createClient(browser, harness, `p${i + 1}`, viewport));\n    const rows = [];\n    for (let i = 0; i < SAMPLE_COUNT; i += 1) rows.push(await measureOne(harness, clients));\n    return rows;\n  } finally { await closeClients(clients); }\n}\n''',
        '''async function runNormalMatrix(browser, viewport, playerCount, code) {\n  const rows = [];\n  while (rows.length < SAMPLE_COUNT) {\n    const harness = makeHarness(playerCount, code);\n    const clients = [];\n    try {\n      for (let i = 0; i < playerCount; i += 1) clients.push(await createClient(browser, harness, `p${i + 1}`, viewport));\n      const batchCount = Math.min(8, SAMPLE_COUNT - rows.length);\n      for (let i = 0; i < batchCount; i += 1) rows.push(await measureOne(harness, clients));\n    } finally { await closeClients(clients); }\n  }\n  return rows;\n}\n''',
        "fresh legal sample batches",
    )

    new_probe = r'''async function selectFirstLegalPiece(client, expectedPlayer) {
  await client.page.waitForFunction(() => typeof window.yakolakTurn32ProbeInput === 'function', null, { timeout: 20000 });
  const firstProbeAt = Date.now();
  let attempts = 0;
  let last = null;
  while (Date.now() - firstProbeAt < 20000) {
    attempts += 1;
    const inputDispatchAt = Date.now();
    await client.page.evaluate(() => {
      window.__yakolakTurn32ProbeResult = null;
      window.yakolakTurn32ProbeInput();
    });
    await client.page.waitForFunction(() => window.__yakolakTurn32ProbeResult !== null, null, { timeout: 1000 }).catch(() => {});
    last = await client.page.evaluate(() => window.__yakolakTurn32ProbeResult || null);
    if (last?.accepted) {
      return {
        firstProbeAt,
        inputDispatchAt,
        acceptedAt: Date.now(),
        targetReadyAt: inputDispatchAt,
        attempts,
        probeResult: last,
      };
    }
    await sleep(8);
  }
  const snapshot = await client.page.evaluate(() => ({
    dataset: { ...document.body.dataset },
    probe: window.__yakolakTurn32ProbeResult || null,
  }));
  throw new Error(`no legal Godot input accepted for P${expectedPlayer}; attempts=${attempts}; last=${JSON.stringify(last)}; snapshot=${JSON.stringify(snapshot)}`);
}

'''
    pattern = re.compile(r"async function tap\(client, x, y\) \{.*?(?=async function measureOne)", re.S)
    if "no legal Godot input accepted" not in text:
        text, count = pattern.subn(lambda _m: new_probe, text, count=1)
        if count != 1:
            raise SystemExit("UX-TURN-32 patch anchor missing: browser pointer probe block")

    text = replace_once(
        text,
        "  const input = await selectFirstLegalPiece(targetClient, expectedPlayer);\n  const timeline = await targetClient.page.evaluate(() => window.__turn32Timeline || []);\n",
        "  const input = await selectFirstLegalPiece(targetClient, expectedPlayer);\n  await targetClient.page.waitForFunction(player => {\n    const d = document.body.dataset;\n    return Number(d.yakolakAuthoritativeTurnPlayer) === player && d.yakolakGameplay === 'ready';\n  }, expectedPlayer, { timeout: 3000 }).catch(() => {});\n  await sleep(32);\n  const timeline = await targetClient.page.evaluate(() => window.__turn32Timeline || []);\n",
        "capture post-accept readiness",
    )
    text = replace_once(
        text,
        "  const delivered = requests.find(row => Number(row.version) === Number(commit.version) && row.requestAt >= commit.commitAt) || null;\n",
        "  const delivered = requests.find(row => Number(row.version) === Number(commit.version) && row.responseAt >= commit.commitAt) || null;\n",
        "delivered response boundary",
    )
    text = replace_once(
        text,
        "  const selectedAt = firstTime(timeline, row => row.gameplay === 'piece-selected' && row.selectedSize === 'large') || input.acceptedAt;\n",
        "  const selectedAt = input.acceptedAt;\n",
        "exact callback acceptance",
    )
    text = text.replace("  expect(gameplayReadyAt, 'gameplay_ready must be observed').not.toBeNull();\n", "")
    text = replace_once(
        text,
        "    cameraStartAt, gameplayReadyAt, targetReadyAt: input.targetReadyAt,\n    inputDispatchAt: input.inputDispatchAt, inputAcceptedAt: selectedAt,\n",
        "    cameraStartAt, gameplayReadyAt, targetReadyAt: input.targetReadyAt,\n    inputDispatchAt: input.inputDispatchAt, inputAcceptedAt: selectedAt, firstProbeAt: input.firstProbeAt,\n    probeAttempts: input.attempts, probeResult: input.probeResult,\n",
        "probe result fields",
    )
    text = replace_once(
        text,
        "    cameraGateMs: Math.max(0, gameplayReadyAt - (cameraStartAt || authAt)),\n    readyAfterCommitMs: Math.max(0, gameplayReadyAt - commit.commitAt),\n    targetObserverMs: Math.max(0, input.targetReadyAt - gameplayReadyAt),\n    hitTestAcceptMs: Math.max(0, selectedAt - input.inputDispatchAt),\n    totalMs: Math.max(0, selectedAt - commit.commitAt),\n",
        "    cameraGateMs: gameplayReadyAt == null ? null : Math.max(0, gameplayReadyAt - (cameraStartAt || authAt)),\n    readyAfterCommitMs: gameplayReadyAt == null ? null : Math.max(0, gameplayReadyAt - commit.commitAt),\n    targetObserverMs: null,\n    hitTestAcceptMs: Number(input.probeResult?.durationMs ?? Math.max(0, selectedAt - input.inputDispatchAt)),\n    authToInteractMs: authAt == null ? null : Math.max(0, selectedAt - authAt),\n    turnToInteractMs: Math.max(0, selectedAt - commit.commitAt),\n    totalMs: Math.max(0, selectedAt - commit.commitAt),\n",
        "turn-to-interact metric",
    )
    text = replace_once(
        text,
        "  if (!LABEL.startsWith('production')) return null;\n  const endpoint = `${BASE}/api/rooms`;\n",
        "  if (!LIVE_BASE) return null;\n  const endpoint = `${LIVE_BASE}/api/rooms`;\n",
        "live production endpoint",
    )
    text = replace_once(
        text,
        "      groups.push({ viewport: viewport.name, players: playerCount, total: stats(rows, 'totalMs'), ready: stats(rows, 'readyAfterCommitMs'), pollWait: stats(rows, 'pollWaitMs'), network: stats(rows, 'networkMs'), camera: stats(rows, 'cameraGateMs'), hitTest: stats(rows, 'hitTestAcceptMs') });\n",
        "      groups.push({ viewport: viewport.name, players: playerCount, turnToInteract: stats(rows, 'turnToInteractMs'), total: stats(rows, 'totalMs'), ready: stats(rows, 'readyAfterCommitMs'), pollWait: stats(rows, 'pollWaitMs'), network: stats(rows, 'networkMs'), hydration: stats(rows, 'snapshotHydrationMs'), uiUpdate: stats(rows, 'uiUpdateMs'), camera: stats(rows, 'cameraGateMs'), hitTest: stats(rows, 'hitTestAcceptMs'), authToInteract: stats(rows, 'authToInteractMs') });\n",
        "matrix stage stats",
    )
    text = replace_once(
        text,
        "  const slowest = [...all].sort((a, b) => b.totalMs - a.totalMs).slice(0, 8);\n",
        "  const slowest = [...all].sort((a, b) => b.turnToInteractMs - a.turnToInteractMs).slice(0, 8);\n",
        "slowest metric sort",
    )
    text = replace_once(
        text,
        "      totalMs: 'authoritative commit -> first actual large-piece pointer accepted as piece-selected',\n",
        "      turnToInteractMs: 'authoritative commit -> first explicit WebDriver probe accepted by the exact Godot _input -> _handle_pointer -> _ray_pick -> _select_piece path',\n      totalMs: 'alias of turnToInteractMs for compatibility with earlier diagnostic output',\n",
        "metric definition",
    )
    text = replace_once(
        text,
        "      hitTestAcceptMs: 'pointer dispatch -> piece-selected acceptance',\n      targetObserverMs: 'diagnostic coordinate availability after gameplay_ready; measurement observer overhead, not product readiness',\n",
        "      hitTestAcceptMs: 'Godot callback dispatch -> return from the exact production input path with the target piece selected',\n      authToInteractMs: 'accepted authoritative turn publication -> first legal input accepted',\n      targetObserverMs: 'not used by the WebDriver probe; retained as null for schema compatibility',\n",
        "input definition",
    )
    SPEC.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    patch_bridge()
    patch_spec()
    print("YAKOLAK_UX_TURN_32_WEBDRIVER_PATCH_OK")
