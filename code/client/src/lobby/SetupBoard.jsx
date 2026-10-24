// Noninteractive setup board: stable seats, recipient-authorized faces, and reserved empty space.
import { CARD_IMAGES, CARD_BACK_IMAGE } from '../../../shared/cardCatalog.js';

const positions = ['bottom', 'left', 'top', 'right'];

/** Show all opening hands around the local player's seat; empty positions have no graphic.
 * @param {{ players: import('../../../shared/lobbyTypes.js').PlayerSummary[],
 * cards: import('../../../shared/lobbyTypes.js').CardView[],
 * identity: import('../../../shared/lobbyTypes.js').JoinAck,
 * canReady: boolean, onReady: () => void }} props
 */
export function SetupBoard({ players, cards, identity, canReady, onReady }) {
  return (
    <section className="setup-board" aria-label="Memorization board">
      <ol className="setup-players" aria-label="Players and hands">
        {players.map(player => {
          const position = positions[(player.seatId - identity.seatId + 4) % 4];
          return (
            <li className={`setup-player setup-player--${position}`} key={player.playerId} aria-label={`Seat ${player.seatId}`}>
              <div className="setup-player__details">
                <span className="seat__circle" aria-hidden="true" />
                <span className="seat__name">{player.displayName}{player.playerId === identity.playerId ? ' (you)' : ''}</span>
                <span className={`seat__readiness seat__readiness--${player.isReady ? 'ready' : 'waiting'}`}>
                  <span className="visually-hidden">{player.isReady ? 'Ready' : 'Not ready'}</span>
                </span>
              </div>
              <div className="setup-hand-frame">
                <div className="setup-hand">
                  {Array.from({ length: 8 }, (_, index) => {
                    const slot = index + 1;
                    const card = cards.find(candidate => candidate.playerId === player.playerId && candidate.handSlotId === slot);
                    return (
                      <div className="setup-hand__slot" key={slot} aria-hidden={card ? undefined : true}
                        style={{ gridColumn: Math.ceil(slot / 2), gridRow: slot % 2 === 1 ? 1 : 2 }}>
                        {card && <img className="setup-card" draggable={false}
                          src={card.faceUp ? CARD_IMAGES[card.cardId] : CARD_BACK_IMAGE}
                          alt={`Slot ${slot}, face ${card.faceUp ? 'up' : 'down'}`} />}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="setup-drawn" aria-hidden="true" />
            </li>
          );
        })}
      </ol>
      <div className="setup-piles">
        <img className="setup-card" src={CARD_BACK_IMAGE} alt="Deck" draggable={false} />
        <div className="setup-discard" aria-hidden="true" />
      </div>
      <div className="setup-controls">
        <button type="button" disabled>Call Cambio</button>
        <button type="button" disabled={!canReady} onClick={onReady}>Ready Up</button>
      </div>
    </section>
  );
}
