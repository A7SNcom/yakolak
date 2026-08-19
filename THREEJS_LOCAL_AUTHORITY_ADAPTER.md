# THREEJS-057 — Unified local authority adapter

Status: **LOCKED by THREEJS-057 (2026-08-19)**

THREEJS-057 gives sessions with no Online seat one owner for canonical state, local deadlines, accepted gameplay intents and local revision advancement.

## Public authority interface

`createLocalAuthorityAdapter(...)` exposes exactly two Promise-based methods:

- `snapshot()`
- `submit(intent)`

There is no public local/remote flag. UI and renderer code consume the authority interface rather than branching on where authority runs. A future remote adapter can provide the same two methods.

`snapshot()` waits for queued submissions and returns a canonical serialized/hydrated clone. `submit(intent)` is serialized through one queue so two callers cannot both commit against the same observed revision.

## Authority boundary

The local adapter requires a seat-type classifier and refuses construction/submission if any configured seat is Online. It accepts only gameplay intents whose authority adapter is `local`.

Online seat vocabulary, remote deadlines, remote bot authority, unified mutation envelopes and online restart/rematch consensus remain owned by their later tasks.

## Revision rule

An accepted gameplay intent consumes revision `R` and produces exactly one new canonical revision `R+1`.

Rejected, illegal, stale or wrong-authority intents do not consume revision.

For terminal move/timeout outcomes, revision advances before win/draw commit so `roundEndRevision` equals the accepted revision exactly.

If the adapter receives a committed `round-ready` or active local turn that still needs its first deadline, priming that authoritative deadline also advances revision once before producers receive the snapshot.

## Move path

Human and Computer/Bot moves use the same path:

1. validate current local intent/revision/active seat/deadline;
2. call shared strict placement rules;
3. commit board, derived inventory and exact last move;
4. prove win from the accepted placement;
5. otherwise resolve the next legal configured seat through THREEJS-048;
6. commit draw if every configured seat is blocked;
7. otherwise hand off and create the next absolute local deadline;
8. publish one new revision.

`origin=human` and `origin=bot` affect only intent production/presentation; they do not create separate gameplay semantics.

## Timeout, restart and Rematch

Clock timeout intents also enter through `submit(intent)`. The adapter derives the timeout attempt from its own current deadline snapshot, uses the THREEJS-050 reducer, and commits THREEJS-051 draw when every seat is blocked.

A confirmed local restart is submitted as the existing `restart` intent. The adapter reconstructs the THREEJS-055 witness request from current authority state before applying it.

Local Rematch likewise reconstructs the THREEJS-056 request from current match-end state, resets the match, starts the first configured local turn/deadline, then publishes one new revision.

## Atomicity

Owned state changes only after the full handler succeeds. An exception leaves the previous canonical snapshot and revision intact.

Submission calls are queued. If two intents both observed revision `R`, only the first accepted one may commit; the next sees the new revision and is stale.

## Verification

Run:

- `node --test tests/threejs_local_authority_adapter_contract.test.mjs`
- `node --test tests/threejs_placement_inventory_contract.test.mjs`
- `node --test tests/threejs_local_timeout_contract.test.mjs`
- `node --test tests/threejs_local_restart_contract.test.mjs`
- `node --test tests/threejs_match_end_lifecycle_contract.test.mjs`

The focused contract covers the exact `snapshot()/submit()` surface, human/bot equivalence, atomic rejection, timeout, exact win/draw revision stamping, restart, Rematch, deadline priming and Online refusal.
