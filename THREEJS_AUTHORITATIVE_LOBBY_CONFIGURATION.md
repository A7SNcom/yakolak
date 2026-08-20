# THREEJS-064 — Authoritative lobby configuration

Status: **LOCKED by THREEJS-064 (2026-08-20)**

Scope: host-owned **initial** lobby configuration only. Invitation locator allocation/claim, lobby-edit invalidation/new generations, readiness/start, timeout and Computer execution remain owned by THREEJS-065/066/068/069/070/071.

## Configuration contract

The host resolves exactly:

- `preferredColor`: one shared-rules color;
- `targetPlayers`: 2, 3 or 4;
- `winsToMatch`: 3 or 5;
- `remainingSeatTypes`: exactly `targetPlayers - 1` values, each `online` or `computer`.

Unknown keys and every other value fail closed.

The host seat is always the first record in the THREEJS-048 rotated configured ring. The remaining seat types are applied by **configured-ring index**, never connection/join order.

## Stable seat identity

`web/app/shared/seat-order.js` remains the only source of physical/color identity:

- `right = marble`
- `back = blue`
- `left = gold`
- `front = green`

`materializeLobbySeatRecords()` projects that ring to exact records:

```json
{
  "seatId": "front",
  "spatialSlot": "front",
  "color": "green",
  "type": "host",
  "configuredIndex": 0,
  "lobbyGeneration": 0
}
```

Preferred color rotates **configured order only**. It never changes a physical slot's color or side.

The authoritative gameplay snapshot stores the resolved order in `players[]` as `{seat,color,type}` for gameplay consumption. Turso also persists every resolved record explicitly in `yakolak_authority_seat_configurations_v1` with `seatId`, physical slot, color, type, configured index and lobby generation. This is the durable configured-ring record; it does not depend on connection or claim order.

`yakolak_authority_seats_v1` remains a separate current credential/controller binding table. Initial configuration preserves only the authenticated host credential and reserves Online/Computer seat IDs with no browser credential; THREEJS-066 later binds claimed Online credentials without redefining their configured color/side/order.

The configuration table is an additive PAGES-015-compatible expansion. A previous Worker can ignore it, and Worker rollback never requires restoring Turso data. Later lobby generations may add new configuration records without rewriting the historical generation.

## Host ownership and first configuration

`createConfigureLobbyTransaction()` uses the THREEJS-062/063 room-scoped revision/idempotency boundary with operation `configure-lobby` and a seat actor.

For the initial configuration:

1. the lobby must still be `waiting` and unresolved (`preferredColor/targetPlayers/winsToMatch` null/absent);
2. the authenticated bootstrap host must be the lobby's single current player;
3. that seat must equal the first seat of the requested preferred-color ring;
4. the existing host credential/generation is preserved;
5. every remaining configured seat is reserved atomically as `online` or `computer` with no credential;
6. explicit seat-configuration records, credential bindings, state, revision and mutation receipt commit in the same Turso IMMEDIATE transaction.

THREEJS-064 does not allocate a room ID or define a public room-creation flow. It configures an already-created bootstrap lobby through the versioned authoritative mutation boundary. Later transport/browser work may consume bootstrap create, but may not change the configured-ring contract here.

This task does **not** implement post-configuration edits. A second configuration fails `lobby_already_configured`; THREEJS-068 owns reversible setup edits, lobby-generation invalidation and any safe seat/credential rebinding after the initial contract exists.

A configuration also fails rather than overwriting any already-bound non-host credential. That keeps invitation claim/controller ownership with THREEJS-066/067/068.

## Join order is non-authoritative

No arrival-order input exists in the configuration contract. Reversing/shuffling resolved seat records fails canonical-order validation. Therefore connection order cannot redefine turn order or physical sides.

## Verification

Run:

```bash
node --test tests/threejs064_authoritative_lobby_configuration.test.mjs
node --test tests/threejs064_worker_route_contract.test.mjs
```

The contracts cover every preferred-color × 2/3/4 combination at both 3/5 wins targets, host ownership, exact seat/type counts, durable explicit seat/color/physical/index records, separated credential bindings, idempotent initial configuration, rejection of second configuration, configured-order validation, SQLite materialization, refusal to overwrite a bound non-host credential and the real Worker mutation route.

The manual `backend` optional suite runs both contracts. No live Turso migration/deployment or THREEJS-061 live acceptance is claimed by THREEJS-064.
