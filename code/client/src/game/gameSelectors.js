// Derives membership and action eligibility rather than storing duplicate flags.
/** @typedef {import('./gameClientState.js').GameClientState} GameClientState */
/** Single eligibility calculation used by rendering and request guards.
 * @param {GameClientState} state
 */
export function selectGameClient(state) {
  const connected = state.connection === 'connected';
  const localPlayer = state.players.find(player => player.playerId === state.identity?.playerId);
  const joined = Boolean(state.identity && localPlayer);
  const allReady = state.players.filter(player => player.isReady).length === 4;
  const ownTurn = connected && joined && state.stage === 'active' && state.turnPlayerId === state.identity?.playerId
    && !state.turnPending && !state.awaitingTurn;
  const canReplace = ownTurn && state.drawnCard?.playerId === state.identity?.playerId;
  const canDraw = ownTurn && !state.drawnCard;
  return {
    view: {
      connected, connectionLost: state.connection === 'lost', localPlayer, joined, allReady,
      connectionStatus: selectConnectionStatus(state, joined),
    },
    permissions: {
      canJoin: connected && !state.joinPending && !state.identity,
      canReady: connected && joined && !state.readyPending && state.stage !== 'active'
        && (state.stage === 'memorization' ? !localPlayer?.isReady : (!localPlayer?.isReady || !allReady)),
      canRetry: state.connection === 'failed',
      canDraw,
      canDrawDiscard: canDraw && state.discardTop !== null,
      canReplace,
      canDiscardDrawn: canReplace && state.drawnCard?.source === 'deck',
    },
  };
}

/** Keep connection feedback independent of screen markup.
 * @param {GameClientState} state @param {boolean} joined
 */
function selectConnectionStatus(state, joined) {
  if (state.connection === 'lost') return 'Connection lost';
  if (state.connection === 'failed') return 'Connection failed';
  if (state.connection === 'connecting') return 'Connecting to server\u2026';
  if (!joined && (state.joinPending || state.identity)) return 'Joining lobby\u2026';
  return 'Connected';
}

/** @typedef {ReturnType<typeof selectGameClient>['view']} GameView */
/** @typedef {ReturnType<typeof selectGameClient>['permissions']} GamePermissions */
