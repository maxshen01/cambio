// Owns the non-dismissible join dialog, connection feedback, and keyboard focus boundary.
import { JoinForm } from './JoinForm.jsx';

/** @param {{ connectionStatus: string, connectionLost: boolean,
 * error: import('../game/gameClientState.js').DisplayError | null,
 * canJoin: boolean, canRetry: boolean, onJoin: (name: string) => void,
 * onNameChange: () => void, onRetry: () => void }} props
 */
export function JoinDialog({ connectionStatus, connectionLost, error, canJoin, canRetry,
  onJoin, onNameChange, onRetry }) {
  return (
    <div className="join-overlay">
      <section className="join-dialog" role="dialog" aria-modal="true" aria-labelledby="join-title" onKeyDown={keepDialogFocus}>
        <h2 id="join-title">Join the lobby</h2>
        <p className="connection-status" role="status">{connectionStatus}</p>
        <JoinForm connected={canJoin} connectionLost={connectionLost} onJoin={onJoin} onNameChange={onNameChange} />
        {error && <p className="join-dialog__error" role="alert">{error.message}</p>}
        {canRetry && <button type="button" onClick={onRetry}>Retry connection</button>}
        {connectionLost && <button type="button" autoFocus onClick={() => window.location.reload()}>Reload to rejoin</button>}
      </section>
    </div>
  );
}

/** Tab in either direction stays among the dialog's enabled controls, including on loss.
 * @param {import('react').KeyboardEvent<HTMLElement>} event
 */
function keepDialogFocus(event) {
  if (event.key !== 'Tab') return;
  const controls = [...event.currentTarget.querySelectorAll('input:not(:disabled), button:not(:disabled)')]
    .filter(element => element instanceof HTMLElement);
  const first = controls[0];
  const last = controls.at(-1);
  if (!first) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
