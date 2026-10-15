# Playing screen rules

This document explains [Playing Screen.png](Playing%20Screen.png) and its [User Power Screen.png](User%20Power%20Screen.png) variation. The images are layout guides; the [Events Contract](../Events%20Contract.md) defines which actions the server accepts and what each player is allowed to see.

## Board and cards

- Each blue circle represents a player. Show that player's name beside it. Put a visible border around the player whose turn it is, using `turnChanged` to move the border. Remove the turn border when no player holds the turn, including the final matching window and the result screen.
- A filled red rectangle is an occupied hand slot. A hollow rectangle is an empty slot. Hand slot IDs are per player: `1` above `2`, `3` above `4`, then `5` above `6` and `7` above `8`. Keep an occupied card in its assigned slot until the server removes or replaces it. New cards fill the lowest vacant slot ID reported by the server.
- The separate position in front of each player is for their drawn card, represented by `handSlotId: 0`. It is empty until `cardDrawn` and clears when that card is swapped or discarded. It is not one of the eight hand slots.
- The purple pile is the facedown deck. The yellow pile is the discard pile; show its top card face when present. Do not show either pile's card count.
- Filled red rectangles are placeholders for card graphics. Display a face only when an event reveals it to this client. At `dealComplete`, each player sees only their own slots `2` and `4` face up until they press Ready again. Other hand cards stay facedown except for temporary peeks, match flips, and the final reveal.

## Memorization, turns, and Cambio

- The [start screen rules](startScreenRules.md) cover joining and Ready Up before the deal. On this screen, keep **Ready Up** and **Call Cambio** visible but disabled whenever the rules below do not allow them. A disabled button does not send an event.
- `dealComplete` resets readiness and starts memorization. Enable the same **Ready Up** button again for each player to confirm they have memorized their two revealed cards. When a player presses it, disable their button and hide their two opening card faces. After all four have pressed it, the first `turnChanged` starts play and Ready Up is disabled.
- Enable **Call Cambio** only for the current player during an unresolved `active` turn, if nobody has called Cambio and no card gift is pending. The player may call before drawing, after drawing, or during power resolution; calling does not end their current turn. Disable the button after a successful `cambioCalled` and throughout `finalRound`.

## Drawing and resolving a card

- Only the current player may click a pile, and only while their turn is awaiting its one draw. Disable the discard pile when it is empty, including on the first turn. A successful `drawCard` displays `cardDrawn` in that player's slot `0` and disables both piles for the rest of that turn.
- A card drawn from the deck is face up only to its drawer at first. A card drawn from the discard pile is face up to everyone. Follow later reveal events if a power makes a deck-drawn card public.
- While a drawn card awaits resolution, clicking the current player's occupied hand slot sends `swapDrawnCard` for that slot. This works for either draw source. The replacement hand card becomes facedown, the displaced card becomes the visible discard top, and slot `0` clears.
- Clicking the card in slot `0` sends `discardDrawnCard` only if it came from the deck. A card taken from the discard pile **must** replace one of the drawer's occupied hand cards, so its slot `0` cannot be clicked to discard it.
- If the discarded deck-drawn card has a power, keep it in slot `0` while the player uses or skips that power. Show a simple prompt for the permitted peek or swap targets and a **Don't use** action when the current power stage allows it. The server discards the held card when the power ends; then clear slot `0`. Matching is unavailable throughout power resolution.
- After `powerPeekResult` for a 7–10 or black queen/king, show the authorized peeked faces only to the power user and keep them visible with a **Done** button. Do not close the peek on a timer. Done hides the peek and sends `finishPowerPeek`. For a 7–10, wait for `discardPileUpdated` and turn advancement. For a black queen/king, then show the swap-or-skip controls; neither choice is available before Done. Other players see which slots were targeted but never their faces.

## Power and gift prompts

