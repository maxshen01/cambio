# MVP

## Product goal and audience

Provide a functional online Cambio game for four friends using desktop browsers, reachable through a shared link across the UK. Prioritize correct card rules, private information, and real-time play over UI polish or hosting complexity.

## Scope and exclusions

- Exactly four players, one shared game room, and one round per game; show final scores and winners, then finish.
- Join by shared link without accounts or matchmaking.
- Real-time updates via WebSockets. The server owns all hidden card data and independently validates every action, even when the UI also prevents invalid actions.
- A bare-basics, functional UI with card images showing suit/rank rather than plain text.
- No reconnection or session resume, no turn timer, and no mobile-browser requirement.
- No database, stored accounts, or persistent statistics.

## Product acceptance criteria

- Four players can join, ready for a deal, privately memorize their opening cards, and complete one round according to [Game Rules](Game%20Rules.md), including powers, matching, rule-defined penalties, Cambio, scoring, and ties.
- Each player sees only the information authorized for them; all clients receive consistent outcomes from server-validated actions.
- Final hands, scores, and winners are shown and the completed round remains final.
- Automated rules-engine checks and a complete manual playtest with friends validate the game. [Test Scenarios](Test%20Scenarios.md#mvp-acceptance) defines the release validation method, including representative integration scenarios and manual hosted play across UK connections.

These are acceptance requirements for the intended MVP. See the [root README](../README.md) for current implementation capabilities, limitations, and coverage.

## Specifications

- [Game Rules](Game%20Rules.md): setup and memorization, turns, card values and powers, matching and penalties, Cambio, scoring, and lifecycle rules.
- [Game Data Model](Game%20Data%20Model.md): state ownership, fields, and invariants.
- [Events Contract](Events%20Contract.md): event payloads, errors, recipient visibility, and ordering.
- [UI Rules](designs/UI%20Rules.md): layout, controls, and feedback.
- [Test Scenarios](Test%20Scenarios.md): acceptance scenarios and validation.
- [Development](../code/Development.md): stack, setup, commands, and diagnostics.
