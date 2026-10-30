// One stable hand position with recipient-authorized artwork and an explicit card action.
import { CARD_IMAGES, CARD_BACK_IMAGE } from '../../../shared/cardCatalog.js';

/** @param {{ playerId: string, slot: import('../../../shared/protocol.js').HandSlotId,
 * card: import('../../../shared/protocol.js').CardView | undefined,
 * artworkReady: boolean, actionMode: 'replace' | 'peek' | 'swap' | 'none', canAct: boolean,
 * selected: boolean, peeked: boolean,
 * onAction: (slot: import('../../../shared/protocol.js').HandSlotId) => void }} props
 */
export function HandSlot({ playerId, slot, card, artworkReady, actionMode, canAct, selected, peeked, onAction }) {
  const image = card && artworkReady && <img className="setup-card" draggable={false}
    src={card.faceUp ? CARD_IMAGES[card.cardId] : CARD_BACK_IMAGE}
    alt={`Slot ${slot}, face ${card.faceUp ? 'up' : 'down'}`} />;
  return (
    <div className={`setup-hand__slot${selected ? ' setup-hand__slot--selected' : ''}${peeked ? ' setup-hand__slot--peeked' : ''}`} aria-hidden={card ? undefined : true}
      data-player-id={playerId} data-slot={slot}
      style={{ gridColumn: Math.ceil(slot / 2), gridRow: slot % 2 === 1 ? 1 : 2 }}>
      {card && artworkReady && (actionMode === 'none' ? image : <button type="button" className="card-action" disabled={!canAct}
        data-card-action={actionMode} aria-pressed={actionMode === 'peek' || actionMode === 'swap' ? selected : undefined}
        aria-label={actionMode === 'swap' ? `Swap slot ${slot}` : actionMode === 'peek' ? `Peek at slot ${slot}` : `Replace slot ${slot} with drawn card`}
        onClick={() => onAction(card.handSlotId)}>{image}</button>)}
    </div>
  );
}
