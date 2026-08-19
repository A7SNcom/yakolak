# THREEJS-048 — Stable configured seat/turn ring

Status: **LOCKED by THREEJS-048 (2026-08-19)**

THREEJS-048 resolves GAP-001 and SRC-003 before implementing skip behavior. This contract is authoritative for the Three.js migration protocol, local authority, reconnect/hydration and the future backend implementation.

## Stable physical slot identity

The only canonical configured seat IDs are the physical slots:

| seatId | spatial slot | canonical color |
|---|---|---|
| `right` | right | `marble` |
| `back` | back | `blue` |
| `left` | left | `gold` |
| `front` | front | `green` |

These bindings never rotate. Camera position, viewport orientation and UI layout are presentation only.

## Host-preference rotation

The base ring is:

`right/marble → back/blue → left/gold → front/green`

The host's approved preferred color chooses the starting point of this ring. The configured session uses the first 2, 3 or 4 slots from the rotated ring.

Examples:

- marble + 2 → `right, back`
- blue + 3 → `back, left, front`
- gold + 4 → `left, front, right, back`
- green + 2 → `front, right`

`tests/threejs_turn_ring_contract.test.mjs` exhaustively verifies all 12 preferred-color/player-count combinations.

## Credential binding

An invitation/session credential maps to an already configured stable `seatId`. Credential arrival does not allocate, renumber or reorder seats.

`createCredentialSeatBindings(state, claims)` and `configuredSeatForCredential(state, bindings, credentialId)` re-derive configured order from canonical `preferredColor + targetPlayers + seat identity`; they do not trust the incoming `seats[]` array order. Therefore even an adapter that presents hydrated seats in reversed join/reconnect order cannot redefine authority.

Only stable opaque credential identities/fingerprints and exact configured seat IDs cross this helper. Raw bearer secrets are not canonical gameplay state and are not stored by this module.

The future migration backend must persist the same binding. Protocol-v5 `p1…p4` identifiers remain compatibility-only during migration and cannot define new-protocol authority.

## Legal-mover handoff

`selectNextLegalConfiguredSeat(state, currentSeatId)` scans exactly the configured order:

1. start at the seat immediately after the current seat;
2. for each seat with no legal placement, append `{ seatId, reason: 'no_legal_move' }` to ordered `skips` evidence;
3. the first seat with any legal placement becomes `nextSeatId`;
4. wrap once through the full configured ring, including the current seat last;
5. if the current seat is the only legal mover, it may therefore receive a consecutive turn after the others are skipped;
6. if every configured seat is blocked, return `nextSeatId: null`, `allSeatsBlocked: true` and the complete ordered `skips` evidence.

THREEJS-051 owns committing a draw from the all-blocked result. THREEJS-048 only resolves the order/evidence and does not manufacture a draw.

## Canonical skip evidence

`yakolak.session-state/v1` carries an ordered `skips[]` array of exact `{ seatId, reason }` records. The former singular `skippedSeat`/`skipReason` shape is removed because it could not represent multiple skipped seats or hydrate deterministic evidence after reconnect.

`no_legal_move` is the reason locked by THREEJS-048. It is not a timeout reason. THREEJS-050/070 own timeout authority and must use a distinct reason/intent if they add timeout evidence.

## Consumers

All later code must consume this exact configured order:

- THREEJS-049 move authority;
- THREEJS-050 timeout handoff;
- THREEJS-051 draw detection;
- THREEJS-054 next-round starter/reset;
- THREEJS-062/064 migration protocol seat persistence;
- THREEJS-066/074 reconnect/hydration identity;
- THREEJS-072 online transition/idempotency package;
- future Cloudflare/backend authority.

No consumer may derive authority from connection order, join order, reconnect order, `players[]` arrival order, camera position or screen orientation.

## Verification

Run:

- `node --test tests/threejs_turn_ring_contract.test.mjs`
- `node --test tests/threejs_canonical_session_state_contract.test.mjs`
- `node --test tests/threejs_placement_inventory_contract.test.mjs`
- `node --test tests/threejs_session_lifecycle_contract.test.mjs`

The focused contract verifies all 12 ring rotations, immutable spatial/color bindings, canonical stored order, credential-to-seat stability across reversed claim/reconnect order, 2/3/4-seat legal-mover skipping, the only-legal-mover wrap case and complete all-blocked evidence.