- [User Power Screen.png](User%20Power%20Screen.png) shows the power user's view after `powerAvailable`: the green card marks the held card in slot `0`, **Use** and **Don't use** sit below it, and a grey toast-style panel in the bottom-left explains the available power in plain language. Keep that description visible while the player makes the power choice. The green treatment is a highlight, not a new card type or permission for other players to see the card face.
- **Use** starts selection of the legal target or targets for that power. Send `usePower` only once the required targets are selected; until then, selected cards keep their lit outlines and do not flip. **Don't use** sends `skipPower` while the power is still at `"awaitingChoice"`. After a black queen/king peek is finished with **Done**, offer swap-target selection or **Don't use** for the optional swap. During `"awaitingPeekDone"`, show **Done** instead of Use/Don't use.
- A required gift after `matchResult` with `giftRequired: true` uses the same prompt style: replace the power controls with an instruction to choose a card, show the matcher a bottom-left toast naming the recipient, and highlight selectable cards in the matcher's own hand. Selecting one sends `chooseCardToGive`; keep its outline lit while the choice is pending. The gift is mandatory when prompted, so do not offer **Don't use** or Skip. Matching remains available during this prompt through the separate **Match** mode described below.
- Close the power or gift description when its choice resolves, and restore it if a rejected action leaves the choice pending. Keep error and warning toasts readable without covering the active instruction.

## Clicking hand cards

- A hand-card click has the current action's meaning: the drawer's own occupied slot is a swap target while resolving a drawn card; a power prompt selects only legal targets for that power; a gift prompt lets the matcher choose an occupied card from their own hand to give to the matched opponent.
- Otherwise, clicking any player's occupied hand card sends `attemptMatch` when matching is allowed and a discard top exists. Matching remains available during ordinary turn steps and while a gift choice is pending, even though turn actions wait for the gift. When a player's own hand click would select a swap or gift, provide a simple **Match** mode so they can still attempt a legal match on their own card; opponent cards can be clicked to match as usual. Leave Match mode when the pending choice resolves.
- Follow the Events Contract for power target ownership, two-card swap restrictions, protection for the Cambio caller in `finalRound`, and the end of the final matching window. Disable empty slots and repeated clicks on a card during its local flip animation. A wrong match adds a facedown penalty card through `penaltyCardDrawn`.

## Visual feedback and animations

- Hovering over a card that can be clicked for the current action lights its outline. Clicking a card to select a gift or power target keeps that outline lit while the choice is pending. Selection itself does not flip or reveal the card. Clear the selection when the action resolves or the server rejects it with `error`; for a multi-card power choice, keep each selected outline until the full choice resolves or is rejected.
- Clicking a hand card to attempt a match starts a brief flip animation. The client may animate the facedown side immediately, but shows the face only after `flipCard` supplies its `cardId`. `matchResult` arrives without waiting for the animation: use its `whoFlipped` value to briefly mark the player who attempted the match, then show the result. Return an occupied card to facedown after the flip; remove a card only for a winning result. A rejected attempt gets no `flipCard` and must not reveal a face.
- Animate a successful `cardDrawn` moving from the chosen pile into the drawer's slot `0`. Animate `discardPileUpdated` moving a card out of the pile after a discard draw or into the pile after a discard. Animate `cardSwapped` moving the affected cards between the drawn position and hand or between two hand slots, with hand cards facedown unless an event authorizes a reveal. Keep these movements simple and brief.
- Apply server events to the card layout as they arrive, even if a local animation is still running. Animations never delay sending an action, processing a result, advancing the turn, or ending the final matching window.

## Feedback and state changes

- Show `error` messages and warnings such as `handLimitWarning` as temporary toasts in the bottom-left corner. Keep the current card layout after a rejected action.
- Update occupied and empty slots from `matchResult`, `cardGiven`, and `penaltyCardDrawn`; use the slot IDs in those events rather than assigning new IDs in the browser. Clear temporary match flips after their local animation and power peeks when Done is clicked. Clear prompts and slot `0` when the corresponding resolution finishes.
- After `finalMatchGraceStarted`, disable turn controls and retain matching only for the server-timed window. At `roundOver`, reveal every hand and show scores and winners.
