# MVP

## MVP:

- Works for four players only
- Hosted online, reasonably reachable across the UK
- Only one game room needed
- Bare-basics UI — functional, not polished
- Card rules implemented to a high standard, including rule-defined penalties (e.g. wrong-card match → draw penalty) — exact rule list defined separately
- Players join via a shared link — no accounts, no matchmaking
- No reconnection/resume support
- Real-time updates via WebSockets
- Server is source of truth for all hidden card data _and_ independently validates every action (never trusts the client), even though the UI also prevents invalid actions
- One round per game — final scores shown, then done
- No turn timer
- Desktop browser only
- Rules engine covered by automated tests + manual playtesting with friends
- Cards shown as basic images (suit/rank icons), not plain text

## Tech Stack:

- Node and js for backend
- Html/css/console for testing backend works, once works use react to build mvp frontend.
- No database (no player account storing, no stats etc. cards state should just be an array or something like that)
- Host on something like render or fly.io (devops not important bit, no need to waste time)

## In game rules:

### Game Setup:

- The game is played with 2 decks of cards, including jokers.
- Each player dealt 4 cards at the start of the game.
- The cards start in a 2×2 grid, numbered by column: `1` above `2`, then `3` above `4`. Further columns extend the two-row hand horizontally (`5` above `6`, then `7` above `8`). Removing a card leaves its slot empty; the next card added to that hand fills the lowest empty slot before extending the layout. For example, if slot `1` is matched away, the next penalty card goes into slot `1`.
- Each player is shown their bottom two cards (slots `2` and `4`) and has unlimited time to remember them.
- A randomised player will start. Play will commence clockwise.
- After a deck draw leaves two cards, shuffle all discard cards below the top two back into the bottom of the deck. The two remaining deck cards stay on top. If the discard pile has fewer than three cards, retry after later draws or discards while the deck remains low. Deck and pile counts are not shown to players.

### What can happen each turn

- The player who’s turn it is must draw 1 card from the deck or the discard pile (not possible on first turn as nothing has been discarded)
- The player has unlimited time to look and decide what to do with the card.
- If the player took from the deck, the player must either discard this card or replace one of their facedown cards, and discard that card.
- The player can choose to swap their drawn card with one of their facedown cards. This facedown card is then moved to the discard pile, face up.
- If the player takes from the discard pile, they must replace one of their facedown cards and discard it.
- If the player chooses to discard a deck-drawn card with a power, they may use or skip that power before the card is discarded. The card remains drawn while its power is resolved. Choosing to use the power reveals the held card to everyone before its effect, so all players can see which card granted it; skipping before use leaves the card private until discard. After the power is completed or skipped, the server automatically discards the card; the player does not make a second discard choice. Matching is unavailable throughout power resolution, including between a black queen/king peek and the subsequent swap or skip choice.
- Once a card is swapped with one of the facedown cards, it loses its power.

### Card values and powers.

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

### Matching mechanic

- When a card is discarded by anyone, it becomes eligible for a same-rank match immediately, including after the turn changes. A power card is discarded only after its power is completed or skipped. Match attempts against the current discard are rejected during power resolution, even if that discard was already present. Rank means the printed rank, regardless of suit or scoring value: red and black queens match, and red and black kings match. There is no time limit for making the first successful match.
- Only one successful match is allowed for each newly discarded card. The first correct flip wins by server arrival order and takes effect immediately. Further attempts remain available, including while an opponent matcher chooses a card to give. A later same-rank flip reveals the card but has no effect or penalty; a wrong flip immediately gives a deck penalty. If a player draws the discard top, flips against the newly exposed older card reveal briefly but have no effect or penalty until another card is discarded. The client disables repeated clicks on a card during its flip animation; the server applies no repeat-click cooldown and handles each received request in arrival order.
- If the player matches their own card, this card is gone from their set of cards. For example, if they were on 4 cards, they now have 3.
- If a player matches someone elses card, i.e. flips an opponents card correctly, that opponent's matched card is removed. The matcher gives one of their cards to that opponent if they have one; the opponent also picks up a penalty card from the deck. The penalty is automatic after the gift choice.
- If the opponent wrongly tries to match their own or opponents cards, the card is not matched and returned. The player picks up one penalty card.
- In the event that 2 people try and match the same card, the person who matches first gets to match.
- After a successful opponent match, turn actions pause while the matcher chooses a card to give and the gift and automatic penalty are completed. Other players may continue attempting matches during that choice. A successful self-match needs no settlement pause. A pending turn resumes after the gift; the turn cannot advance until then. Every accepted flip is decided by the server immediately, while clients animate the reveal locally.
- Each player may hold at most eight cards. If an added penalty or given card would exceed this limit, that player is disconnected and the match is aborted. If a required deck penalty cannot be drawn or supplied by the usual refill, the match aborts as a server error.

### Calling Cambio

- The game continues until someone thinks they have good enough cards to win. They may call Cambio at any unresolved step of their turn, except while a match is settling. They then finish that turn, including any pending draw or power, and may still attempt matches. They do not get another turn.
- Once the caller finishes, each other player takes exactly one final turn in clockwise order. After the last final turn resolves, players have one server-timed second to attempt matches against the current discard. An accepted match is decided immediately; scoring waits for any outstanding card-give choice and automatic penalty. Attempts received after the deadline are rejected.
- The winning player is the person with the lowest total card score. In the event of a tie, it goes to the person with the least cards. In the event this is a tie, the game is a tie between the people on the same score and cards.
- After the caller's turn ends, players are not allowed to use power cards to swap with the person who called Cambio’s cards. The caller may still use a pending swap power on their own turn after calling.
- Players are allowed to match the person who called cambio’s cards.
