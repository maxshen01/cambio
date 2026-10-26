import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// jsdom does not download images. Ordinary UI tests use successful asynchronous loads;
// artwork-specific tests override Image or the loader to exercise delays and failures.
beforeEach(() => {
  vi.stubGlobal('Image', class {
    onload = null;
    onerror = null;
    decode() { return Promise.resolve(); }
    set src(value) { queueMicrotask(() => this.onload?.()); }
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
