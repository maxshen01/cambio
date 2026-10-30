// Owner-only power choices and persistent instructions; server state decides the stage.
import { useEffect, useId, useRef } from 'react';

/** @param {{ prompt: import('../game/gameClientState.js').PowerPrompt | null,
 * canUse: boolean, canConfirm: boolean, canSkip: boolean, canDone: boolean,
 * onUse: () => void, onConfirm: () => void, onSkip: () => void, onDone: () => void }} props */
export function PowerControls({ prompt, canUse, canConfirm, canSkip, canDone, onUse, onConfirm, onSkip, onDone }) {
  const descriptionId = useId();
  const done = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const viewing = prompt?.stage === 'awaitingPeekDone';
  const selecting = prompt?.stage === 'awaitingTargets';
  const opponent = prompt?.power === 'opponentPeek';
  const blindSwap = prompt?.power === 'blindSwap';
  const label = blindSwap ? 'Blind-swap' : opponent ? 'Opponent-peek' : 'Self-peek';
  useEffect(() => {
    if (viewing && canDone) done.current?.focus();
  }, [viewing, canDone]);
  if (!prompt) return null;
  return <>
    <aside className="power-explanation" aria-label={`${label} power`} aria-live="polite">
      <p id={descriptionId}>{blindSwap ? 'Swap two cards belonging to different players without looking at them. Choose your card and an opponent’s, or two opponents’ cards.'
        : `${opponent ? "Look at one opponent's card." : 'Look at one of your own cards.'} It stays visible until you choose Done.`}</p>
      {selecting && !viewing && <p>{blindSwap ? 'Choose two cards, then confirm. Select a highlighted card again to deselect it.' : opponent ? "Choose one of your opponents' cards." : 'Choose one of your cards.'}</p>}
    </aside>
    <div className="power-controls" role="group" aria-label={`${label} actions`} aria-describedby={descriptionId}>
      {viewing ? <button ref={done} type="button" disabled={!canDone} onClick={onDone}>Done</button> : <>
        <button type="button" disabled={selecting ? !canConfirm : !canUse} onClick={selecting ? onConfirm : onUse}>
          {selecting ? 'Confirm selection' : 'Use'}
        </button>
        <button type="button" disabled={!canSkip} onClick={onSkip}>Don't use</button>
      </>}
    </div>
  </>;
}
