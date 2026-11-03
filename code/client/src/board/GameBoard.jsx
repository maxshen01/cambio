// Composes the memorization and playing board, artwork gate, and event-driven animations.
import { useEffect, useRef } from 'react';
import { PlayerHand } from './PlayerHand.jsx';
import { CardPiles } from './CardPiles.jsx';
import { GameControls } from './GameControls.jsx';
import { PowerControls } from './PowerControls.jsx';
import { getSeatPosition } from './seatPosition.js';
import { useCardArtwork } from '../cards/useCardArtwork.js';
import { useCardMovements } from '../cards/useCardMovements.js';
import { usePowerSelection } from './usePowerSelection.js';
import { allowsPowerTargetOwner } from '../game/powerPolicy.js';

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
  const selection = usePowerSelection({ prompt, cards, ownerId: identity.playerId, turnPlayerId,
    drawnPlayerId: drawnCard?.playerId, canChooseTargets: Boolean(power?.canChooseTargets),
    pendingAction: power?.pendingAction, onChooseTargets: power?.onChooseTargets });
  const selectionMode = selection.active;
  useEffect(() => {
    if (selectionMode && power?.canChooseTargets && artwork.ready) {
      const first = board.current?.querySelector('button[data-card-action="peek"]:enabled, button[data-card-action="swap"]:enabled');
      if (first instanceof HTMLButtonElement) first.focus();
    }
  }, [selectionMode, power?.canChooseTargets, artwork.ready]);
  /** Resolve each hand's interaction without mixing power rules into JSX.
   * @param {string} playerId
   * @returns {'peek' | 'swap' | 'replace' | 'none'}
   */
  function handActionMode(playerId) {
    if (selectionMode && selection.policy) {
      return allowsPowerTargetOwner(selection.policy, playerId, identity.playerId) ? selection.policy.kind : 'none';
    }
    return playerId === identity.playerId && !power?.resolving && turnPlayerId ? 'replace' : 'none';
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
            actionMode={handActionMode(player.playerId)}
            canAct={selectionMode ? Boolean(power?.canChooseTargets) : canReplace}
            selectedSlots={selection.selectedSlotsFor(player.playerId)} peekTargets={targets}
            selectionBlocked={selection.isHandBlocked(player.playerId)}
            onAction={slot => selectionMode ? selection.selectTarget({ playerId: player.playerId, handSlotId: slot }) : onSwap(slot)} />
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
