// Bounded event waits remove every listener and timer on both success and failure.
export function nextEvent(socket, event, failureEvent) {
  return new Promise((resolve, reject) => {
    function cleanup() {
      clearTimeout(timer);
      socket.off(event, onEvent);
      if (failureEvent) socket.off(failureEvent, onFailure);
    }
    function onEvent(payload) { cleanup(); resolve(payload); }
    function onFailure(error) { cleanup(); reject(error); }
    const timer = setTimeout(() => onFailure(new Error(`Timed out waiting for ${event}`)), 1500);
    socket.once(event, onEvent);
    if (failureEvent) socket.once(failureEvent, onFailure);
  });
}

// Observe only server events; remove catch-all listeners with the owning test.
export function recordEvents(t, recipients) {
  const records = recipients.map(() => []);
  recipients.forEach((client, index) => {
    const record = (event, payload) => records[index].push({ event, payload });
    client.onAny(record);
    t.after(() => client.offAny(record));
  });
  return { records, clear() { records.forEach(record => { record.length = 0; }); } };
}

// Same-connection ordering proves earlier requests were processed, not just sent.
export function barrier(client) {
  return new Promise((resolve, reject) => {
    client.timeout(1500).emit('testBarrier', error => error ? reject(error) : resolve());
  });
}
