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
 * onConfirm: (target: import('../../../shared/protocol.js').HandSlotRef | import('../../../shared/protocol.js').PlayerSwap) => void,
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
  const [selectedTargets, setSelectedTargets] = useState(/** @type {import('../../../shared/protocol.js').HandSlotRef[]} */ ([]));
  const confirming = useRef(false);
  const selectionMode = prompt?.stage === 'awaitingTargets';
  const blindSwap = prompt?.power === 'blindSwap';
  const targetsValid = selectedTargets.length === (blindSwap ? 2 : 1)
    && selectedTargets.every(target => cards.some(card => card.playerId === target.playerId && card.handSlotId === target.handSlotId))
    && (!blindSwap || selectedTargets[0].playerId !== selectedTargets[1].playerId);
  useEffect(() => {
    setSelectedTargets([]);
    confirming.current = false;
  }, [prompt, turnPlayerId, drawnCard?.playerId]);
  useEffect(() => {
    if (power?.pendingAction !== 'choosePowerTargets') {
      setSelectedTargets([]);
      confirming.current = false;
    }
  }, [power?.pendingAction]);
  useEffect(() => {
    if (selectionMode && power?.canChooseTargets && artwork.ready) {
      const first = board.current?.querySelector('button[data-card-action="peek"]:enabled, button[data-card-action="swap"]:enabled');
      if (first instanceof HTMLButtonElement) first.focus();
    }
  }, [selectionMode, power?.canChooseTargets, artwork.ready]);
  /** Draft selection remains local until the player confirms it.
   * @param {import('../../../shared/protocol.js').HandSlotRef} target
   */
  function chooseTarget(target) {
    if (!selectionMode || !power?.canChooseTargets || confirming.current) return;
    setSelectedTargets(previous => {
      if (previous.some(ref => ref.playerId === target.playerId && ref.handSlotId === target.handSlotId)) {
        return previous.filter(ref => ref.playerId !== target.playerId || ref.handSlotId !== target.handSlotId);
      }
      if (!blindSwap) return [target];
      if (previous.length === 2 || previous.some(ref => ref.playerId === target.playerId)) return previous;
      return [...previous, target];
    });
  }
  /** Keep the outline locked while the synchronous client command acquires its request lock. */
  function confirmTarget() {
    if (!selectionMode || !power?.canChooseTargets || !targetsValid || confirming.current) return;
    confirming.current = true;
    power.onConfirm(blindSwap ? { first: selectedTargets[0], second: selectedTargets[1] } : selectedTargets[0]);
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
              ? (blindSwap ? 'swap' : (prompt?.power === 'selfPeek' ? player.playerId === identity.playerId : player.playerId !== identity.playerId) ? 'peek' : 'none')
              : player.playerId === identity.playerId && !power?.resolving && turnPlayerId ? 'replace' : 'none'}
            canAct={selectionMode ? Boolean(power?.canChooseTargets) : canReplace}
            selectedSlot={selectionMode ? selectedTargets.find(target => target.playerId === player.playerId)?.handSlotId ?? null : null} peekTargets={targets}
            selectionBlocked={blindSwap && (selectedTargets.length === 2 || selectedTargets.some(target => target.playerId === player.playerId))}
            onAction={slot => selectionMode ? chooseTarget({ playerId: player.playerId, handSlotId: slot }) : onSwap(slot)} />
        ))}
      </ol>
      <CardPiles artworkReady={artwork.ready} drawnCard={drawnCard} discardTop={discardTop}
        highlightDrawn={Boolean(prompt)}
        drawerName={drawer?.displayName} canDraw={canDraw} canDrawDiscard={canDrawDiscard} canDiscardDrawn={canDiscardDrawn}
        onDraw={onDraw} onDrawDiscard={onDrawDiscard} onDiscard={onDiscard} />
      {power && <PowerControls prompt={prompt}
        canUse={power.canUse && artwork.ready} canConfirm={Boolean(power.canChooseTargets && targetsValid && artwork.ready)}
        canSkip={power.canSkip} canDone={power.canDone}
        onUse={power.onUse} onConfirm={confirmTarget} onSkip={power.onSkip} onDone={power.onDone} />}
      <GameControls canReady={canReady && artwork.ready} onReady={onReady} />
    </section>
  );
}
