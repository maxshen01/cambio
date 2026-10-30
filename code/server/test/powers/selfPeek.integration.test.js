// Backend power acceptance: ordered socket events, authorized faces, and recovery.
import assert from 'node:assert/strict';
import test from 'node:test';
import { powerRoom } from '../helpers/powerRoom.js';
import { allCards } from '../helpers/activeGame.js';
import { nextEvent } from '../helpers/socket.js';
import { toDrawnCardView } from '../../src/game/views/drawnCardView.js';
import { createGameState } from '../../src/game/state.js';

for (const rank of [7, 8]) {
  for (const skip of [false, true]) {
    test(`${rank}: ${skip ? 'Skip' : 'Use then Done'} publishes private prompts and ordered completion`, async t => {
      const room = await powerRoom(t, rank, rank === 8);
      const { clients, gameState: state, held, records } = room;
      const owner = clients[0];
      const originals = new Set(allCards(state));
      await room.draw();
      const before = structuredClone(state);
      const deck = [...state.deck.cards];
      const discards = [...state.discardPile.cards];
      await room.start();
      assert.deepEqual(state, {
        ...before, turnStep: 'resolvingPower', pendingPower: 'selfPeek', pendingPowerStage: 'awaitingChoice',
      });
      records.forEach((record, index) => assert.deepEqual(record, index === 4 ? [] : [
        { event: 'powerResolutionStarted', payload: { playerId: owner.id } },
        ...(index === 0 ? [{ event: 'powerAvailable', payload: { power: 'selfPeek' } }] : []),
      ]));
      room.clear();
      if (!skip) {
        const target = { playerId: owner.id, handSlotId: 2 };
        const peeked = state.players[0].hand[1].card;
        const peeks = clients.map(client => nextEvent(client, 'powerPeekResult'));
        owner.emit('usePower', { peekTarget: target });
        await Promise.all(peeks);
        await room.drain();
        records.forEach((record, index) => assert.deepEqual(record, index === 4 ? [] : [
          { event: 'powerCardRevealed', payload: { playerId: owner.id, faceUp: true, cardId: held.cardId } },
          { event: 'powerPeekResult', payload: { targets: [index === 0
            ? { ...target, faceUp: true, cardId: peeked.cardId } : { ...target, faceUp: false }] } },
        ]));
        const expected = structuredClone(before);
        Object.assign(expected, { turnStep: 'resolvingPower', pendingPower: 'selfPeek', pendingPowerStage: 'awaitingPeekDone' });
        expected.players[0].drawnCardRevealed = true;
        assert.deepEqual(state, expected);
        for (const client of clients) assert.deepEqual(toDrawnCardView(state.players[0], client.id), {
          playerId: owner.id, source: 'deck', faceUp: true, cardId: held.cardId,
        });
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
      assert.equal(state.players[0].drawnCard, null);
      assert.equal(state.players[0].drawnFrom, null);
      assert.equal(state.players[0].drawnCardRevealed, false);
      assert.equal(state.pendingPower, null);
      assert.equal(state.pendingPowerStage, null);
      assert.equal(state.turnStep, 'awaitingDraw');
      assert.equal(state.discardPile.topMatchStatus, 'eligible');
      assert.deepEqual(new Set(allCards(state)), originals);
      assert.equal(allCards(state).length, originals.size);
      assert.deepEqual(state.players.map(player => player.hand), before.players.map(player => player.hand));
      if (rank === 8) {
        assert.deepEqual(state.deck.cards, [discards[0], ...deck]);
        assert.deepEqual(state.discardPile.cards, [discards[1], held]);
      }
      // A repeated completion produces only a private error, never a second turn.
      room.clear();
      const error = nextEvent(owner, 'error');
      owner.emit(event, {});
      assert.equal((await error).code, 'NOT_YOUR_TURN');
      await room.drain();
      records.forEach((record, index) => assert.deepEqual(record.map(item => item.event), index === 0 ? ['error'] : []));
    });
  }
}

test('invalid power requests are private, immutable, and emit no reveal or completion', async t => {
  const room = await powerRoom(t);
  const { clients, observer, gameState: state, records } = room;
  const owner = clients[0];
  const target = { playerId: owner.id, handSlotId: 2 };
  async function rejected(client, event, payload, code) {
    room.clear();
    const before = structuredClone(state);
    const response = nextEvent(client, 'error');
    client.emit(event, payload);
    assert.equal((await response).code, code);
    await room.drain();
    assert.deepEqual(state, before);
    records.forEach((record, index) => assert.deepEqual(record.map(item => item.event),
      [...clients, observer][index] === client ? ['error'] : []));
  }
  for (const event of ['usePower', 'skipPower', 'finishPowerPeek']) {
    await rejected(observer, event, {}, 'NOT_IN_ROOM');
    await rejected(clients[1], event, {}, 'NOT_YOUR_TURN');
    await rejected(owner, event, {}, 'POWER_NOT_AVAILABLE');
  }
  await room.draw();
  await room.start();
  await rejected(owner, 'discardDrawnCard', {}, 'RESOLUTION_NOT_AVAILABLE');
  await rejected(owner, 'finishPowerPeek', {}, 'POWER_NOT_AVAILABLE');
  await rejected(owner, 'usePower', {}, 'INVALID_POWER_ACTION');
  await rejected(owner, 'usePower', { peekTarget: { playerId: clients[1].id, handSlotId: 2 } }, 'INVALID_POWER_TARGET');
  await rejected(owner, 'usePower', { peekTarget: { playerId: owner.id, handSlotId: 8 } }, 'INVALID_POWER_TARGET');
  const peek = nextEvent(owner, 'powerPeekResult');
  owner.emit('usePower', { peekTarget: target });
  await peek;
  await room.drain();
  await rejected(owner, 'usePower', { peekTarget: target }, 'POWER_NOT_AVAILABLE');
  await rejected(owner, 'skipPower', {}, 'POWER_NOT_AVAILABLE');
  await rejected(owner, 'drawCard', { source: 'deck' }, 'DRAW_NOT_AVAILABLE');
  await rejected(owner, 'swapDrawnCard', { target }, 'RESOLUTION_NOT_AVAILABLE');
});

for (const peek of [false, true]) {
  test(`departure during ${peek ? 'peek viewing' : 'power choice'} clears live power state`, async t => {
    const room = await powerRoom(t);
    await room.draw();
    await room.start();
    const { clients, gameState: state } = room;
    if (peek) {
      const result = nextEvent(clients[0], 'powerPeekResult');
      clients[0].emit('usePower', { peekTarget: { playerId: clients[0].id, handSlotId: 2 } });
      await result;
    }
    room.clear();
    const aborts = clients.slice(1).map(client => nextEvent(client, 'gameAborted'));
    const id = clients[0].id;
    clients[0].disconnect();
    for (const notice of await Promise.all(aborts)) {
      assert.equal(notice.reason, 'PLAYER_DISCONNECTED');
      assert.equal(notice.playerId, id);
    }
    assert.deepEqual({ ...state, players: [] }, createGameState());
    assert.ok(state.players.every(player => player.drawnCard === null && !player.drawnCardRevealed && player.hand.length === 0));
  });
}
