# Three.js Source-of-Truth Order

This contract applies only to the `threejs-rebuild` workspace until an explicit cutover task changes it. It does not change `main`, the Godot production path, or `https://yakolak.vercel.app/`.

## 1. Authoritative order by domain

For every `THREEJS-*` task, determine which domain owns the decision before implementing it:

1. **`YAKOLAK_PORTABLE_KIT/` — definitive spatial, visual, presentation, and rebuild specification.**
   - Owns world coordinates, board/base/piece transforms, approved assets, materials, room composition, cameras, responsive poses, motion timings, scene flow, interaction presentation, visual states, accessibility presentation, and rebuild acceptance expectations.
   - Historical Godot code, wrappers, experiments, and production quirks must not override it.

2. **Current `rules/` + `api/` — authoritative live backend contract.**
   - Owns the currently served rule tokens, validation behavior, room/session protocol, mutations, versioning, identity/seat ownership, persistence, lifecycle transitions, network errors, and any server-authoritative state actually accepted by the live API.
   - The Three.js client must interoperate with this contract unless a separate explicit backend-migration task changes it.

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

### SRC-001 — Match length semantics — OPEN

- `YAKOLAK_PORTABLE_KIT/README.md` specifies a match as **exactly 3 or 5 completed rounds**, with highest score after the final round deciding the match.
- `rules/yakolak-rules.json` exposes the same numeric options as `winsToMatchOptions`.
- `api/rooms.js` treats the selected value as `winsToMatch` and completes the match only when one seat's score reaches that number; draws increase `completedRounds` but do not complete the match.
- Consequence: the live backend can run for more than 3 or 5 completed rounds, which contradicts the rebuild guide's fixed-round contract.
- Rule for rewrite: do not disguise this as equivalent behavior. Preserve live API compatibility until a separate backend-contract task resolves it.

### SRC-002 — White visual color vs `marble` backend token — ADAPTER

- `YAKOLAK_PORTABLE_KIT/README.md` defines the physical/visual color as `white`.
- `rules/yakolak-rules.json` and `api/` define the live backend token as `marble` alongside `blue`, `gold`, and `green`.
- Rule for rewrite: the visual presentation may remain white, but any `white ↔ marble` translation must be an explicit named adapter at the backend boundary. Do not rename the live token silently.

### SRC-003 — Seat order and color ownership — OPEN

- `YAKOLAK_PORTABLE_KIT/README.md` defines a fixed color ring `white → blue → gold → green`, rotated so the preferred color is first, and each invitation reserves one exact seat/color.
- `api/rooms.js` stores players in host/join order, assigns the next free `p2`/`p3`/`p4` seat when a join occurs, and accepts the joining player's requested available color.
- Turn advancement and round starters in the backend use the `players` array order rather than the Kit's fixed color ring.
- Rule for rewrite: do not make the UI imply fixed-ring ownership when the live backend state says otherwise unless an explicit backend migration resolves this contract.

### SRC-004 — Invitation and ready-check model — OPEN

- `YAKOLAK_PORTABLE_KIT/README.md` requires seat-specific invitation links, reserved colors, explicit readiness, and start only after every configured seat is ready.
- `api/rooms.js` exposes two-digit room discovery/join behavior, lets each joining player request an available color, and switches the room to `playing` automatically when `players.length === targetPlayers`.
- The current API has no seat-specific invitation reservation or ready flag/state.
- Rule for rewrite: do not invent client-only readiness or seat reservation and present it as authoritative online state.

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

## 4. Implementation rule for future Three.js tasks

Every implementation decision must be traceable to one of these outcomes:

- **Kit-owned:** implement the Kit exactly.
- **Backend-owned:** implement the current `rules/` + `api/` contract exactly.
- **Agreement:** when Kit, backend, and Production agree, Production may be used as a supporting behavioral/visual reference.
- **Contradiction:** record it here and use only an explicit compatibility adapter that does not alter either authoritative contract; otherwise stop that affected decision for a later resolution task.

Do not copy a Godot quirk merely because it is currently visible in Production. Do not rewrite the live backend merely because the Kit describes a cleaner target. Do not modify the Kit silently to match current backend behavior.

## 5. Workspace and deployment boundary

- This file and all Three.js rebuild work stay on `threejs-rebuild` until explicit cutover.
- `main` remains the Godot source branch.
- `https://yakolak.vercel.app/` remains Godot Production until explicit cutover.
- No competing migration branch, PR chain, or alternate production path is authorized by this contract.
