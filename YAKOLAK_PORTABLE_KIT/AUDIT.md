# Audit Decisions

Reviewed again on 2026-08-04 against the repository, developer screen/database, production lineage, historical accepted snapshots, and v121–v130 branches.

## Accepted sources

- Current production presentation: v125 white-wall continuity.
- Portable rule baseline: v126 shared rules, especially skip/no-move draw handling.
- Online match rules: v118, including 3/5-round matches and authoritative scoring.
- Loading-star movement: v129.
- Loader-to-room camera continuity: v130, excluding placeholder content.
- Geometry and deterministic scatter: accepted v54/v58/v67 snapshots plus current production transforms.
- Current gameplay motions: core v085–v114 source used by production.

## Corrections made

- Local play is open-ended; online play ends after the host-selected 3 or 5 rounds.
- Current online play has no authoritative 18-second timer; that timer is local.
- A player with no legal move is skipped before declaring a draw.
- The room is generated geometry, not an absent asset.
- Production v125 and later motion references v126–v130 are clearly separated.
- Visual animations cannot mutate authoritative board state.

## Removed or rejected

- Historical wrapper/import architecture.
- Repeated explanations and implementation-language examples.
- Obsolete v54/v66 timings where production has newer accepted values.
- v130 sample-wall placeholder text.
- Old neon menu styling as a requirement.
- External marble-image dependency.
- Font dependency and framework-specific APIs.

## Developer-screen finding

The screen called “complete scenes” exposes only broad cards. It omits many required states: loader handoff, room reveal, route travel, setup exit, online pending/error, round count, lobby/rematch, tutorial repeat, tray open/close, drag, invalid drop, piece travel, last move, bot thinking, timeout, no-move skip, conflict/resync, reconnect, score award, draw/reset, match end, resize/resume, and reduced-motion variants.

Therefore the developer screen is a preview source, not the complete game contract. `SCENES.md` is the required inventory for a new implementation.
