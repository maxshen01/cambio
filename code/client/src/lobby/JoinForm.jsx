// Collects a player name and submits one valid join request at a time.
import { useState } from 'react';

/** Render the name entry controls and enforce basic submission eligibility. */
export function JoinForm({ connected, pending = false, onJoin }) {
  const [name, setName] = useState('');
  const canJoin = connected && !pending && name.trim().length > 0;

  /** Prevent page navigation and pass the trimmed name to the join handler. */
  function submit(event) {
    event.preventDefault();
    if (canJoin) onJoin(name.trim());
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="display-name">Your name</label>
      <input
        id="display-name"
        autoFocus
        value={name}
        onChange={event => setName(event.target.value)}
        autoComplete="nickname"
      />
      <button type="submit" disabled={!canJoin}>Join lobby</button>
    </form>
  );
}
