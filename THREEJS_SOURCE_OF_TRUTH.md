# Three.js Source-of-Truth Order

## PAGES-004 deployment/backend-hosting override — 2026-08-17

For hosting, deployment, origin, and final-cutover decisions, `PAGES_MIGRATION_CONTRACT.md` is now the higher-order authority.

- GitHub Pages is the static frontend target.
- During migration `/yakolak/` is the known-good Godot root and `/yakolak/threejs/` is the Three.js candidate in one composite Pages site.
- GitHub Actions/Pages owns frontend publishing; PAGES-002 owns the deployment pipeline and PAGES-003 owns relocatable base paths.
- GitHub Pages never becomes the authoritative room server. Online transport crosses one explicit `API_ORIGIN`; PAGES-005 owns selection of the non-Vercel backend runtime/provider and public origin.
- Any Vercel project, preview alias, production deployment, serverless-runtime observation, header/cache behavior, `vercel.json` rule, or `yakolak.vercel.app` reference below is retained as historical evidence only. It cannot govern a new frontend/backend/cutover decision after PAGES-004.
- The current `rules/` + `api/` implementation remains authoritative evidence for live product/protocol semantics until a backend migration explicitly changes those semantics; this does not select Vercel as their future host.
- Final frontend cutover is a deliberate GitHub Pages move of accepted Three.js bytes to `/yakolak/`, retirement of `/yakolak/threejs/`, coordinated `API_ORIGIN` compatibility, and tested rollback. It is not a Vercel promotion or alias switch.

All non-hosting source-of-truth rules and contradiction records below remain binding unless explicitly resolved by their named owner task.

This contract applies only to the `threejs-rebuild` workspace until an explicit cutover task changes it. It does not change `main` or resolve an `OPEN` backend contract merely because the frontend needs an answer.

## 1. Authoritative order by domain

For every `THREEJS-*` task, determine which domain owns the decision before implementing it:

1. **`YAKOLAK_PORTABLE_KIT/` — definitive spatial, visual, presentation, and rebuild specification.**
   - Owns world coordinates, board/base/piece transforms, approved assets, materials, room composition, cameras, responsive poses, motion timings, scene flow, interaction presentation, visual states, accessibility presentation, and rebuild acceptance expectations.
   - Historical Godot code, wrappers, experiments, and production quirks must not override it.

2. **Current `rules/` + `api/` — authoritative live backend contract.**
   - Owns the currently served rule tokens, validation behavior, room/session protocol, mutations, versioning, identity/seat ownership, persistence, lifecycle transitions, network errors, and any server-authoritative state actually accepted by the live API.
   - The Three.js client must interoperate with this semantic contract unless a separate explicit backend-migration task changes it.
   - Hosting of that authority is now a separate Pages-era decision behind `API_ORIGIN`; do not infer Vercel hosting from these files.

3. **Current Godot Production — visual/behavioral reference only where it agrees with the applicable authoritative source above.**
   - Production may be used to understand feel, pacing, or currently visible behavior only when that behavior agrees with `YAKOLAK_PORTABLE_KIT/` for rebuild/presentation matters and with `rules/` + `api/` for live backend matters.
   - Production is never a tie-breaker and never overrides either authoritative source.

This is not one global precedence list where one folder may silently override a different domain. The applicable domain owner must be identified first.

## 2. Mandatory contradiction protocol

When two sources disagree, **do not silently choose, normalize, rename, emulate, or merge the difference**.

Before implementing the affected behavior:

1. Add or update an entry in the contradiction register below.
2. Name the exact conflicting paths/behaviors.
3. State which domain each source owns.
4. Keep the conflict explicit in code through a named adapter/mapping only when compatibility can be preserved without changing either authoritative contract.
5. If implementing the feature would require changing an authoritative contract, leave that portion unresolved until an explicit task authorizes the contract change.
6. A contradiction blocks only the affected decision; unrelated Three.js work may continue.

