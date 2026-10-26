import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/helpers/setup.js'],
    include: ['test/**/*.unit.test.js', 'test/**/*.component.test.jsx', 'test/**/*.integration.test.{js,jsx}'],
    passWithNoTests: false,
    reporters: ['default', './test/helpers/selectionReporter.js'],
  },
});
