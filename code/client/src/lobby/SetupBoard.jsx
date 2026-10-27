// Displays private setup and deck-turn cards, with accessible server-confirmed action controls.
import { useRef } from 'react';
import { CARD_IMAGES, CARD_BACK_IMAGE } from '../../../shared/cardCatalog.js';
import { useCardArtwork } from '../cards/useCardArtwork.js';
import { useCardMovements } from '../cards/useCardMovements.js';

const positions = ['bottom', 'left', 'top', 'right'];

/** Show all opening hands around the local player's seat; empty positions have no graphic.
 * @param {{ players: import('../../../shared/lobbyTypes.js').PlayerSummary[],
 * cards: import('../../../shared/lobbyTypes.js').CardView[],
 * identity: import('../../../shared/lobbyTypes.js').JoinAck,
 * turnPlayerId: string | null,
 * drawnCard: import('../../../shared/lobbyTypes.js').DrawnCardView | null,
 * discardTop: import('../../../shared/lobbyTypes.js').DiscardView | null,
 * movement: import('./lobbyReducer.js').LobbyState['movement'],
 * canDraw: boolean, canResolve: boolean, onDraw: () => void, onDiscard: () => void,
 * onSwap: (slot: import('../../../shared/lobbyTypes.js').HandSlotId) => void,
 * canReady: boolean, onReady: () => void }} props
 */
export function SetupBoard({ players, cards, identity, turnPlayerId, drawnCard, discardTop, movement,
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
        {players.map(player => {
          const position = positions[(player.seatId - identity.seatId + 4) % 4];
          return (
            <li className={`setup-player setup-player--${position}${player.playerId === turnPlayerId ? ' setup-player--current' : ''}`}
              key={player.playerId} aria-label={`Seat ${player.seatId}`} aria-current={player.playerId === turnPlayerId ? 'true' : undefined}>
              <div className="setup-player__details">
                <span className="seat__circle" aria-hidden="true" />
                <span className="seat__name">{player.displayName}</span>
                {!turnPlayerId && <span className={`seat__readiness seat__readiness--${player.isReady ? 'ready' : 'waiting'}`}>
                  <span className="visually-hidden">{player.isReady ? 'Ready' : 'Not ready'}</span>
                </span>}
                {player.playerId === turnPlayerId && <span className="visually-hidden">Current turn</span>}
              </div>
              <div className="setup-hand-frame">
                <div className="setup-hand">
                  {Array.from({ length: 8 }, (_, index) => {
                    const slot = index + 1;
                    const card = cards.find(candidate => candidate.playerId === player.playerId && candidate.handSlotId === slot);
                    return (
                      <div className="setup-hand__slot" key={slot} aria-hidden={card ? undefined : true}
                        data-player-id={player.playerId} data-slot={slot}
                        style={{ gridColumn: Math.ceil(slot / 2), gridRow: slot % 2 === 1 ? 1 : 2 }}>
                        {card && artwork.ready && (turnPlayerId && player.playerId === identity.playerId ?
                          <button type="button" className="card-action" disabled={!canResolve}
                            aria-label={`Replace slot ${slot} with drawn card`} onClick={() => onSwap(card.handSlotId)}>
                            <img className="setup-card" draggable={false} src={CARD_BACK_IMAGE} alt={`Slot ${slot}, face down`} />
                          </button> : <img className="setup-card" draggable={false}
                          src={card.faceUp ? CARD_IMAGES[card.cardId] : CARD_BACK_IMAGE}
                          alt={`Slot ${slot}, face ${card.faceUp ? 'up' : 'down'}`} />)}
                      </div>
                    );
                  })}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="setup-piles">
        <div className="setup-deck">{artwork.ready && <button type="button" className="card-action"
          aria-label="Draw from deck" disabled={!canDraw} onClick={onDraw}>
          <img className="setup-card" src={CARD_BACK_IMAGE} alt="Deck" draggable={false} />
        </button>}</div>
        <div className="setup-discard" aria-hidden={discardTop ? undefined : true}>
          {discardTop && artwork.ready && <button type="button" className="card-action" aria-label="Draw from discard" disabled>
            <img className="setup-card" src={CARD_IMAGES[discardTop.cardId]} alt="Discard pile" draggable={false} />
          </button>}
        </div>
        <div className="setup-drawn" aria-hidden={drawnCard ? undefined : true}>
          {drawnCard && artwork.ready && <button type="button" className="card-action" aria-label="Discard drawn card"
            disabled={!canResolve} onClick={onDiscard}>
            <img className="setup-card" draggable={false}
              src={drawnCard.faceUp ? CARD_IMAGES[drawnCard.cardId] : CARD_BACK_IMAGE}
              alt={`Drawn card for ${drawer?.displayName ?? 'player'}, face ${drawnCard.faceUp ? 'up' : 'down'}`} />
          </button>}
        </div>
      </div>
      <div className="setup-controls">
        <button type="button" disabled>Call Cambio</button>
        <button type="button" disabled={!canReady || !artwork.ready} onClick={onReady}>Ready Up</button>
      </div>
    </section>
  );
}