Any contradiction discovered later by a `THREEJS-*` task must be appended here in the same commit that first depends on it, unless that task explicitly resolves the contradiction and records the resolution.

## 3. Current contradiction register

Status values: `OPEN`, `ADAPTER`, or `RESOLVED`. No entry may disappear without a recorded resolution.

### SRC-001 — Match length semantics — RESOLVED

- `YAKOLAK_PORTABLE_KIT/README.md` describes a match as **exactly 3 or 5 completed rounds**, with highest score after the final round deciding the match.
- `rules/yakolak-rules.json` defines the current product choices as `winsToMatchOptions: [3, 5]`.
- `api/rooms.js` stores the selected value as `winsToMatch`, awards one score point only to a round winner, increments `completedRounds` for both wins and draws, and sets `matchComplete` only when one seat's score reaches `winsToMatch`.
- **Resolution — THREEJS-004 (2026-08-16): the rebuild is locked to the current product/backend meaning. `3` or `5` means round wins required to win the match, not total completed rounds.**
- A drawn round awards **no point** to any seat. It may increment `completedRounds`, but `completedRounds` is informational/history state and must never be used as a hidden fixed-length match terminator.
- Therefore a match may contain more than 3 or 5 completed rounds when draws or split wins occur; it ends only when one seat reaches the configured `winsToMatch` threshold.
- `targetRounds` is a legacy API/config alias for this same threshold and must be interpreted as wins-to-match at the Three.js boundary. New rebuild naming, UI copy, state models, and tests should prefer `winsToMatch` / “wins required”, never “exactly 3/5 rounds”.
- The Portable Kit's old fixed-round sentence is explicitly superseded **for rebuild match semantics only** by this resolution. Do not reintroduce “highest score after exactly 3/5 completed rounds” unless a later explicit product-rule migration changes the authoritative backend contract and this resolution record.

### SRC-002 — White visual color vs `marble` backend token — RESOLVED

- `YAKOLAK_PORTABLE_KIT/README.md` historically describes the physical/visual set as `white`, while `rules/yakolak-rules.json` and `api/` use the live playable token `marble` alongside `blue`, `gold`, and `green`.
- **Resolution — THREEJS-005 (2026-08-16): `marble` is the one canonical internal/playable color ID for the white-marble set everywhere in the Three.js rebuild.**
- The canonical playable color IDs are exactly `marble`, `blue`, `gold`, `green`. `white` is not a fifth color, not a state token, not a backend alias, and must never be inserted into board, inventory, seat, score, winner, turn, persistence, mutation, fixture, or rules state as a playable ID.
- Visual presentation may describe the `marble` set as **white marble**. `YAKOLAK_PORTABLE_KIT/assets/reference/approved-contract.json` owns the single display/material mapping from canonical ID `marble` to display name `white marble` and material key `marble`.
- `YAKOLAK_PORTABLE_KIT/assets/reference/approved-contract.json` now uses `marble` in its playable color arrays, turn ring, intro order, and material palette; `YAKOLAK_PORTABLE_KIT/assets/layout/world-layout.json` now maps `right` to `marble`.
- Preserve the spatial/identity mapping exactly: `right = marble`, `back = blue`, `left = gold`, `front = green`. Preserve the fixed spatial turn ring exactly as `right → back → left → front`, equivalent to canonical color ring `marble → blue → gold → green`.
- Any old prose or artwork using the word `white` is descriptive only. Code must resolve presentation from canonical `marble`; it must not branch on `white` as a separate playable color or maintain parallel `white` and `marble` inventories/material identities.

### SRC-003 — Seat order and color ownership — RESOLVED

