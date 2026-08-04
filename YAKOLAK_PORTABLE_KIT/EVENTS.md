# Engine-Neutral Events

Events describe intent and results; they do not prescribe classes, functions, or a language.

## Rules

- Every accepted move has one unique ID and one authoritative result.
- Result events are safe to apply again without duplicating score, inventory, or movement.
- Presentation events may move visuals but never write board slots.
- Online clients emit requests; only server results commit state.
- A full state snapshot always overrides stale presentation.

## Required events

| Event | Minimum data | Purpose |
|---|---|---|
| AppReady | asset/version status | leave boot |
| LoadFailed | reason | show retry |
| RouteChosen | online/computer/learn | lock menu and travel |
| ColorChosen | color | advance setup |
| PlayerCountChosen | 2/3/4 | configure seats |
| RoundCountChosen | 3/5 | configure online match |
| IntroStarted / IntroFinished | round/setup identity | control unboxing |
| TutorialStepStarted / Confirmed / Repeated | win type | tutorial flow |
| RoundStarted | round, players, starter | reset turn state |
| TurnStarted | player, optional deadline | enable valid input |
| StackOpened / Closed | color, stack | tray presentation |
| SizeSelected | color, size | calculate legal cells |
| MoveRequested | move ID, color, size, cell, revision | ask validator/server |
| MoveRejected | move ID, reason, latest state | feedback/resync |
| MoveAccepted | move ID, committed state, last move | begin piece travel |
| PieceArrived | move ID | finish presentation |
| TurnExpired | player | local skip |
| PlayerSkipped | player, reason | no-legal-move flow |
| WinnerFound | type, exact cells | lock and highlight |
| ScoreAdded | color/seat, new score | create score marker once |
| DrawFound | round | draw presentation |
| RoundResetStarted / Finished | round | return pieces and restart |
| MatchFinished | rounds, scores, winner/tie | online final state |
| RoomCreated / Joined | code, seat, color, token | online identity |
| RoomUpdated | revision, full room state | authoritative sync |
| RequestTimedOut | action | network feedback |
| RevisionConflict | latest snapshot | discard stale pending state |
| Reconnecting / Reconnected | code, revision | lock and restore |
| PlayerLeft / RoomCancelled | seat, status | stop play |
| RematchRequested / Ready | seat readiness | next round/match |
| ViewportChanged | size, orientation, reduced motion | refit current scene |
| AppResumed | last known room/revision | resync before input |
