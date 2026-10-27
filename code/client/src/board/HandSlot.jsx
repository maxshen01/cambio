// Reserves one stable hand position and exposes replacement only for the local player's hand.
import { CARD_IMAGES, CARD_BACK_IMAGE } from '../../../shared/cardCatalog.js';

/** @param {{ playerId: string, slot: import('../../../shared/lobbyTypes.js').HandSlotId,
 * card: import('../../../shared/lobbyTypes.js').CardView | undefined,
 * artworkReady: boolean, replacementMode: boolean, canReplaceCard: boolean,
 * onReplaceCard: (slot: import('../../../shared/lobbyTypes.js').HandSlotId) => void }} props
 */
export function HandSlot({ playerId, slot, card, artworkReady, replacementMode, canReplaceCard, onReplaceCard }) {
  return (
    <div className="setup-hand__slot" aria-hidden={card ? undefined : true}
      data-player-id={playerId} data-slot={slot}
      style={{ gridColumn: Math.ceil(slot / 2), gridRow: slot % 2 === 1 ? 1 : 2 }}>
      {card && artworkReady && (replacementMode ? (
        <button type="button" className="card-action" disabled={!canReplaceCard}
          aria-label={`Replace slot ${slot} with drawn card`} onClick={() => onReplaceCard(card.handSlotId)}>
          <img className="setup-card" draggable={false} src={CARD_BACK_IMAGE} alt={`Slot ${slot}, face down`} />
        </button>
      ) : (
        <img className="setup-card" draggable={false}
          src={card.faceUp ? CARD_IMAGES[card.cardId] : CARD_BACK_IMAGE}
          alt={`Slot ${slot}, face ${card.faceUp ? 'up' : 'down'}`} />
      ))}
    </div>
  );
}
