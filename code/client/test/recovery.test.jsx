// Covers explicit connection recovery and callback lifetime across StrictMode effects.
import { StrictMode } from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { App } from '../src/App.jsx';
import { FakeSocket } from './fakeSocket.js';
import { useLobby } from '../src/lobby/useLobby.js';

it('guards retry, join, and ready twice in the same render cycle and clears pending actions on loss', () => {
  const socket = new FakeSocket();
  socket.connect = vi.fn();
  const { result } = renderHook(() => useLobby(socket));
  act(() => socket.receive('connect_error', new Error('offline')));
  act(() => { result.current.retry(); result.current.retry(); });
  expect(socket.connect).toHaveBeenCalledTimes(2);
  act(() => { socket.connected = true; socket.receive('connect'); });
  act(() => { result.current.join('Alice'); result.current.join('Alice'); });
  expect(socket.emissions).toHaveLength(1);
  act(() => {
    socket.emissions[0].ack({ playerId: 'p1', seatId: 1 });
    socket.receive('playerJoined', { players: [
      { playerId: 'p1', seatId: 1, displayName: 'Alice', connected: true, isReady: false },
    ] });
  });
  act(() => { result.current.toggleReady(); result.current.toggleReady(); });
  expect(socket.emissions).toHaveLength(2);
  expect(result.current.readyPending).toBe(true);
  act(() => socket.disconnect());
  expect(result.current).toMatchObject({ connection: 'lost', identity: null, players: [], pending: false, readyPending: false });
  act(() => {
    socket.emissions[0].ack({ playerId: 'p1', seatId: 1 });
    socket.receive('playerUnready', { playerId: 'p1' });
    socket.receive('playerDisconnected', { players: [{ playerId: 'p1', seatId: 1 }] });
  });
  expect(result.current).toMatchObject({ connection: 'lost', identity: null, players: [] });
});

it('shows initial failure and retries once with the same name and socket', async () => {
  const socket = new FakeSocket();
  socket.connect = vi.fn();
  const user = userEvent.setup();
  render(<App socket={socket} />);
  await user.type(screen.getByRole('textbox'), 'Alice');
  act(() => socket.receive('connect_error', new Error('offline')));
  expect(screen.getByRole('status')).toHaveTextContent('Connection failed');
  const retry = screen.getByRole('button', { name: 'Retry connection' });
  await user.tab();
  expect(retry).toHaveFocus();
  await user.tab();
  expect(screen.getByRole('textbox')).toHaveFocus();
  await user.tab({ shift: true });
  expect(retry).toHaveFocus();
  await user.click(retry);
  await user.click(retry);
  expect(socket.connect).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Connecting');
  expect(screen.getByRole('textbox')).toHaveValue('Alice');
  act(() => { socket.connected = true; socket.receive('connect'); });
  await user.click(screen.getByRole('button', { name: 'Join lobby' }));
  expect(socket.emissions[0].payload).toEqual({ displayName: 'Alice' });
});

it('keeps reload keyboard focus inside the lost-connection dialog', async () => {
  const socket = new FakeSocket();
  const user = userEvent.setup();
  render(<App socket={socket} />);
  act(() => socket.disconnect());
  const reload = screen.getByRole('button', { name: 'Reload to rejoin' });
  expect(reload).toHaveFocus();
  await user.tab();
  expect(reload).toHaveFocus();
  await user.tab({ shift: true });
  expect(reload).toHaveFocus();
});

it('does not start overlapping connection attempts during StrictMode mounting', () => {
  const socket = new FakeSocket();
  socket.connect = vi.fn();
  render(<StrictMode><App socket={socket} /></StrictMode>);
  expect(socket.connect).toHaveBeenCalledTimes(1);
  for (const listeners of socket.listeners.values()) expect(listeners.size).toBe(1);
  act(() => socket.receive('connect_error', new Error('offline')));
  expect(screen.getByRole('button', { name: 'Retry connection' })).toBeEnabled();
});

it('cleans StrictMode listeners and invalidates an acknowledgement after unmount', async () => {
  const socket = new FakeSocket();
  const user = userEvent.setup();
  const view = render(<StrictMode><App socket={socket} /></StrictMode>);
  for (const listeners of socket.listeners.values()) expect(listeners.size).toBe(1);
  await user.type(screen.getByRole('textbox'), 'Alice');
  await user.click(screen.getByRole('button', { name: 'Join lobby' }));
  const ack = socket.emissions[0].ack;
  view.unmount();
  for (const listeners of socket.listeners.values()) expect(listeners.size).toBe(0);
  render(<App socket={socket} />);
  act(() => ack({ playerId: 'old', seatId: 1 }));
  expect(screen.getByRole('status')).toHaveTextContent('Connected');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
