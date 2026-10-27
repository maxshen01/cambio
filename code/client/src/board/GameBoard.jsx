// Composes the memorization and playing board, artwork gate, and event-driven animations.
import { useRef } from 'react';
import { PlayerHand } from './PlayerHand.jsx';
import { CardPiles } from './CardPiles.jsx';
import { GameControls } from './GameControls.jsx';
import { getSeatPosition } from './seatPosition.js';
import { useCardArtwork } from '../cards/useCardArtwork.js';
import { useCardMovements } from '../cards/useCardMovements.js';

/** Display recipient-authorized hands and actions; empty positions reserve invisible space.
 * @param {{ players: import('../../../shared/lobbyTypes.js').PlayerSummary[],
 * cards: import('../../../shared/lobbyTypes.js').CardView[],
 * identity: import('../../../shared/lobbyTypes.js').JoinAck,
 * turnPlayerId: string | null,
 * drawnCard: import('../../../shared/lobbyTypes.js').DrawnCardView | null,
 * discardTop: import('../../../shared/lobbyTypes.js').DiscardView | null,
 * movement: import('../game/gameClientState.js').GameClientState['movement'],
 * canDraw: boolean, canResolve: boolean, onDraw: () => void, onDiscard: () => void,
 * onSwap: (slot: import('../../../shared/lobbyTypes.js').HandSlotId) => void,
 * canReady: boolean, onReady: () => void }} props
 */
export function GameBoard({ players, cards, identity, turnPlayerId, drawnCard, discardTop, movement,
  canDraw, canResolve, onDraw, onDiscard, onSwap, canReady, onReady }) {
  const board = useRef(/** @type {HTMLElement | null} */ (null));
  const artwork = useCardArtwork([...cards, ...(drawnCard ? [drawnCard] : []),
    ...(discardTop ? [{ faceUp: /** @type {const} */ (true), cardId: discardTop.cardId }] : [])]);
  useCardMovements(board, movement, artwork.ready);
  const drawer = players.find(player => player.playerId === drawnCard?.playerId);
  return (
    <section ref={board} className="setup-board" aria-label={turnPlayerId ? 'Playing board' : 'Memorization board'} aria-busy={!artwork.ready}>
      {!artwork.ready && <div className="setup-artwork-status">
        {artwork.failed ? <>
          <p role="alert">Card images could not be loaded. Please try again.</p>
          <button type="button" onClick={artwork.retry}>Retry card images</button>
        </> : <p role="status">Loading cards…</p>}
      </div>}
      <ol className="setup-players" aria-label="Players and hands">
        {players.map(player => (
          <PlayerHand key={player.playerId} player={player}
            cards={cards.filter(card => card.playerId === player.playerId)}
            position={getSeatPosition(player.seatId, identity.seatId)}
            isCurrentTurn={player.playerId === turnPlayerId} showReadiness={!turnPlayerId}
            artworkReady={artwork.ready}
            replacementMode={Boolean(turnPlayerId) && player.playerId === identity.playerId}
            canReplaceCard={canResolve} onReplaceCard={onSwap} />
        ))}
      </ol>
      <CardPiles artworkReady={artwork.ready} drawnCard={drawnCard} discardTop={discardTop}
        drawerName={drawer?.displayName} canDraw={canDraw} canResolve={canResolve}
        onDraw={onDraw} onDiscard={onDiscard} />
      <GameControls canReady={canReady && artwork.ready} onReady={onReady} />
    </section>
  );
}
