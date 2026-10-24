// Exercises actual image load/decode orchestration without relying on jsdom image downloads.
import { beforeEach, expect, it, vi } from 'vitest';

let images;
let artwork;
beforeEach(async () => {
  vi.resetModules();
  images = [];
  vi.stubGlobal('Image', class {
    onload = null;
    onerror = null;
    decode = vi.fn().mockResolvedValue(undefined);
    constructor() { images.push(this); }
  });
  artwork = await import('../src/cards/cardArtwork.js');
});

it('deduplicates requests and waits for decoding before caching artwork as ready', async () => {
  let finishDecode;
  const pending = artwork.loadCardArtwork('/cards/card_back.png');
  expect(artwork.loadCardArtwork('/cards/card_back.png')).toBe(pending);
  expect(images).toHaveLength(1);
  expect(artwork.isCardArtworkReady('/cards/card_back.png')).toBe(false);
  images[0].decode.mockImplementation(() => new Promise(resolve => { finishDecode = resolve; }));
  images[0].onload();
  expect(artwork.isCardArtworkReady('/cards/card_back.png')).toBe(false);
  finishDecode();
  await pending;
  expect(artwork.isCardArtworkReady('/cards/card_back.png')).toBe(true);
  await artwork.loadCardArtwork('/cards/card_back.png');
  expect(images).toHaveLength(1);
});

it.each(['load', 'decode'])('permits a fresh request after a %s failure', async failure => {
  const pending = artwork.loadCardArtwork('/cards/card_back.png');
  const rejected = expect(pending).rejects.toThrow();
  if (failure === 'load') images[0].onerror();
  else {
    images[0].decode.mockRejectedValue(new Error('decode failed'));
    images[0].onload();
  }
  await rejected;
  expect(artwork.isCardArtworkReady('/cards/card_back.png')).toBe(false);
  const retry = artwork.loadCardArtwork('/cards/card_back.png');
  expect(images).toHaveLength(2);
  images[1].onload();
  await retry;
  expect(artwork.isCardArtworkReady('/cards/card_back.png')).toBe(true);
});

it('preloads all 55 public images, handles individual failures, and reuses successful loads', async () => {
  const preload = artwork.preloadCardArtwork();
  expect(images).toHaveLength(55);
  images[0].onerror();
  images.slice(1).forEach(image => image.onload());
  await preload;
  expect(artwork.isCardArtworkReady(images[1].src)).toBe(true);
  await artwork.loadCardArtwork(images[1].src);
  expect(images).toHaveLength(55);
});