- The Kit's fixed canonical color/spatial ring is `marble → blue → gold → green`, mapped `right → back → left → front`, and setup explicitly says: rotate the ring so the host's preferred color is first, then keep the selected 2/3/4 seats.
- Protocol 5 historically stores players in host/join arrival order, assigns free `p2`/`p3`/`p4` identifiers, and advances `turnIndex` through that array. That representation is now a **legacy compatibility contract only** and is not the target seat authority for the rebuild migration.
- **Resolution — THREEJS-048 (2026-08-19): canonical configured seat IDs are the stable spatial slots `right`, `back`, `left`, `front`, permanently bound to `marble`, `blue`, `gold`, `green` respectively.**
- The canonical base ring is therefore `right/marble → back/blue → left/gold → front/green`. The host's approved preferred color rotates this ring once; the configured seat/turn order is the first `targetPlayers` slots from that rotated ring. No other rotation rule exists.
- The first configured slot is the host's preferred-color seat. Remaining Computer/Online seat types occupy the following configured slots in that same order; changing camera orientation, reconnect order, invitation claim order or network arrival order never changes the configured order.
- Every invitation/online credential maps to one already-configured stable `seatId`. The credential proves ownership of that slot; it never creates, renumbers, swaps or reorders a seat. Reconnect with the same recovered identity resolves the same `seatId`.
- Canonical turn handoff scans only this configured order. Starting immediately after the current seat, each configured seat with no legal placement is recorded with authoritative reason `no_legal_move` and skipped; scanning wraps through the ring and may return to the current seat if that is the only seat with a legal move. Only when **no configured seat** has a legal placement does the selector return no next seat; THREEJS-051 owns committing the resulting draw transition.
- `no_legal_move` is distinct from timeout. THREEJS-050/070 may hand off after timeout, but they must not mislabel a timeout as no-legal-move evidence.
- THREEJS-054 owns next-round starter/reset mechanics but must consume this exact configured order; it may not invent a second seat ring.
- THREEJS-062/064/072 and any future Cloudflare room implementation must persist/transport these stable configured slots and credential bindings. They may adapt active legacy protocol-5 rooms during migration, but they may not resurrect join-order authority for the new protocol.
- The fixed physical mapping remains fixed even when the host prefers another color: rotating turn/setup order does **not** rotate the actual right/back/left/front geometry or rename colors.

### SRC-004 — Entry and invitation model — RESOLVED

- `YAKOLAK_PORTABLE_KIT/README.md` requires one seat-specific invitation per online seat, with an exact reserved seat/color; the joining player does not choose another color.
- Current `api/rooms.js` instead treats a two-digit value as a room code, allocates the next free `p2`/`p3`/`p4` seat on join, and accepts a joiner-requested available color.
- **Resolution — THREEJS-006 (2026-08-16): the rebuild entry is locked to two top-level paths, `قيم جديد` for the host and `دخول بدعوة` for invitees. The host configures seats/colors, and every online seat receives one authoritative invitation reservation for one exact seat and canonical color.**
- A joiner never chooses, swaps, or falls back to another seat/color. If the reserved seat/color cannot be claimed, the claim fails; the server must not silently allocate a different free seat or color.
- The manual **2-digit code resolves an invitation, not a room**. One lobby may therefore have multiple active 2-digit invitation codes, one per online seat. Generic “enter room code, then take the next free seat/color” behavior is not part of the Three.js contract.
- Invitation-link entry and manual-code entry must converge on the same authoritative invitation record before claiming. For the same invitation they must show the same preview, enforce the same validation, return the same reserved seat/color, and produce the same post-claim session identity outcome and errors.
- The 2-digit invitation value is a locator, not the player's authenticated session credential. Successful claim issues or recovers a separate seat session identity used for later room actions.
- Invalid, expired, cancelled, stale-after-reconfiguration, or already-claimed invitations do not occupy another seat and never fall back to generic room joining.
- The complete binding contract is `THREEJS_ENTRY_INVITATION_CONTRACT.md`; later THREEJS tasks must follow it together with this resolution.
- The current backend is not yet compliant with this resolved migration contract. A later implementation task must add/adjust authoritative invitation reservation/resolution before the rebuilt online UI claims this flow is live. Until then, the client must not fake reservation authority client-side.

