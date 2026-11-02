// Four connected boards exercise Jack selection, hidden swaps, and both Skip stages.
import { render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { io as connectClient } from 'socket.io-client';
import { expect, it } from 'vitest';
import { createServer } from '../../../server/src/server.js';
import { activeGame } from '../../../server/test/helpers/activeGame.js';
import { App } from '../../src/App.jsx';
import { CARD_BACK_IMAGE, CARD_IMAGES } from '../../../shared/cardCatalog.js';

it('four boards complete own/opponent and opponent/opponent blind swaps, then Skip before and after activation', async () => {
  const { httpServer, io, gameState } = createServer();
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const sockets = [];
  const views = [];
  const user = userEvent.setup();
  const query = index => within(views[index].container);
  try {
    for (let index = 0; index < 4; index++) {
      const socket = connectClient(`http://127.0.0.1:${httpServer.address().port}`, {
        autoConnect: false, reconnection: false, forceNew: true, transports: ['websocket'],
      });
      sockets.push(socket);
      views.push(render(<App socket={socket} />));
      await waitFor(() => expect(query(index).getByRole('status')).toHaveTextContent('Connected'));
      await user.type(query(index).getByRole('textbox'), `Player ${index + 1}`);
      await user.click(query(index).getByRole('button', { name: 'Join lobby' }));
      await waitFor(() => expect(query(index).queryByRole('dialog')).not.toBeInTheDocument());
    }
    Object.assign(gameState, activeGame(sockets.map(socket => socket.id)));
    const cards = gameState.players.flatMap(player => player.hand.map(slot => ({
      playerId: player.id, handSlotId: slot.handSlotId, faceUp: false,
    })));
    for (const socket of sockets) {
      io.sockets.sockets.get(socket.id).emit('dealComplete', { cards });
      io.sockets.sockets.get(socket.id).emit('turnChanged', { playerId: sockets[0].id });
    }
    for (const owner of [0, 1, 2, 3]) {
      await waitFor(() => expect(query(owner).getByRole('button', { name: 'Draw from deck' })).toBeEnabled());
      const index = gameState.deck.cards.findIndex(card => card.rank === 11);
      const [held] = gameState.deck.cards.splice(index, 1);
      gameState.deck.cards.push(held);
      await user.click(query(owner).getByRole('button', { name: 'Draw from deck' }));
      await query(owner).findByRole('img', { name: `Drawn card for Player ${owner + 1}, face up` });

      await query(owner).findByRole('button', { name: 'Use', exact: true });
      if (owner !== 2) {
        await user.click(query(owner).getByRole('button', { name: 'Use', exact: true }));
        await waitFor(() => expect(query(owner).getAllByRole('button', { name: /^(Peek at|Swap) slot/ })[0]).toBeEnabled());
        for (let viewer = 0; viewer < 4; viewer++) {
          const image = await query(viewer).findByRole('img', { name: `Drawn card for Player ${owner + 1}, face up` });
          expect(image).toHaveAttribute('src', CARD_IMAGES[held.cardId]);
          if (viewer !== owner) expect(query(viewer).queryByRole('complementary')).not.toBeInTheDocument();
        }
      }
      if (owner < 2) {
        // Turn one swaps own/opponent; turn two swaps two opponents of that owner.
        const a = gameState.players[0].hand[0].card;
        const b = gameState.players[2].hand[0].card;
        for (const seat of [1, 3]) {
          const hand = within(query(owner).getByRole('listitem', { name: `Seat ${seat}` }));
          await user.click(hand.getByRole('button', { name: 'Swap slot 1' }));
        }
        for (let viewer = 0; viewer < 4; viewer++) {
          if (viewer !== owner) expect(views[viewer].container.querySelector('.setup-hand__slot--selected')).toBeNull();
        }

        await waitFor(() => expect(gameState.players[0].hand[0].card).toBe(b));
        expect(gameState.players[2].hand[0].card).toBe(a);
      } else await user.click(query(owner).getByRole('button', { name: "Don't use" }));
      for (let viewer = 0; viewer < 4; viewer++) {
        await waitFor(() => expect(query(viewer).getByRole('listitem', { name: `Seat ${(owner + 1) % 4 + 1}` })).toHaveAttribute('aria-current', 'true'));
        expect(query(viewer).queryByRole('img', { name: /Drawn card/ })).not.toBeInTheDocument();
        expect(query(viewer).getByRole('img', { name: 'Discard pile' })).toHaveAttribute('src', CARD_IMAGES[held.cardId]);
        expect(views[viewer].container.querySelector('.setup-hand__slot--selected')).toBeNull();
        for (const image of views[viewer].container.querySelectorAll('.setup-hand .setup-card')) expect(image).toHaveAttribute('src', CARD_BACK_IMAGE);
      }
      expect(gameState.pendingPower).toBeNull();
    }
  } finally {
    for (const view of views) view.unmount();
    for (const socket of sockets) socket.disconnect();
    await new Promise(resolve => io.close(resolve));
  }
}, 20000);
