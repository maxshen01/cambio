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
 * canUse: boolean, canChooseTargets: boolean, canSkip: boolean, canDone: boolean,
 * onUse: () => void,
 * onChooseTargets: (target: import('../../../shared/protocol.js').HandSlotRef | import('../../../shared/protocol.js').HandSlotRef[] | import('../../../shared/protocol.js').PlayerSwap) => void,
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
  const prompt = drawnCard?.playerId === identity.playerId && turnPlayerId === identity.playerId
    ? power?.prompt ?? null : null;
  const [selectedTargets, setSelectedTargets] = useState(/** @type {import('../../../shared/protocol.js').HandSlotRef[]} */ ([]));
  const selection = useRef(selectedTargets);
  const submitting = useRef(false);
  const selectionMode = prompt?.stage === 'awaitingTargets' || prompt?.stage === 'awaitingSwap';
  const swapMode = prompt?.power === 'blindSwap' || prompt?.stage === 'awaitingSwap';
  const peekSwap = prompt?.power === 'onePeekSwap' || prompt?.power === 'twoPeekSwap';
  const requiredTargets = swapMode || prompt?.power === 'twoPeekSwap' ? 2 : 1;
  useEffect(() => {
    selection.current = [];
    setSelectedTargets([]);
    submitting.current = false;
  }, [prompt, turnPlayerId, drawnCard?.playerId]);
  useEffect(() => {
    if (power?.pendingAction !== 'choosePowerTargets' && power?.pendingAction !== 'choosePowerSwap') {
      selection.current = [];
      setSelectedTargets([]);
      submitting.current = false;
    }
  }, [power?.pendingAction]);
  useEffect(() => {
    if (selectionMode && power?.canChooseTargets && artwork.ready) {
      const first = board.current?.querySelector('button[data-card-action="peek"]:enabled, button[data-card-action="swap"]:enabled');
      if (first instanceof HTMLButtonElement) first.focus();
    }
  }, [selectionMode, power?.canChooseTargets, artwork.ready]);
  /** Submit on the last valid click; refs also guard bursts before React renders.
   * @param {import('../../../shared/protocol.js').HandSlotRef} target
   */
  function chooseTarget(target) {
    if (!selectionMode || !power?.canChooseTargets || submitting.current) return;
    if (!cards.some(card => card.playerId === target.playerId && card.handSlotId === target.handSlotId)
      || !swapMode && !peekSwap && (prompt?.power === 'selfPeek' ? target.playerId !== identity.playerId : target.playerId === identity.playerId)) return;
    const previous = selection.current;
    const deselect = previous.some(ref => ref.playerId === target.playerId && ref.handSlotId === target.handSlotId);
    if (!deselect && (previous.length >= requiredTargets || swapMode && previous.some(ref => ref.playerId === target.playerId))) return;
    const next = deselect ? previous.filter(ref => ref.playerId !== target.playerId || ref.handSlotId !== target.handSlotId)
      : [...previous, target];
    selection.current = next;
    setSelectedTargets(next);
    if (next.length !== requiredTargets) return;
    submitting.current = true;
    power.onChooseTargets(swapMode ? { first: next[0], second: next[1] }
      : peekSwap ? next : next[0]);
  }
  useCardMovements(board, movement, artwork.ready, movement?.kind === 'powerSwap' && !drawnCard);
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
            actionMode={selectionMode
              ? (swapMode ? 'swap' : (peekSwap || (prompt?.power === 'selfPeek' ? player.playerId === identity.playerId : player.playerId !== identity.playerId)) ? 'peek' : 'none')
              : player.playerId === identity.playerId && !power?.resolving && turnPlayerId ? 'replace' : 'none'}
            canAct={selectionMode ? Boolean(power?.canChooseTargets) : canReplace}
            selectedSlots={selectionMode ? selectedTargets.filter(target => target.playerId === player.playerId).map(target => target.handSlotId) : []} peekTargets={targets}
            selectionBlocked={requiredTargets === 2 && (selectedTargets.length === 2 || swapMode && selectedTargets.some(target => target.playerId === player.playerId))}
            onAction={slot => selectionMode ? chooseTarget({ playerId: player.playerId, handSlotId: slot }) : onSwap(slot)} />
        ))}
      </ol>
      <CardPiles artworkReady={artwork.ready} drawnCard={drawnCard} discardTop={discardTop}
        highlightDrawn={Boolean(prompt)}
        canUsePower={Boolean(power?.canUse)} onUsePower={power?.onUse}
        drawerName={drawer?.displayName} canDraw={canDraw} canDrawDiscard={canDrawDiscard} canDiscardDrawn={canDiscardDrawn}
        onDraw={onDraw} onDrawDiscard={onDrawDiscard} onDiscard={onDiscard} />
      {power && <PowerControls prompt={prompt}
        canUse={power.canUse && artwork.ready}
        canSkip={power.canSkip} canDone={power.canDone}
        onUse={power.onUse} onSkip={power.onSkip} onDone={power.onDone} />}
      <GameControls canReady={canReady && artwork.ready} onReady={onReady} />
    </section>
  );
}
