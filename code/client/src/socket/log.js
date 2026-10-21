// Writes concise client event diagnostics when VITE_SOCKET_DEBUG is enabled.
/** Log an event name, outcome, and small non-sensitive metadata. */
export function logClientEvent(event, outcome, details = {}) {
  if (import.meta.env.VITE_SOCKET_DEBUG !== '1') return;
  console.info('[client]', event, outcome, details);
}
