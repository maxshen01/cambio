// Composes the client state, derived view, socket lifecycle, and player commands.
import { useCallback, useState, useRef } from 'react';
import { initialGameClientState } from './gameClientState.js';
import { gameClientReducer } from './gameClientReducer.js';
import { selectGameClient } from './gameSelectors.js';
import { createSessionControl } from './sessionControl.js';
import { useGameSocketEvents } from './useGameSocketEvents.js';
import { useGameActions } from './useGameActions.js';

/** One state owner and one shared session guard for this browser tab's connection.
 * @param {import('./sessionControl.js').GameSocket} socket
 */
export function useGameClient(socket) {
  const [state, setState] = useState(() => initialGameClientState(socket.connected));
  const session = useRef(createSessionControl(state));
  // Apply the same pure reducer synchronously so event/action bursts cannot use stale render permissions.
  /** @type {import('./sessionControl.js').ClientDispatch} */
  const dispatch = useCallback(action => {
    const next = gameClientReducer(session.current.state, action);
    session.current.state = next;
    session.current.turnPending = next.turnPending;
    setState(next);
  }, []);
  const { view, permissions } = selectGameClient(state);
  useGameSocketEvents(socket, dispatch, session);
  const actions = useGameActions({ socket, dispatch, session });
  return { state, view, permissions, actions };
}
