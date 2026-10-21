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
    expect(screen.getByRole('button', { name: /join/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('textbox', { name: /name/i })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: /join/i }));
    expect(socket.emissions).toHaveLength(1);
    expect(socket.emissions[0]).toMatchObject({ event: 'joinRoom', payload: { displayName: 'Alice' } });
    expect(screen.getByRole('button', { name: /join/i })).toBeDisabled();

    act(() => socket.emissions[0].ack({ playerId: 'p1', seatId: 1 }));
    expect(screen.getByRole('dialog', { name: 'Join the lobby' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /join/i })).toBeDisabled();
    act(() => socket.receive('playerJoined', { players: [player(1, 'p1', 'Alice')] }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /join/i })).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: /join/i }));

    act(() => socket.receive('error', { code: 'INVALID_NAME', message: 'Enter a different name.' }));
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Enter a different name.');
    expect(screen.getByRole('button', { name: /join/i })).toBeEnabled();
    await user.clear(name);
    await user.type(name, 'Bob');
    await user.click(screen.getByRole('button', { name: /join/i }));
    expect(socket.emissions[1]).toMatchObject({ event: 'joinRoom', payload: { displayName: 'Bob' } });
  });

  it('keeps vacant seats fixed and shows readiness supplied by the server', async () => {
    const user = userEvent.setup();
    const socket = new FakeSocket();
    render(<App socket={socket} />);

    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Cara');
    await user.click(screen.getByRole('button', { name: /join/i }));
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
    expect(screen.getByRole('button', { name: 'Ready Up' })).toBeDisabled();
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
});
