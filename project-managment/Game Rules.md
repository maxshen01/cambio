# Cambio — Game Rules

This document owns the intended gameplay rules for the four-player, one-round game. [MVP](MVP.md) defines product scope; [Game Data Model](Game%20Data%20Model.md) defines state representation; [Events Contract](Events%20Contract.md) defines wire payloads, errors, recipient redaction, and event ordering. Layout and interaction details remain in the [UI Rules](designs/UI%20Rules.md).

These rules describe the intended game. See the [root README](../README.md) for current implementation capabilities, limitations, and coverage.

## Setup and memorization

- The game is played with 2 decks of cards, including jokers.
- Shuffle the two decks and deal each player 4 cards at the start of the game.
- The cards start in a 2×2 grid, numbered by column: `1` above `2`, then `3` above `4`. Further columns extend the two-row hand horizontally (`5` above `6`, then `7` above `8`). Removing a card leaves its slot empty; the next card added to that hand fills the lowest empty slot before extending the layout. For example, if slot `1` is matched away, the next penalty card goes into slot `1`.
- Each player is shown their bottom two cards (slots `2` and `4`) and has unlimited time to remember them.
- A randomised player will start. Play will commence clockwise.
- After any deck draw, including a penalty draw, leaves two cards, shuffle all discard cards below the top two back into the bottom of the deck. The two remaining deck cards stay on top. If the discard pile has fewer than three cards, retry after later draws or discards while the deck remains low. Deck and pile counts are not shown to players.

- Four connected, seated players must all be ready before dealing; filling the fourth seat alone does not deal. A seated player may ready before the room is full, or unready in the undealt lobby while fewer than four players are ready. Duplicate readiness requests do nothing. Dealing resets all ready marks for the separate memorization confirmation; Unready is unavailable during memorization.
- Opening faces are private: each player sees only their own slots `2` and `4` until their memorization Ready is accepted. A rejected confirmation preserves those faces. Once all four confirm, randomly choose the first player and begin clockwise play. There is no memorization or turn timer.

## Turns and draw resolution

- The player who’s turn it is must draw 1 card from the deck or the discard pile (not possible on first turn as nothing has been discarded)
- There is at most one pending drawn card, owned by the current turn holder and separate from every player's hand, with no hand-slot ID. It does not count toward the eight-card hand limit. Deck draws are private to the drawer until revealed by a power or discarded; discard draws are public. Only the drawer may resolve this card. Its shared display location is specified in the [UI Rules](designs/UI%20Rules.md#board-and-cards).
- The player has unlimited time to look and decide what to do with the card.
- If the player took from the deck, the player must either discard this card or replace one of their facedown cards, and discard that card.
- The player can choose to swap their drawn card with one of their facedown cards. This facedown card is then moved to the discard pile, face up.
- If the player takes from the discard pile, they must replace one of their facedown cards and discard it.
- If the player chooses to discard a deck-drawn card with a power, they may use or skip that power before the card is discarded. The card remains drawn while its power is resolved. Choosing to use the power reveals the held card to everyone before its effect, so all players can see which card granted it; skipping before use leaves the card private until discard. After the power is completed or skipped, the server automatically discards the card; the player does not make a second discard choice. Matching is unavailable throughout power resolution, including between a black queen/king peek and the subsequent swap or skip choice.
- Once a card is swapped with one of the facedown cards, it loses its power.

## Card values and powers

- Ace to 6: no powers.
- 7 or 8: look at the value of one of your cards.
- 9 or 10: look at the value of an opponents card. You cannot look at your cards.
- Jack: do a blind swap of 2 cards. This can be your card with someone elses or 2 opponents cards.
- Black queen: same as jack, but get to look at 1 card beforehand too. This card can be yours or opponents.
- Black king: same as black queen but can look at 2 cards instead of one.
- For the black king and queen, the looking occurs before the swap.
- Swaps swapping two of your own cards are not permitted
- Red queen: card value of -2
- Red king: card value of -1
- Jokers: card value of 0
- Numbers 1-10: card value of the number.
- Face cards (not red queen or red king): 11 for jack, 12 for queen and 13 for king.

### Power resolution and visibility

- Only a deck-drawn card chosen for direct discard can grant its power. Replacing a hand card, giving a card, or receiving a penalty card does not activate a power.
- Power peeks reveal target faces only to the power user; everyone else may see the targeted slots, never their faces. Keep peeked faces visible until the user chooses Done; do not time them out. A 7–10 then automatically discards the held card and completes the turn. A black queen/king instead proceeds to swap or skip after Done, retaining the publicly revealed held power card until that choice resolves.
- A black queen requires one peek target; a black king requires two distinct targets. Targets may be the user's or opponents' cards. Their subsequent swap may use any legal pair, whether peeked or not. All power swaps exchange existing slots belonging to different players; two opponents' cards may be swapped. The final-round caller protection is defined [below](#cambio-final-grace-and-scoring).
- Skipping is permitted before using a power or after finishing a black queen/king peek to decline the swap. While viewing a peek, the user must finish it with Done before choosing the next action. A rejected power choice preserves the pending card and stage so the player can retry.
- Hand cards are otherwise facedown during play; temporary peeks and accepted match flips do not permanently reveal them. A card swapped into a hand is facedown even if it was publicly drawn from discard. At round completion, reveal every hand and score. Never disclose hidden card identifiers to unauthorized recipients.

## Matching, gifts, and penalties

