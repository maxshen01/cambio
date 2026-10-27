// Composes the client state, derived view, socket lifecycle, and player commands.
import { useReducer, useRef } from 'react';
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
  const [state, dispatch] = useReducer(gameClientReducer, socket.connected, initialGameClientState);
  const session = useRef(createSessionControl());
  const { view, permissions } = selectGameClient(state);
  useGameSocketEvents(socket, dispatch, session);
  const actions = useGameActions({ socket, state, view, permissions, dispatch, session });
  return { state, view, permissions, actions };
}
