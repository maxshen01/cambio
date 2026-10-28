# Cambio — UI Rules

This document owns layout, controls, feedback, animations, accessibility, and screen transitions. [Game Rules](../Game%20Rules.md) owns gameplay eligibility and card visibility policy; [Events Contract](../Events%20Contract.md) owns payloads, errors, recipient redaction, and ordering. Use those specifications for detailed predicates and schemas rather than duplicating them here.

[Start Screen.png](Start%20Screen.png), [Playing Screen.png](Playing%20Screen.png), and [User Power Screen.png](User%20Power%20Screen.png) are illustrative sketches. Written layout rules below supersede any player-specific drawn-card positions in those images. Blue circles represent players, filled red rectangles stand for card graphics, purple represents the deck, and yellow the discard pile.

These are the intended screens for the complete one-round game. See the [root README](../../README.md) for current implementation capabilities, limitations, and coverage.

## Lobby

### Joining the lobby

- If the initial connection fails, offer **Retry connection**. If an established connection is lost, require **Reload to rejoin**; automatic reconnection and session resume are not supported.
- Opening the shared link shows a name-entry prompt over the start screen. Normalize and validate the entered name before submitting it, following the [join name rules](../Events%20Contract.md#joinroom). The client must not send `ready` before `joinRoom` succeeds.
- Keep **Ready Up** visible but disabled while the name is empty, the join request is pending, or the server has not accepted the join. A successful join acknowledgement supplies the player's `playerId` and `seatId`; `playerJoined` then supplies the lobby seats.
- Server name validation and uniqueness follow the [join contract](../Events%20Contract.md#joinroom). If the server rejects the join with `INVALID_NAME`, `ROOM_FULL`, or `GAME_ALREADY_STARTED`, show the error and leave the player unjoined with Ready Up disabled. Clear an `INVALID_NAME` error as soon as the name input changes, and do not show a late rejection for an earlier input value. Keep other server errors visible during edits. Disable browser autocomplete and spelling suggestions for the name input while retaining the format hint. A rejected name can be corrected and submitted again. The server remains responsible for validating names and seats.

### Seats and readiness

- The four blue circles are seat positions. Show a joined player's name beside their seat. Leave an empty seat without a readiness mark.
- Seat the local player at the bottom of the screen. During a four-player game, rotate the other positions around them using the server-supplied seat order: the next player in the array sits on the left, the player after that sits at the top, and the preceding player sits on the right. Wrap from the end of the array to its start. This makes turns move clockwise on screen: bottom → left → top → right → bottom. For example, with `[player1, player3, player2, player4]`, player2 sees player4 on the left, player1 at the top, and player3 on the right.
- Use the same relative seating arrangement on the playing and results screens. In a partly filled lobby, use `seatId` order to reserve all four positions relative to the local player's seat; leave vacant seats empty rather than shifting joined players into them.
- A red cross beside a seated player means they are not ready. A green tick means they are ready. Use `LobbyView` from `playerJoined` and `playerDisconnected`, plus `playerReady` and `playerUnready`, to update these marks. Do not infer another player's readiness from their local button state.
- In the undealt lobby, enable **Ready Up** for a joined player who has not yet readied, even if fewer than four players have joined. Clicking it sends `ready` once. After `playerReady`, show **Unready** and allow the player to send `unready` while fewer than four players are ready. Disable the button during either request and while all four are ready. Update marks only from server events. If the server rejects either request, show the `error` and restore the button only if the player is still eligible.
- When a player leaves before the deal, clear that seat and its mark while preserving the remaining players' ready marks supplied by the server. If a deal is cancelled during memorization or a match is aborted, return to this lobby view using the supplied lobby state and readiness marks.
- After the fourth lobby `playerReady`, `dealComplete` moves everyone to the [memorization screen](#memorization) to memorize their opening cards. That screen reuses **Ready Up** for the separate memorization confirmation.

## Memorization

- Keep **Call Cambio** visible and disabled during memorization. Use the same board and reserved shared drawn-card area described [below](#board-and-cards).
- `dealComplete` resets readiness and starts memorization. Enable the same **Ready Up** button again for each player to confirm they have memorized their two revealed cards. When a player presses it, disable their button while pending. Hide their two opening card faces only after their `playerReady` confirmation, removing the face IDs from display state. A rejected Ready preserves the faces and allows retry. Keep Ready Up disabled after acceptance and do not offer Unready during memorization. The first `turnChanged` starts play after all four confirmations, removes any remaining opening face IDs, and highlights the current player. Hide setup readiness marks during play. Keep **Ready Up** visible and disabled; **Call Cambio** and draw controls follow the gameplay eligibility rules below.

Opening-card visibility and readiness eligibility follow [setup and memorization](../Game%20Rules.md#setup-and-memorization). Event order, readiness reset, and recipient-specific opening payloads follow [setup events](../Events%20Contract.md#setup--deal-events).

## Gameplay

### Board and cards

- Each blue circle represents a player. Show that player's name beside it. Put a visible border around the player whose turn it is, using `turnChanged` to move the border. Remove the turn border when no player holds the turn, including the final matching window and the result screen.
- A filled red rectangle is an occupied hand slot. Empty slots are invisible: do not render the sketch's hollow outlines or any visible placeholder. Reserve layout space for all eight slots so adding a card does not shift the board. Hand slot IDs are per player: `1` above `2`, `3` above `4`, then `5` above `6` and `7` above `8`. Keep an occupied card in its assigned slot until the server removes or replaces it. New cards fill the lowest vacant slot ID reported by the server.
- Use exactly one shared drawn-card area, centered below the deck and discard piles. Keep the deck and discard in their existing order in the first row of a two-column grid; center the drawn card across both columns in the second row, with a 12px vertical gap and the existing card dimensions and horizontal spacing. Keep the shared card upright for every viewer, regardless of seating rotation. It is empty until `cardDrawn` and clears when the card is swapped or discarded. Reserve its space during memorization and whenever empty, with no outline, card image, label, or interaction; hide the empty area from assistive technology. Ownership, privacy, and exclusion from the hand limit follow [draw-resolution rules](../Game%20Rules.md#turns-and-draw-resolution); the [drawn-card view](../Events%20Contract.md#server-to-frontend) identifies the owner without a hand-slot ID.
- The purple pile is the facedown deck. The yellow pile is the discard pile; show its top card face when present. An empty discard pile is invisible with its layout space reserved. Do not show either pile's card count.
- Filled red rectangles are placeholders for card graphics. Display a face only when an event reveals it to this client. Opening-card display follows [memorization](#memorization). Other hand cards stay facedown except for temporary peeks, match flips, and the final reveal.

### Turns and Cambio

- Keep **Ready Up** and **Call Cambio** visible on the playing screen and disabled whenever their actions are unavailable; a disabled button sends no event. Enable Call Cambio according to [calling eligibility](../Game%20Rules.md#cambio-final-grace-and-scoring) and the [call contract](../Events%20Contract.md#callcambio). A call leaves the current turn controls available for unfinished work. Disable Call Cambio after successful `cambioCalled` and throughout `finalRound`.

### Drawing and resolving a card

- Only the current player may click a pile, and only while their turn is awaiting its one draw. Disable the discard pile when it is empty, including on the first turn. A successful `drawCard` displays `cardDrawn` in the shared area below both piles and disables both piles for the rest of that turn.
- Display the pending card according to recipient-specific [cardDrawn visibility](../Events%20Contract.md#carddrawn), and apply later [power-card reveals](../Events%20Contract.md#powercardrevealed). Never infer another player's private face.
- While a drawn card awaits resolution, clicking the current player's occupied hand slot sends `swapDrawnCard` for that slot. This works for either draw source. The replacement hand card becomes facedown, the displaced card becomes the visible discard top, and the shared drawn-card area clears.
- Only the drawer may click the shared drawn card to send `discardDrawnCard`, and only while awaiting drawn-card resolution and if it came from the deck. For a discard draw, disable direct discard and require selection of a replacement hand slot. Other players cannot act on the shared card. These controls follow [draw-resolution eligibility](../Game%20Rules.md#turns-and-draw-resolution) and the [discard contract](../Events%20Contract.md#discarddrawncard).
- If the discarded deck-drawn card has a power, keep it in the shared drawn-card area while the player uses or skips that power. Show a simple prompt for the permitted peek or swap targets and a **Don't use** action when the current power stage allows it. The server discards the held card when the power ends; then clear the shared drawn-card area. Matching is unavailable throughout power resolution.
- After `powerPeekResult` for a 7–10 or black queen/king, show the authorized peeked faces only to the power user and keep them visible with a **Done** button. Do not close the peek on a timer. Done hides the peek and sends `finishPowerPeek`. For a 7–10, wait for `discardPileUpdated` and turn advancement. For a black queen/king, then show the swap-or-skip controls; neither choice is available before Done. Other players see which slots were targeted but never their faces.

### Power and gift prompts

- [User Power Screen.png](User%20Power%20Screen.png) illustrates the power user's view after `powerAvailable`: the green card marks the held power card; render that card in the shared area below the piles, with **Use** and **Don't use** below it. A grey toast-style panel in the bottom-left explains the available power in plain language. Keep that description visible while the player makes the power choice. The green treatment is a highlight, not a new card type or permission for other players to see the card face.
- **Use** starts selection of the legal target or targets for that power. Send `usePower` only once the required targets are selected; until then, selected cards keep their lit outlines and do not flip. **Don't use** sends `skipPower` while the power is still at `"awaitingChoice"`. After a black queen/king peek is finished with **Done**, offer swap-target selection or **Don't use** for the optional swap. During `"awaitingPeekDone"`, show **Done** instead of Use/Don't use.
- A required gift after `matchResult` with `giftRequired: true` uses the same prompt style: replace the power controls with an instruction to choose a card, show the matcher a bottom-left toast naming the recipient, and highlight selectable cards in the matcher's own hand. Selecting one sends `chooseCardToGive`; keep its outline lit while the choice is pending. The gift is mandatory when prompted, so do not offer **Don't use** or Skip. Matching remains available during this prompt through the separate **Match** mode described [below](#clicking-hand-cards).
- Close the power or gift description when its choice resolves, and restore it if a rejected action leaves the choice pending. Keep error and warning toasts readable without covering the active instruction.

### Clicking hand cards

- A hand-card click has the current action's meaning: the drawer's own occupied slot is a swap target while resolving a drawn card; a power prompt selects only legal targets for that power; a gift prompt lets the matcher choose an occupied card from their own hand to give to the matched opponent.
- Otherwise, clicking any player's occupied hand card sends `attemptMatch` when matching is allowed and a discard top exists. Matching remains available during ordinary turn steps and while a gift choice is pending, even though turn actions wait for the gift. When a player's own hand click would select a swap or gift, provide a simple **Match** mode so they can still attempt a legal match on their own card; opponent cards can be clicked to match as usual. Leave Match mode when the pending choice resolves.
- Follow [power eligibility](../Game%20Rules.md#card-values-and-powers), [matching rules](../Game%20Rules.md#matching-gifts-and-penalties), and [Cambio protection and final grace](../Game%20Rules.md#cambio-final-grace-and-scoring). Payloads and rejection mappings belong to [power](../Events%20Contract.md#power-events) and [matching events](../Events%20Contract.md#matching-events). Disable empty slots and repeated clicks on a card during its local flip animation. A wrong match adds a facedown penalty card through `penaltyCardDrawn`.

## Results

- Hide the green match-results popup before the round ends. Lobby readiness is shown by the ticks and crosses beside the seats; no scores are available in the lobby.
- At `roundOver`, open the green match-results popup using the final `GameStateView.winners` and `scores` to show the winner or joint winners and every player's final score. Keep player names attached to their seats and hide the lobby readiness marks. The result is terminal for this one-round MVP: **Ready Up** stays visible but disabled, and no restart or new deal is offered.
- A later `playerDisconnected` updates that seat's connection indicator without clearing the final results. Do not replace the result with a new lobby.

Scoring, tie breaks, and terminal-round policy follow [Cambio and scoring](../Game%20Rules.md#cambio-final-grace-and-scoring); final payloads and ordering follow [roundOver](../Events%20Contract.md#roundover) and [gameOver](../Events%20Contract.md#gameover). The sketch's green central box is this results popup, never a lobby score panel.

## Shared feedback and accessibility

### Dialogs, inputs, and controls

- The opening name dialog is non-dismissible until joining succeeds; keep the underlying board inert and expose a labelled modal dialog to assistive technology. Initially focus the name input. Tab and Shift+Tab wrap among enabled controls inside the dialog rather than reaching the board.
- Keep keyboard focus inside the lost-connection dialog as well. Focus **Reload to rejoin** after an established connection is lost; disable the name input and let both Tab directions remain on the available dialog controls. Connection status is readable as status feedback; validation and server errors are exposed as alerts.
- Retain the visible name-format hint and associate it with the input. Disable autocomplete and spelling suggestions as specified [above](#joining-the-lobby).
- Pending requests disable their action controls until confirmed or rejected. Show eligibility and readiness from server-confirmed state; do not treat a click as acceptance. Rejections preserve the authorized board and restore a control or prompt only if it remains available.
- Empty hand slots cannot be clicked. Empty pile/shared-card areas reserve their layout space without visible placeholders; keep the empty shared drawn-card area hidden from assistive technology as specified [above](#board-and-cards).

### Visual feedback and animations

- Hovering over a card that can be clicked for the current action lights its outline. Clicking a card to select a gift or power target keeps that outline lit while the choice is pending. Selection itself does not flip or reveal the card. Clear the selection when the action resolves or the server rejects it with `error`; for a multi-card power choice, keep each selected outline until the full choice resolves or is rejected.
- Clicking a hand card to attempt a match starts a brief flip animation. The client may animate the facedown side immediately, but shows the face only after `flipCard` supplies its `cardId`. `matchResult` arrives without waiting for the animation: use its `whoFlipped` value to briefly mark the player who attempted the match, then show the result. Return an occupied card to facedown after the flip; remove a card only for a winning result. A rejected attempt gets no `flipCard` and must not reveal a face.
- Animate a successful `cardDrawn` moving from the chosen pile into the shared drawn-card area below the piles. Animate `discardPileUpdated` moving a card out of the pile after a discard draw or into the pile after a discard. Animate `cardSwapped` moving the affected cards between the shared drawn-card area and hand or between two hand slots, with hand cards facedown unless an event authorizes a reveal. Keep these movements simple and brief.
- Apply server events to the card layout as they arrive, even if a local animation is still running. Animations never delay sending an action, processing a result, advancing the turn, or ending the final matching window.

### Feedback and state changes

- Show `error` messages and warnings such as `handLimitWarning` as temporary toasts in the bottom-left corner. Keep the current card layout after a rejected action.
- Update occupied and empty slots from `matchResult`, `cardGiven`, and `penaltyCardDrawn`; use the slot IDs in those events rather than assigning new IDs in the browser. Clear temporary match flips after their local animation and power peeks when Done is clicked. Clear prompts and the shared drawn-card area when the corresponding resolution finishes. Keep that card present through power resolution, including while a black queen/king awaits swap or skip. A pile update following a discard draw only changes the pile top and must retain the newly drawn card. Clear the shared area on reset or connection loss, and replace it from the single `GameStateView.drawnCard` when applying a snapshot.
- After `finalMatchGraceStarted`, disable turn controls and retain matching only for the server-timed window. At `roundOver`, reveal every hand and show scores and winners.

Connection-loss, setup-cancellation, abort, and final-result transitions follow the [disconnect lifecycle](../Game%20Rules.md#disconnect-and-abort-lifecycle) and [connection events](../Events%20Contract.md#connection--lobby-events). Preserve server-supplied seats and readiness when returning to the lobby; a completed result remains on screen after a later disconnect.
