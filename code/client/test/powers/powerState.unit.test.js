// Client power transitions retain authorized views and erase private buffers at boundaries.
import { expect, it } from 'vitest';
import { gameClientReducer as reduce } from '../../src/game/gameClientReducer.js';
import { selectGameClient } from '../../src/game/gameSelectors.js';
import { powerClientState, peek, cards, players } from '../helpers/powerClient.js';

const start = { type: 'powerResolutionStarted', notice: { playerId: 'p1' } };
const available = { type: 'powerAvailable', notice: { power: 'selfPeek' } };
const reveal = { type: 'powerCardRevealed', card: { playerId: 'p1', faceUp: true, cardId: 7 } };
const result = { type: 'powerPeekResult', notice: peek };
function viewing() {
  return [start, available, reveal, result].reduce(reduce, powerClientState());
}

it('starts privately, retains the shared card and old discard, and blocks ordinary actions', () => {
  const before = powerClientState();
  const started = reduce({ ...before, turnPending: true }, start);
  expect(started).toMatchObject({ resolvingPower: true, turnPending: false, powerPrompt: null });
  expect(started.drawnCard).toBe(before.drawnCard);
  expect(started.discardTop).toBe(before.discardTop);
  const prompted = reduce(started, available);
  expect(prompted.powerPrompt).toEqual({ power: 'selfPeek', stage: 'awaitingChoice' });
  expect(selectGameClient(prompted).permissions).toMatchObject({
    canDraw: false, canDrawDiscard: false, canReplace: false, canDiscardDrawn: false,
    canUsePower: true, canSkipPower: true, canFinishPowerPeek: false,
  });
});

it('public reveal preserves source and movement; peeks never change baseline hands', () => {
  const before = powerClientState('p2');
  before.movement = { id: 1, kind: 'draw', source: 'deck' };
  const revealed = [start, reveal].reduce(reduce, before);
  expect(revealed.drawnCard).toEqual({ playerId: 'p1', source: 'deck', faceUp: true, cardId: 7 });
  expect(revealed.movement).toBe(before.movement);
  expect(revealed.movementId).toBe(before.movementId);
  const other = reduce(revealed, result);
  expect(other.powerPrompt).toBeNull();
  expect(other.powerPeekTargets).toEqual([{ playerId: 'p1', handSlotId: 2, faceUp: false }]);
  expect(other.cards).toBe(before.cards);
  const own = viewing();
  expect(own.powerPeekTargets).toEqual(peek.targets);
  expect(own.powerPeekTargets[0]).not.toBe(peek.targets[0]);
  expect(own.cards.every(card => !card.faceUp && !('cardId' in card))).toBe(true);
  expect(selectGameClient(own).permissions).toMatchObject({ canFinishPowerPeek: true, canUsePower: false, canSkipPower: false });
});

it('Done hides authorized peek faces immediately and rejection restores them without enabling ordinary actions', () => {
  const state = viewing();
  const pending = reduce(state, { type: 'powerActionRequested', action: 'finishPowerPeek' });
  expect(pending.powerPeekTargets).toEqual(peek.targets);
  expect(selectGameClient(pending).view.powerPeekTargets).toEqual([]);
  const rejected = reduce(pending, { type: 'serverErrorReceived', error: { code: 'POWER_NOT_AVAILABLE', message: 'Retry Done' } });
  expect(selectGameClient(rejected).view.powerPeekTargets).toEqual(peek.targets);
  expect(selectGameClient(rejected).permissions).toMatchObject({ canFinishPowerPeek: true, canReplace: false, canDiscardDrawn: false });
});

it.each([
  { type: 'discardPileReceived', top: { cardId: 7 } },
  { type: 'turnChanged', playerId: 'p2' },
  { type: 'dealReceived', cards },
  { type: 'gameAborted', notice: { reason: 'SERVER_ERROR', lobby: { players } } },
  { type: 'connectionLost' },
])('clears power state and ignores late notifications after $type', action => {
  const state = reduce(viewing(), action);
  expect(state).toMatchObject({ resolvingPower: false, powerPrompt: null, powerPeekTargets: [], pendingPowerAction: null });
  for (const late of [start, available, reveal, result]) expect(reduce(state, late)).toBe(state);
  if (action.type === 'discardPileReceived') {
    expect(state.drawnCard).toBeNull();
    expect(state.awaitingTurn).toBe(true);
    expect(selectGameClient(state).permissions.canDraw).toBe(false);
  }
});

