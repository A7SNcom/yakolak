# Stability verification — 2026-10-22

Baseline: `c70e4171a64f24c3de8d4ff6d1f6f1f18ad42a9a` on `main`.

## Changes with reproduced failures

1. A cancelled host/guest discovery could fail late and close the replacement
   room. Both regression cases failed before the fix. Discovery now closes a
   failed session only while it is still the client's current session. Tests
   also verify that a current failed session still releases its own room.
2. The branded loader hid Godot's startup failure notice indefinitely. A browser
   without WebGL2 reproduced this on the deployed page. Startup failures now
   display an Arabic explanation, safe plain-text details, and a reload button.
   Normal loading/handoff is unchanged.
3. The local browser-test server served CSS/fonts as octet-stream. This left the
   DOM setup unstyled and underneath the canvas. Correct CSS and OTF MIME types
   restore representative tests; this is a test-harness correction.

No Godot gameplay, rules, camera choreography, quality settings or engine export
was changed. The existing `index.pck`, `index.wasm` and `index.js` remain byte-for-byte
unchanged. The new transport bundle is content-addressed and referenced by the
refreshed setup module.

## Passing checks

- `npm run test:release`: **44 Node tests + 17 DOM/setup tests**, zero failures.
- `npm audit --audit-level=high`: zero reported vulnerabilities.
- Eight new targeted regressions: cancelled/current host/guest discovery,
  existing/delayed startup errors, safe error text, unaffected successful loading.
- **17 of 25** historical Godot test scripts passed; see exclusions below.
- All **five shipping-pack checks passed in isolation** using Godot 4.7.1:
  scene continuity, short win tutorial, real intro/setup/match/return,
  visual refinement, online presentation. Online presentation reports **230 checks**.
- Browser runtime tests passed: actual exported game startup, round result and
  next round, physically clean restart after a played move.
- Normal DOM onboarding and real local/bot turns are exercised by the opt-in
  `tests/stability_browser_smoke.cjs`, with screenshots and clean-board assertions.
  Both current scenarios passed with zero JavaScript errors: 3 players at
  390×844 (one human + two bots), and 4 players at 1280×720 (one human + three bots).
  Each completed a full turn cycle and returned to setup with zero board residue.
  This test uses reduced motion; the separate engine/pack checks cover motion.
- A real browser without WebGL2 displayed the new failure UI at **320×568**;
  the loader was hidden and the retry button performed a real page reload.

## Results that are not passes

The broad historical suite was run deliberately. Its failures are recorded here
instead of changing current behavior to satisfy incompatible expectations:

| Historical script | Observed incompatibility / limit |
| --- | --- |
| `authoritative_turn_indicator_headless.gd` | Old `دورك` / bot copy and synchronous round-transition expectations. Current UI uses actual player names; current online presentation and owner-boundary checks pass. |
| `custom_setup_regression_matrix_headless.gd` | Old wizard and rejection of mixed online/bot rosters, which are now supported. |
| `session_setup_headless.gd` | Same old wizard / all-online shortcut and mixed-roster rejection assumptions. |
| `gameplay_session_headless.gd` | Expects the old automatic spectator lesson and immediate hiding of inactive sides. |
| `gameplay_session_lifecycle_headless.gd` | Assumes no setup camera/base movement and checks returns after 0.58s; current return is animated. Current clean-restart and scene-continuity checks pass. |
| `intro_handoff_base_consumer_headless.gd` | Minimal fake scene lacks the board geometry needed by the current visual setup; logs missing/empty fixture data. |
| `visual_setup_headless.gd` | Fake scene lacks `PostIntroGameplay`; old immediate camera/start expectations. The complete real-scene setup check passes. |
| `round_boundary_multiclient_headless.gd` | Checks tray/selection synchronously during an animated round return. The current shipping-pack presentation test exercises the asynchronous path. |

The two long desktop/mobile mesh-selection browser tests also timed out. Their
captured state had advanced to player two while the test still expected player
one; software-rendered repeated mesh probes consumed the 30s turn window. These
are **not counted as passes**, and do not establish hardware touch latency.

## Online acceptance remains incomplete

- The unmodified public-signaling smoke test failed with `signaling_unavailable`;
  Nostr WebSockets returned `ERR_EMPTY_RESPONSE` in this environment.
- A controlled local-relay attempt exchanged signaling messages but could not
  establish a WebRTC peer. It is not recorded as a successful connection.
- An independent raw WebRTC capability probe, without any game code, generated
  **zero ICE candidates** and remained in connection state `new`. Therefore this
  environment cannot validate device-to-device transport/NAT behavior.
- Authority, mixed seats, clocks, exact-once moves, continuation, reconnect
  hydration and rendering have automated coverage; this does **not** replace a
  real-device online match or iPhone/Android GPU performance testing.
- `docs/online-acceptance.json` remains blocked for physical-device acceptance.
  Publication uses the owner's explicit authorization, not a fabricated pass.

## Reproduction

```sh
npm ci
npm run test:release
node tests/web_test_server.mjs
# In another terminal, with Playwright/Chromium installed:
node tests/stability_browser_smoke.cjs
```

The browser smoke supports `YAKOLAK_CHROMIUM` and `YAKOLAK_STABILITY_BASE`.
Engine/pack checks use the existing build and `scripts/verify_exported_pack.py`.
