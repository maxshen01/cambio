// Maps server game state to the public lobby view sent in events.

/** Include only public seat fields in a LobbyView. */
export function toLobbyView(state) {
  const playersInSeatOrder = [...state.players].sort((first, second) => {
    return first.seatId - second.seatId;
  });

  const publicPlayers = playersInSeatOrder.map(player => {
    return {
      playerId: player.id,
      displayName: player.displayName,
      seatId: player.seatId,
      connected: player.connected,
      isReady: player.isReady,
    };
  });

  return {
    players: publicPlayers,
  };
}
