import { render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { io as connectClient } from 'socket.io-client';
import { expect, it } from 'vitest';
import { createServer } from '../../server/src/server.js';
import { App } from '../src/App.jsx';

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
        .toHaveTextContent(`Player ${seat} (you)`);
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
            .toHaveTextContent('Ready');
        }
      });
      expect(within(view.container).getByRole('button', { name: 'Unready' })).toBeDisabled();
    }
  } finally {
    for (const socket of sockets) socket.disconnect();
    await new Promise(resolve => io.close(resolve));
  }
}, 15000);
