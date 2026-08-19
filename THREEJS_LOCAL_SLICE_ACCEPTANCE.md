# THREEJS-061 — Exact-generation local mixed playable-slice acceptance

Status: **LIVE EVIDENCE PENDING (harness ready, 2026-08-20)**

THREEJS-061 is accepted only by a real Chromium run against:

`https://a7sncom.github.io/yakolak/threejs/`

A branch SHA, localhost server, source-level contract, or stale/superseded Pages generation is not acceptance evidence.

## Exact live identity gate

The manual `live-local` suite requires one explicit 40-hex `expected_candidate_sha`. It does **not** assume the workflow/harness commit is the deployed candidate.

Before Chromium starts, the runner polls the public PAGES-014 manifest with cache bypass and requires all of the real manifest fields:

- `schemaVersion = 1`
- `generationSchema = pages-deployment-generation-v1`
- `deploymentGeneration = sha256:<64 hex>`
- `godotRootSha`
- `threejsCandidateSha == expected_candidate_sha`
- `publicRuntimeProtocol.sha256`
- `publicRuntimeProtocol.protocolVersion`
- `contentIdentity.algorithm = sha256-canonical-file-manifest-v1`
- `contentIdentity.sha256`
- `contentIdentity.excludes` includes `deployment-manifest.json`

The same run fetches `/threejs/runtime-config.json` as exact bytes and requires its SHA-256 to equal `publicRuntimeProtocol.sha256`. Its `frontendSha`, protocol version, production environment and `threejs-rebuild` branch must agree with the live manifest.

The runner also fetches both public HTML entry points and requires the root `/yakolak/` to remain the Godot root while `/yakolak/threejs/` carries the Three.js rebuild marker.

If the public manifest is older than the requested candidate, the run polls for readiness and then fails `threejs061_exact_live_generation_not_ready`; it never tests the stale generation as if it were current.

## Full matches

One accepted run completes six deterministic full matches from deployed ESM modules:

- 2-seat all-human
- 2-seat Human+Computer
- 3-seat all-human
- 3-seat Human+Computer
- 4-seat all-human
- 4-seat Human+Computer

Every match uses canonical THREEJS-045 state, the real local authority adapter, THREEJS-044/046 shared rules and `winsToMatch = 3`. Human moves are created as canonical local intents. Computer seats run through `createComputerTurnProducer(...)` with reduced presentation delay but unchanged strategy semantics.

The deterministic test strategy asks shared rules for every legal move, prefers an immediately winning move, then center, then the first legal move. It contains no copied legality/win implementation. The six configurations finish below the runner's 700 accepted-move safety ceiling; exceeding that ceiling is a failure.

Every ordinary handoff and every new round verifies that the authoritative deadline is exactly `now + 18_000 ms`. Scoring must reach a canonical `MATCH_END` whose winner has exactly three wins.

## Supported input paths

Separate deployed-module probes submit real local-authority moves through:

- tap
- click
- keyboard confirm
- gamepad confirm
- drag release
- Computer/BOT producer

Tap/click use the public shell's verified `data.world-layout` and `data.approved-contract` assets. Keyboard/gamepad use the shared navigation controller. Drag uses the real THREEJS-035 controller plus THREEJS-096 motion controller with a presentation-only test bridge; the submitted intent must carry `drag-release`.

The full-match evidence also requires at least one real Computer move in every Human+Computer configuration.

## Timer, skip, draw, restart and rematch

The same live run contains focused authority probes:

- **18-second timeout:** build the real expired local-timeout intent, submit through local authority, and require the next deadline to be exactly +18 seconds.
- **skip:** exhaust blue and gold stock in a 4-seat canonical state, submit a real right-seat move, and require canonical skip order `back, left` with `front` becoming active.
- **true draw:** use a deterministic near-exhausted input arrangement, submit the last legal move, and require canonical draw with no winner; deployed shared rules must find no winning pattern.
- **restart:** create the real local restart request before any committed placement; require the same round/score and a fresh +18-second deadline.
- **rematch:** use one completed full-match `MATCH_END`, create the real local rematch request, and require round 1, zero scores and a fresh +18-second deadline.

## Refresh/resume

Refresh evidence is not a fake in-function clone. The runner:

1. accepts a real deployed local move;
2. serializes the resulting THREEJS-045 canonical state with the deployed module;
3. performs `page.reload()` on the public Pages URL;
4. waits for the public shell to become ready again;
5. imports the deployed canonical/local-authority modules again;
6. parses the pre-refresh snapshot;
7. submits the next legal move and requires revision continuity.

The evidence labels this boundary `canonical-serialized-snapshot-across-real-page-reload`. It proves canonical resume across a real browser reload without pretending that a separate production persistence/UI task has already been implemented.

## Base-path relocation

The run imports modules only as URLs relative to `/yakolak/threejs/` and fails if a deployed module escapes that base.

It also imports `app/core/app-url.js` from the public candidate and requires `APP_BASE_URL` to equal the exact nested Pages URL. An asset URL must stay under `/yakolak/threejs/`; origin-root `/assets/...` resolution is rejected.

## WebGL recovery

The public canvas must expose `WEBGL_lose_context` in acceptance Chromium. The runner performs one real loss/restore cycle and requires:

- graphics state becomes `lost`;
- frame count freezes and no RAF remains pending while lost;
- restore count increments exactly once;
- resource generation increments exactly once;
- restored presentation generation matches the graphics generation;
- boot state returns to `ready`;
- frame count resumes afterward.

Any page error fails the slice.

## Evidence artifact

The manual workflow always uploads:

`threejs061-live-local-evidence.json`

The JSON records the exact candidate SHA, deployment generation, Godot root SHA, runtime/content hashes, HTTP identity checks, six full-match summaries, supported input paths, timer/skip/draw/restart/rematch probes, refresh/resume, base-path proof, context recovery, page errors and failures.

Only `status = passed` from this exact-generation live artifact can complete THREEJS-061.

## Workflow

In **YAKOLAK Three.js Optional Checks**, manually choose:

- `suite = live-local`
- `expected_candidate_sha = <exact SHA from the successful PAGES-014 generation>`

The workflow installs Playwright/Chromium, runs the source gate, executes the public Pages acceptance, and uploads evidence even on failure.

No push trigger or daily deployment gate is added. The existing `fast`, `browser` and `full` suites remain unchanged except that `fast/full` also validate the static THREEJS-061 acceptance contract.

## Current completion state

The harness and exact-generation gate can be reviewed/merged independently, but **THREEJS-061 remains incomplete until a real `live-local` run produces a passing evidence artifact**. This environment cannot reach the public Pages host or dispatch the manual workflow, so source review must not be reported as live acceptance.
