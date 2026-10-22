// Owns socket listeners and React state for lobby membership, readiness, and connection loss.
import { useCallback, useEffect, useRef, useState } from 'react';
import { logClientEvent } from '../socket/log.js';

/** Track connection, join response, lobby seats, and join errors for one socket. */
export function useLobby(socket) {
  const [connected, setConnected] = useState(socket.connected);
  const [connectionLost, setConnectionLost] = useState(false);
  const [pending, setPending] = useState(false);
  const [readyPending, setReadyPending] = useState(false);
  const [identity, setIdentity] = useState(null);
  const [players, setPlayers] = useState([]);
  const [error, setError] = useState(null);
  const pendingRef = useRef(false);
  const readyPendingRef = useRef(false);
  const readyPlayerIdRef = useRef(null);
  const connectionLostRef = useRef(false);
  const errorCodeRef = useRef(null);
  const nameRevisionRef = useRef(0);
  const submittedNameRevisionRef = useRef(null);

  // Attach lobby listeners once per socket and remove them on unmount.
  useEffect(() => {
    /** Mark the socket usable after its connection succeeds. */
    function onConnect() {
      if (connectionLostRef.current) return;
      setConnected(true);
      errorCodeRef.current = null;
      setError(null);
      logClientEvent('connect', 'connected');
    }

    /** Surface a failed connection and release a pending join. */
    function onConnectError() {
      if (connectionLostRef.current) return;
      setConnected(false);
      pendingRef.current = false;
      readyPendingRef.current = false;
      readyPlayerIdRef.current = null;
      setPending(false);
      setReadyPending(false);
      errorCodeRef.current = null;
      setError('Unable to connect to the server.');
      logClientEvent('connect_error', 'failed');
    }

    /** Forget this connection's membership; rejoining requires a page reload. */
    function onDisconnect() {
      connectionLostRef.current = true;
      pendingRef.current = false;
      readyPendingRef.current = false;
      readyPlayerIdRef.current = null;
      setConnected(false);
      setConnectionLost(true);
      setPending(false);
      setReadyPending(false);
      setIdentity(null);
      setPlayers([]);
      errorCodeRef.current = null;
      setError('Connection lost. Reload to rejoin.');
      logClientEvent('disconnect', 'disconnected');
    }

    /** Replace the displayed seats with the server's complete lobby view. */
    function onPlayerJoined(lobby) {
      if (connectionLostRef.current) return;
      setPlayers(lobby.players);
      logClientEvent('playerJoined', 'received', { playerCount: lobby.players.length });
    }

    /** Replace seats after another seated player leaves the lobby. */
    function onPlayerDisconnected(lobby) {
      if (connectionLostRef.current) return;
      setPlayers(lobby.players);
      logClientEvent('playerDisconnected', 'received', { playerCount: lobby.players.length });
    }

    /** Apply a ready mark only when the server announces it. */
    function onPlayerReady({ playerId }) {
      if (connectionLostRef.current) return;
      setPlayers(current => current.map(player => (
        player.playerId === playerId ? { ...player, isReady: true } : player
      )));
      if (readyPlayerIdRef.current === playerId) {
        readyPendingRef.current = false;
        readyPlayerIdRef.current = null;
        setReadyPending(false);
      }
      logClientEvent('playerReady', 'received');
    }

    /** Apply a cleared ready mark only after the server announces it. */
    function onPlayerUnready({ playerId }) {
      if (connectionLostRef.current) return;
      setPlayers(current => current.map(player => (
        player.playerId === playerId ? { ...player, isReady: false } : player
      )));
      if (readyPlayerIdRef.current === playerId) {
        readyPendingRef.current = false;
        readyPlayerIdRef.current = null;
        setReadyPending(false);
      }
      logClientEvent('playerUnready', 'received');
    }

    /** Show a rejected join and make the form available for retry. */
    function onServerError(serverError) {
      if (connectionLostRef.current) return;
      const staleNameError = serverError.code === 'INVALID_NAME'
        && pendingRef.current
        && submittedNameRevisionRef.current !== nameRevisionRef.current;
      pendingRef.current = false;
      readyPendingRef.current = false;
      readyPlayerIdRef.current = null;
      setPending(false);
      setReadyPending(false);
      if (!staleNameError) {
        errorCodeRef.current = serverError.code;
        setError(serverError.message);
      }
      logClientEvent('error', 'received', { code: serverError.code });
    }

    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.on('disconnect', onDisconnect);
    socket.on('playerJoined', onPlayerJoined);
    socket.on('playerDisconnected', onPlayerDisconnected);
    socket.on('playerReady', onPlayerReady);
    socket.on('playerUnready', onPlayerUnready);
    socket.on('error', onServerError);
    if (!socket.connected) socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      socket.off('disconnect', onDisconnect);
      socket.off('playerJoined', onPlayerJoined);
      socket.off('playerDisconnected', onPlayerDisconnected);
      socket.off('playerReady', onPlayerReady);
      socket.off('playerUnready', onPlayerUnready);
      socket.off('error', onServerError);
    };
  }, [socket]);

  /** Clear a name-specific rejection as soon as the input changes. */
  const nameChanged = useCallback(() => {
    nameRevisionRef.current++;
    if (errorCodeRef.current === 'INVALID_NAME') {
      errorCodeRef.current = null;
      setError(null);
    }
  }, []);

  /** Send one trimmed join request and store the acknowledged seat. */
  const join = useCallback(displayName => {
    const trimmedName = displayName.trim();
    if (connectionLostRef.current || !socket.connected || pendingRef.current || identity || !trimmedName) return;

    pendingRef.current = true;
    submittedNameRevisionRef.current = nameRevisionRef.current;
    setPending(true);
    errorCodeRef.current = null;
    setError(null);
    logClientEvent('joinRoom', 'sent');
    socket.emit('joinRoom', { displayName: trimmedName }, ack => {
      if (connectionLostRef.current || !socket.connected) return;
      pendingRef.current = false;
      setPending(false);
      setIdentity({ playerId: ack.playerId, seatId: ack.seatId });
      logClientEvent('joinRoom', 'acknowledged', { seatId: ack.seatId });
    });
  }, [socket, identity]);

  /** Request the opposite lobby mark without changing it before the server event. */
  const toggleReady = useCallback(() => {
    if (connectionLostRef.current || !socket.connected || !identity || readyPendingRef.current) return;
    const localPlayer = players.find(player => player.playerId === identity.playerId);
    if (!localPlayer || (localPlayer.isReady && players.filter(player => player.isReady).length === 4)) return;
    const event = localPlayer.isReady ? 'unready' : 'ready';
    readyPendingRef.current = true;
    readyPlayerIdRef.current = identity.playerId;
    setReadyPending(true);
    errorCodeRef.current = null;
    setError(null);
    socket.emit(event, {});
    logClientEvent(event, 'sent');
  }, [socket, identity, players]);

  return { connected, connectionLost, pending, readyPending, identity, players, error, join, nameChanged, toggleReady };
}
