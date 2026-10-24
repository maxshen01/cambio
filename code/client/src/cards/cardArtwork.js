// Shares loaded and decoded public artwork across lobby preloading and subsequent deals.
import { CARD_BACK_IMAGE, CARD_IMAGES } from '../../../shared/cardCatalog.js';

/** @type {Map<string, { image: HTMLImageElement, promise: Promise<void>, ready: boolean }>} */
const cache = new Map();

/** Reuse pending requests and retain decoded images; failures may be retried.
 * @param {string} url @returns {Promise<void>}
 */
export function loadCardArtwork(url) {
  const existing = cache.get(url);
  if (existing) return existing.promise;
  const image = new Image();
  /** @type {Promise<void>} */
  const promise = new Promise((resolve, reject) => {
    image.onload = () => { image.decode().then(() => resolve(), reject); };
    image.onerror = () => reject(new Error('Card artwork could not be loaded.'));
    image.src = url;
  });
  const entry = { image, promise, ready: false };
  cache.set(url, entry);
  void promise.then(() => {
    entry.ready = true;
    image.onload = null;
    image.onerror = null;
  }, () => {
    cache.delete(url);
    image.onload = null;
    image.onerror = null;
  });
  return promise;
}

/** @param {string} url */
export function isCardArtworkReady(url) {
  return cache.get(url)?.ready === true;
}

/** Warm the back and all public faces while joining; unrelated failures do not block play. */
export async function preloadCardArtwork() {
  await Promise.allSettled([CARD_BACK_IMAGE, ...Object.values(CARD_IMAGES)].map(loadCardArtwork));
}
