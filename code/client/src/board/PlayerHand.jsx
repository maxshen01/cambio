// Renders a player's details and eight reserved card positions around the table.
import { HandSlot } from './HandSlot.jsx';

/** @type {import('../../../shared/protocol.js').HandSlotId[]} */
const handSlots = [1, 2, 3, 4, 5, 6, 7, 8];

/** @param {{ player: import('../../../shared/protocol.js').PlayerSummary,
 * cards: import('../../../shared/protocol.js').CardView[], position: string,
 * isCurrentTurn: boolean, showReadiness: boolean, artworkReady: boolean,
 * actionMode: 'replace' | 'peek' | 'swap' | 'none', canAct: boolean, selectionBlocked?: boolean,
 * selectedSlots: import('../../../shared/protocol.js').HandSlotId[],
 * peekTargets: import('../../../shared/protocol.js').CardView[],
 * onAction: (slot: import('../../../shared/protocol.js').HandSlotId) => void }} props
 */
export function PlayerHand({ player, cards, position, isCurrentTurn, showReadiness, artworkReady,
  actionMode, canAct, selectionBlocked = false, selectedSlots, peekTargets, onAction }) {
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
              actionMode={actionMode} canAct={canAct && (!selectionBlocked || selectedSlots.includes(slot))} selected={selectedSlots.includes(slot)}
              peeked={peekTargets.some(card => card.playerId === player.playerId && card.handSlotId === slot)}
              onAction={onAction} />
          ))}
        </div>
      </div>
    </li>
  );
}
