// Fake socket for component tests without opening network connections.
export class FakeSocket {
  connected = false;
  listeners = new Map();
  emissions = [];

  on(event, listener) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event, listener) {
    this.listeners.get(event)?.delete(listener);
  }

  connect() {
    this.connected = true;
    this.receive('connect');
  }

  disconnect() {
    this.connected = false;
    this.receive('disconnect', 'transport close');
  }

  emit(event, payload, ack) {
    this.emissions.push({ event, payload, ack });
  }

  receive(event, payload) {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }
}
