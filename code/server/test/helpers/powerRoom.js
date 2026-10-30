// Real seated sockets with a controlled self-peek draw and ordered per-recipient records.
import { harness, join } from './room.js';
import { activeGame } from './activeGame.js';
import { nextEvent } from './socket.js';

export async function powerRoom(t, rank = 7, lowDeck = false) {
  const room = await harness(t, undefined, { random: () => 0 });
  const clients = [];
  for (let seat = 1; seat <= 4; seat++) {
    const client = await room.connect();
    await join(client, `Player ${seat}`, clients);
    clients.push(client);
  }
  const observer = await room.connect();
  Object.assign(room.gameState, activeGame(clients.map(client => client.id)));
  const state = room.gameState;
  const index = state.deck.cards.findIndex(card => card.rank === rank);
  const [held] = state.deck.cards.splice(index, 1);
  state.discardPile.cards.push(state.deck.cards.pop(), state.deck.cards.pop());
  state.discardPile.topMatchStatus = 'matched';
  if (lowDeck) state.deck.cards = state.deck.cards.slice(-2);
  state.deck.cards.push(held);
  const recipients = [...clients, observer];
  const records = recipients.map(() => []);
  recipients.forEach((client, index) => {
    client.onAny((event, payload) => records[index].push({ event, payload }));
    // A test-only acknowledgement drains earlier server output on each connection.
    room.io.sockets.sockets.get(client.id).on('testBarrier', ack => ack());
  });
  async function drain() {
    await Promise.all(recipients.map(client => new Promise((resolve, reject) => {
      client.timeout(1000).emit('testBarrier', error => error ? reject(error) : resolve());
    })));
  }
  function clear() { records.forEach(record => { record.length = 0; }); }
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
  return { ...room, clients, observer, records, clear, drain, draw, start, held };
}
