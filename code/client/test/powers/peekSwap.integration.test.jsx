// One connected king flow covers two faces, silent Done, and a separate hidden swap.
import { fireEvent, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { io as connectClient } from 'socket.io-client';
import { expect, it } from 'vitest';
import { createServer } from '../../../server/src/server.js';
import { activeGame } from '../../../server/test/helpers/activeGame.js';
import { App } from '../../src/App.jsx';
import { CARD_BACK_IMAGE } from '../../../shared/cardCatalog.js';

it('four boards peek two king targets, close them with Done, then swap a different pair', async () => {
  const { httpServer, io, gameState } = createServer();
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const sockets = [], views = [];
  const user = userEvent.setup();
  const query = index => within(views[index].container);
  const hand = (index, seat) => within(query(index).getByRole('listitem', { name: `Seat ${seat}` }));
  try {
    for (let index = 0; index < 4; index++) {
      const socket = connectClient(`http://127.0.0.1:${httpServer.address().port}`, {
        autoConnect: false, reconnection: false, forceNew: true, transports: ['websocket'],
      });
      sockets.push(socket);
      views.push(render(<App socket={socket} />));
      await waitFor(() => expect(query(index).getByRole('status')).toHaveTextContent('Connected'));
      // Join is fixture setup; the feature actions below use realistic UI interactions.
      fireEvent.change(query(index).getByRole('textbox'), { target: { value: `Player ${index + 1}` } });
      await user.click(query(index).getByRole('button', { name: 'Join lobby' }));
      await waitFor(() => expect(query(index).queryByRole('dialog')).not.toBeInTheDocument());
    }
    Object.assign(gameState, activeGame(sockets.map(socket => socket.id)));
    const index = gameState.deck.cards.findIndex(card => card.power === 'twoPeekSwap');
    gameState.deck.cards.push(...gameState.deck.cards.splice(index, 1));
    const cards = gameState.players.flatMap(player => player.hand.map(slot => ({ playerId: player.id, handSlotId: slot.handSlotId, faceUp: false })));
    for (const socket of sockets) {
      io.sockets.sockets.get(socket.id).emit('dealComplete', { cards });
      io.sockets.sockets.get(socket.id).emit('turnChanged', { playerId: sockets[0].id });
    }
    await waitFor(() => expect(query(0).getByRole('button', { name: 'Draw from deck' })).toBeEnabled());
    await user.click(query(0).getByRole('button', { name: 'Draw from deck' }));
    await query(0).findByRole('img', { name: 'Drawn card for Player 1, face up' });
    await user.click(query(0).getByRole('button', { name: 'Discard drawn card' }));
    await user.click(await query(0).findByRole('button', { name: 'Use', exact: true }));
    await query(0).findByRole('button', { name: 'Confirm selection' });
    for (const slot of [1, 2]) await user.click(hand(0, 1).getByRole('button', { name: `Peek at slot ${slot}` }));
    await user.click(query(0).getByRole('button', { name: 'Confirm selection' }));
    await query(0).findByRole('button', { name: 'Done' });
    expect(hand(0, 1).getAllByRole('img', { name: /face up/ })).toHaveLength(2);
    for (let viewer = 1; viewer < 4; viewer++) {
      await waitFor(() => expect(views[viewer].container.querySelectorAll('.setup-hand__slot--peeked')).toHaveLength(2));
      expect(hand(viewer, 1).queryByRole('img', { name: /face up/ })).not.toBeInTheDocument();
      expect(query(viewer).queryByRole('complementary')).not.toBeInTheDocument();
    }
    await user.click(query(0).getByRole('button', { name: 'Done' }));
    expect(hand(0, 1).queryByRole('img', { name: /face up/ })).not.toBeInTheDocument();
    for (const seat of [2, 3]) await user.click(hand(0, seat).getByRole('button', { name: 'Swap slot 1' }));
    // Selection sends no swap, and Done does not advance or discard.
    expect(gameState.pendingPowerStage).toBe('awaitingSwap');
    expect(gameState.turn).toBe(sockets[0].id);
    for (let viewer = 0; viewer < 4; viewer++) expect(query(viewer).getByRole('img', { name: 'Drawn card for Player 1, face up' })).toBeVisible();
    const [a, b] = [gameState.players[1].hand[0].card, gameState.players[2].hand[0].card];
    await user.click(query(0).getByRole('button', { name: 'Confirm selection' }));
    for (let viewer = 0; viewer < 4; viewer++) {
      await waitFor(() => expect(query(viewer).getByRole('listitem', { name: 'Seat 2' })).toHaveAttribute('aria-current', 'true'));
      expect(query(viewer).queryByRole('img', { name: /Drawn card/ })).not.toBeInTheDocument();
      expect(views[viewer].container.querySelector('.setup-hand__slot--selected')).toBeNull();
      for (const image of views[viewer].container.querySelectorAll('.setup-hand .setup-card')) expect(image).toHaveAttribute('src', CARD_BACK_IMAGE);
    }
    expect(gameState.players[1].hand[0].card).toBe(b);
    expect(gameState.players[2].hand[0].card).toBe(a);
  } finally {
    views.forEach(view => view.unmount());
    sockets.forEach(socket => socket.disconnect());
    await new Promise(resolve => io.close(resolve));
  }
}, 15000);
