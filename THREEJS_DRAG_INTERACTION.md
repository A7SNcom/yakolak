# THREEJS-035 — Full drag interaction contract

Status: **LOCKED by THREEJS-035 (2026-08-19)**

THREEJS-035 turns the normalized THREEJS-030 drag gesture into one local direct-manipulation presentation and, only on a valid release, one engine-neutral move submission. It does not create a second tween scheduler or accepted-travel animation path.

## Legal remaining piece only

Drag begins from the current THREEJS-033 selection and re-resolves that selected logical piece through THREEJS-031 canonical remaining inventory. Another seat, stale selection or already-used copy fails before camera/input state changes.

The piece may already be visually separated by THREEJS-032. Drag therefore starts from the **current presentation transform**, not an assumption that the piece is still at its canonical home transform. Canonical transform is consulted only for invalid/cancel return or authoritative resync.

## Direct pointer follow

While dragging, THREEJS-034 first validates the current selection/layout and projects the pointer ray to the canonical board plane. If a world point exists, the selected piece is presented directly at:

`[worldX, boardY + 14, worldZ]`

where **14** is the authoritative Portable Kit `dragHeight`.

Direct pointer-follow is intentionally not a tween. It allocates no RAF/timer and does not pass through THREEJS-096 frame scheduling.

Rotation/scale are preserved from the current presentation transform.

## Candidate destination

Every update reuses `resolveBoardCellPick(...)` from THREEJS-034. The drag exposes either:

- exactly one validated candidate destination; or
- `null` plus the deterministic 034 diagnostic.

It never exposes multiple legal alternatives. The same geometry-first/no-illegal-magnet rule therefore applies continuously during drag and again at release.

## Camera gesture ownership

A drag requires an injected `setCameraGesturesEnabled(boolean)` bridge.

- begin drag → camera gestures disabled;
- invalid/cancel/valid release → camera gestures re-enabled;
- pointer cancel / canonical resync → camera gestures re-enabled.

This prevents camera gestures from competing with a gameplay-owned drag without coupling the drag controller to camera implementation details.

## Valid release and pending state

Release recomputes THREEJS-034 picking at the actual release ray. A move is submitted only when that exact release remains inside the authoritative normal/touch radius and the selected-size placement validates.

THREEJS-035 receives an injected `intentFactory`, so it does not know whether authority is local or networked. The returned intent is still asserted to be:

- `kind=move`;
- `origin=human`;
- `presentation.source=drag-release`;
- exact selected seat/revision;
- exact release `{cell,size}`.

It is then submitted through the generic authority `{snapshot(), submit(intent)}` interface.

As soon as submission starts, drag becomes **pending**. While pending:

- cancel returns false;
- pointer-cancel returns false;
- repeated release returns the same pending submission;
- authority is never submitted twice;
- the piece is not locally returned or moved by an accepted-travel tween.

A same-witness caller cannot falsely label pending as accepted and undo it. Same-witness reconciliation is allowed only for trusted `rejected-resync` or `reconnect`; a normal accepted/ownership/round transition requires a changed authoritative witness.

## Accepted travel belongs to THREEJS-042

A valid release emits a frozen `travelRequest` containing the selected piece, direct-release transform, validated candidate, intent and original generation/revision, with:

`owner = THREEJS-042`

THREEJS-035 allocates **zero** accepted-travel motion handles. THREEJS-042 will consume accepted authority results and own the travel sequence through the same THREEJS-096 controller.

## Invalid release and explicit cancel

An invalid/outside-radius release submits nothing. It requests one canonical return through THREEJS-096 using:

- definitive `invalidReturnMs = 300`;
- `easeInOutCubic`;
- current drag transform → current canonical transform.

Invalid pre-submit release leaves THREEJS-033 size selection intact so the user may correct the action.

Explicit user cancel requests the same THREEJS-096 canonical-return motion and atomically clears THREEJS-033 selection with reason `cancel`.

## Pointer cancel and authoritative resync

Browser `pointercancel` is not treated as a deliberate animated invalid drop. It immediately drops local drag presentation, snaps/rebuilds from the canonical presentation adapter, clears selection and allocates no return tween.

Lifecycle/revision change, reconnect or hydration uses `reconcileCanonical(...)`. The caller must first expose the latest canonical presentation data, then pass the canonical state + one locked THREEJS-033 clear reason. The controller:

1. rejects an older generation/revision;
2. synchronizes THREEJS-096 authority;
3. re-enables camera gestures;
4. immediately snaps/rebuilds the dragged piece from canonical presentation if still live;
5. clears the local drag/pending state and THREEJS-033 selection.

This is presentation reconciliation only; it never mutates gameplay authority.

## Scheduler boundary

The only `motionController.animate(...)` call in THREEJS-035 is the **canonical return** path. There is no raw RAF/timer and no accepted-travel animation.

Direct pointer follow is immediate, invalid/cancel return belongs to THREEJS-096, and accepted travel belongs to THREEJS-042 through THREEJS-096.

## Verification

Run:

- `node --test tests/threejs_drag_interaction_contract.test.mjs`
- `npm run test:threejs:gameplay`

The focused contract covers opened-stack start, direct Y+14 follow, single candidate exposure, camera gesture exclusion, legal release/pending exactly-once submission, no local pending undo, trusted same-revision rejection, newer accepted resync, 300ms invalid/cancel return through THREEJS-096, immediate pointercancel/hydration snap, used-piece rejection and source-level scheduler ownership.