### SRC-005 — Computer/mixed-seat authority — OPEN

- `YAKOLAK_PORTABLE_KIT/README.md` requires remaining seats to be configured as `Computer` or `Online`, including mixed online/computer matches with authoritative computer decisions.
- Current `api/rooms.js` models joined player seats only and has no authoritative seat-type/computer contract for mixed rooms.
- Rule for rewrite: mixed online/computer behavior remains unresolved at the live-backend boundary until explicitly specified or migrated.

### SRC-006 — Authoritative turn deadline/timeouts — OPEN

- `YAKOLAK_PORTABLE_KIT/README.md` requires an authoritative 18-second deadline, timeout skip behavior, and deadline-derived client timers.
- Current `api/rooms.js` room state contains no authoritative deadline and exposes no timeout mutation/action.
- Rule for rewrite: presentation may not fabricate a server-authoritative deadline. Any temporary visual timer must not mutate authoritative state or be treated as proof of a backend timeout contract.

### SRC-007 — Lobby editing/invalidation — OPEN

- `YAKOLAK_PORTABLE_KIT/README.md` says changing color, player count, seat type, or round count after invitations exist invalidates the old lobby/invitations and creates a new lobby, with one narrow exception for replacing an unjoined online seat by a computer.
- `api/rooms.js` allows the host to edit `color`, `targetPlayers`, and `targetRounds` in the existing waiting room without recreating it, subject to its allowlist and safety checks.
- Rule for rewrite: preserve the live edit contract and do not claim old-room invalidation happened unless the backend actually changes.

### SRC-008 — Room expiration — OPEN

- `YAKOLAK_PORTABLE_KIT/README.md` allows a room to expire after **8 hours** without activity.
- Current `api/rooms.js` sets `ROOM_TTL_MS` to **3 hours** and refreshes that expiry on room updates.
- Rule for rewrite: client copy/behavior must not promise an 8-hour live-session lifetime while the current API enforces 3 hours.

### SRC-009 — Restart-round contract — OPEN

- `YAKOLAK_PORTABLE_KIT/README.md` specifies restart-round availability before a committed move with required confirmation rules.
- Current `api/rooms.js` exposes `move`, `rematch`, `edit`, and `leave` mutations but no restart-round mutation.
- Rule for rewrite: do not present restart-round as an authoritative online capability until the backend contract supports it.

### SRC-010 — Mutation-ID coverage — OPEN

- `YAKOLAK_PORTABLE_KIT/README.md` requires every mutating request to carry a unique request/move ID and current revision.
- Current `api/rooms.js` requires `mutationId` for `move` and `rematch`, while `edit` and `leave` do not use the same mutation-ID requirement (`leave` also bypasses the caller-supplied expected version by using the current row version).
- Rule for rewrite: follow the live API exactly at its boundary and do not describe all mutations as having identical idempotency/version semantics.

### SRC-011 — Ready-check and automatic start — OPEN

- `YAKOLAK_PORTABLE_KIT/README.md` requires explicit readiness and start only after every configured seat is ready.
- Current `api/rooms.js` has no ready flag/state and changes the room to `playing` automatically when `players.length === targetPlayers`.
- THREEJS-006 intentionally resolves entry/invitation reservation only; it does not invent a client-only ready authority or silently change the live start transition.
- Rule for rewrite: keep readiness/start-gating unresolved until an explicit backend migration defines authoritative ready state and start behavior.

### SRC-012 — Table top and game-clearance contact plane — OPEN

