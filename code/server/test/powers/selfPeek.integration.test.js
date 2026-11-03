// Backend power acceptance: ordered socket events, authorized faces, and recovery.
import assert from 'node:assert/strict';
import test from 'node:test';
import { powerRoom } from '../helpers/powerRoom.js';
import { nextEvent } from '../helpers/socket.js';
import { createGameState } from '../../src/game/state.js';

for (const [rank, skip] of [[7, false], [9, false], [7, 'before']]) {
  const power = rank < 9 ? 'selfPeek' : 'opponentPeek';
  test(`${rank}: ${skip ? 'Skip ' + skip + ' activation' : 'Use then confirm then Done'} publishes private prompts and ordered completion`, async t => {
    const room = await powerRoom(t, rank);
    const { clients, gameState: state, held, records } = room;
    const owner = clients[0];
    await room.draw();
    await room.start();
    records.forEach((record, index) => assert.deepEqual(record, index === 4 ? [] : [
      { event: 'powerResolutionStarted', payload: { playerId: owner.id } },
      ...(index === 0 ? [{ event: 'powerAvailable', payload: { power } }] : []),
    ]));
    room.clear();
    if (skip !== 'before') {
      await room.activate();
      records.forEach((record, index) => assert.deepEqual(record, index === 4 ? [] : [
        { event: 'powerCardRevealed', payload: { playerId: owner.id, faceUp: true, cardId: held.cardId } },
      ]));
      room.clear();
    }
    if (!skip) {
      const target = { playerId: rank < 9 ? owner.id : clients[1].id, handSlotId: 2 };
      const peeked = state.players[rank < 9 ? 0 : 1].hand[1].card;
      const peeks = clients.map(client => nextEvent(client, 'powerPeekResult'));
      owner.emit('choosePowerTargets', { peekTarget: target });
      await Promise.all(peeks);
      await room.drain();
      records.forEach((record, index) => assert.deepEqual(record, index === 4 ? [] : [
        { event: 'powerPeekResult', payload: { targets: [index === 0
          ? { ...target, faceUp: true, cardId: peeked.cardId } : { ...target, faceUp: false }] } },
      ]));
      room.clear();
    }
    const event = skip ? 'skipPower' : 'finishPowerPeek';
    const turns = clients.map(client => nextEvent(client, 'turnChanged'));
    owner.emit(event, {});
    await Promise.all(turns);
    await room.drain();
    records.forEach((record, index) => assert.deepEqual(record, index === 4 ? [] : [
      { event: 'discardPileUpdated', payload: { top: { cardId: held.cardId } } },
      { event: 'turnChanged', payload: { playerId: clients[1].id } },
    ]));
    assert.equal(state.pendingPower, null);
    assert.equal(state.turn, clients[1].id);
    // A repeated completion produces only a private error, never a second turn.
    room.clear();
    const error = nextEvent(owner, 'error');
    owner.emit(event, {});
    assert.equal((await error).code, 'NOT_YOUR_TURN');
    await room.drain();
    records.forEach((record, index) => assert.deepEqual(record.map(item => item.event), index === 0 ? ['error'] : []));
  });
}

test('simple peek: invalid power requests are private, immutable, and emit no reveal or completion', async t => {
  const room = await powerRoom(t, 7);
  const { clients, observer, gameState: state, records } = room;
  const owner = clients[0];
  const target = { playerId: owner.id, handSlotId: 2 };
  async function rejected(client, event, payload, code) {
    room.clear();
    const before = structuredClone(state);
    const response = nextEvent(client, 'error');
    client.emit(event, payload);
    assert.equal((await response).code, code);
    await room.drain(client);
    assert.deepEqual(state, before);
    records.forEach((record, index) => assert.deepEqual(record.map(item => item.event),
      [...clients, observer][index] === client ? ['error'] : []));
  }
  await rejected(observer, 'usePower', {}, 'NOT_IN_ROOM');
  await rejected(clients[1], 'choosePowerTargets', {}, 'NOT_YOUR_TURN');
  await room.draw();
  await room.start();
  await rejected(owner, 'discardDrawnCard', {}, 'RESOLUTION_NOT_AVAILABLE');
  await rejected(owner, 'finishPowerPeek', {}, 'POWER_NOT_AVAILABLE');
  await rejected(owner, 'choosePowerTargets', { peekTarget: target }, 'POWER_NOT_AVAILABLE');
  await room.activate();
  await rejected(owner, 'usePower', {}, 'POWER_NOT_AVAILABLE');
  await rejected(owner, 'choosePowerTargets', { peekTarget: { playerId: owner.id, handSlotId: 8 } }, 'INVALID_POWER_TARGET');
  const peek = nextEvent(owner, 'powerPeekResult');
  owner.emit('choosePowerTargets', { peekTarget: target });
  await peek;
  await room.drain();
  await rejected(owner, 'skipPower', {}, 'POWER_NOT_AVAILABLE');
});

for (const peek of [false, true]) {
  test(`power departure during ${peek ? 'peek viewing' : 'power choice'} clears live power state`, async t => {
    const room = await powerRoom(t, 7);
    await room.draw();
    await room.start();
    const { clients, gameState: state } = room;
    if (peek) {
      await room.activate();
      const result = nextEvent(clients[0], 'powerPeekResult');
      clients[0].emit('choosePowerTargets', { peekTarget: { playerId: clients[0].id, handSlotId: 2 } });
      await result;
    }
    room.clear();
    const aborts = clients.slice(1).map(client => nextEvent(client, 'gameAborted'));
    const id = clients[0].id;
    await room.disconnect(clients[0]);
    for (const notice of await Promise.all(aborts)) {
      assert.equal(notice.reason, 'PLAYER_DISCONNECTED');
      assert.equal(notice.playerId, id);
    }
    assert.deepEqual({ ...state, players: [] }, createGameState());
    assert.ok(state.players.every(player => player.drawnCard === null && !player.drawnCardRevealed && player.hand.length === 0));
  });
}
