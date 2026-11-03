// Simulates cold caches and rejected requests to check the user-visible artwork gate.
import { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { GameBoard } from '../../src/board/GameBoard.jsx';
import { App } from '../../src/App.jsx';
import { FakeSocket } from '../helpers/fakeSocket.js';
import { CARD_BACK_IMAGE, CARD_IMAGES } from '../../../shared/cardCatalog.js';
import { loadCardArtwork, isCardArtworkReady, preloadCardArtwork } from '../../src/cards/cardArtwork.js';

vi.mock('../../src/cards/cardArtwork.js', () => ({
  loadCardArtwork: vi.fn(), isCardArtworkReady: vi.fn(), preloadCardArtwork: vi.fn(),
}));

let loaded;
let requests;
const players = [1, 2, 3, 4].map(seatId => ({
  playerId: `p${seatId}`, seatId, displayName: `Player ${seatId}`, connected: true, isReady: false,
}));
function cards(faceId = 1) {
  return players.flatMap(player => [1, 2, 3, 4].map(handSlotId => ({
    playerId: player.playerId, handSlotId,
    ...(player.playerId === 'p1' && [2, 4].includes(handSlotId)
      ? { faceUp: true, cardId: handSlotId === 2 ? faceId : 14 } : { faceUp: false }),
  })));
}
function props(faceId = 1) {
  return { players, cards: cards(faceId), identity: { playerId: 'p1', seatId: 1 }, canReady: true, onReady: vi.fn() };
}
beforeEach(() => {
  vi.clearAllMocks();
  loaded = new Set();
  requests = new Map();
  isCardArtworkReady.mockImplementation(url => loaded.has(url));
  loadCardArtwork.mockImplementation(url => {
    if (loaded.has(url)) return Promise.resolve();
    if (requests.has(url)) return requests.get(url).promise;
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    requests.set(url, { promise, resolve, reject });
    return promise;
  });
});
async function finish(...urls) {
  await act(async () => {
    for (const url of urls) { loaded.add(url); requests.get(url)?.resolve(); }
  });
}

it.each(['selfPeek', 'opponentPeek'])('%s keeps the shared held card and baseline hands visible while peek artwork loads, fails, and retries', async power => {
  const user = userEvent.setup();
  const boardProps = {
    ...props(), canReady: false, turnPlayerId: 'p1',
    cards: cards().map(({ playerId, handSlotId }) => ({ playerId, handSlotId, faceUp: false })),
    drawnCard: { playerId: 'p1', source: 'deck', faceUp: true, cardId: 7 },
    power: { resolving: true, prompt: { power, stage: 'awaitingChoice' }, peekTargets: [],
      pendingAction: null, canUse: true, canChooseTargets: false, canSkip: true, canDone: false,
      onUse: vi.fn(), onChooseTargets: vi.fn(), onSkip: vi.fn(), onDone: vi.fn() },
  };
  const view = render(<GameBoard {...boardProps} />);
  await finish(CARD_BACK_IMAGE, CARD_IMAGES[7]);
  const shared = screen.getByRole('img', { name: 'Drawn card for Player 1, face up' });
  const viewing = { ...boardProps, power: { ...boardProps.power,
    prompt: { power, stage: 'awaitingPeekDone' }, canUse: false, canSkip: false, canDone: true,
    peekTargets: [{ playerId: power === 'selfPeek' ? 'p1' : 'p2', handSlotId: 2, faceUp: true, cardId: 12 }],
  } };
  view.rerender(<GameBoard {...viewing} />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading cards');
  expect(screen.getByRole('img', { name: 'Drawn card for Player 1, face up' })).toBe(shared);
  expect(screen.getAllByRole('img', { name: /Slot .*face down/ })).toHaveLength(16);
  await act(async () => requests.get(CARD_IMAGES[12]).reject(new Error('peek offline')));
  expect(screen.getByRole('alert')).toHaveTextContent('Card images could not be loaded');
  expect(shared).toBeVisible();
  expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
  requests.delete(CARD_IMAGES[12]);
  await user.click(screen.getByRole('button', { name: 'Retry card images' }));
  await finish(CARD_IMAGES[12]);
  expect(screen.getByRole('img', { name: 'Slot 2, face up' })).toHaveAttribute('src', CARD_IMAGES[12]);
  expect(shared).toBeVisible();
  expect(boardProps.cards.every(card => !card.faceUp && !('cardId' in card))).toBe(true);
});

it('begins preloading the public artwork while the join dialog is displayed', () => {
  render(<App socket={new FakeSocket()} />);
  expect(screen.getByRole('dialog', { name: 'Join the lobby' })).toBeInTheDocument();
  expect(preloadCardArtwork).toHaveBeenCalledTimes(1);
});

it('shows a loading status without partial card images and disables Ready until every required image is decoded', async () => {
  const boardProps = props();
  const user = userEvent.setup();
  render(<StrictMode><GameBoard {...boardProps} /></StrictMode>);
  expect(screen.getByRole('status')).toHaveTextContent('Loading cards');
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  const ready = screen.getByRole('button', { name: 'Ready Up' });
  expect(ready).toBeDisabled();
  await user.click(ready);
  expect(boardProps.onReady).not.toHaveBeenCalled();
  expect([...requests.keys()].sort()).toEqual([CARD_BACK_IMAGE, CARD_IMAGES[1], CARD_IMAGES[14]].sort());
  await finish(CARD_BACK_IMAGE, CARD_IMAGES[1]);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(ready).toBeDisabled();
  await finish(CARD_IMAGES[14]);
  expect(screen.queryByText(/Loading cards/)).not.toBeInTheDocument();
  expect(screen.getAllByRole('img')).toHaveLength(17);
  expect(ready).toBeEnabled();
  await user.click(ready);
  expect(boardProps.onReady).toHaveBeenCalledTimes(1);
});

it('keeps faces hidden after failure and allows a fresh image request without a socket action', async () => {
  const boardProps = props();
  const user = userEvent.setup();
  render(<GameBoard {...boardProps} />);
  await finish(CARD_BACK_IMAGE, CARD_IMAGES[1]);
  await act(async () => { requests.get(CARD_IMAGES[14]).reject(new Error('offline')); });
  expect(screen.getByRole('alert')).toHaveTextContent('Card images could not be loaded');
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ready Up' })).toBeDisabled();
  requests.delete(CARD_IMAGES[14]);
  await user.click(screen.getByRole('button', { name: 'Retry card images' }));
  expect(screen.getByRole('status')).toHaveTextContent('Loading cards');
  await finish(CARD_IMAGES[14]);
  expect(screen.getAllByRole('img')).toHaveLength(17);
  expect(screen.getByRole('button', { name: 'Ready Up' })).toBeEnabled();
  expect(boardProps.onReady).not.toHaveBeenCalled();
});

it('does not let an older deal completion reveal a new deal before its own artwork is ready', async () => {
  const view = render(<GameBoard {...props()} />);
  view.rerender(<GameBoard {...props(53)} />);
  await finish(CARD_BACK_IMAGE, CARD_IMAGES[1], CARD_IMAGES[14]);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ready Up' })).toBeDisabled();
  await finish(CARD_IMAGES[53]);
  expect(screen.getByRole('img', { name: 'Slot 2, face up' })).toHaveAttribute('src', CARD_IMAGES[53]);
  view.unmount();
});

it('shows cached artwork immediately and never waits for unrelated faces', () => {
  [CARD_BACK_IMAGE, CARD_IMAGES[1], CARD_IMAGES[14]].forEach(url => loaded.add(url));
  render(<GameBoard {...props()} />);
  expect(screen.queryByText(/Loading cards/)).not.toBeInTheDocument();
  expect(screen.getAllByRole('img')).toHaveLength(17);
  expect(screen.getByRole('button', { name: 'Ready Up' })).toBeEnabled();
});
