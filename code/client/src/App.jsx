// Composes joining, the lobby, and the dealt memorization board.
import { JoinForm } from './lobby/JoinForm.jsx';
import { SeatList } from './lobby/SeatList.jsx';
import { SetupBoard } from './lobby/SetupBoard.jsx';
import { useLobby } from './lobby/useLobby.js';
import { useEffect } from 'react';
import { preloadCardArtwork } from './cards/cardArtwork.js';

/** Show the lobby using state from this browser's socket connection.
 * @param {{ socket: import('./lobby/useLobby.js').LobbySocket }} props
 */
export function App({ socket }) {
  useEffect(() => { void preloadCardArtwork(); }, []);
  const { connection, connectionLost, pending, identity, players, error, join, nameChanged,
    toggleReady, retry, joined, localPlayer, canJoin, canReady, canRetry, stage, cards } = useLobby(socket);
  const showJoinDialog = !joined;
  const connectionStatus = connection === 'lost' ? 'Connection lost'
    : connection === 'failed' ? 'Connection failed'
    : connection === 'connecting' ? 'Connecting to server…'
    : showJoinDialog && (pending || identity) ? 'Joining lobby…' : 'Connected';

  /** Keep keyboard navigation inside the non-dismissible name dialog.
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

  return (
    <main className="lobby">
      <div className={`lobby__content${stage === 'memorization' ? ' lobby__content--setup' : ''}`} inert={showJoinDialog ? true : undefined}>
        <h1 className="lobby__title">{stage === 'memorization' ? 'Cambio' : 'Cambio lobby'}</h1>
        {!showJoinDialog && <p className="connection-status" role="status">{connectionStatus}</p>}
        {!showJoinDialog && error && <p className="lobby__error" role="alert">{error.message}</p>}
        {stage === 'memorization' && identity ? (
          <SetupBoard players={players} cards={cards} identity={identity} canReady={canReady} onReady={toggleReady} />
        ) : <div className="lobby__table">
          <SeatList players={players} localPlayerId={identity?.playerId} localSeatId={identity?.seatId} />
          <button className="ready-button" type="button" disabled={!canReady} onClick={toggleReady}>
            {localPlayer?.isReady ? 'Unready' : 'Ready Up'}
          </button>
        </div>}
      </div>
      {showJoinDialog && (
        <div className="join-overlay">
          <section className="join-dialog" role="dialog" aria-modal="true" aria-labelledby="join-title" onKeyDown={keepDialogFocus}>
            <h2 id="join-title">Join the lobby</h2>
            <p className="connection-status" role="status">{connectionStatus}</p>
            <JoinForm connected={canJoin} connectionLost={connectionLost} onJoin={join} onNameChange={nameChanged} />
            {error && <p className="join-dialog__error" role="alert">{error.message}</p>}
            {canRetry && <button type="button" onClick={retry}>Retry connection</button>}
            {connectionLost && <button type="button" autoFocus onClick={() => window.location.reload()}>Reload to rejoin</button>}
          </section>
        </div>
      )}
    </main>
  );
}
