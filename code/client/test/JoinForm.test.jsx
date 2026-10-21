import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JoinForm } from '../src/lobby/JoinForm.jsx';

describe('JoinForm', () => {
  it('does not submit a blank name and trims a valid name', async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn();
    render(<JoinForm onJoin={onJoin} connected />);

    const name = screen.getByRole('textbox', { name: /name/i });
    const join = screen.getByRole('button', { name: /join/i });
    expect(join).toBeDisabled();

    await user.type(name, '   ');
    expect(join).toBeDisabled();
    await user.clear(name);
    await user.type(name, '  Alice  ');
    expect(join).toBeEnabled();
    await user.click(join);
    expect(onJoin).toHaveBeenCalledExactlyOnceWith('Alice');
  });

  it('blocks submission while a join is pending or the socket is unavailable', async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn();
    const { rerender } = render(<JoinForm onJoin={onJoin} connected />);
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Alice');

    rerender(<JoinForm onJoin={onJoin} connected pending />);
    expect(screen.getByRole('button', { name: /join/i })).toBeDisabled();
    rerender(<JoinForm onJoin={onJoin} connected={false} />);
    expect(screen.getByRole('button', { name: /join/i })).toBeDisabled();
    expect(onJoin).not.toHaveBeenCalled();
  });
});
