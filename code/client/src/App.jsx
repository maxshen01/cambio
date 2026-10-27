// Composes joining, the lobby, memorization, and ordinary deck-draw turns.
import { JoinDialog } from './lobby/JoinDialog.jsx';
import { LobbyScreen } from './lobby/LobbyScreen.jsx';
import { GameBoard } from './board/GameBoard.jsx';
import { useGameClient } from './game/useGameClient.js';
import { useEffect } from 'react';
import { preloadCardArtwork } from './cards/cardArtwork.js';

/** Compose the current screen using state from this browser's socket connection.
 * @param {{ socket: import('./game/sessionControl.js').GameSocket }} props
 */
export function App({ socket }) {
  useEffect(() => { void preloadCardArtwork(); }, []);
  const { state, view, permissions, actions } = useGameClient(socket);
  const { identity, players, error, stage, cards, turnPlayerId, drawnCard, discardTop, movement } = state;
  const { connectionLost, localPlayer, joined, connectionStatus } = view;
  const { canJoin, canReady, canRetry, canDraw, canResolve } = permissions;
  const { joinLobby, notifyNameChanged, toggleReady, retryConnection,
    drawFromDeck, discardDrawnCard, replaceHandCard } = actions;
  const showJoinDialog = !joined;

  return (
    <main className="lobby">
      <div className={`lobby__content${stage !== 'lobby' ? ' lobby__content--setup' : ''}`} inert={showJoinDialog ? true : undefined}>
        <h1 className="lobby__title">{stage !== 'lobby' ? 'Cambio' : 'Cambio lobby'}</h1>
        {!showJoinDialog && error && <p className="lobby__error" role="alert">{error.message}</p>}
        {stage !== 'lobby' && identity ? (
          <GameBoard players={players} cards={cards} identity={identity} turnPlayerId={turnPlayerId}
            drawnCard={drawnCard} discardTop={discardTop} movement={movement} canDraw={canDraw} canResolve={canResolve}
            onDraw={drawFromDeck} onDiscard={discardDrawnCard} onSwap={replaceHandCard} canReady={canReady} onReady={toggleReady} />
        ) : <LobbyScreen players={players} localSeatId={identity?.seatId}
          isReady={localPlayer?.isReady ?? false} canReady={canReady} onReady={toggleReady} />}
      </div>
      {showJoinDialog && <JoinDialog connectionStatus={connectionStatus} connectionLost={connectionLost}
        error={error} canJoin={canJoin} canRetry={canRetry} onJoin={joinLobby}
        onNameChange={notifyNameChanged} onRetry={retryConnection} />}
    </main>
  );
}
