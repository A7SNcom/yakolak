# Yakolak Online Architecture

## Decision

Yokolak v126 uses server-authoritative HTTP synchronization backed by Turso. The game is turn based, so short polling gives deterministic recovery without requiring a permanently pinned function instance.

The browser and server now import the same canonical rules from `src/game-rules-v126.js`. Offline and online play therefore share move validation, piece inventory, win detection, skipped turns, and draw handling. Online adds only transport, identity, room lifecycle, and round scoring.

## Trust boundary

The browser may request a move. It cannot decide:

- whose turn it is;
- whether a slot is occupied;
- whether the move wins;
- which room version is current;
- whether a round or rematch starts.

`api/rooms-v126.js` validates those decisions through the shared rules and applies updates with compare-and-swap semantics.

## Named-room protocol

- Public waiting rooms are discoverable through the room list; players do not type a six-character code.
- The host gives the room a Unicode name of 2–32 characters and chooses two, three, or four seats.
- Recent room names remain only in that browser's `localStorage` and appear as suggestions on future creation forms.
- A random internal room identifier still provides stable API addressing and optional direct invitation links, but it is not part of the normal user flow.
- Session tokens contain 256 random bits, are returned once, stored in `sessionStorage`, and SHA-256 hashed before database storage.
- Seats are stable protocol identifiers (`p1` through `p4`); every player chooses one remaining color.
- Public list and preview responses expose room name, capacity, occupied colors, round settings, and public seat labels. They never expose authentication hashes or session tokens.
- A room starts automatically when its declared capacity is full.
- State version increments after every accepted join, leave, move, round transition, or rematch action.

Moves use a compare-and-swap update:

```sql
UPDATE room
SET state = ?, version = version + 1
WHERE room_code = ? AND version = ?
```

If another request reached the server first, the stale update affects zero rows and returns a conflict. The client reloads authoritative state instead of replaying the move.

## Round and rematch lifecycle

- A completed board immediately becomes a visible round result rather than disappearing behind the hidden legacy dialog.
- Scores, round number, winner, and match result live in authoritative room state.
- The room owner starts the next round or a full rematch; other players see an explicit waiting state.
- A full rematch resets board, scores, round number, winner, turn, and readiness together.
- The same player-oriented camera and the same board input bridge are used online and offline.

## Recovery

- GET returns 204 when the client already has the current version.
- Polling begins at 0.9 seconds and backs off to at most eight seconds after errors.
- Hidden tabs poll no faster than every four seconds.
- Returning to the tab or regaining network triggers an immediate refresh.
- Every request is aborted after 6.5 seconds.
- Reload restores only that browser tab's seat from `sessionStorage`.
- The room browser reports service failures in place and stays navigable instead of freezing.

## Security and privacy

- No accounts, chat, analytics, or personal information are required.
- Same-origin API only; no wildcard CORS.
- JSON bodies are capped at 8 KB.
- Room identifiers, names, actions, colors, and token formats are validated.
- The server validates turn ownership, destination vacancy, the three-piece inventory limit for every size, wins, skipped players with no legal move, draws, round progression, and rematches.
- Responses use `no-store`, `nosniff`, and `no-referrer`.
- Server logs never print session tokens.

## Operational boundary

The protocol intentionally keeps polling for this release. WebSockets can be reconsidered only when measured concurrency or latency justifies another durable coordination service and its reconnection complexity.
