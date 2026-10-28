// Renders the server-assigned players in four stable lobby seats.
import { getSeatPosition } from '../board/seatPosition.js';

/** Rotate the four stable seats around the local player's position.
 * @param {{ players: import('../../../shared/protocol.js').PlayerSummary[],
 * localSeatId?: import('../../../shared/protocol.js').SeatId }} props
 */
export function SeatList({ players, localSeatId = 1 }) {
  return (
    <ol className="seats" aria-label="Lobby seats">
      {[1, 2, 3, 4].map(seatId => {
        const player = players.find(candidate => candidate.seatId === seatId);
        const position = getSeatPosition(seatId, localSeatId);
        return (
          <li className={`seat seat--${position}`} key={seatId} aria-label={`Seat ${seatId}`}>
            <span className="seat__circle" aria-hidden="true" />
            <span className="seat__details">
              {player ? (
                <>
                  <span className="seat__name">{player.displayName}</span>
                  <span className={`seat__readiness seat__readiness--${player.isReady ? 'ready' : 'waiting'}`}>
                    <span className="visually-hidden">{player.isReady ? 'Ready' : 'Not ready'}</span>
                  </span>
                </>
              ) : (
                <span className="seat__empty">Empty</span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
