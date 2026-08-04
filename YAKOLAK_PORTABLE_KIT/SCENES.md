# Required Scenes and States

Every row must be enterable and previewable. Names may differ internally; behavior may not.

| ID | Visible state | Enter | Leave / result |
|---|---|---|---|
| boot | renderer, rules, storage initialization | app launch | loading or error |
| loading | bouncing star and hidden progress text | assets pending | loader handoff |
| loading-error | clear failure and retry | fatal boot failure | clean reload |
| loader-handoff | loader visually becomes wall star | first room frame ready | room reveal |
| room-reveal | camera exposes room and table | loader released | menu/brand wall |
| brand-wall | official Yakolak and MTKYF marks | selected entry route | menu wall |
| menu-wall | online, computer, learn | entry complete | route selection |
| route-selection | selected row, locked input, camera travel | first accepted choice | destination route |
| how-to | three win explanations | learn selected | local color setup |
| setup-color | available physical color sets | local/online setup | setup exit |
| setup-player-count | 2, 3, or 4-player rows | local color selected | setup exit |
| setup-round-count | 3 or 5 online rounds | online host creates room | request pending |
| setup-exit | current choices shrink and leave table | setup choice accepted | next setup/game state |
| online-home | create room or enter code | online selected | code/setup/request |
| online-code | six-character code input | join selected | preview/request/error |
| network-pending | create, join, move, rematch request | request sent | response/error |
| network-error | validation, timeout, or server message | request rejected | retry/back/resync |
| online-lobby | room code, roster, empty seats | room waiting | playing/cancelled |
| online-start | board rebuilt from server state | room becomes full | playing turn |
| unboxing | lid, bases, and 36 pieces assemble | local setup complete | tutorial/round |
| tutorial-same-size | first scripted win | tutorial begins | confirm/repeat |
| tutorial-graded | second scripted win | first confirmed | confirm/repeat |
| tutorial-cell | third scripted win | second confirmed | confirm/repeat |
| guided-first-turn | real human move, timer paused | tutorials complete | first accepted move |
| round-ready | empty board, active bases, pieces home | reset complete | turn start |
| turn-start | current player and local timer | playable player chosen | human/bot/skip |
| stack-open | remaining sizes rise from one home stack | human selects stack | size selected/close |
| size-selected | one size active; legal cells shown | size chosen | move/close/drag |
| dragging | selected piece follows pointer above table | drag begins | valid or invalid drop |
| invalid-drop | red/invalid feedback and return | illegal or missed drop | previous selection |
| move-commit | one authoritative validation | legal target requested | accepted/rejected |
| piece-travel | committed piece arcs to slot | move accepted | last move/win/turn |
| last-move | latest move marker for each color | piece arrives/state sync | replace/reset |
| bot-thinking | bot caption and locked input | bot turn | bot move/skip |
| local-timeout | expired local turn message | timer reaches zero | turn handoff |
| no-move-skip | blocked player is skipped | no legal move | next player/draw |
| turn-handoff | tray closes; next player/timer updates | move or skip complete | turn start |
| conflict-resync | remote revision won the race | version conflict | authoritative rebuild |
| reconnecting | room retained while network recovers | polling/request failure | synced/cancelled |
| win-highlight | only winning pieces blink/glow | victory detected | score award |
| score-award | one persistent point appears | highlight complete | round reset |
| draw | no legal move for anyone | draw detected | round reset |
| round-reset | active pieces return home together | win/draw/rematch | round ready |
| online-match-end | final standings after 3/5 rounds | target rounds complete | rematch/exit |
| rematch-wait | each seat's ready state | rematch requested | new round/match |
| cancelled | player left or host cancelled | room cancelled | menu/exit |
| resize-refit | current scene camera recomputed | viewport/orientation change | same state |
| resume-sync | online state checked before input | app/tab resumes | prior authoritative state |
| reduced-motion | shortened equivalent of any transition | accessibility preference | same exact final state |

Input is locked during route travel, setup exit, intro, scripted tutorial movement, move commit/travel, bot thinking, network pending, win, score award, and round reset.
