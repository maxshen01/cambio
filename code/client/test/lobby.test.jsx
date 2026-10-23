import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App.jsx';
import { FakeSocket } from './fakeSocket.js';

function player(seatId, playerId, displayName, isReady = false) {
  return { seatId, playerId, displayName, connected: true, isReady };
}

describe('lobby join flow', () => {
  it('emits joinRoom once, then shows local identity and the complete lobby', async () => {
    const user = userEvent.setup();
    const socket = new FakeSocket();
    render(<App socket={socket} />);

    expect(screen.getByRole('dialog', { name: 'Join the lobby' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ready Up', hidden: true })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: /name/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('textbox', { name: /name/i })).toHaveFocus();

    await user.type(screen.getByRole('textbox', { name: /name/i }), '  Alice  ');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Join lobby' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('textbox', { name: /name/i })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Join lobby' }));
    expect(socket.emissions).toHaveLength(1);
    expect(socket.emissions[0]).toMatchObject({ event: 'joinRoom', payload: { displayName: 'Alice' } });
    expect(screen.getByRole('button', { name: 'Join lobby' })).toBeDisabled();

    act(() => socket.emissions[0].ack({ playerId: 'p1', seatId: 1 }));
    expect(screen.getByRole('dialog', { name: 'Join the lobby' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join lobby' })).toBeDisabled();
    act(() => socket.receive('playerJoined', { players: [player(1, 'p1', 'Alice')] }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join lobby' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('listitem', { name: 'Seat 1' })).getByText(/Alice.*you/i)).toBeVisible();
    expect(screen.getAllByText(/empty/i)).toHaveLength(3);

    act(() => socket.receive('playerJoined', { players: [player(1, 'p1', 'Alice'), player(2, 'p2', 'Bob')] }));
    expect(within(screen.getByRole('listitem', { name: 'Seat 2' })).getByText('Bob')).toBeVisible();
    expect(screen.getAllByText(/empty/i)).toHaveLength(2);
  });

  it('shows a rejected join and allows the name to be corrected and retried', async () => {
    const user = userEvent.setup();
    const socket = new FakeSocket();
    render(<App socket={socket} />);
    const name = screen.getByRole('textbox', { name: /name/i });
    await user.type(name, 'Alice');
    await user.click(screen.getByRole('button', { name: 'Join lobby' }));

    act(() => socket.receive('error', { code: 'INVALID_NAME', message: 'Enter a different name.' }));
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Enter a different name.');
    expect(screen.getByRole('button', { name: 'Join lobby' })).toBeEnabled();
    await user.type(name, 'x');
    expect(within(screen.getByRole('dialog')).queryByRole('alert')).not.toBeInTheDocument();
    await user.clear(name);
    await user.type(name, 'Bob');
    await user.click(screen.getByRole('button', { name: 'Join lobby' }));
    expect(socket.emissions[1]).toMatchObject({ event: 'joinRoom', payload: { displayName: 'Bob' } });
  });

  it('ignores a stale name rejection but keeps unrelated errors during edits', async () => {
    const user = userEvent.setup();
    const socket = new FakeSocket();
    render(<App socket={socket} />);
    const name = screen.getByRole('textbox', { name: /name/i });
    await user.type(name, 'Alice');
    await user.click(screen.getByRole('button', { name: 'Join lobby' }));
    await user.type(name, '2');
    act(() => socket.receive('error', { code: 'INVALID_NAME', message: 'That name is already taken.' }));
    expect(within(screen.getByRole('dialog')).queryByRole('alert')).not.toBeInTheDocument();
    act(() => socket.receive('error', { code: 'ROOM_FULL', message: 'This room is full.' }));
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('This room is full.');
    await user.type(name, '3');
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('This room is full.');
  });

  it('keeps vacant seats fixed and shows readiness supplied by the server', async () => {
    const user = userEvent.setup();
    const socket = new FakeSocket();
    render(<App socket={socket} />);

    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Cara');
    await user.click(screen.getByRole('button', { name: 'Join lobby' }));
    act(() => socket.emissions[0].ack({ playerId: 'p3', seatId: 3 }));
    act(() => socket.receive('playerJoined', {
      players: [player(1, 'p1', 'Alice', true), player(3, 'p3', 'Cara')],
    }));

    expect(screen.getByRole('listitem', { name: 'Seat 3' })).toHaveClass('seat--bottom');
    expect(screen.getByRole('listitem', { name: 'Seat 4' })).toHaveClass('seat--left');
    expect(screen.getByRole('listitem', { name: 'Seat 1' })).toHaveClass('seat--top');
    expect(screen.getByRole('listitem', { name: 'Seat 2' })).toHaveClass('seat--right');
    expect(within(screen.getByRole('listitem', { name: 'Seat 1' })).getByText('Ready')).toBeInTheDocument();
    expect(within(screen.getByRole('listitem', { name: 'Seat 3' })).getByText('Not ready')).toBeInTheDocument();
    expect(within(screen.getByRole('listitem', { name: 'Seat 2' })).queryByText(/ready/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('Empty')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Ready Up' })).toBeEnabled();
  });

  it('sends one ready request and waits for the server event before showing ready', async () => {
    const user = userEvent.setup();
    const socket = new FakeSocket();
    render(<App socket={socket} />);
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Alice');
    await user.click(screen.getByRole('button', { name: 'Join lobby' }));
    act(() => socket.emissions[0].ack({ playerId: 'p1', seatId: 1 }));
    act(() => socket.receive('playerJoined', { players: [player(1, 'p1', 'Alice')] }));

    const ready = screen.getByRole('button', { name: 'Ready Up' });
    expect(ready).toBeEnabled();
    await user.click(ready);
    expect(socket.emissions[1]).toEqual({ event: 'ready', payload: {}, ack: undefined });
    expect(ready).toBeDisabled();
    expect(within(screen.getByRole('listitem', { name: 'Seat 1' })).getByText('Not ready')).toBeInTheDocument();
    await user.click(ready);
    expect(socket.emissions).toHaveLength(2);

    act(() => socket.receive('playerReady', { playerId: 'p1' }));
    expect(within(screen.getByRole('listitem', { name: 'Seat 1' })).getByText('Ready')).toBeInTheDocument();
    const unready = screen.getByRole('button', { name: 'Unready' });
    expect(unready).toBeEnabled();
    await user.click(unready);
    expect(socket.emissions[2]).toEqual({ event: 'unready', payload: {}, ack: undefined });
    expect(unready).toBeDisabled();
    expect(within(screen.getByRole('listitem', { name: 'Seat 1' })).getByText('Ready')).toBeInTheDocument();
    act(() => socket.receive('playerUnready', { playerId: 'p1' }));
    expect(screen.getByRole('button', { name: 'Ready Up' })).toBeEnabled();
    expect(within(screen.getByRole('listitem', { name: 'Seat 1' })).getByText('Not ready')).toBeInTheDocument();
  });

  it('locks at four ready players, then unlocks when a player leaves', async () => {
    const user = userEvent.setup();
    const socket = new FakeSocket();
    render(<App socket={socket} />);
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Alice');
    await user.click(screen.getByRole('button', { name: 'Join lobby' }));
    act(() => socket.emissions[0].ack({ playerId: 'p1', seatId: 1 }));
    act(() => socket.receive('playerJoined', { players: [
      player(1, 'p1', 'Alice', true), player(2, 'p2', 'Bob', true),
      player(3, 'p3', 'Cara', true), player(4, 'p4', 'Dan', true),
    ] }));
    expect(screen.getByRole('button', { name: 'Unready' })).toBeDisabled();
    act(() => socket.receive('playerDisconnected', { players: [
      player(1, 'p1', 'Alice', true), player(2, 'p2', 'Bob', true), player(3, 'p3', 'Cara', true),
    ] }));
    expect(screen.getByRole('button', { name: 'Unready' })).toBeEnabled();
  });

  it('restores Unready after a server rejection and keeps the mark unchanged', async () => {
    const user = userEvent.setup();
    const socket = new FakeSocket();
    const view = render(<App socket={socket} />);
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Alice');
    await user.click(screen.getByRole('button', { name: 'Join lobby' }));
    act(() => socket.emissions[0].ack({ playerId: 'p1', seatId: 1 }));
    act(() => socket.receive('playerJoined', { players: [player(1, 'p1', 'Alice', true)] }));
    await user.click(screen.getByRole('button', { name: 'Unready' }));
    act(() => socket.receive('error', { code: 'READY_NOT_AVAILABLE', message: 'Ready is not available right now.' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Ready is not available right now.');
    expect(screen.getByRole('button', { name: 'Unready' })).toBeEnabled();
    expect(within(screen.getByRole('listitem', { name: 'Seat 1' })).getByText('Ready')).toBeInTheDocument();
    view.unmount();
    expect(socket.listeners.get('playerUnready')?.size).toBe(0);
  });

  it('keeps Unready locked if a fourth ready mark arrives before rejection', async () => {
    const user = userEvent.setup();
    const socket = new FakeSocket();
    render(<App socket={socket} />);
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Alice');
    await user.click(screen.getByRole('button', { name: 'Join lobby' }));
    act(() => socket.emissions[0].ack({ playerId: 'p1', seatId: 1 }));
    act(() => socket.receive('playerJoined', { players: [
      player(1, 'p1', 'Alice', true), player(2, 'p2', 'Bob', true),
      player(3, 'p3', 'Cara', true), player(4, 'p4', 'Dan'),
    ] }));
    await user.click(screen.getByRole('button', { name: 'Unready' }));
    act(() => socket.receive('playerReady', { playerId: 'p4' }));
    act(() => socket.receive('error', { code: 'READY_NOT_AVAILABLE', message: 'Ready is not available right now.' }));
    expect(screen.getByRole('button', { name: 'Unready' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Ready is not available right now.');
  });

  it('restores Ready Up after rejection and applies other players ready events', async () => {
    const user = userEvent.setup();
    const socket = new FakeSocket();
    const view = render(<App socket={socket} />);
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Alice');
    await user.click(screen.getByRole('button', { name: 'Join lobby' }));
    act(() => socket.emissions[0].ack({ playerId: 'p1', seatId: 1 }));
    act(() => socket.receive('playerJoined', { players: [player(1, 'p1', 'Alice'), player(2, 'p2', 'Bob')] }));

    await user.click(screen.getByRole('button', { name: 'Ready Up' }));
    act(() => socket.receive('error', { code: 'READY_NOT_AVAILABLE', message: 'Ready is not available right now.' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Ready is not available right now.');
    expect(screen.getByRole('button', { name: 'Ready Up' })).toBeEnabled();
    act(() => socket.receive('playerReady', { playerId: 'p2' }));
    expect(within(screen.getByRole('listitem', { name: 'Seat 2' })).getByText('Ready')).toBeInTheDocument();
    expect(within(screen.getByRole('listitem', { name: 'Seat 1' })).getByText('Not ready')).toBeInTheDocument();
    view.unmount();
    expect(socket.listeners.get('playerReady')?.size).toBe(0);
  });

  it('keeps independent lobby views for different sockets', async () => {
    const first = new FakeSocket();
    const second = new FakeSocket();
    const firstView = render(<App socket={first} />);
    const secondView = render(<App socket={second} />);

    act(() => first.receive('playerJoined', { players: [player(1, 'p1', 'Alice')] }));
    expect(within(firstView.container).getByText('Alice')).toBeVisible();
    expect(within(secondView.container).queryByText('Alice')).not.toBeInTheDocument();

    act(() => {
      const lobby = { players: [player(1, 'p1', 'Alice'), player(2, 'p2', 'Bob')] };
      first.receive('playerJoined', lobby);
      second.receive('playerJoined', lobby);
    });
    expect(within(firstView.container).getByText('Bob')).toBeVisible();
    expect(within(secondView.container).getByText('Bob')).toBeVisible();
  });

  it('replaces seats after playerDisconnected and removes the listener on unmount', async () => {
    const user = userEvent.setup();
    const socket = new FakeSocket();
    const view = render(<App socket={socket} />);
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Cara');
    await user.click(screen.getByRole('button', { name: 'Join lobby' }));
    act(() => socket.emissions[0].ack({ playerId: 'p3', seatId: 3 }));
    act(() => socket.receive('playerJoined', { players: [
      player(1, 'p1', 'Alice', true), player(2, 'p2', 'Bob'), player(3, 'p3', 'Cara'),
    ] }));

    act(() => socket.receive('playerDisconnected', { players: [
      player(1, 'p1', 'Alice', true), player(3, 'p3', 'Cara'),
    ] }));
    expect(within(screen.getByRole('listitem', { name: 'Seat 2' })).getByText('Empty')).toBeVisible();
    expect(within(screen.getByRole('listitem', { name: 'Seat 1' })).getByText('Ready')).toBeInTheDocument();
    expect(within(screen.getByRole('listitem', { name: 'Seat 3' })).getByText(/Cara.*you/)).toBeVisible();

    view.unmount();
    expect(socket.listeners.get('playerDisconnected')?.size).toBe(0);
  });

  it('clears a departed browser’s identity and seats and requires a reload', async () => {
    const user = userEvent.setup();
    const socket = new FakeSocket();
    const view = render(<App socket={socket} />);
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Alice');
    await user.click(screen.getByRole('button', { name: 'Join lobby' }));
    act(() => socket.emissions[0].ack({ playerId: 'p1', seatId: 1 }));
    act(() => socket.receive('playerJoined', { players: [player(1, 'p1', 'Alice')] }));

    await user.click(screen.getByRole('button', { name: 'Ready Up' }));
    expect(screen.getByRole('button', { name: 'Ready Up' })).toBeDisabled();
    act(() => socket.disconnect());
    act(() => socket.receive('playerReady', { playerId: 'p1' }));
    expect(screen.getByRole('dialog', { name: 'Join the lobby' })).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByRole('alert'))
      .toHaveTextContent('Connection lost. Reload to rejoin.');
    expect(screen.getByRole('textbox', { name: /name/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Join lobby' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ready Up', hidden: true })).toBeDisabled();
    expect(screen.getAllByText('Empty')).toHaveLength(4);

    act(() => socket.connect());
    expect(screen.getByRole('button', { name: 'Join lobby' })).toBeDisabled();
    expect(within(screen.getByRole('dialog')).getByRole('alert'))
      .toHaveTextContent('Connection lost. Reload to rejoin.');

    view.unmount();
    expect(socket.listeners.get('disconnect')?.size).toBe(0);
  });

  it('ignores an old join acknowledgement and events after disconnect', async () => {
    const user = userEvent.setup();
    const socket = new FakeSocket();
    render(<App socket={socket} />);
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Alice');
    await user.click(screen.getByRole('button', { name: 'Join lobby' }));

    act(() => socket.disconnect());
    act(() => socket.emissions[0].ack({ playerId: 'old', seatId: 1 }));
    act(() => socket.receive('playerJoined', { players: [player(1, 'old', 'Alice')] }));
    act(() => socket.receive('error', { code: 'INVALID_NAME', message: 'Old error' }));

    expect(screen.getByRole('dialog', { name: 'Join the lobby' })).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByRole('alert'))
      .toHaveTextContent('Connection lost. Reload to rejoin.');
    expect(screen.getAllByText('Empty')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Join lobby' })).toBeDisabled();
  });
});
