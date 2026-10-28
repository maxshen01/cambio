// Exercises handler recovery with injected faults, without a wire-level debug event.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createServer } from '../../src/server.js';
import { createGameState } from '../../src/game/state.js';

test('unexpected join failure after mutation resets the injected room and suppresses cleanup broadcasts', t => {
  const gameState = createGameState();
  const server = createServer({ gameState });
  t.after(() => server.io.close());
  const socket = new EventEmitter();
  socket.id = 'faulty';
  socket.onAny = () => {};
  socket.join = () => { throw new Error('injected join fault'); };
  server.io.sockets.emitReserved('connection', socket);
  let cleanupCount = 0;
  let broadcasts = 0;
  t.mock.method(console, 'error', () => {});
  t.mock.method(server.io, 'to', () => ({ emit() { broadcasts++; } }));
  t.mock.method(server.io, 'disconnectSockets', () => {
    cleanupCount++;
    socket.emit('disconnect', 'server namespace disconnect');
  });

  assert.doesNotThrow(() => socket.emit('joinRoom', { displayName: 'Alice' }));
  assert.equal(server.gameState, gameState);
  assert.deepEqual(gameState, createGameState());
  assert.equal(cleanupCount, 1);
  assert.equal(broadcasts, 0);
});