- `YAKOLAK_PORTABLE_KIT/assets/layout/world-layout.json` defines the room table top as `Y=-16` and separately defines `gameClearance=0.8`; `YAKOLAK_PORTABLE_KIT/assets/room/ROOM.md` says to align the game assembly to the measured table top plus that `0.8` clearance.
- The same Kit-owned board transform, verified from the canonical `board-and-lid.stl` by THREEJS-018, places the board's final world bounds at `Y=0..12`. With the table top fixed at `Y=-16`, the measured table-to-board-bottom gap is therefore `16`, not `0.8`.
- These values are inside the same definitive spatial source and cannot be reconciled by silently translating the board, table, rule cells, pieces, or score geometry. A hidden `15.2`-unit presentation offset would break the locked world-coordinate contract.
- THREEJS-021 therefore preserves all three facts explicitly: table top `-16`, declared clearance `0.8`, and verified board bottom `0`; its runtime contact report records the mismatch and applies **no hidden game offset**. The table is constructed at the exact declared top plane, while game/rule coordinates remain untouched.
- THREEJS-022 must preserve these exact planes while building the neutral room. A later explicit spatial-contract resolution is required before any release claim that the physical board clearance itself equals `0.8`; until then no renderer or camera code may conceal the discrepancy.

## 4. Implementation rule for future Three.js tasks

Every implementation decision must be traceable to one of these outcomes:

- **Kit-owned:** implement the Kit exactly.
- **Backend-owned:** implement the current `rules/` + `api/` semantic contract exactly.
- **Agreement:** when Kit, backend, and Production agree, Production may be used as a supporting behavioral/visual reference.
- **Contradiction:** record it here and use only an explicit compatibility adapter that does not alter either authoritative contract; otherwise stop that affected decision for a later resolution task.
- **Resolved contradiction:** a `RESOLVED` entry is a binding migration decision for later Three.js tasks. Follow its recorded resolution even if an older source still contains the superseded wording; reopening it requires another explicit product-rule or migration-resolution task.

For `SRC-001` specifically, all future Three.js code, copy, adapters, fixtures, and tests must treat 3/5 as **wins-to-match**. No code path may terminate a match merely because `completedRounds` reaches 3 or 5.

For `SRC-002` specifically, every playable color value crossing rules, state, persistence, network, turn, board, inventory, scoring, or tests must use canonical `marble`, never playable `white`. Rendering and copy for that ID must use the single approved white-marble display/material mapping rather than creating a second color identity. The canonical spatial identity is `right=marble`, `back=blue`, `left=gold`, `front=green`, with fixed spatial ring `right → back → left → front`.

For `SRC-003` specifically, configured seat identity and order are never array-arrival artifacts. Build the stable slot ring `right/marble → back/blue → left/gold → front/green`, rotate it so the host's preferred color is first, keep the configured 2/3/4-seat prefix, bind credentials/invitations to those stable slot IDs, and scan only that order for turn handoff/no-legal-move skips. Legacy `p1…p4`/join-order behavior may exist only inside an explicit compatibility adapter during migration.

For `SRC-004` specifically, every Three.js entry/invitation implementation must follow `THREEJS_ENTRY_INVITATION_CONTRACT.md`: `قيم جديد` is the host path, `دخول بدعوة` is the invitee path, each online invitation owns one exact reserved seat/color, and manual 2-digit entry resolves that invitation rather than a generic room. Link and code entry must converge on the same authoritative invitation record and claim outcome.

Do not copy a Godot quirk merely because it is currently visible in Production. Do not rewrite the live backend merely because the Kit describes a cleaner target. Do not modify the Kit silently to match current backend behavior.

## 5. Workspace and deployment boundary

- This file and all Three.js rebuild work stay on `threejs-rebuild` until explicit cutover.
- `main` remains the Godot source branch during migration.
- The static frontend deployment target is the one GitHub Pages site defined by `PAGES_MIGRATION_CONTRACT.md`.
- Migration layout remains Godot root `/yakolak/` + Three.js candidate `/yakolak/threejs/` until explicit cutover.
- Backend hosting is separated behind `API_ORIGIN`; PAGES-005 selects the non-Vercel authoritative runtime.
- Historical `yakolak.vercel.app`/Vercel Preview evidence does not authorize a competing migration or production path.
- No competing migration branch, PR chain, second Pages site, or alternate production frontend path is authorized by this contract.
