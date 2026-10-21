// Composes the name prompt and the four-seat lobby.
import { JoinForm } from './lobby/JoinForm.jsx';
import { SeatList } from './lobby/SeatList.jsx';
import { useLobby } from './lobby/useLobby.js';

/** Show the lobby using state from this browser's socket connection. */
export function App({ socket }) {
  const { connected, pending, identity, players, error, join } = useLobby(socket);
  const showJoinDialog = !identity || !players.some(player => player.playerId === identity.playerId);
  const connectionStatus = !connected ? 'Connecting to server…' : showJoinDialog && (pending || identity) ? 'Joining lobby…' : 'Connected';

  /** Keep keyboard navigation inside the non-dismissible name dialog. */
  function keepDialogFocus(event) {
    if (event.key !== 'Tab') return;
    const controls = [...event.currentTarget.querySelectorAll('input:not(:disabled), button:not(:disabled)')];
    const first = controls[0];
    const last = controls.at(-1);
    if (!first) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <main className="lobby">
      <div className="lobby__content" inert={showJoinDialog ? true : undefined}>
        <h1 className="lobby__title">Cambio lobby</h1>
        {!showJoinDialog && <p className="connection-status" role="status">{connectionStatus}</p>}
        {!showJoinDialog && error && <p className="lobby__error" role="alert">{error}</p>}
        <div className="lobby__table">
          <SeatList players={players} localPlayerId={identity?.playerId} localSeatId={identity?.seatId} />
          <button className="ready-button" type="button" disabled>Ready Up</button>
        </div>
      </div>
      {showJoinDialog && (
        <div className="join-overlay">
          <section className="join-dialog" role="dialog" aria-modal="true" aria-labelledby="join-title" onKeyDown={keepDialogFocus}>
            <h2 id="join-title">Join the lobby</h2>
            <p className="connection-status" role="status">{connectionStatus}</p>
            <JoinForm connected={connected} pending={pending || Boolean(identity)} onJoin={join} />
            {error && <p className="join-dialog__error" role="alert">{error}</p>}
          </section>
        </div>
      )}
    </main>
  );
}
