// Owns the socket subscription lifetime and translates server events into state actions.
import { useEffect } from 'react';
import { logClientEvent } from '../socket/log.js';
import { clearActionRequests } from './sessionControl.js';

/** Subscribe once per socket; cleanup invalidates callbacks without closing the tab's socket.
 * @param {import('./sessionControl.js').GameSocket} socket
 * @param {import('./sessionControl.js').ClientDispatch} dispatch
 * @param {import('./sessionControl.js').SessionRef} session
 */
export function useGameSocketEvents(socket, dispatch, session) {
  useEffect(() => {
    const guard = session.current;
    guard.active = true;
    const generation = ++guard.generation;
    const valid = () => guard.active && !guard.lost && guard.generation === generation;
    function onConnect() {
      if (!valid()) return;
      guard.connecting = false;
      dispatch({ type: 'connectionEstablished' });
      logClientEvent('connect', 'connected');
    }
    function onConnectError() {
      if (!valid()) return;
      guard.connecting = false;
      clearActionRequests(guard);
      dispatch({ type: 'connectionFailed' });
      logClientEvent('connect_error', 'failed');
    }
    function onDisconnect() {
      if (!valid()) return;
      guard.lost = true;
      ++guard.generation;
      guard.connecting = false;
      clearActionRequests(guard);
      dispatch({ type: 'connectionLost' });
      logClientEvent('disconnect', 'lost');
    }
    /** @param {import('../../../shared/protocol.js').LobbyView} lobby */
    function onPlayers(lobby) {
      if (!valid()) return;
      dispatch({ type: 'playersReceived', players: lobby.players });
      logClientEvent('lobby', 'received', { playerCount: lobby.players.length });
    }
    /** A prestart departure cancels the deal and any outstanding setup request.
     * @param {import('../../../shared/protocol.js').LobbyView} lobby */
    function onDeparture(lobby) {
      if (!valid()) return;
      clearActionRequests(guard);
      dispatch({ type: 'playerDepartureReceived', players: lobby.players });
      logClientEvent('playerDisconnected', 'received', { playerCount: lobby.players.length });
    }
    /** @param {import('../../../shared/protocol.js').DealComplete} deal */
    function onDeal(deal) {
      if (!valid()) return;
      clearActionRequests(guard);
      dispatch({ type: 'dealReceived', cards: deal.cards });
      logClientEvent('dealComplete', 'received', { cardCount: deal.cards.length });
    }
    /** @param {string} playerId @param {boolean} isReady */
    function onMark(playerId, isReady) {
      if (!valid()) return;
      if (guard.readyPlayerId === playerId) guard.readyPlayerId = null;
      dispatch({ type: 'readinessReceived', playerId, isReady });
      logClientEvent(isReady ? 'playerReady' : 'playerUnready', 'received');
    }
    /** @param {import('../../../shared/protocol.js').ReadyNotice} notice */
    const onReady = ({ playerId }) => onMark(playerId, true);
    /** @param {import('../../../shared/protocol.js').ReadyNotice} notice */
    const onUnready = ({ playerId }) => onMark(playerId, false);
    /** @param {import('../../../shared/protocol.js').TurnChanged} notice */
    function onTurn({ playerId }) {
      if (!valid()) return;
      guard.readyPlayerId = null;
      guard.turnPending = false;
      dispatch({ type: 'turnChanged', playerId });
      logClientEvent('turnChanged', 'received');
    }
    /** @param {import('../../../shared/protocol.js').CardDrawnNotice} card */
    function onDrawn(card) {
      if (!valid()) return;
      guard.turnPending = false;
      dispatch({ type: 'drawnCardReceived', card });
      logClientEvent('cardDrawn', 'received');
    }
    /** @param {import('../../../shared/protocol.js').DiscardPileUpdated} notice */
    function onPile({ top }) {
      if (!valid()) return;
      dispatch({ type: 'discardPileReceived', top });
      logClientEvent('discardPileUpdated', 'received');
    }
    /** @param {import('../../../shared/protocol.js').DrawnSwapNotice} notice */
    function onSwapped(notice) {
      if (!valid()) return;
      dispatch({ type: 'cardSwapReceived', notice });
      logClientEvent('cardSwapped', 'received');
    }
    /** @param {import('../../../shared/protocol.js').LobbyError} error */
    function onError(error) {
      if (!valid()) return;
      clearActionRequests(guard);
      dispatch({ type: 'serverErrorReceived', error });
      logClientEvent('error', 'received', { code: error.code });
    }
    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.on('disconnect', onDisconnect);
    socket.on('playerJoined', onPlayers);
    socket.on('playerDisconnected', onDeparture);
    socket.on('dealComplete', onDeal);
    socket.on('turnChanged', onTurn);
    socket.on('cardDrawn', onDrawn);
    socket.on('discardPileUpdated', onPile);
    socket.on('cardSwapped', onSwapped);
    socket.on('playerReady', onReady);
    socket.on('playerUnready', onUnready);
    socket.on('error', onError);
    if (socket.connected) onConnect();
    else if (!guard.lost && !guard.connecting) {
      guard.connecting = true;
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
      socket.off('cardDrawn', onDrawn);
      socket.off('discardPileUpdated', onPile);
      socket.off('cardSwapped', onSwapped);
      socket.off('playerReady', onReady);
      socket.off('playerUnready', onUnready);
      socket.off('error', onError);
    };
  }, [socket, dispatch, session]);
}
