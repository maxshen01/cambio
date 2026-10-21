// Writes safe, one-line Socket.IO diagnostics to the terminal.

const debugEnabled = process.env.SOCKET_DEBUG === '1';

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

export function logUnexpectedSocketError(socketId, event, error) {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    socketId,
    event,
    outcome: 'failed',
    error: error?.stack ?? String(error),
  }));
}
