# THREEJS-041 — Invalid and rejected action feedback

Status: **LOCKED by THREEJS-041 (2026-08-20)**

THREEJS-041 separates two failure classes that must not share rollback semantics:

1. **pre-submit invalid input** — nothing authoritative was submitted or mutated;
2. **post-submit authority rejection** — a mutation attempt existed, so speculative/pending presentation must be dropped and rebuilt from canonical authority rather than locally guessed backward.

The module owns feedback presentation coordination only. It does not submit gameplay intents, change board/inventory/turn state, or create another animation scheduler.

## Pre-submit invalid input

`preSubmitInvalid(...)` consumes the current canonical snapshot plus a semantic reason code.

It returns:

- `status = invalid-pre-submit`;
- `mutationSubmitted = false`;
- `authoritativeStateChangedByFeedback = false`;
- one concise semantic feedback model;
- optional invalid-return motion handle.

No speculative/pending cancellation occurs because authority was never entered.

Typical semantic keys include occupied target, unavailable piece, expired turn and generic move-unavailable. The presentation model exposes `role=status` + `ariaLive=polite` so a renderer/DOM bridge can announce it without coupling feedback meaning to color.

## Semantic feedback sequence through THREEJS-096

The chosen cue is a short `brief-cross-badge` semantic presentation.

Its self-clear sequence is owned by THREEJS-096:

- duration: 480 ms;
- easing: `easeOutCubic`;
- opacity: `1 → 0`;
- scale: `1 → 0.96`.

THREEJS-041 calls no RAF, interval or timeout. The only completion callback observes the 096 motion handle and clears the semantic presentation if that exact feedback ID is still current.

If a newer authority/hydration cancels the motion, 096 invokes the cue's canonical snap/clear path. A late completion callback checks identity again and cannot clear newer feedback/presentation.

## Optional physical invalid return

When an invalid action also needs a physical piece return, callers may supply a normal THREEJS-096 motion descriptor.

THREEJS-041:

- preserves the caller's target ownership scope/key;
- injects the **current canonical generation and revision** itself;
- rejects collision with the semantic-feedback scope;
- submits the motion only through `motionController.animate(...)`;
- tracks/cancels active return scopes on newer hydration/rejection/release;
- relies on the descriptor's 096 `snapToCanonical` path when cancelled.

Caller-provided generation/revision values cannot override the canonical witness.

## Post-submit authority rejection

`authoritativeRejected(...)` behaves differently from pre-submit invalid input.

Immediately, before awaiting any network/current-state read, it:

1. cancels speculative/pending presentation;
2. cancels stale semantic feedback;
3. cancels any invalid-return physical presentation.

It does **not** animate a guessed rollback.

Then it resolves canonical reconstruction from authoritative sources:

- a returned rejection snapshot, if supplied;
- `authority.snapshot()` current state;
- a strictly newer canonical hydration that arrived while rejection handling was waiting.

The attempted pre-submit snapshot is **not** accepted as a fallback rollback source by itself. If no returned/current/newer snapshot exists, handling fails as `authority_rejection_snapshot_unavailable` rather than guessing.

Returned/current snapshots older than the attempted authority witness are unusable.

## Newer hydration wins

THREEJS-041 retains the latest observed canonical snapshot and compares:

- presentation generation;
- authoritative revision;
- round.

Ordering must be monotonic across all three dimensions; contradictory ordering fails closed.

If rejection waits for `authority.snapshot()` while a newer reconnect/hydration arrives, the newer hydration wins. When the older rejection read later completes, reconstruction stays on that newer snapshot.

A still newer hydration also cancels any rejection feedback started afterward. Cancelled RAF callbacks and late `finished` Promise callbacks cannot apply/clear presentation after the newer rebuild.

## Same-witness consistency

Two canonical snapshots with the exact same generation + revision + round must serialize identically. A mismatch fails as `action_feedback_same_witness_snapshot_conflict`.

This prevents feedback/rebuild code from choosing between contradictory states under one authority identity.

## Canonical rebuild boundary

THREEJS-041 receives two injected presentation bridges:

- `cancelSpeculativePresentation(reason)`;
- `rebuildFromCanonical(snapshot, meta)`.

Authority rejection and newer hydration use these bridges; the feedback controller itself never places/removes pieces or edits gameplay state.

The chosen rebuild metadata records whether the snapshot came from:

- `current-snapshot`;
- `returned-snapshot`;
- `newer-hydration`;
- ordinary `hydration`.

## Verification

Run:

- `node --test tests/threejs_action_feedback_contract.test.mjs`
- `npm run test:threejs:gameplay`

The focused contract proves:

- pre-submit invalid actions submit/mutate nothing;
- semantic self-clear and physical invalid return both run through THREEJS-096 at current generation/revision;
- newer hydration cancels both and stale callbacks no-op;
- version conflict/rejection cancels speculative presentation before awaiting authority;
- current and returned snapshot rebuild paths;
- unavailable snapshot fails rather than guessing attempted-state rollback;
- hydration arriving during rejection wins over returned/current stale results;
- later hydration wins over late rejection-feedback completion;
- no rules/board mutation or private animation loop exists in THREEJS-041.