it('ignores mismatched notifications and strips face IDs from facedown peek results', () => {
  const before = powerClientState();
  for (const action of [available, reveal, result, { ...start, notice: { playerId: 'p2' } }]) expect(reduce(before, action)).toBe(before);
  const prompted = [start, available, reveal].reduce(reduce, before);
  const hidden = reduce(prompted, { type: 'powerPeekResult', notice: { targets: [{ ...peek.targets[0], faceUp: false }] } });
  expect(hidden.powerPeekTargets).toEqual([{ playerId: 'p1', handSlotId: 2, faceUp: false }]);
});

it('duplicate power/draw events cannot unlock pending Done or reopen a choice', () => {
  const pending = reduce(viewing(), { type: 'powerActionRequested', action: 'finishPowerPeek' });
  for (const late of [start, available, reveal, result, {
    type: 'drawnCardReceived', card: { playerId: 'p1', source: 'deck', faceUp: false },
  }]) expect(reduce(pending, late)).toBe(pending);
  expect(selectGameClient(pending).view.powerPeekTargets).toEqual([]);
  expect(selectGameClient(pending).permissions.canFinishPowerPeek).toBe(false);
});

for (const targetId of ['p2', 'p3', 'p4']) {
  it('opponent peek accepts ' + targetId + ' and preserves its prompt identity through Done', () => {
    let state = reduce(reduce(powerClientState(), start), { ...available, notice: { power: 'opponentPeek' } });
    expect(selectGameClient(state).permissions.canUsePower).toBe(true);
    state = reduce(state, reveal);
    const ownResult = { ...result, notice: { targets: [{ ...peek.targets[0], playerId: 'p1' }] } };
    expect(reduce(state, ownResult)).toBe(state);
    state = reduce(state, { ...result, notice: { targets: [{ ...peek.targets[0], playerId: targetId }] } });
    expect(state.powerPrompt).toEqual({ power: 'opponentPeek', stage: 'awaitingPeekDone' });
    expect(state.powerPeekTargets[0]).toMatchObject({ playerId: targetId, faceUp: true, cardId: 12 });
    expect(state.cards.every(card => !card.faceUp && !('cardId' in card))).toBe(true);
    const pending = reduce(state, { type: 'powerActionRequested', action: 'finishPowerPeek' });
    expect(selectGameClient(pending).view.powerPeekTargets).toEqual([]);
    const retry = reduce(pending, { type: 'serverErrorReceived', error: { code: 'POWER_NOT_AVAILABLE', message: 'Retry' } });
    expect(selectGameClient(retry).view.powerPeekTargets).toEqual(state.powerPeekTargets);
    for (const action of [
      { type: 'discardPileReceived', top: { cardId: 9 } },
      { type: 'turnChanged', playerId: 'p2' },
      { type: 'dealReceived', cards },
      { type: 'gameAborted', notice: { reason: 'SERVER_ERROR', lobby: { players } } },
      { type: 'connectionLost' },
    ]) {
      const cleared = reduce(state, action);
      expect(cleared.powerPeekTargets).toEqual([]);
      expect(cleared.powerPrompt).toBeNull();
      expect(reduce(cleared, result)).toBe(cleared);
    }
  });
}
it('targeted opponent strips even unexpected face IDs and receives no prompt', () => {
  const state = [start, reveal].reduce(reduce, powerClientState('p2'));
  const viewed = reduce(state, { ...result, notice: { targets: [{ ...peek.targets[0], playerId: 'p2' }] } });
  expect(viewed.powerPeekTargets).toEqual([{ playerId: 'p2', handSlotId: 2, faceUp: false }]);
  expect(viewed.powerPrompt).toBeNull();
});

it('activation confirms target selection once, preserving piles, hands, and movement', () => {
  const before = [start, available].reduce(reduce, powerClientState());
  expect(reduce(before, result)).toBe(before);
  const pending = reduce(before, { type: 'powerActionRequested', action: 'usePower' });
  const activated = reduce(pending, reveal);
  expect(activated.powerPrompt.stage).toBe('awaitingTargets');
  expect(activated.turnPending).toBe(false);
  expect(activated.cards).toBe(before.cards);
  expect(activated.discardTop).toBe(before.discardTop);
  expect(activated.movement).toBe(before.movement);
  for (const action of ['choosePowerTargets', 'skipPower']) {
    const locked = reduce(activated, { type: 'powerActionRequested', action });
    expect(reduce(locked, reveal)).toBe(locked);
  }
});
