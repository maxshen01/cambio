// Bridges setup/turn events to display state; refs guard requests and socket lifetimes.
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { checkDisplayName } from '../../../shared/displayName.js';
import { logClientEvent } from '../socket/log.js';
import { initialLobbyState, lobbyReducer, selectLobby } from './lobbyReducer.js';

/** @typedef {import('socket.io-client').Socket<import('../../../shared/lobbyTypes.js').ServerEvents, import('../../../shared/lobbyTypes.js').ClientEvents>} LobbySocket */

/** Attach one set of listeners per socket and keep membership server-confirmed.
 * @param {LobbySocket} socket
 */
export function useLobby(socket) {
  const [state, dispatch] = useReducer(lobbyReducer, socket.connected, initialLobbyState);
  const eligibility = selectLobby(state);
  const lifetime = useRef({ generation: 0, active: false, lost: false });
  const requests = useRef({ connecting: false, join: false, ready: /** @type {string | null} */ (null) });

  useEffect(() => {
    const guard = lifetime.current;
    guard.active = true;
    const generation = ++guard.generation;
    const valid = () => guard.active && !guard.lost && guard.generation === generation;
    function onConnect() {
      if (!valid()) return;
      requests.current.connecting = false;
      dispatch({ type: 'connected' });
      logClientEvent('connect', 'connected');
    }
    function onConnectError() {
      if (!valid()) return;
      requests.current = { connecting: false, join: false, ready: null };
      dispatch({ type: 'failed' });
      logClientEvent('connect_error', 'failed');
    }
    function onDisconnect() {
      if (!valid()) return;
      guard.lost = true;
      ++guard.generation;
      requests.current = { connecting: false, join: false, ready: null };
      dispatch({ type: 'lost' });
      logClientEvent('disconnect', 'lost');
    }
    /** @param {import('../../../shared/lobbyTypes.js').LobbyView} lobby */
    function onPlayers(lobby) {
      if (!valid()) return;
      dispatch({ type: 'players', players: lobby.players });
      logClientEvent('lobby', 'received', { playerCount: lobby.players.length });
    }
    /** A prestart departure cancels the deal and any outstanding setup request.
     * @param {import('../../../shared/lobbyTypes.js').LobbyView} lobby */
    function onDeparture(lobby) {
      if (!valid()) return;
      requests.current.join = false;
      requests.current.ready = null;
      dispatch({ type: 'departure', players: lobby.players });
      logClientEvent('playerDisconnected', 'received', { playerCount: lobby.players.length });
    }
    /** @param {import('../../../shared/lobbyTypes.js').DealComplete} deal */
    function onDeal(deal) {
      if (!valid()) return;
      requests.current.join = false;
      requests.current.ready = null;
      dispatch({ type: 'deal', cards: deal.cards });
      logClientEvent('dealComplete', 'received', { cardCount: deal.cards.length });
    }
    /** @param {string} playerId @param {boolean} isReady */
    function onMark(playerId, isReady) {
      if (!valid()) return;
      if (requests.current.ready === playerId) requests.current.ready = null;
      dispatch({ type: 'readyMark', playerId, isReady });
      logClientEvent(isReady ? 'playerReady' : 'playerUnready', 'received');
    }
    /** @param {import('../../../shared/lobbyTypes.js').ReadyNotice} notice */
    const onReady = ({ playerId }) => onMark(playerId, true);
    /** @param {import('../../../shared/lobbyTypes.js').ReadyNotice} notice */
    const onUnready = ({ playerId }) => onMark(playerId, false);
    /** @param {import('../../../shared/lobbyTypes.js').TurnChanged} notice */
    function onTurn({ playerId }) {
      if (!valid()) return;
      requests.current.ready = null;
      dispatch({ type: 'turn', playerId });
      logClientEvent('turnChanged', 'received');
    }
    /** @param {import('../../../shared/lobbyTypes.js').LobbyError} error */
    function onError(error) {
      if (!valid()) return;
      requests.current.join = false;
      requests.current.ready = null;
      dispatch({ type: 'error', error });
      logClientEvent('error', 'received', { code: error.code });
    }
    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.on('disconnect', onDisconnect);
    socket.on('playerJoined', onPlayers);
    socket.on('playerDisconnected', onDeparture);
    socket.on('dealComplete', onDeal);
    socket.on('turnChanged', onTurn);
    socket.on('playerReady', onReady);
    socket.on('playerUnready', onUnready);
    socket.on('error', onError);
    if (socket.connected) onConnect();
    else if (!guard.lost && !requests.current.connecting) {
      requests.current.connecting = true;
      socket.connect();
    }
    return () => {
      guard.active = false;
      ++guard.generation;
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      socket.off('disconnect', onDisconnect);
      socket.off('playerJoined', onPlayers);
      socket.off('playerDisconnected', onDeparture);
      socket.off('dealComplete', onDeal);
      socket.off('turnChanged', onTurn);
      socket.off('playerReady', onReady);
      socket.off('playerUnready', onUnready);
      socket.off('error', onError);
    };
  }, [socket]);

  const nameChanged = useCallback(() => dispatch({ type: 'nameChanged' }), []);

  /** Retry initial failures on the same socket, without automatic reconnection. */
  function retry() {
    if (!eligibility.canRetry || requests.current.connecting || lifetime.current.lost) return;
    requests.current.connecting = true;
    dispatch({ type: 'retry' });
    logClientEvent('connect', 'retry');
    socket.connect();
  }

  /** @param {string} displayName */
  function join(displayName) {
    const checked = checkDisplayName(displayName);
    if (!eligibility.canJoin || !socket.connected || requests.current.join || lifetime.current.lost
      || checked.name === null) return;
    requests.current.join = true;
    const generation = lifetime.current.generation;
    dispatch({ type: 'joinStarted' });
    logClientEvent('joinRoom', 'sent');
    socket.emit('joinRoom', { displayName: checked.name }, identity => {
      if (!lifetime.current.active || lifetime.current.lost || !socket.connected
        || lifetime.current.generation !== generation || !requests.current.join) return;
      dispatch({ type: 'joined', identity });
      logClientEvent('joinRoom', 'acknowledged', { seatId: identity.seatId });
    });
  }

  function toggleReady() {
    if (!eligibility.canReady || !socket.connected || requests.current.ready || lifetime.current.lost) return;
    const localPlayer = eligibility.localPlayer;
    if (!localPlayer) return;
    const event = state.stage === 'lobby' && localPlayer.isReady ? 'unready' : 'ready';
    requests.current.ready = localPlayer.playerId;
    dispatch({ type: 'readyStarted' });
    socket.emit(event, {});
    logClientEvent(event, 'sent');
  }

  return { ...state, ...eligibility, join, nameChanged, toggleReady, retry };
}
