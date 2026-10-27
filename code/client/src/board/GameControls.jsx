// Keeps the setup confirmation and future Call Cambio control visible on the board.
/** @param {{ canReady: boolean, onReady: () => void }} props */
export function GameControls({ canReady, onReady }) {
  return (
    <div className="setup-controls">
      <button type="button" disabled>Call Cambio</button>
      <button type="button" disabled={!canReady} onClick={onReady}>Ready Up</button>
    </div>
  );
}
