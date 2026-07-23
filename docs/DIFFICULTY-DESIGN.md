# Yakolak Difficulty Design

## Goal

Keep the player between boredom and frustration while preserving perceived fairness.

## Difficulty dimensions

Difficulty levels must vary by:

- search depth,
- board evaluation quality,
- immediate win detection,
- immediate threat prevention,
- multi-turn planning,
- probability of choosing a good-but-not-best move,
- strategy variety,
- thinking delay,
- hint availability.

Thinking speed alone is not difficulty.

## Proposed levels

- **Beginner:** Always legal and understandable; sees direct wins and blocks obvious immediate losses, but often chooses a good alternative rather than the best move.
- **Easy:** Consistent one-turn tactics with limited setup planning.
- **Medium:** Reliable threat prevention and short combinations.
- **Advanced:** Deeper evaluation, stronger denial, and varied strategy.
- **Expert:** Highest practical search within mobile frame-time and response limits.

## Dynamic adjustment guardrails

- Never secretly change rules.
- Never grant hidden information.
- Do not create obvious intentional mistakes.
- After repeated losses, reduce evaluation depth or optimal-move probability slightly.
- After repeated wins, increase depth gradually.
- Expose a fixed difficulty option so players can disable adaptation.

## Tests

Every level must pass legality, direct-win, direct-block, restart, no-move, and bounded-response-time scenarios.
