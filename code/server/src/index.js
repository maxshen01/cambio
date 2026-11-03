// Starts the shared game server on the configured port.

import { createServer } from './server.js';
import { createPlaytestDeckPreparer } from './dev/playtestDeck.js';

try {
  const playtest = process.argv.includes('--playtest');
  if (playtest && process.env.NODE_ENV === 'production') {
    throw new Error('Playtesting mode is unavailable when NODE_ENV=production.');
  }
  const prepareDeck = playtest ? createPlaytestDeckPreparer(process.env.PLAYTEST_TOP_CARDS) : undefined;
  const { httpServer } = createServer({ prepareDeck });
  const port = Number(process.env.PORT) || 3000;
  httpServer.listen(port, () => {
    console.log(`Cambio server listening on ${port}`);
    if (prepareDeck) console.log('Playtesting deck order enabled for each fresh deal.');
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Server startup failed.');
  process.exitCode = 1;
}
