# v113 Online and Mobile Baseline

Date: 2026-07-24

## Verified source of truth

- Repository: `A7SNcom/yakolak`
- Default branch head: `01ee4c6372a71d40f667740abfbd263ac301b0bf`
- Production version: `v113-first-move-breathing-room`
- Production deployment: `dpl_J1Ucdzn2nsBxsywLpy9HAXFcFQz9`
- Production URL: `https://yakolak.vercel.app`
- Vercel state: `READY`
- Grouped runtime errors in the checked window: none

## Online baseline

The production runtime has no room, invite, network synchronization, remote
identity, or authoritative move endpoint. Existing files named
`multiplayer-restart` verify three- and four-seat local games against bots.
They are not online multiplayer tests.

The existing Turso connection is usable by Vercel Functions. The published
calibration endpoint returned `storage: fallback` with
`reason: record_not_created`, which means the database connection is present
but no custom calibration record has been written.

## Mobile visual baseline

Production was inspected at 390x844 portrait:

- the document and canvas matched the viewport without overflow;
- the table column occupied most of the lower viewport;
- the playable pieces were small relative to the available screen;
- the table, room, and board were dominated by closely related gray values;
- the camera framed the whole table object rather than prioritizing the play
  surface;
- canvas DPR was 1 in the test browser; production code caps real mobile DPR at
  1.15 on high-quality devices and 0.9 on low-quality devices.

Player-facing problem:

> On a phone, the room and table consume attention and pixels while the pieces
> that matter to the decision remain comparatively small and low-contrast.

## Highest-risk online failure modes

1. Two clients submitting a move from the same room version.
2. A client moving when it is not their turn.
3. A client editing board state locally.
4. A room token leaking through an invitation URL or server logs.
5. A reload losing the player seat.
6. A transient network failure producing duplicate moves.
7. A stale client overwriting a newer room state.
8. A Vercel Function instance change losing in-memory room state.

## Controlled release scope

v114 introduces a two-player online foundation only:

- durable Turso room state;
- server-authoritative move and winner validation;
- optimistic concurrency through room versions;
- random bearer tokens stored per tab in `sessionStorage`;
- invitation URLs containing only the room code;
- bounded polling with request timeouts and reconnection;
- two-party rematch confirmation;
- a mobile camera preset that prioritizes the play surface;
- a bounded DPR increase and restrained table/board contrast adjustment.

Four-player online, accounts, matchmaking, chat, spectators, rankings, and
voice are deliberately excluded.