- When a card is discarded by anyone, it becomes eligible for a same-rank match immediately, including after the turn changes. A power card is discarded only after its power is completed or skipped. Match attempts against the current discard are rejected during power resolution, even if that discard was already present. Rank means the printed rank, regardless of suit or scoring value: red and black queens match, and red and black kings match. There is no time limit for making the first successful match.
- Only one successful match is allowed for each newly discarded card. The first correct flip wins by server arrival order and takes effect immediately. Further attempts remain available, including while an opponent matcher chooses a card to give. A later same-rank flip reveals the card but has no effect or penalty; a wrong flip immediately gives a deck penalty. If a player draws the discard top, flips against the newly exposed older card reveal briefly but have no effect or penalty until another card is discarded. The client disables repeated clicks on a card during its flip animation; the server applies no repeat-click cooldown and handles each received request in arrival order.
- If the player matches their own card, this card is gone from their set of cards. For example, if they were on 4 cards, they now have 3.
- If a player matches someone elses card, i.e. flips an opponents card correctly, that opponent's matched card is removed. The matcher gives one of their cards to that opponent if they have one; the opponent also picks up a penalty card from the deck. The penalty is automatic after the gift choice.
- If the opponent wrongly tries to match their own or opponents cards, the card is not matched and returned. The player picks up one penalty card.
- In the event that 2 people try and match the same card, the person who matches first gets to match.
- After a successful opponent match, turn actions pause while the matcher chooses a card to give and the gift and automatic penalty are completed. Other players may continue attempting matches during that choice. A successful self-match needs no settlement pause. A pending turn resumes after the gift; the turn cannot advance until then. Every accepted flip is decided by the server immediately, while clients animate the reveal locally.
- Each player's hand may contain at most eight cards, excluding their pending drawn card in the shared area. If an added penalty or given card would exceed this limit, that player is disconnected and the match is aborted. If a required deck penalty cannot be drawn or supplied by the usual refill, the match aborts as a server error.

- A gift is mandatory when the winning opponent matcher has a card to give; otherwise skip the gift and apply the opponent's penalty automatically. Gifts and penalties enter the recipient's lowest vacant hand slot, gift first, facedown to everyone. Neither grants a power, and a penalty does not consume the player's ordinary turn draw.
- Revalidate the chosen gift slot, recipient capacity for both additions, and deck availability when the gift is submitted: intervening wrong flips may have changed hands. An invalid gift choice leaves settlement pending; an overflow or unavailable mandatory penalty aborts without a partial transfer.
- Exactly eight hand cards is legal and triggers a private warning after the addition. Warn again if the count falls below eight and later returns to eight. Only an addition above eight forces disconnect and abort.
- Matching requires a live game and an occupied target slot with a discard top. Rejected attempts reveal nothing and add no penalty. An accepted flip briefly reveals its target to everyone; the server determines the result immediately without waiting for the client animation. Matching has no separate first-match timer, but remains subject to the final grace deadline [below](#cambio-final-grace-and-scoring).

## Cambio, final grace, and scoring

- The game continues until someone thinks they have good enough cards to win. They may call Cambio at any unresolved step of their turn, except while a match is settling. They then finish that turn, including any pending draw or power, and may still attempt matches. They do not get another turn.
- Once the caller finishes, each other player takes exactly one final turn in clockwise order. After the last final turn resolves, players have one server-timed second to attempt matches against the current discard. An accepted match is decided immediately; scoring waits for any outstanding card-give choice and automatic penalty. Attempts received after the deadline are rejected.
- The winning player is the person with the lowest total card score. In the event of a tie, it goes to the person with the least cards. In the event this is a tie, the game is a tie between the people on the same score and cards.
- After the caller's turn ends, players are not allowed to use power cards to swap with the person who called Cambio’s cards. The caller may still use a pending swap power on their own turn after calling.
- Players are allowed to match the person who called cambio’s cards.
- Cambio may be called only once per round by the current player during an unresolved active turn. No player holds a turn during final grace; the server accepts match attempts only if received strictly before its deadline. A gift from an accepted attempt can be completed after the deadline, with its automatic penalty included before scoring. Client countdowns and animations do not extend that deadline.
- Scores are totals of the remaining hand cards using the values above. Joint winners are reported in seat order. The completed one-round result is terminal: no further turn or match actions, restart, or new deal are offered. Later disconnects preserve final hands, scores, and winners.

## Disconnect and abort lifecycle

- No reconnection or session resume is supported, and players cannot join a dealt or active game. A returning disconnected player joins an available undealt-lobby seat as a new, unready player. Existing players retain their seats when another seat becomes vacant.
- Before dealing, a disconnect frees the seat and preserves the remaining players' ready marks. During memorization, it frees the seat, cancels the deal, clears hands and pending setup state, and resets remaining readiness; replacements can join for a fresh deal. Neither case is an active-game abort.
- A disconnect during active play or the final round (including final grace or an eight-card overflow) aborts the match. An unavailable mandatory deck penalty or other unrecoverable active-game server error also aborts it.
- On abort, clear hands, piles, pending draws, powers, gifts, turn state, Cambio declarations, grace deadline, scores, winners, and ready marks. Remove disconnected players, retain connected players in their seats, and return to the undealt lobby. Connected players and any replacement use the ordinary four-player ready flow for a fresh deal.
- Unexpected undealt-lobby faults use the distinct recovery described in [Events Contract conventions](Events%20Contract.md#conventions): reset the room and disconnect clients, who must reload to rejoin. Expected validation failures leave state unchanged. This recovery is separate from the active-game abort rules above.
