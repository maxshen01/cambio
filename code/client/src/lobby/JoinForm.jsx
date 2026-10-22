// Collects a player name and submits one valid join request at a time.
import { useState } from 'react';
import { checkDisplayName } from '../../../shared/displayName.js';

/** Render the name entry controls and enforce basic submission eligibility. */
export function JoinForm({ connected, connectionLost = false, pending = false, onJoin }) {
  const [name, setName] = useState('');
  const checkedName = checkDisplayName(name);
  const canJoin = connected && !pending && !checkedName.error;

  /** Prevent page navigation and pass the trimmed name to the join handler. */
  function submit(event) {
    event.preventDefault();
    if (canJoin) onJoin(checkedName.name);
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="display-name">Your name</label>
      <input
        id="display-name"
        autoFocus
        value={name}
        disabled={connectionLost}
        onChange={event => setName(event.target.value)}
        autoComplete="nickname"
        aria-describedby="name-rules"
      />
      <p id="name-rules" className="join-dialog__hint">1–20 characters: letters, numbers, spaces, apostrophes, hyphens, or periods.</p>
      {name && checkedName.error && <p className="join-dialog__error" role="alert">{checkedName.error}</p>}
      <button type="submit" disabled={!canJoin}>Join lobby</button>
    </form>
  );
}
