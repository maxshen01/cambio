// Four connected React boards exercise self/opponent-peek privacy and completion through UI actions.
import { render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { io as connectClient } from 'socket.io-client';
import { expect, it } from 'vitest';
import { createServer } from '../../../server/src/server.js';
import { activeGame } from '../../../server/test/helpers/activeGame.js';
import { App } from '../../src/App.jsx';
import { CARD_BACK_IMAGE, CARD_IMAGES } from '../../../shared/cardCatalog.js';

it.each([7, 8, 9, 10])('%s: four boards activate, immediately select a peek, and Skip with private faces', async rank => {
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
    // Exercise a confirmed peek, Skip after activation, and Skip before activation.
    for (const owner of [0, 1, 2]) {
      await waitFor(() => expect(query(owner).getByRole('button', { name: 'Draw from deck' })).toBeEnabled());
      const cardIndex = gameState.deck.cards.findIndex(card => card.rank === rank);
      const [held] = gameState.deck.cards.splice(cardIndex, 1);
      gameState.deck.cards.push(held);
      await user.click(query(owner).getByRole('button', { name: 'Draw from deck' }));
      await query(owner).findByRole('img', { name: `Drawn card for Player ${owner + 1}, face up` });

      await query(owner).findByRole('button', { name: 'Use', exact: true });
      if (owner === 0) {
        const targetSeat = rank < 9 ? 1 : 2;
        const target = gameState.players[targetSeat - 1].hand[1].card;
        await user.click(query(owner).getByRole('button', { name: 'Use drawn card power' }));
        await waitFor(() => expect(query(owner).getAllByRole('button', { name: /^(Peek at|Swap) slot/ })[0]).toBeEnabled());

        for (let index = 0; index < 4; index++) {
          const image = await query(index).findByRole('img', { name: 'Drawn card for Player 1, face up' });
          expect(image).toHaveAttribute('src', CARD_IMAGES[held.cardId]);
          expect(views[index].container.querySelector('.setup-hand__slot--peeked')).toBeNull();
        }
        expect(gameState.pendingPowerStage).toBe('awaitingTargets');
        const targetHand = within(query(owner).getByRole('listitem', { name: 'Seat ' + targetSeat }));
        await user.click(targetHand.getByRole('button', { name: 'Peek at slot 2' }));
        for (let index = 1; index < 4; index++) expect(views[index].container.querySelector('.setup-hand__slot--selected')).toBeNull();

        await query(owner).findByRole('button', { name: 'Done' });
        for (let index = 0; index < 4; index++) {
          const hand = within(query(index).getByRole('listitem', { name: 'Seat ' + targetSeat }));
          const image = await hand.findByRole('img', { name: `Slot 2, face ${index === owner ? 'up' : 'down'}` });
          await waitFor(() => expect(image.closest('[data-slot]')).toHaveClass('setup-hand__slot--peeked'));
          expect(image).toHaveAttribute('src', index === owner ? CARD_IMAGES[target.cardId] : CARD_BACK_IMAGE);
          expect(query(index).getByRole('img', { name: 'Drawn card for Player 1, face up' })).toHaveAttribute('src', CARD_IMAGES[held.cardId]);
          if (index !== owner) {
            expect(query(index).queryByRole('complementary')).not.toBeInTheDocument();
            expect(query(index).queryByRole('alert')).not.toBeInTheDocument();
            expect(query(index).queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
          }
        }
        expect(gameState.turn).toBe(sockets[owner].id);
        expect(gameState.pendingPowerStage).toBe('awaitingPeekDone');
        await user.click(query(owner).getByRole('button', { name: 'Done' }));
      } else {
        if (owner === 1) {
          await user.click(query(owner).getByRole('button', { name: 'Use', exact: true }));
          await waitFor(() => expect(query(owner).getAllByRole('button', { name: /^(Peek at|Swap) slot/ })[0]).toBeEnabled());
          for (let index = 0; index < 4; index++) await query(index).findByRole('img', { name: 'Drawn card for Player 2, face up' });
        }
        await user.click(query(owner).getByRole('button', { name: "Don't use" }));
      }
      for (let index = 0; index < 4; index++) {
        await waitFor(() => expect(query(index).getByRole('listitem', { name: `Seat ${owner + 2}` })).toHaveAttribute('aria-current', 'true'));
        expect(query(index).queryByRole('img', { name: /Drawn card/ })).not.toBeInTheDocument();
        expect(query(index).getByRole('img', { name: 'Discard pile' })).toHaveAttribute('src', CARD_IMAGES[held.cardId]);
        expect(views[index].container.querySelector('.setup-hand__slot--peeked')).toBeNull();
      }
      expect(gameState.pendingPower).toBeNull();
    }
  } finally {
    for (const view of views) view.unmount();
    for (const socket of sockets) socket.disconnect();
    await new Promise(resolve => io.close(resolve));
  }
}, 15000);
