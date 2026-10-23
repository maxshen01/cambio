// Starts the shared game server on the configured port.

import { createServer } from './server.js';

const { httpServer } = createServer();
const port = Number(process.env.PORT) || 3000;
httpServer.listen(port, () => {
  console.log(`Cambio server listening on ${port}`);
});
