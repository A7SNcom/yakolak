# Yakolak Online Architecture

## Decision

Yakolak v114 uses server-authoritative HTTP synchronization backed by Turso.
This is a turn-based board game, so a 1.2-second state check is simpler and more
predictable than maintaining a permanent socket for every room.

Vercel now supports WebSockets in Functions, but its official guidance states
that a connection is pinned only for its lifetime and future connections are
not guaranteed to reach the same Function instance. Durable cross-instance
state therefore still needs Redis or another shared store:

- https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections
- https://vercel.com/kb/guide/real-time-chat-websockets

The repository already has a Turso client and configured production
credentials. Reusing it avoids a second service and reduces operational
surface.

## Trust boundary

The browser may request a move. It cannot decide:

- whose turn it is;
- whether a slot is occupied;
- whether the move wins;
- which room version is current;
- whether a rematch starts.

`api/rooms.js` validates those decisions using `src/online-rules-v114.js`.

## Room protocol

- Room code: six unambiguous characters, safe to share.
- Session token: 256 random bits, returned once and stored in `sessionStorage`.
- Invitation URL: contains the room code only.
- Tokens are SHA-256 hashed before database storage.
- Room lifetime: eight hours, extended by accepted state changes.
- Initial release: exactly two seats, `host` and `guest`.
- State version: incremented after every accepted join, move, or rematch action.

Moves use a compare-and-swap update:

```sql
UPDATE room
SET state = ?, version = version + 1
WHERE room_code = ? AND version = ?
```

If another move reached the server first, the stale update affects zero rows
and returns a conflict. The client reloads authoritative state rather than
replaying the move.

## Recovery

- GET returns 204 when the client already has the current version.
- Poll interval begins at 1.2 seconds.
- Errors use exponential backoff capped at eight seconds.
- Hidden tabs poll no faster than every four seconds.
- Returning to the tab or regaining network triggers an immediate refresh.
- Each request is aborted after 6.5 seconds.
- A reload restores only that browser tab's seat from `sessionStorage`.

## Security and privacy

- No names, accounts, chat, analytics, or personal information.
- Same-origin API only; no wildcard CORS.
- JSON bodies are capped at 8 KB.
- Room and token formats are validated.
- Responses use `no-store`, `nosniff`, and `no-referrer`.
- Server logs never print session tokens.

## Known boundaries

- A room is not discoverable or match-made; players share a link.
- A closed tab is considered temporarily absent, not a resignation.
- v114 does not provide TURN timers online; network latency must not cost a
  player their turn.
- Polling is intentionally used for the first stable release. WebSockets can
  be reconsidered after real concurrency and latency measurements justify the
  additional Redis and reconnection complexity.
