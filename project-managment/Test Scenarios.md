# Cambio — Test Scenarios

## Purpose and method

Representative acceptance sequences link to [Game Rules](Game%20Rules.md), [Game Data Model](Game%20Data%20Model.md), [Events Contract](Events%20Contract.md), and [UI Rules](designs/UI%20Rules.md). Detailed rules, payload schemas, error mappings, and visibility definitions stay in those documents.

Run socket integration scenarios against the real Node server with four programmatic clients P1–P4 in seat order. Control deck order, shuffle, first-player choice, and server clock for reproducibility. Record each recipient's events in order and inspect authoritative state through fixtures where available. Rejections must preserve state, send only requester errors, and emit no success/reveal. Broadcasts reach all four unless stated otherwise; check each recipient's redaction using the [card-view contract](Events%20Contract.md#server-to-frontend), including hidden face-ID omission, hand slot IDs, and the drawn card's owner without a hand-slot ID.

See the [root README](../README.md#source-and-coverage-map) for current implementation capabilities, limitations, and scenario-to-test mappings.

Manual scenarios below require human validation; non-browser checks do not establish visual correctness. No automated browser suite or test of the reserved `gameState` event is required.

## Integration scenarios

### IT-01 — Join, deal, and begin play

- **Start:** An empty, undealt room. Configure a known deck and first player.
- **Actions:** P1–P4 each send `joinRoom`; before the fourth ready mark, P1 sends `ready`, `unready`, then `ready` again. The other players send `ready`. Once dealt, all four send `ready` again.
- **Expected:** Join acknowledgements precede their lobby updates; filling the fourth seat alone does not deal. Readiness and Unready update only the appropriate marks. The fourth lobby ready notice precedes one private deal per player, in seat/slot order, resetting readiness. Only each recipient's bottom two opening faces are exposed. Four new memorization confirmations then produce one first-turn notice for the chosen starter, entering active play awaiting a draw; no `gameState` is emitted.
- **Contract:** [Connection and lobby](Events%20Contract.md#connection--lobby-events) and [setup and deal](Events%20Contract.md#setup--deal-events).

### IT-02 — Private deck draw through turn completion

- **Start:** An active turn awaiting a draw, with a known non-power card on top of the deck.
- **Actions:** The turn holder draws from the deck, attempts a second draw before resolving the first, then sends `discardDrawnCard`.
- **Expected:** The drawer alone receives the deck-drawn face; all four receive the pending card in the single shared area. A second draw is rejected privately with `DRAW_NOT_AVAILABLE` and no changes. Discard-pile update precedes exactly one turn advancement; the new top is eligible, pending card/source/reveal state clears, and the shared area empties.
- **Contract:** [Turn and draw](Events%20Contract.md#turn--draw-events) and [resolve drawn card](Events%20Contract.md#resolve-drawn-card-events).

### IT-03 — Public discard draw must be swapped

- **Start:** An active turn awaiting a draw, with a known discard top and at least one older discard card.
- **Actions:** The turn holder draws from discard, tries `discardDrawnCard`, then swaps the drawn card into one of their occupied hand slots.
- **Expected:** All four receive the public draw before the older-top pile update; the pending shared card survives that update. The exposed older top is ineligible. Direct discard is rejected privately with `MUST_SWAP_DISCARD_DRAW`, leaving the draw pending. A valid drawn swap precedes the displaced-card pile update and turn change. The replacement is facedown, the displaced card becomes eligible, pending display clears, and neither card activates a power.
- **Contract:** [Turn and draw](Events%20Contract.md#turn--draw-events) and [resolve drawn card](Events%20Contract.md#resolve-drawn-card-events).

### IT-04 — Peek power remains private until Done

- **Start:** The turn holder has drawn a known 7 or 8 from the deck and has a valid own-hand peek target. The current discard top is known.
- **Actions:** The player sends `discardDrawnCard`, then `usePower` on the target. Before sending `finishPowerPeek`, another player attempts a match. The power user then sends `finishPowerPeek`.
- **Expected:** Power resolution is announced to all and the prompt goes only to its user, with no initial discard change. Valid use reveals the held power card to everyone before recipient-specific peek results; only the user receives the target face. The held card stays in the shared area while viewing. A concurrent match is rejected privately with `MATCH_NOT_AVAILABLE`, no flip or penalty. Done discards the held card before turn change, clears pending draw/power/display state, and re-enables matching.
- **Contract:** [Power events](Events%20Contract.md#power-events) and [matching events](Events%20Contract.md#matching-events).

### IT-05 — Peek then swap power completes in stages

- **Start:** The turn holder has drawn a known black queen from the deck. Configure a peek target and two legal swap slots owned by different players.
- **Actions:** Begin resolution with `discardDrawnCard`, use the peek, send `finishPowerPeek`, try an invalid same-player swap, then choose the legal pair.
- **Expected:** Resolution announcement and private power prompt precede public held-card reveal and recipient-specific peek results. Only the user sees the target face. Done enters `awaitingSwap` without discarding or advancing; the shared held card stays public. The same-player pair gets a private `SWAP_NOT_ALLOWED`, changes nothing, and leaves the choice available. The legal pair exchanges cards, then sends swap, held-card discard update, and turn change; swapped slots remain facedown without hidden face IDs.
- **Contract:** [Power events](Events%20Contract.md#power-events) and [resolve drawn card](Events%20Contract.md#resolve-drawn-card-events).

### IT-06 — Self-match, wrong match, and opponent match

- **Start:** Use separate controlled active-game fixtures with an eligible discard top and known hand ranks for each outcome. Ensure a matcher has a current card to give in the opponent case.
- **Actions:** In the three fixtures, send a correct self-match, a wrong match, and a correct match against another player's card; for the opponent win, follow with `chooseCardToGive`.
- **Expected:** Every accepted flip reveals its target to all and produces an immediate result without waiting for animation. A self-win removes its slot without a gift. A wrong flip retains the slot and adds one facedown deck penalty to the matcher. An opponent win immediately removes its target and requires a gift when the matcher has a card; gift notification precedes the opponent's automatic penalty. Both additions are facedown for every recipient.
- **Contract:** [Matching events](Events%20Contract.md#matching-events).

### IT-07 — Only the first correct match wins

- **Start:** Use a known eligible discard top with two matching cards in one player's hand, so the first win is a self-match without a pending gift. Use a separate fixture with an older card below the discard top.
- **Actions:** Submit two correct attempts in a controlled server-receipt order. In the separate fixture, draw the discard top and attempt a match against the newly exposed older top.
- **Expected:** Both accepted attempts reveal and report results, but only the first is `won` and removes a slot; the second is `sameRankNoEffect`, with no further removal, gift, or penalty. A discard draw is public before its pile update; a flip against the exposed older top is `ineligible` and causes no removal, gift, or penalty. Receipt order decides the result; there is no server repeat-click cooldown.
- **Contract:** [Turn and draw](Events%20Contract.md#turn--draw-events) and [matching events](Events%20Contract.md#matching-events).

### IT-08 — Pending gift pauses turn actions but permits matches

- **Start:** An active turn is awaiting a draw. A different player can win an opponent match against the eligible discard. Give the recipient a known vacant slot after the winning removal, and give the matcher a card to gift.
- **Actions:** Win the opponent match, try to draw with the current turn holder while the gift is pending, submit a known wrong match attempt from a different player who can receive its penalty, then choose a valid gift.
- **Expected:** The winning flip/result is immediate and only the matcher has a gift choice. Drawing during settlement is rejected privately with `MATCH_RESOLVING`, with no draw or turn change. The additional wrong attempt resolves and incurs its own penalty without consuming the gift. Gift then automatic penalty use the recipient's then-lowest and next-lowest vacancies, both facedown for all. Settlement clears and the interrupted turn still awaits its draw.
- **Contract:** [Matching events](Events%20Contract.md#matching-events) and [turn and draw](Events%20Contract.md#turn--draw-events).

### IT-09 — Call Cambio through final result

- **Start:** An active turn with known hands, deck order, and first player. Use a known scoring fixture, including a red queen or king and a joker, whose expected scores and winner are calculated before the test.
- **Actions:** The current player calls Cambio before finishing their turn. Complete that turn, then complete one turn for each other player in clockwise order. Advance the controlled clock past the grace deadline without a pending gift.
- **Expected:** Cambio is announced immediately without clearing the current turn or pending work. Completing it starts the other three players' final turns clockwise; the caller gets none. After the third, a 1000ms final grace starts instead of another turn notice. At expiry, fully revealed hands, scores, and seat-ordered winners arrive in `roundOver`, followed by identical winner IDs in `gameOver`. Turn/pending state clears and the result is terminal.
- **Contract:** [Cambio and endgame](Events%20Contract.md#cambio--endgame-events) and [shared GameStateView](Events%20Contract.md#server-to-frontend).

### IT-10 — Accepted match settles after the grace deadline

- **Start:** The third final turn has ended and `finalMatchGraceStarted` has reached all four. The discard top is eligible. A non-turn player can correctly match an opponent's card and has a card to give. Configure the next penalty card and expected final scores.
- **Actions:** Have the match request reach the server just before its deadline. Advance the clock past the deadline with the gift still pending. Send another match request after the deadline, then let the original matcher choose a valid gift.
- **Expected:** The accepted pre-deadline flip/result records its gift immediately. Deadline expiry produces no scoring while that gift waits. A late attempt gets requester-only `MATCH_NOT_AVAILABLE`, no flip or penalty. The original gift remains completable after expiry; gift then automatic penalty remain facedown to all, before round result and game-over messages. Scores include both additions; no new match is accepted after the deadline.
- **Contract:** [Matching events](Events%20Contract.md#matching-events) and [Cambio and endgame](Events%20Contract.md#cambio--endgame-events).

### IT-11 — Active-game disconnect aborts for everyone

- **Start:** Four players have entered `active` play and hold dealt cards.
- **Actions:** Disconnect P2. Have a replacement socket join the vacant seat, then ready the connected players for a fresh deal.
- **Expected:** Survivors receive departure before abort, identifying P2 and reason `PLAYER_DISCONNECTED`. The reset lobby preserves survivor seats and clears readiness; hands, piles, turn, pending state, and prior result are cleared. Replacement joins as a new unready player, and ordinary four-player readiness produces a fresh deal. No `gameState` is needed.
- **Contract:** [Connection and lobby](Events%20Contract.md#connection--lobby-events) and [setup and deal](Events%20Contract.md#setup--deal-events).

## Unit-test coverage

Use focused unit tests for power target rules/stages; scoring values, tie breaks, and joint winners; deck refill/shuffle placement; lowest-vacant-slot allocation and the eight-card limit; printed-rank matching/eligibility; and boundaries such as missing penalty cards, overflow, invalid actions, and exact grace-deadline comparison. Integration scenarios check representative sequences rather than every rule combination.

Keep capability-to-source/test mappings in the [root README](../README.md#source-and-coverage-map).

## Manual scenarios

All rows define manual acceptance checks for the intended game. Use the [root README](../README.md) to determine which behaviors are available to exercise. Non-browser tests do not establish visual correctness.

| Scenario | What to try | Expected outcome |
| --- | --- | --- |
| Setup, replacement deal, and first turn | Join in four tabs, ready all four to deal, inspect the center of the board, then confirm memorization. In a separate session, close one tab during memorization and deal again with a replacement. | Each player sees only their bottom two faces until their own Ready confirmation. Exactly one empty drawn-card area is reserved below both piles, with none beside individual hands and no overlap with hands or controls. Departure before activation clears the deal and permits replacement-seat redealing. Play starts only after the fourth memorization confirmation, with all hands facedown and the same starter bordered in all tabs. Ready Up stays disabled; Call Cambio and drawing follow the gameplay eligibility rules. |
| Complete desktop round | Four people join by shared link, ready twice, play, call Cambio, and finish the round. | Everyone can follow the turn and available choices; final hands, scores, and winners are correct and the round ends. |
| Visibility and powers | Compare four screens during memorization, a deck draw, a discard draw, and several powers. Check the shared area during peek, swap/skip, rejected actions, and connection loss. | Every viewer sees one upright drawn card below both piles, associated with its drawer. Only authorized players see private faces; discard draws and activated powers are public. Only the owner may act; the card remains through power resolution, clears on swap/completed discard/reset/loss, and a discard-draw pile update retains it. Peeks remain visible until Done. |
| Matching interaction | Try correct and wrong flips, a gift, and repeated clicking during a flip animation. | Removals, penalties, and the gift are understandable; the local flip interaction does not produce confusing duplicate clicks or reveals. |
| Hosted play | Complete a round with players on separate UK connections using desktop browsers. | The shared link works, updates arrive promptly enough to play, and all players reach the same final result. |
| Connection failure, retry, and loss | Start the frontend with the backend stopped, enter a name, then start the backend and retry. Join, then stop the backend while connected. | Initial failure offers Retry, preserves the entered name and socket, clears the connection error on retry, and prevents overlapping retries. Established loss clears membership/pending requests/private cards and requires Reload to rejoin; late responses cannot restore the session. |
| Join input and lobby controls | Enter/edit valid and invalid names; join in four tabs and toggle readiness before the room fills. | Autocomplete/spelling suggestions are off; rejected-name errors clear on edit without stale rejections. Ready/Unready labels and seat marks change on server confirmation. Other errors remain readable. |

Use [UI Rules](designs/UI%20Rules.md) for layout, controls, and visibility expectations, and [Development](../code/Development.md#running-locally) for startup and diagnostics. Fault injection belongs in automated tests rather than production debug controls. Current recovery test mappings are in the [root README](../README.md#source-and-coverage-map).

## MVP acceptance

The intended four-player playtest release requires IT-01–IT-11 and relevant unit tests to pass, plus a successful complete manual round. Record defects in chat or issues as authorized, fix them, and repeat affected scenarios before considering them passed. Manual hosted/UI checks complement socket tests; they do not require an automated browser suite. Use the [pre-merge gate](../code/Development.md#pre-merge-gate) for implementation checks and [MVP](MVP.md#product-acceptance-criteria) for product acceptance.
