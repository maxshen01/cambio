# Start screen rules

This document explains [Start Screen.png](Start%20Screen.png). It is the layout for the undealt lobby and the final results view. The [Events Contract](../Events%20Contract.md) defines when a player may join or ready and which results the server sends.

## What the image shows

- The blue circles show the four player positions. The mark beside each joined player shows their lobby readiness: a red cross means not ready, and a green tick means ready.
- **Ready Up** marks a joined player ready and becomes **Unready** when their ready mark is set. Its enabled state follows the joining and readiness rules below.
- The green box in the middle is a **match-results popup** showing the winner or joint winners and each player's score. It appears only after the match finishes; it is not visible while players are joining or readying.

## Joining the lobby

- If the initial connection fails, offer **Retry connection**. If an established connection is lost, require **Reload to rejoin**; automatic reconnection and session resume are not supported.
- Opening the shared link shows a name-entry prompt over the start screen. Before sending `joinRoom` with `{ displayName }`, the client trims surrounding whitespace, collapses repeated ordinary spaces, normalizes to Unicode NFC, and accepts 1–20 Unicode code points. The name must start with a letter or number and otherwise contain only letters, combining marks, numbers, ordinary spaces, apostrophes (`'` and `’`), hyphens, or periods. Emoji, other symbols, and control characters are invalid. The client must not send `ready` before `joinRoom` succeeds.
- Keep **Ready Up** visible but disabled while the name is empty, the join request is pending, or the server has not accepted the join. A successful join acknowledgement supplies the player's `playerId` and `seatId`; `playerJoined` then supplies the lobby seats.
- The server applies the same name rules and rejects a name already used by a seated player, ignoring case and normalized spacing. A departed player's name becomes available again. If the server rejects the join with `INVALID_NAME`, `ROOM_FULL`, or `GAME_ALREADY_STARTED`, show the error and leave the player unjoined with Ready Up disabled. Clear an `INVALID_NAME` error as soon as the name input changes, and do not show a late rejection for an earlier input value. Keep other server errors visible during edits. Disable browser autocomplete and spelling suggestions for the name input while retaining the format hint. A rejected name can be corrected and submitted again. The server remains responsible for validating names and seats.

## Seats and readiness

- The four blue circles are seat positions. Show a joined player's name beside their seat. Leave an empty seat without a readiness mark.
- Seat the local player at the bottom of the screen. During a four-player game, rotate the other positions around them using the order of the `players` array in `GameState`: the next player in the array sits on the left, the player after that sits at the top, and the preceding player sits on the right. Wrap from the end of the array to its start. This makes turns move clockwise on screen: bottom → left → top → right → bottom. For example, with `[player1, player3, player2, player4]`, player2 sees player4 on the left, player1 at the top, and player3 on the right.
- Use the same relative seating arrangement on the playing and results screens. In a partly filled lobby, use `seatId` order to reserve all four positions relative to the local player's seat; leave vacant seats empty rather than shifting joined players into them.
- A red cross beside a seated player means they are not ready. A green tick means they are ready. Use `LobbyView` from `playerJoined` and `playerDisconnected`, plus `playerReady` and `playerUnready`, to update these marks. Do not infer another player's readiness from their local button state.
- In the undealt lobby, enable **Ready Up** for a joined player who has not yet readied, even if fewer than four players have joined. Clicking it sends `ready` once. After `playerReady`, show **Unready** and allow the player to send `unready` while fewer than four players are ready. Disable the button during either request and while all four are ready. Update marks only from server events. If the server rejects either request, show the `error` and restore the button only if the player is still eligible.
- When a player leaves before the deal, clear that seat and its mark while preserving the remaining players' ready marks supplied by the server. If a deal is cancelled during memorization or a match is aborted, return to this lobby view using the supplied lobby state and readiness marks.
- After the fourth lobby `playerReady`, `dealComplete` moves everyone to the [playing screen](playingScreenRules.md) to memorize their opening cards. That screen reuses **Ready Up** for the separate memorization confirmation.

## Results

- Hide the green match-results popup before the round ends. Lobby readiness is shown by the ticks and crosses beside the seats; no scores are available in the lobby.
- At `roundOver`, open the green match-results popup using the final `GameStateView.winners` and `scores` to show the winner or joint winners and every player's final score. Keep player names attached to their seats and hide the lobby readiness marks. The result is terminal for this one-round MVP: **Ready Up** stays visible but disabled, and no restart or new deal is offered.
- A later `playerDisconnected` updates that seat's connection indicator without clearing the final results. Do not replace the result with a new lobby.
