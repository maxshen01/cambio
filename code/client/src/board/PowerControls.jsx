// Owner-only power choices and persistent instructions; server state decides the stage.
import { useEffect, useId, useRef } from 'react';

/** @param {{ prompt: import('../game/gameClientState.js').PowerPrompt | null,
 * canUse: boolean, canSkip: boolean, canDone: boolean,
 * onUse: () => void, onSkip: () => void, onDone: () => void }} props */
export function PowerControls({ prompt, canUse, canSkip, canDone, onUse, onSkip, onDone }) {
  const descriptionId = useId();
  const done = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const viewing = prompt?.stage === 'awaitingPeekDone';
  const selecting = prompt?.stage === 'awaitingTargets' || prompt?.stage === 'awaitingSwap';
  const opponent = prompt?.power === 'opponentPeek';
  const blindSwap = prompt?.power === 'blindSwap';
  const peekSwap = prompt?.power === 'onePeekSwap' || prompt?.power === 'twoPeekSwap';
  const swapping = blindSwap || prompt?.stage === 'awaitingSwap';
  const count = prompt?.power === 'twoPeekSwap' ? 'two distinct cards' : 'one card';
  const label = peekSwap ? (prompt?.power === 'twoPeekSwap' ? 'Black king' : 'Black queen') : blindSwap ? 'Blind-swap' : opponent ? 'Opponent-peek' : 'Self-peek';
  useEffect(() => {
    if (viewing && canDone) done.current?.focus();
  }, [viewing, canDone]);
  if (!prompt) return null;
  return <>
    <aside className="power-explanation" aria-label={`${label} power`} aria-live="polite">
      <p id={descriptionId}>{swapping ? 'Swap two cards belonging to different players without looking at them. Choose your card and an opponent’s, or two opponents’ cards.'
        : peekSwap ? `Look at ${count} from any hand until you choose Done. Then swap any legal pair, or choose Don't use.`
        : `${opponent ? "Look at one opponent's card." : 'Look at one of your own cards.'} It stays visible until you choose Done.`}</p>
      {prompt.stage === 'awaitingChoice' && <p>Click the drawn card or Use to activate. Choose Don't use to discard it without using the power.</p>}
      {selecting && !viewing && <p>{swapping ? 'Choose two cards from different players. The second click submits the swap. Select the first card again to deselect it.'
        : peekSwap ? `Choose ${count}. The last required click submits the peek.` : opponent ? "Click one of your opponents' cards to peek immediately." : 'Click one of your cards to peek immediately.'}</p>}
    </aside>
    <div className="power-controls" role="group" aria-label={`${label} actions`} aria-describedby={descriptionId}>
      {viewing ? <button ref={done} type="button" disabled={!canDone} onClick={onDone}>Done</button> : <>
        {!selecting && <button type="button" disabled={!canUse} onClick={onUse}>Use</button>}
        <button type="button" disabled={!canSkip} onClick={onSkip}>Don't use</button>
      </>}
    </div>
  </>;
}
