// Constructs fresh room state and resets setup while retaining seated player identities.

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

/** Clear every round field and ready mark, preserving the shared state and player objects.
 * @param {import('./types.js').GameState} state
 * @param {import('./types.js').Player[]} players
 */
export function resetSetup(state, players) {
  Object.assign(state, createGameState(), { players });
  for (const player of players) {
    Object.assign(player, {
      hand: [], isReady: false, drawnCard: null, drawnFrom: null,
      drawnCardRevealed: false, score: 0, calledCambio: false,
    });
  }
}
