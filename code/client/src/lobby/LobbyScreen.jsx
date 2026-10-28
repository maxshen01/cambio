// Composes the waiting-room seats and server-confirmed readiness control.
import { SeatList } from './SeatList.jsx';

/** @param {{ players: import('../../../shared/protocol.js').PlayerSummary[],
 * localSeatId?: import('../../../shared/protocol.js').SeatId,
 * isReady: boolean, canReady: boolean, onReady: () => void }} props
 */
export function LobbyScreen({ players, localSeatId, isReady, canReady, onReady }) {
  return (
    <div className="lobby__table">
      <SeatList players={players} localSeatId={localSeatId} />
      <button className="ready-button" type="button" disabled={!canReady} onClick={onReady}>
        {isReady ? 'Unready' : 'Ready Up'}
      </button>
    </div>
  );
}
