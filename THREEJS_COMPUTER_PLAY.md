# THREEJS-058 — Computer play through the shared intent path

Status: **LOCKED by THREEJS-058 (2026-08-19)**

THREEJS-058 defines the local Computer intent producer. A Computer seat is not a second rules engine: it reads an authority snapshot, enumerates legal move intents with shared rules, chooses one, waits only for presentation pacing, then submits the exact same gameplay intent shape through `authority.submit(...)` used by human input.

## Legal intent enumeration

`enumerateComputerLegalMoveIntents(state, seatId)` uses the canonical stable seat and current authority revision. It scans:

- cells `0..8` in ascending order;
- within each cell, canonical sizes `small`, `medium`, `large`;
- each candidate is admitted only when `validatePlacementForSeat(...)` accepts it.

Every emitted intent is:

- `kind = move`;
- `origin = bot`;
- `authority.adapter = local`;
- current stable seat/revision;
- `presentation.source = none`.

No Computer-only occupancy, inventory, win, turn or scoring rule exists.

## Simple strategy/randomness contract

The rebuild specification defines no tactical heuristic for local Computer play. THREEJS-058 therefore locks the smallest non-invented strategy: **uniform random selection over the complete legal-intent list**.

The deterministic enumeration order above makes injected-random tests reproducible. A random sample `r` must be finite and satisfy `0 <= r < 1`; the chosen index is `floor(r * legalIntentCount)`.

This is intentionally not size-first randomness, cell-first weighting, minimax, hidden difficulty, win preference or blocking logic. A later explicit product task may replace the strategy while preserving the same intent/authority path.

## Thinking delay

Portable-kit presentation timing is authoritative:

- normal Bot thinking: `420–740 ms`;
- Reduced Motion: `0 ms` in this implementation, which is permitted because thinking delay is presentation only.

Strategy randomness and presentation randomness are separate channels. The legal move is chosen before presentation delay is derived. Reduced Motion therefore cannot change which legal move is selected merely by skipping a random timing draw.

The thinking delay never changes or extends the authoritative 18-second deadline. If the deadline expires during thinking, no move is submitted and timeout authority remains responsible for the result.

## Stale callback rule

The producer captures a witness from the authority snapshot:

- stable active seat;
- revision;
- exact `deadlineAtMs`;
- lifecycle `presentationGeneration`.

After the thinking delay it fetches a fresh `authority.snapshot()`. Any changed turn, revision, deadline, phase/interrupt or presentation generation makes the callback stale and it submits nothing.

There is a second race-safe boundary at `authority.submit(...)`: if authority changes after the fresh snapshot but before submission commits, THREEJS-057 rejects the stale intent. Those stale/replaced results are treated as cancellation, not gameplay failure.

`cancelPending(...)` also explicitly cancels the registry-owned thinking timer for lifecycle teardown/turn replacement.

## Resource ownership

The delay timer is created through a THREEJS-027 resource-registry transient scope. The Computer producer does not own a raw untracked `setTimeout`. Releasing the producer cancels pending thinking work and releases its scope.

## Authority location

This task implements local Computer play only. The producer depends solely on the generic `snapshot()/submit()` authority interface and does not inspect an `isLocal` flag.

Mixed/Online Computer authority remains server-owned by THREEJS-062/071. A browser must not reuse this local producer to become authoritative for an Online session.

## Verification

Run:

- `node --test tests/threejs_computer_turn_contract.test.mjs`
- `node --test tests/threejs_local_authority_adapter_contract.test.mjs`
- `node --test tests/threejs_placement_inventory_contract.test.mjs`

The focused contract covers complete shared-rule enumeration, uniform selection bounds, exact `420–740 ms` timing, Reduced Motion independence, no mutation while thinking, submission through the shared authority adapter, stale turn/revision suppression and explicit timer cancellation.
