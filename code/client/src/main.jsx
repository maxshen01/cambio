// Starts the React app with one Socket.IO connection for this browser tab.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { createClientSocket } from './socket/client.js';
import './styles/main.css';

const socket = createClientSocket();
const root = document.getElementById('root');
if (!root) throw new Error('Missing app root');
createRoot(root).render(
  <React.StrictMode>
    <App socket={socket} />
  </React.StrictMode>,
);
