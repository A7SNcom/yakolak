# THREEJS-049 — Authoritative 18-second local deadline

Status: **LOCKED by THREEJS-049 (2026-08-19)**

This contract applies only to sessions whose authority adapter confirms that **zero configured seats are Online**. It does not close the separate authoritative online deadline/timeout gap owned by THREEJS-062/070.

## Local authority rule

Every authoritative local turn begins with exactly one absolute wall-clock deadline:

`deadlineAtMs = turnStartNowMs + 18_000`

The canonical session already owns `deadlineAtMs`; THREEJS-049 supplies the local-authority helper `beginAuthoritativeLocalTurnDeadline(...)` that commits that absolute value without introducing a second countdown state or a new gameplay revision rule.

The helper is deliberately one-shot for the current turn. If `deadlineAtMs` is already present, another begin attempt fails with `local_deadline_already_started`. A later authoritative turn transition must first produce the next canonical turn state with `deadlineAtMs: null`, then create that new turn's one deadline. Rendering, visibility callbacks and frame loops never clear/restart it.

## Zero-Online boundary without inventing seat-type vocabulary

THREEJS-062 still owns the authoritative future seat-type vocabulary. THREEJS-049 therefore does not hard-code a new Online token.

The local authority adapter supplies `isOnlineSeatType(type) -> boolean`. Deadline creation fails if any configured seat classifies as Online. The classifier sees only the opaque `type` token, never the canonical seat/state object.

This keeps the local rule usable now without pretending the future online protocol is already specified.

## Wall-clock display derivation

`deriveTurnDeadlineDisplay(state, nowMs)` computes display-only values from the stored absolute deadline:

- `remainingMs = max(0, deadlineAtMs - nowMs)`
- `remainingSeconds = ceil(remainingMs / 1000)`
- `expired = remainingMs === 0`

There is no decrementing counter. Slow frames, background-tab throttling, visibility suspension and duplicate renders merely cause the next read to compare a later wall-clock value against the same unchanged deadline.

If the page is hidden for 65 seconds during an 18-second turn, the next read is immediately expired; the deadline is not extended by the hidden duration.

## Lifecycle boundary

A local deadline may begin only when:

- canonical lifecycle phase is `turn-loop`;
- lifecycle has no active interrupt;
- `activeSeatId` is configured and non-null;
- the current canonical turn has no existing deadline;
- the authority adapter confirms zero Online seats.

Context-loss/recovery, animation completion, render cadence and other presentation events cannot create a new deadline. Recovery must continue from the already committed absolute deadline.

## Online authority remains open

GAP-005/GAP-006 remain open for Online sessions. THREEJS-049 does not create a browser-authoritative online timeout, server deadline, clock-skew policy, timeout mutation, reconciliation transaction or request-driven wake strategy.

THREEJS-070 must later provide online deadline/timeout authority and may reuse the same absolute-deadline display principle, but a browser timer may never write an online timeout outcome.

## Verification

Run:

`node --test tests/threejs_local_deadline_contract.test.mjs`

The contract verifies the exact 18,000 ms duration, one-shot creation, zero-Online guard, state-blind seat classifier, wall-clock countdown derivation, visibility/slow-frame jumps, no deadline restart on duplicate reads, lifecycle/active-seat gating, safe-integer clock validation and the absence of `setTimeout`, `setInterval`, `requestAnimationFrame`, `performance.now` or visibility-event authority.
