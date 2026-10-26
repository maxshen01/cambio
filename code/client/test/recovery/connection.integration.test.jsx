// Checks connection retry and loss using the real server and client socket.
import { render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { io as connectClient } from 'socket.io-client';
import { expect, it } from 'vitest';
import { createServer } from '../../../server/src/server.js';
import { App } from '../../src/App.jsx';
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

