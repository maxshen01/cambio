// Composes the memorization and playing board, artwork gate, and event-driven animations.
import { useEffect, useRef, useState } from 'react';
import { PlayerHand } from './PlayerHand.jsx';
import { CardPiles } from './CardPiles.jsx';
import { GameControls } from './GameControls.jsx';
import { PowerControls } from './PowerControls.jsx';
import { getSeatPosition } from './seatPosition.js';
import { useCardArtwork } from '../cards/useCardArtwork.js';
import { useCardMovements } from '../cards/useCardMovements.js';

/** @typedef {{ resolving: boolean, prompt: import('../game/gameClientState.js').PowerPrompt | null,
 * peekTargets: import('../../../shared/protocol.js').CardView[],
 * pendingAction: import('../game/gameClientState.js').PowerAction | null,
 * canUse: boolean, canSkip: boolean, canDone: boolean,
 * onUse: (slot: import('../../../shared/protocol.js').HandSlotId) => void,
 * onSkip: () => void, onDone: () => void }} BoardPower */

/** Display recipient-authorized hands and actions; empty positions reserve invisible space.
 * @param {{ players: import('../../../shared/protocol.js').PlayerSummary[],
 * cards: import('../../../shared/protocol.js').CardView[],
 * identity: import('../../../shared/protocol.js').JoinAck,
 * turnPlayerId: string | null,
 * drawnCard: import('../../../shared/protocol.js').DrawnCardView | null,
 * discardTop: import('../../../shared/protocol.js').DiscardView | null,
 * movement: import('../game/gameClientState.js').GameClientState['movement'],
 * power?: BoardPower,
 * canDraw: boolean, canDrawDiscard: boolean, canReplace: boolean, canDiscardDrawn: boolean,
 * onDraw: () => void, onDrawDiscard: () => void, onDiscard: () => void,
 * onSwap: (slot: import('../../../shared/protocol.js').HandSlotId) => void,
 * canReady: boolean, onReady: () => void }} props
 */
export function GameBoard({ players, cards, identity, turnPlayerId, drawnCard, discardTop, movement, power,
  canDraw, canDrawDiscard, canReplace, canDiscardDrawn, onDraw, onDrawDiscard, onDiscard, onSwap, canReady, onReady }) {
  const board = useRef(/** @type {HTMLElement | null} */ (null));
  const artwork = useCardArtwork([...cards, ...(drawnCard ? [drawnCard] : []),
    ...(discardTop ? [{ faceUp: /** @type {const} */ (true), cardId: discardTop.cardId }] : [])]);
  const targets = power?.peekTargets ?? [];
  // Temporary hand artwork has its own gate; it must never blank an already decoded held card.
  const peekArtwork = useCardArtwork(targets);
  const displayedCards = cards.map(card => {
    const target = targets.find(target => target.playerId === card.playerId && target.handSlotId === card.handSlotId);
    return target && (!target.faceUp || peekArtwork.ready) ? target : card;
  });
  const prompt = power?.resolving && drawnCard?.playerId === identity.playerId && turnPlayerId === identity.playerId
    ? power.prompt : null;
  const [selecting, setSelecting] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(/** @type {import('../../../shared/protocol.js').HandSlotId | null} */ (null));
  const selected = useRef(/** @type {import('../../../shared/protocol.js').HandSlotId | null} */ (null));
  const choosing = prompt?.stage === 'awaitingChoice';
  const selectionMode = choosing && selecting;
  useEffect(() => {
    setSelecting(false);
    setSelectedSlot(null);
    selected.current = null;
  }, [prompt, turnPlayerId, drawnCard?.playerId]);
  useEffect(() => {
    if (power?.pendingAction !== 'usePower') {
      setSelectedSlot(null);
      selected.current = null;
    }
  }, [power?.pendingAction]);
  useEffect(() => {
    if (selectionMode && power?.canUse && artwork.ready) {
      const first = board.current?.querySelector('button[data-card-action="peek"]:enabled');
      if (first instanceof HTMLButtonElement) first.focus();
    }
  }, [selectionMode, power?.canUse, artwork.ready]);
  /** Lock the selected outline before invoking the already-guarded client command.
   * @param {import('../../../shared/protocol.js').HandSlotId} slot
   */
  function chooseTarget(slot) {
    if (!selectionMode || !power?.canUse || selected.current !== null) return;
    selected.current = slot;
    setSelectedSlot(slot);
    power.onUse(slot);
  }
  useCardMovements(board, movement, artwork.ready);
  const drawer = players.find(player => player.playerId === drawnCard?.playerId);
  return (
    <section ref={board} className="setup-board" aria-label={turnPlayerId ? 'Playing board' : 'Memorization board'} aria-busy={!artwork.ready || !peekArtwork.ready}>
      {(!artwork.ready || !peekArtwork.ready) && <div className="setup-artwork-status">
        {(artwork.failed || peekArtwork.failed) ? <>
          <p role="alert">Card images could not be loaded. Please try again.</p>
          <button type="button" onClick={() => { artwork.retry(); peekArtwork.retry(); }}>Retry card images</button>
        </> : <p role="status">Loading cards…</p>}
      </div>}
      <ol className="setup-players" aria-label="Players and hands">
        {players.map(player => (
          <PlayerHand key={player.playerId} player={player}
            cards={displayedCards.filter(card => card.playerId === player.playerId)}
            position={getSeatPosition(player.seatId, identity.seatId)}
            isCurrentTurn={player.playerId === turnPlayerId} showReadiness={!turnPlayerId}
            artworkReady={artwork.ready}
            actionMode={player.playerId !== identity.playerId ? 'none' : selectionMode ? 'peek'
              : !power?.resolving && turnPlayerId ? 'replace' : 'none'}
            canAct={selectionMode ? Boolean(power?.canUse) : canReplace}
            selectedSlot={player.playerId === identity.playerId ? selectedSlot : null} peekTargets={targets}
            onAction={selectionMode ? chooseTarget : onSwap} />
        ))}
      </ol>
      <CardPiles artworkReady={artwork.ready} drawnCard={drawnCard} discardTop={discardTop}
        highlightDrawn={Boolean(prompt)}
        drawerName={drawer?.displayName} canDraw={canDraw} canDrawDiscard={canDrawDiscard} canDiscardDrawn={canDiscardDrawn}
        onDraw={onDraw} onDrawDiscard={onDrawDiscard} onDiscard={onDiscard} />
      {power && <PowerControls prompt={prompt} selecting={selectionMode}
        canUse={power.canUse && artwork.ready} canSkip={power.canSkip} canDone={power.canDone}
        onSelect={() => setSelecting(true)} onSkip={power.onSkip} onDone={power.onDone} />}
      <GameControls canReady={canReady && artwork.ready} onReady={onReady} />
    </section>
  );
}
