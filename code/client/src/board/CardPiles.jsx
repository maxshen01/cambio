// Displays the deck, public discard top, and recipient-authorized shared drawn card.
import { CARD_IMAGES, CARD_BACK_IMAGE } from '../../../shared/cardCatalog.js';

/** @param {{ artworkReady: boolean,
 * drawnCard: import('../../../shared/lobbyTypes.js').DrawnCardView | null,
 * discardTop: import('../../../shared/lobbyTypes.js').DiscardView | null,
 * drawerName?: string, canDraw: boolean, canDrawDiscard: boolean, canDiscardDrawn: boolean,
 * onDraw: () => void, onDrawDiscard: () => void, onDiscard: () => void }} props
 */
export function CardPiles({ artworkReady, drawnCard, discardTop, drawerName, canDraw, canDrawDiscard, canDiscardDrawn, onDraw, onDrawDiscard, onDiscard }) {
  return (
    <div className="setup-piles">
      <div className="setup-deck">{artworkReady && <button type="button" className="card-action"
        aria-label="Draw from deck" disabled={!canDraw} onClick={onDraw}>
        <img className="setup-card" src={CARD_BACK_IMAGE} alt="Deck" draggable={false} />
      </button>}</div>
      <div className="setup-discard" aria-hidden={discardTop ? undefined : true}>
        {discardTop && artworkReady && <button type="button" className="card-action" aria-label="Draw from discard"
          disabled={!canDrawDiscard} onClick={onDrawDiscard}>
          <img className="setup-card" src={CARD_IMAGES[discardTop.cardId]} alt="Discard pile" draggable={false} />
        </button>}
      </div>
      <div className="setup-drawn" aria-hidden={drawnCard ? undefined : true}>
        {drawnCard && artworkReady && <button type="button" className="card-action" aria-label="Discard drawn card"
          disabled={!canDiscardDrawn} onClick={onDiscard}>
          <img className="setup-card" draggable={false}
            src={drawnCard.faceUp ? CARD_IMAGES[drawnCard.cardId] : CARD_BACK_IMAGE}
            alt={`Drawn card for ${drawerName ?? 'player'}, face ${drawnCard.faceUp ? 'up' : 'down'}`} />
        </button>}
      </div>
    </div>
  );
}
