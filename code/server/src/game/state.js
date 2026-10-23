// Constructs the authoritative state of a fresh empty room.

/** Create an empty, undealt room. Other game fields start without a pending turn or action.
 * @returns {import("./types.js").GameState}
 */
export function createGameState() {
  return {
    players: [],
    deck: { cards: [] },
    discardPile: { cards: [], topMatchStatus: null },
    turn: null,
    turnStep: null,
    pendingPower: null,
    pendingPowerStage: null,
    pendingMatch: null,
    phase: 'deal',
    cambioCalledBy: null,
    finalMatchGraceDeadline: null,
    winners: [],
  };
}
