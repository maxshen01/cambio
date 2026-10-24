import { render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { io as connectClient } from 'socket.io-client';
import { expect, it } from 'vitest';
import { createServer } from '../../server/src/server.js';
import { App } from '../src/App.jsx';
import { createServer as createHttpServer } from 'node:http';

it('retries the same real socket after the backend becomes available and requires reload after loss', async () => {
  // Reserve an ephemeral address, then release it to reproduce an unavailable backend.
  const reservation = createHttpServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const socket = connectClient(`http://127.0.0.1:${port}`, {
    autoConnect: false, reconnection: false, forceNew: true, transports: ['websocket'], timeout: 500,
  });
  const server = createServer();
  const view = render(<App socket={socket} />);
  const ui = within(view.container);
  const user = userEvent.setup();
  try {
    await user.type(ui.getByRole('textbox'), 'Alice');
    await waitFor(() => expect(ui.getByRole('status')).toHaveTextContent('Connection failed'));
    await new Promise(resolve => server.httpServer.listen(port, '127.0.0.1', resolve));
    await user.click(ui.getByRole('button', { name: 'Retry connection' }));
    await waitFor(() => expect(ui.getByRole('status')).toHaveTextContent('Connected'));
    expect(ui.getByRole('textbox')).toHaveValue('Alice');
    await user.click(ui.getByRole('button', { name: 'Join lobby' }));
    await waitFor(() => expect(ui.queryByRole('dialog')).not.toBeInTheDocument());
    await new Promise(resolve => server.io.close(resolve));
    await waitFor(() => expect(ui.getByRole('button', { name: 'Reload to rejoin' })).toBeEnabled());
    expect(ui.getByRole('status')).toHaveTextContent('Connection lost');
    expect(ui.getAllByText('Empty')).toHaveLength(4);
    expect(ui.queryByRole('button', { name: 'Retry connection' })).not.toBeInTheDocument();
  } finally {
    view.unmount();
    socket.disconnect();
    if (server.httpServer.listening) await new Promise(resolve => server.io.close(resolve));
  }
});

it('shows the lobby filling on four separate socket connections', async () => {
  const { httpServer, io } = createServer();
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`;
  const sockets = [];
  const views = [];

  try {
    for (let seat = 1; seat <= 4; seat++) {
      const socket = connectClient(url, {
        autoConnect: false,
        reconnection: false,
        forceNew: true,
        transports: ['websocket'],
      });
      sockets.push(socket);
      const view = render(<App socket={socket} />);
      views.push(view);
      await waitFor(() => expect(within(view.container).getByRole('status')).toHaveTextContent('Connected'));
      expect(within(view.container).getByRole('dialog', { name: 'Join the lobby' })).toBeInTheDocument();

      const user = userEvent.setup();
      await user.type(within(view.container).getByRole('textbox', { name: /name/i }), `Player ${seat}`);
      await user.click(within(view.container).getByRole('button', { name: /join/i }));
      await waitFor(() => expect(within(view.container).queryByRole('dialog')).not.toBeInTheDocument());

      for (const joinedView of views) {
        await waitFor(() => {
          for (let occupiedSeat = 1; occupiedSeat <= seat; occupiedSeat++) {
            expect(within(joinedView.container).getByRole('listitem', { name: `Seat ${occupiedSeat}` }))
              .toHaveTextContent(`Player ${occupiedSeat}`);
          }
          expect(within(joinedView.container).queryAllByText('Empty')).toHaveLength(4 - seat);
        });
      }
      expect(within(view.container).getByRole('listitem', { name: `Seat ${seat}` }))
        .toHaveTextContent(`Player ${seat}`);
      expect(within(view.container).getByRole('listitem', { name: `Seat ${seat}` }))
        .toHaveClass('seat--bottom');
      expect(within(view.container).getByRole('button', { name: 'Ready Up' })).toBeEnabled();
      if (seat === 1) {
        await user.click(within(view.container).getByRole('button', { name: 'Ready Up' }));
        for (const joinedView of views) {
          await waitFor(() => expect(within(joinedView.container).getByRole('listitem', { name: 'Seat 1' }))
            .toHaveTextContent('Ready'));
        }
        await user.click(within(view.container).getByRole('button', { name: 'Unready' }));
        await waitFor(() => expect(within(view.container).getByRole('listitem', { name: 'Seat 1' }))
          .toHaveTextContent('Not ready'));
        await user.click(within(view.container).getByRole('button', { name: 'Ready Up' }));
        await waitFor(() => expect(within(view.container).getByRole('listitem', { name: 'Seat 1' }))
          .toHaveTextContent('Ready'));
      }
    }

    for (let seat = 2; seat <= 4; seat++) {
      const user = userEvent.setup();
      await user.click(within(views[seat - 1].container).getByRole('button', { name: 'Ready Up' }));
    }
    for (const view of views) {
      await waitFor(() => {
        for (let seat = 1; seat <= 4; seat++) {
          expect(within(view.container).getByRole('listitem', { name: `Seat ${seat}` }))
            .toHaveTextContent('Not ready');
        }
      });
      expect(within(view.container).getByRole('button', { name: 'Ready Up' })).toBeEnabled();
      expect(within(view.container).getAllByRole('img', { name: /face up/ })).toHaveLength(2);
    }
  } finally {
    for (const socket of sockets) socket.disconnect();
    await new Promise(resolve => io.close(resolve));
  }
}, 15000);
