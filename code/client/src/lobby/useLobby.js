// Owns the socket listeners and React state for joining the lobby.
import { useCallback, useEffect, useRef, useState } from 'react';
import { logClientEvent } from '../socket/log.js';

/** Track connection, join response, lobby seats, and join errors for one socket. */
export function useLobby(socket) {
  const [connected, setConnected] = useState(socket.connected);
  const [pending, setPending] = useState(false);
  const [identity, setIdentity] = useState(null);
  const [players, setPlayers] = useState([]);
  const [error, setError] = useState(null);
  const pendingRef = useRef(false);

  // Attach lobby listeners once per socket and remove them on unmount.
  useEffect(() => {
    /** Mark the socket usable after its connection succeeds. */
    function onConnect() {
      setConnected(true);
      setError(null);
      logClientEvent('connect', 'connected');
    }

    /** Surface a failed connection and release a pending join. */
    function onConnectError() {
      setConnected(false);
      pendingRef.current = false;
      setPending(false);
      setError('Unable to connect to the server.');
      logClientEvent('connect_error', 'failed');
    }

    /** Replace the displayed seats with the server's complete lobby view. */
    function onPlayerJoined(lobby) {
      setPlayers(lobby.players);
      logClientEvent('playerJoined', 'received', { playerCount: lobby.players.length });
    }

    /** Replace seats after another seated player leaves the lobby. */
    function onPlayerDisconnected(lobby) {
      setPlayers(lobby.players);
      logClientEvent('playerDisconnected', 'received', { playerCount: lobby.players.length });
    }

    /** Show a rejected join and make the form available for retry. */
    function onServerError(serverError) {
      pendingRef.current = false;
      setPending(false);
      setError(serverError.message);
      logClientEvent('error', 'received', { code: serverError.code });
    }

    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.on('playerJoined', onPlayerJoined);
    socket.on('playerDisconnected', onPlayerDisconnected);
    socket.on('error', onServerError);
    if (!socket.connected) socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      socket.off('playerJoined', onPlayerJoined);
      socket.off('playerDisconnected', onPlayerDisconnected);
      socket.off('error', onServerError);
    };
  }, [socket]);

  /** Send one trimmed join request and store the acknowledged seat. */
  const join = useCallback(displayName => {
    const trimmedName = displayName.trim();
    if (!socket.connected || pendingRef.current || identity || !trimmedName) return;

    pendingRef.current = true;
    setPending(true);
    setError(null);
    logClientEvent('joinRoom', 'sent');
    socket.emit('joinRoom', { displayName: trimmedName }, ack => {
      pendingRef.current = false;
      setPending(false);
      setIdentity({ playerId: ack.playerId, seatId: ack.seatId });
      logClientEvent('joinRoom', 'acknowledged', { seatId: ack.seatId });
    });
  }, [socket, identity]);

  return { connected, pending, identity, players, error, join };
}
