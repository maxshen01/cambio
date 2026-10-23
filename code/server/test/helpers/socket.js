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
