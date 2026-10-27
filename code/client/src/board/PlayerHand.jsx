// Renders a player's details and eight reserved card positions around the table.
import { HandSlot } from './HandSlot.jsx';

/** @type {import('../../../shared/lobbyTypes.js').HandSlotId[]} */
const handSlots = [1, 2, 3, 4, 5, 6, 7, 8];

/** @param {{ player: import('../../../shared/lobbyTypes.js').PlayerSummary,
 * cards: import('../../../shared/lobbyTypes.js').CardView[], position: string,
 * isCurrentTurn: boolean, showReadiness: boolean, artworkReady: boolean,
 * replacementMode: boolean, canReplaceCard: boolean,
 * onReplaceCard: (slot: import('../../../shared/lobbyTypes.js').HandSlotId) => void }} props
 */
export function PlayerHand({ player, cards, position, isCurrentTurn, showReadiness, artworkReady,
  replacementMode, canReplaceCard, onReplaceCard }) {
  return (
    <li className={`setup-player setup-player--${position}${isCurrentTurn ? ' setup-player--current' : ''}`}
      aria-label={`Seat ${player.seatId}`} aria-current={isCurrentTurn ? 'true' : undefined}>
      <div className="setup-player__details">
        <span className="seat__circle" aria-hidden="true" />
        <span className="seat__name">{player.displayName}</span>
        {showReadiness && <span className={`seat__readiness seat__readiness--${player.isReady ? 'ready' : 'waiting'}`}>
          <span className="visually-hidden">{player.isReady ? 'Ready' : 'Not ready'}</span>
        </span>}
        {isCurrentTurn && <span className="visually-hidden">Current turn</span>}
      </div>
      <div className="setup-hand-frame">
        <div className="setup-hand">
          {handSlots.map(slot => (
            <HandSlot key={slot} playerId={player.playerId} slot={slot}
              card={cards.find(card => card.handSlotId === slot)} artworkReady={artworkReady}
              replacementMode={replacementMode} canReplaceCard={canReplaceCard} onReplaceCard={onReplaceCard} />
          ))}
        </div>
      </div>
    </li>
  );
}
