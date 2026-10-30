// Owner-only power choices and persistent instructions; server state decides the stage.
import { useEffect, useId, useRef } from 'react';

/** @param {{ prompt: import('../game/gameClientState.js').PowerPrompt | null,
 * selecting: boolean, canUse: boolean, canSkip: boolean, canDone: boolean,
 * onSelect: () => void, onSkip: () => void, onDone: () => void }} props */
export function PowerControls({ prompt, selecting, canUse, canSkip, canDone, onSelect, onSkip, onDone }) {
  const descriptionId = useId();
  const done = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const viewing = prompt?.stage === 'awaitingPeekDone';
  useEffect(() => {
    if (viewing && canDone) done.current?.focus();
  }, [viewing, canDone]);
  if (!prompt) return null;
  return <>
    <aside className="power-explanation" aria-label="Self-peek power" aria-live="polite">
      <p id={descriptionId}>Look at one of your own cards. It stays visible until you choose Done.</p>
      {selecting && !viewing && <p>Choose one of your cards.</p>}
    </aside>
    <div className="power-controls" role="group" aria-label="Self-peek actions" aria-describedby={descriptionId}>
      {viewing ? <button ref={done} type="button" disabled={!canDone} onClick={onDone}>Done</button> : <>
        {!selecting && <button type="button" disabled={!canUse} onClick={onSelect}>Use</button>}
        <button type="button" disabled={!canSkip} onClick={onSkip}>Don't use</button>
      </>}
    </div>
  </>;
}
