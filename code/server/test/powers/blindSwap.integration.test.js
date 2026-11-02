// Four seated sockets verify Jack privacy, ordered completion, and recovery.
import assert from 'node:assert/strict';
import test from 'node:test';
import { powerRoom } from '../helpers/powerRoom.js';
import { nextEvent } from '../helpers/socket.js';

for (const skip of [false, true]) {
  test(`Jack ${skip ? 'Skip after activation' : 'swap'}: private activation and ordered, facedown resolution`, async t => {
    const room = await powerRoom(t, 11);
    const { clients, records, gameState: state, held } = room;
    await room.draw();
    await room.start();
    records.forEach((record, index) => assert.deepEqual(record, index === 4 ? [] : [
      { event: 'powerResolutionStarted', payload: { playerId: clients[0].id } },
      ...(index === 0 ? [{ event: 'powerAvailable', payload: { power: 'blindSwap' } }] : []),
    ]));
    room.clear();
    await room.activate();
    records.forEach((record, index) => assert.deepEqual(record, index === 4 ? [] : [
      { event: 'powerCardRevealed', payload: { playerId: clients[0].id, faceUp: true, cardId: held.cardId } },
    ]));
    const firstIndex = 0;
    const targets = { first: { playerId: clients[firstIndex].id, handSlotId: 1 }, second: { playerId: clients[2].id, handSlotId: 1 } };
    const a = state.players[firstIndex].hand[0].card;
    const b = state.players[2].hand[0].card;
    room.clear();
    const turns = clients.map(client => nextEvent(client, 'turnChanged'));
    clients[0].emit(skip ? 'skipPower' : 'choosePowerTargets', skip ? {} : targets);
    await Promise.all(turns);
    await room.drain();
    records.forEach((record, index) => assert.deepEqual(record, index === 4 ? [] : [
      ...(!skip ? [{ event: 'cardSwapped', payload: { kind: 'power', ...targets } }] : []),
      { event: 'discardPileUpdated', payload: { top: { cardId: held.cardId } } },
      { event: 'turnChanged', payload: { playerId: clients[1].id } },
    ]));
    assert.equal(state.players[firstIndex].hand[0].card, skip ? a : b);
    assert.equal(state.players[2].hand[0].card, skip ? b : a);
    room.clear();
    const before = structuredClone(state);
    const error = nextEvent(clients[0], 'error');
    clients[0].emit('choosePowerTargets', targets);
    assert.equal((await error).code, 'NOT_YOUR_TURN');
    await room.drain(clients[0]);
    assert.deepEqual(state, before);
    records.forEach((record, index) => assert.deepEqual(record.map(item => item.event), index === 0 ? ['error'] : []));
  });
}

test('Jack rejection is requester-only and preserves public activation for retry', async t => {
  const room = await powerRoom(t, 11);
  await room.draw(); await room.start(); await room.activate();
  const { clients, observer, gameState: state, records } = room;
  const first = { playerId: clients[0].id, handSlotId: 1 };
  for (const [client, payload, code] of [
    [clients[0], {}, 'INVALID_POWER_ACTION'],
    [clients[0], { first, second: { ...first, handSlotId: 2 } }, 'SWAP_NOT_ALLOWED'],
  ]) {
    room.clear();
    const before = structuredClone(state);
    const error = nextEvent(client, 'error');
    client.emit('choosePowerTargets', payload);
    assert.equal((await error).code, code);
    await room.drain(client);
    assert.deepEqual(state, before);
    records.forEach((record, index) => assert.deepEqual(record.map(item => item.event),
      [...clients, observer][index] === client ? ['error'] : []));
  }
});
