// Controlled power draw and actions on the shared active socket fixture.
import { activeHarness } from './room.js';
import { nextEvent, recordEvents } from './socket.js';

export async function powerRoom(t, rank = 7) {
  const room = await activeHarness(t, { random: () => 0 });
  const { clients } = room;
  const observer = await room.connect();
  const state = room.gameState;
  const index = state.deck.cards.findIndex(card => card.rank === rank);
  const [held] = state.deck.cards.splice(index, 1);
  state.discardPile.cards.push(state.deck.cards.pop(), state.deck.cards.pop());
  state.discardPile.topMatchStatus = 'matched';
  state.deck.cards.push(held);
  const recipients = [...clients, observer];
  const { records, clear } = recordEvents(t, recipients);
  const drain = (sender = clients[0]) => room.drain(sender);
  async function draw() {
    const events = clients.map(client => nextEvent(client, 'cardDrawn'));
    clients[0].emit('drawCard', { source: 'deck' });
    await Promise.all(events);
    await drain();
    clear();
  }
  async function start() {
    const prompt = nextEvent(clients[0], 'powerAvailable');
    clients[0].emit('discardDrawnCard', {});
    await prompt;
    await drain();
  }
  async function activate() {
    const events = clients.map(client => nextEvent(client, 'powerCardRevealed'));
    clients[0].emit('usePower', {});
    await Promise.all(events);
    await drain();
  }
  return { ...room, clients, observer, records, clear, drain, draw, start, activate, held };
}
