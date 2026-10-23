// Writes safe, one-line Socket.IO diagnostics to the terminal.

const debugEnabled = process.env.SOCKET_DEBUG === '1';

/** Safe routine metadata only. @param {'info' | 'warn'} level @param {string} socketId
 * @param {string} event @param {string} outcome @param {Record<string, string | number | boolean>} details */
export function logSocket(level, socketId, event, outcome, details = {}) {
  if (!debugEnabled) {
    return;
  }

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    socketId,
    event,
    outcome,
    ...details,
  };
  const write = level === 'warn' ? console.warn : console.log;
  write(JSON.stringify(entry));
}

/** Always report unexpected faults. @param {string} socketId @param {string} event @param {unknown} error */
export function logUnexpectedSocketError(socketId, event, error) {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    socketId,
    event,
    outcome: 'failed',
    error: error instanceof Error ? error.stack : String(error),
  }));
}
