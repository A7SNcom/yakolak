# Yakolak AI Design

## Player-facing contract

The computer opponent must be legal, understandable, responsive, varied, and fair. It must never read hidden information, bypass turn rules, or freeze rendering while thinking.

## Required decision order

1. Enumerate legal moves only.
2. Take a direct win when appropriate for the selected difficulty.
3. Block an immediate opponent win according to difficulty policy.
4. Evaluate future threats, board control, and strategic flexibility.
5. Select among near-equal moves with controlled variation.
6. Return a move within the level's response-time budget.

## Architecture direction

- Keep move generation and rule evaluation pure and independent from rendering.
- Make difficulty a configuration object, not scattered conditions.
- Tokenize or cancel AI work when restarting or leaving a round.
- Move expensive search to a Worker if profiling shows main-thread stalls.
- Cache repeated board evaluations only after correctness tests exist.

## Required automated scenarios

- AI takes a direct win.
- AI blocks a direct loss.
- AI never returns an illegal move.
- AI returns no move safely when none exists.
- Restart cancels stale AI work.
- Turn advances exactly once.
- Repeated board states do not hang.
- Response time stays bounded on a mobile-quality profile.

## Perceived fairness

Thinking delay should be short and variable enough to communicate deliberation, but it must not be used to disguise a frozen interface. The board and UI must remain responsive during computation.
