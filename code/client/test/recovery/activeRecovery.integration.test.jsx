// IT-11 exercises real setup, departure, replacement, redeal, and renewed turns through the UI.
import { act, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { io as connectClient } from 'socket.io-client';
import { expect, it } from 'vitest';
import { createServer } from '../../../server/src/server.js';
import { App } from '../../src/App.jsx';

it('IT-11 returns survivors to the lobby and plays again after replacement and a fresh deal', async () => {
  const { httpServer, io, gameState } = createServer({ random: () => 0 });
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const sockets = [];
  const views = [];
  const user = userEvent.setup();
  const query = index => within(views[index].container);
  async function addPlayer(name) {
    const socket = connectClient(`http://127.0.0.1:${httpServer.address().port}`, {
      autoConnect: false, reconnection: false, forceNew: true, transports: ['websocket'],
    });
    const index = sockets.length;
    sockets.push(socket);
    views.push(render(<App socket={socket} />));
    await waitFor(() => expect(query(index).getByRole('status')).toHaveTextContent('Connected'));
    await user.type(query(index).getByRole('textbox'), name);
    await user.click(query(index).getByRole('button', { name: 'Join lobby' }));
    await waitFor(() => expect(query(index).queryByRole('dialog')).not.toBeInTheDocument());
  }
  async function startRound(indices) {
    for (const index of indices) await user.click(query(index).getByRole('button', { name: 'Ready Up' }));
    for (const index of indices) {
      await waitFor(() => expect(query(index).getByRole('img', { name: 'Slot 2, face up' })).toBeInTheDocument());
      await user.click(query(index).getByRole('button', { name: 'Ready Up' }));
    }
    await waitFor(() => expect(query(0).getByRole('button', { name: 'Draw from deck' })).toBeEnabled());
  }
  try {
    for (let i = 0; i < 4; i++) await addPlayer(`Player ${i + 1}`);
    await startRound([0, 1, 2, 3]);
    await user.click(query(0).getByRole('button', { name: 'Draw from deck' }));
    await query(0).findByRole('img', { name: 'Drawn card for Player 1, face up' });
    const seats = gameState.players.map(player => ({ id: player.id, seatId: player.seatId }));
    act(() => sockets[1].disconnect());
    for (const index of [0, 2, 3]) {
      await waitFor(() => expect(query(index).getByRole('button', { name: 'Ready Up' })).toBeEnabled());
      expect(query(index).queryByRole('img')).not.toBeInTheDocument();
      expect(query(index).queryByRole('dialog')).not.toBeInTheDocument();
    }
    expect(gameState.players.map(player => ({ id: player.id, seatId: player.seatId }))).toEqual(seats.filter(player => player.seatId !== 2));
    expect(query(1).getByRole('button', { name: 'Reload to rejoin' })).toBeEnabled();
    await addPlayer('Replacement');
    expect(gameState.players.find(player => player.id === sockets[4].id).seatId).toBe(2);
    await startRound([0, 2, 3, 4]);
    await user.click(query(0).getByRole('button', { name: 'Draw from deck' }));
    await query(0).findByRole('img', { name: 'Drawn card for Player 1, face up' });
    await user.click(query(0).getByRole('button', { name: 'Discard drawn card' }));
    await waitFor(() => expect(query(4).getByRole('button', { name: 'Draw from deck' })).toBeEnabled());
    for (const index of [0, 2, 3, 4]) expect(query(index).queryByRole('img', { name: /Drawn card/ })).not.toBeInTheDocument();
  } finally {
    for (const view of views) view.unmount();
    for (const socket of sockets) socket.disconnect();
    await new Promise(resolve => io.close(resolve));
  }
}, 15000);
