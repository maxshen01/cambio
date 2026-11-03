// Offers leave replacement available; activation and skipping need no preceding discard request.
import assert from 'node:assert/strict';
import test from 'node:test';
import { powerRoom } from '../helpers/powerRoom.js';
import { nextEvent } from '../helpers/socket.js';

for (const [rank, power] of [[7, 'selfPeek'], [9, 'opponentPeek'], [11, 'blindSwap'], [12, 'onePeekSwap'], [13, 'twoPeekSwap']]) {
  test(`${power}: offers privately on draw and activates directly in public order`, async t => {
    const room = await powerRoom(t, rank);
    const { clients, records, gameState: state } = room;
    const offer = nextEvent(clients[0], 'powerAvailable');
    const draws = clients.map(client => nextEvent(client, 'cardDrawn'));
    clients[0].emit('drawCard', { source: 'deck' });
    await Promise.all(draws);
    assert.deepEqual(await offer, { power });
    await room.drain();
    records.forEach((record, index) => assert.deepEqual(record.map(item => item.event),
      index === 0 ? ['cardDrawn', 'powerAvailable'] : index === 4 ? [] : ['cardDrawn']));
    assert.equal(state.turnStep, 'awaitingDrawnCardResolution');
    assert.equal(state.pendingPower, null);
    assert.equal(state.players[0].drawnCardRevealed, false);
    room.clear();
    await room.activate();
    records.forEach((record, index) => assert.deepEqual(record.map(item => item.event),
      index === 4 ? [] : ['powerResolutionStarted', 'powerCardRevealed']));
    assert.equal(state.pendingPower?.stage, 'awaitingTargets');
    const before = structuredClone(state);
    const error = nextEvent(clients[0], 'error');
    clients[0].emit('usePower', {});
    assert.equal((await error).code, 'POWER_NOT_AVAILABLE');
    await room.drain();
    assert.deepEqual(state, before);
  });
}

for (const action of ['skipPower', 'swapDrawnCard']) {
  test(`offered power allows ${action} without activation`, async t => {
    const room = await powerRoom(t, 13);
    const { clients, records, gameState: state, held } = room;
    await room.draw();
    const turns = clients.map(client => nextEvent(client, 'turnChanged'));
    clients[0].emit(action, action === 'skipPower' ? {} : { target: { playerId: clients[0].id, handSlotId: 1 } });
    await Promise.all(turns);
    await room.drain();
    records.forEach((record, index) => assert.deepEqual(record.map(item => item.event), index === 4 ? [] :
      [...(action === 'swapDrawnCard' ? ['cardSwapped'] : []), 'discardPileUpdated', 'turnChanged']));
    assert.equal(state.players[0].drawnCard, null);
    assert.equal(state.pendingPower, null);
    if (action === 'swapDrawnCard') assert.equal(state.players[0].hand[0].card, held);
    else assert.equal(state.discardPile.cards.at(-1), held);
  });
}
