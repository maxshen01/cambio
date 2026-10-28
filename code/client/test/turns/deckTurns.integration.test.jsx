// Four real clients exercise private/public draws and ordinary resolutions under jsdom.
import { act, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { io as connectClient } from 'socket.io-client';
import { expect, it } from 'vitest';
import { createServer } from '../../../server/src/server.js';
import { activeGame } from '../../../server/test/helpers/activeGame.js';
import { App } from '../../src/App.jsx';
import { CARD_BACK_IMAGE, CARD_IMAGES } from '../../../shared/cardCatalog.js';

it('IT-02/IT-03: plays private deck and public discard turns through all four boards', async () => {
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
    const cards = gameState.players.flatMap(player => player.hand.map(slot => ({ playerId: player.id, handSlotId: slot.handSlotId, faceUp: false })));
    for (const socket of sockets) {
      io.sockets.sockets.get(socket.id).emit('dealComplete', { cards });
      io.sockets.sockets.get(socket.id).emit('turnChanged', { playerId: sockets[0].id });
    }
    await waitFor(() => expect(query(0).getByRole('button', { name: 'Draw from deck' })).toBeEnabled());
    // A power card must behave exactly like an ordinary deck card in this milestone.
    const powerIndex = gameState.deck.cards.findIndex(card => card.cardId === 7);
    const [power] = gameState.deck.cards.splice(powerIndex, 1);
    gameState.deck.cards.push(power);
    await user.click(query(0).getByRole('button', { name: 'Draw from deck' }));
    for (let index = 0; index < 4; index++) {
      const image = await query(index).findByRole('img', { name: `Drawn card for Player 1, face ${index === 0 ? 'up' : 'down'}` });
      expect(image).toHaveAttribute('src', index === 0 ? CARD_IMAGES[7] : CARD_BACK_IMAGE);
      expect(query(index).getByRole('button', { name: 'Draw from deck' })).toBeDisabled();
      if (index !== 0) expect(query(index).getByRole('button', { name: 'Discard drawn card' })).toBeDisabled();
    }
    await user.click(query(0).getByRole('button', { name: 'Discard drawn card' }));
    for (let index = 0; index < 4; index++) {
      await waitFor(() => expect(query(index).getByRole('listitem', { name: 'Seat 2' })).toHaveAttribute('aria-current', 'true'));
      expect(query(index).getByRole('img', { name: 'Discard pile' })).toHaveAttribute('src', CARD_IMAGES[7]);
      expect(query(index).queryByRole('img', { name: /Drawn card/ })).not.toBeInTheDocument();
      expect(query(index).getByRole('button', { name: 'Draw from discard' })).toHaveProperty('disabled', index !== 1);
      expect(query(index).queryByText(/Use power|Don't use/)).not.toBeInTheDocument();
    }
    const drawn = gameState.deck.cards.at(-1);
    const displaced = gameState.players[1].hand[1].card;
    await user.click(query(1).getByRole('button', { name: 'Draw from deck' }));
    const held = await query(1).findByRole('img', { name: 'Drawn card for Player 2, face up' });
    expect(held).toHaveAttribute('src', CARD_IMAGES[drawn.cardId]);
    await user.click(query(1).getByRole('button', { name: 'Replace slot 2 with drawn card' }));
    for (let index = 0; index < 4; index++) {
      await waitFor(() => expect(query(index).getByRole('listitem', { name: 'Seat 3' })).toHaveAttribute('aria-current', 'true'));
      expect(query(index).getByRole('img', { name: 'Discard pile' })).toHaveAttribute('src', CARD_IMAGES[displaced.cardId]);
      expect(query(index).queryByRole('img', { name: /Drawn card/ })).not.toBeInTheDocument();
      const player2 = within(query(index).getByRole('listitem', { name: 'Seat 2' }));
      expect(player2.getByRole('img', { name: 'Slot 2, face down' })).toHaveAttribute('src', CARD_BACK_IMAGE);
    }
    expect(gameState.players[1].hand[1].card).toBe(drawn);
    // Exercise both older-top and sole-card draws through the real UI controls.
    for (const [ownerIndex, soleCard] of [[2, false], [3, true]]) {
      if (soleCard) {
        // Recycle buried cards in the fixture without changing its publicly visible top.
        gameState.deck.cards.unshift(...gameState.discardPile.cards.splice(0, gameState.discardPile.cards.length - 1));
      }
      const top = gameState.discardPile.cards.at(-1);
      const older = gameState.discardPile.cards.at(-2);
      const replaced = gameState.players[ownerIndex].hand[0].card;
      const discardButton = query(ownerIndex).getByRole('button', { name: 'Draw from discard' });
      expect(discardButton).toBeEnabled();
      await user.click(discardButton);
      for (let index = 0; index < 4; index++) {
        const held = await query(index).findByRole('img', { name: `Drawn card for Player ${ownerIndex + 1}, face up` });
        expect(held).toHaveAttribute('src', CARD_IMAGES[top.cardId]);
        await waitFor(() => {
          if (older) expect(query(index).getByRole('img', { name: 'Discard pile' })).toHaveAttribute('src', CARD_IMAGES[older.cardId]);
          else expect(query(index).queryByRole('img', { name: 'Discard pile' })).not.toBeInTheDocument();
        });
        // The pending display must survive the older-top update for every recipient.
        expect(held).toBeInTheDocument();
        expect(query(index).getByRole('button', { name: 'Discard drawn card' })).toBeDisabled();
        expect(query(index).getByRole('button', { name: 'Draw from deck' })).toBeDisabled();
        if (older) expect(query(index).getByRole('button', { name: 'Draw from discard' })).toBeDisabled();
      }
      const slot = query(ownerIndex).getByRole('button', { name: 'Replace slot 1 with drawn card' });
      expect(slot).toBeEnabled();
      await user.click(slot);
      const nextSeat = (ownerIndex + 1) % 4 + 1;
      for (let index = 0; index < 4; index++) {
        await waitFor(() => expect(query(index).getByRole('listitem', { name: `Seat ${nextSeat}` })).toHaveAttribute('aria-current', 'true'));
        expect(query(index).queryByRole('img', { name: /Drawn card/ })).not.toBeInTheDocument();
        expect(query(index).getByRole('img', { name: 'Discard pile' })).toHaveAttribute('src', CARD_IMAGES[replaced.cardId]);
        expect(query(index).getByRole('button', { name: 'Draw from discard' })).toHaveProperty('disabled', index !== (ownerIndex + 1) % 4);
        const hand = within(query(index).getByRole('listitem', { name: `Seat ${ownerIndex + 1}` }));
        expect(hand.getByRole('img', { name: 'Slot 1, face down' })).toHaveAttribute('src', CARD_BACK_IMAGE);
      }
      expect(gameState.players[ownerIndex].hand[0].card).toBe(top);
    }
    // Connection loss while holding a private card remains terminal for that local tab.
    await user.click(query(0).getByRole('button', { name: 'Draw from deck' }));
    await query(0).findByRole('img', { name: 'Drawn card for Player 1, face up' });
    act(() => sockets[0].disconnect());
    await waitFor(() => expect(query(0).getByRole('button', { name: 'Reload to rejoin' })).toBeEnabled());
    expect(query(0).queryByRole('img')).not.toBeInTheDocument();
  } finally {
    for (const view of views) view.unmount();
    for (const socket of sockets) socket.disconnect();
    await new Promise(resolve => io.close(resolve));
  }
}, 15000);
