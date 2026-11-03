// IT-05 and a two-face king case verify the socket contract without a suit matrix.
import assert from 'node:assert/strict';
import test from 'node:test';
import { powerRoom } from '../helpers/powerRoom.js';
import { nextEvent } from '../helpers/socket.js';

for (const rank of [12, 13]) {
  test(`${rank === 12 ? 'IT-05 queen swap' : 'king two-face peek then Skip'} keeps both stages private and ordered`, async t => {
    const room = await powerRoom(t, rank);
    const { clients, records, gameState: state, held } = room;
    const owner = clients[0];
    await room.draw(); await room.start(); await room.activate();
    const peekTargets = rank === 12
      ? [{ playerId: clients[1].id, handSlotId: 1 }]
      : [1, 2].map(handSlotId => ({ playerId: clients[0].id, handSlotId }));
    const faceViews = peekTargets.map(target => ({ ...target, faceUp: true,
      cardId: state.players.find(player => player.id === target.playerId).hand.find(slot => slot.handSlotId === target.handSlotId).card.cardId }));
    room.clear();
    const peeks = clients.map(client => nextEvent(client, 'powerPeekResult'));
    owner.emit('choosePowerTargets', { peekTargets });
    await Promise.all(peeks); await room.drain();
    records.forEach((record, index) => assert.deepEqual(record, index === 4 ? [] : [{
      event: 'powerPeekResult', payload: { targets: index === 0 ? faceViews : peekTargets.map(ref => ({ ...ref, faceUp: false })) },
    }]));
    room.clear();
    const beforeDone = structuredClone(state);
    owner.emit('finishPowerPeek', {});
    await room.drain();
    assert.deepEqual(state, { ...beforeDone, pendingPower: { ...beforeDone.pendingPower, stage: 'awaitingSwap' } });
    assert.ok(records.every(record => record.length === 0));
    // Rejection remains requester-only and does not discard the publicly held card.
    const invalid = { first: { playerId: clients[1].id, handSlotId: 1 }, second: { playerId: clients[1].id, handSlotId: 2 } };
    const beforeInvalid = structuredClone(state);
    const error = nextEvent(owner, 'error');
    owner.emit('choosePowerSwap', invalid);
    assert.equal((await error).code, 'SWAP_NOT_ALLOWED');
    await room.drain();
    assert.deepEqual(state, beforeInvalid);
    records.forEach((record, index) => assert.deepEqual(record.map(item => item.event), index === 0 ? ['error'] : []));
    room.clear();
    const pair = { first: { playerId: clients[1].id, handSlotId: 2 }, second: { playerId: clients[2].id, handSlotId: 1 } };
    const turns = clients.map(client => nextEvent(client, 'turnChanged'));
    owner.emit(rank === 12 ? 'choosePowerSwap' : 'skipPower', rank === 12 ? pair : {});
    await Promise.all(turns); await room.drain();
    records.forEach((record, index) => assert.deepEqual(record, index === 4 ? [] : [
      ...(rank === 12 ? [{ event: 'cardSwapped', payload: { kind: 'power', ...pair } }] : []),
      { event: 'discardPileUpdated', payload: { top: { cardId: held.cardId } } },
      { event: 'turnChanged', payload: { playerId: clients[1].id } },
    ]));
    assert.equal(state.pendingPower, null);
    assert.equal(state.players[0].drawnCard, null);
  });
}
