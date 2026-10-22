// Owns socket listeners and React state for lobby membership and connection loss.
import { useCallback, useEffect, useRef, useState } from 'react';
import { logClientEvent } from '../socket/log.js';

/** Track connection, join response, lobby seats, and join errors for one socket. */
export function useLobby(socket) {
  const [connected, setConnected] = useState(socket.connected);
  const [connectionLost, setConnectionLost] = useState(false);
  const [pending, setPending] = useState(false);
  const [identity, setIdentity] = useState(null);
  const [players, setPlayers] = useState([]);
  const [error, setError] = useState(null);
  const pendingRef = useRef(false);
  const connectionLostRef = useRef(false);

  // Attach lobby listeners once per socket and remove them on unmount.
  useEffect(() => {
    /** Mark the socket usable after its connection succeeds. */
    function onConnect() {
      if (connectionLostRef.current) return;
      setConnected(true);
      setError(null);
      logClientEvent('connect', 'connected');
    }

    /** Surface a failed connection and release a pending join. */
    function onConnectError() {
      if (connectionLostRef.current) return;
      setConnected(false);
      pendingRef.current = false;
      setPending(false);
      setError('Unable to connect to the server.');
      logClientEvent('connect_error', 'failed');
    }

    /** Forget this connection's membership; rejoining requires a page reload. */
    function onDisconnect() {
      connectionLostRef.current = true;
      pendingRef.current = false;
      setConnected(false);
      setConnectionLost(true);
      setPending(false);
      setIdentity(null);
      setPlayers([]);
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

    /** Show a rejected join and make the form available for retry. */
    function onServerError(serverError) {
      if (connectionLostRef.current) return;
      pendingRef.current = false;
      setPending(false);
      setError(serverError.message);
      logClientEvent('error', 'received', { code: serverError.code });
    }

    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.on('disconnect', onDisconnect);
    socket.on('playerJoined', onPlayerJoined);
    socket.on('playerDisconnected', onPlayerDisconnected);
    socket.on('error', onServerError);
    if (!socket.connected) socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      socket.off('disconnect', onDisconnect);
      socket.off('playerJoined', onPlayerJoined);
      socket.off('playerDisconnected', onPlayerDisconnected);
      socket.off('error', onServerError);
    };
  }, [socket]);

  /** Send one trimmed join request and store the acknowledged seat. */
  const join = useCallback(displayName => {
    const trimmedName = displayName.trim();
    if (connectionLostRef.current || !socket.connected || pendingRef.current || identity || !trimmedName) return;

    pendingRef.current = true;
    setPending(true);
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

  return { connected, connectionLost, pending, identity, players, error, join };
}
