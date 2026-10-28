// Verifies the public card catalog and exact copies of the design artwork.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { CARD_IMAGES, CARD_BACK_IMAGE } from '../../../shared/cardCatalog.js';

const suits = ['clubs', 'diamonds', 'hearts', 'spades'];
const ranks = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];

test('all 54 face IDs and the back map to exact copies of the existing PNGs', () => {
  const filenames = suits.flatMap(suit => ranks.map(rank => `${rank}_of_${suit}.png`));
  filenames.push('black_joker.png', 'red_joker.png');
  assert.deepEqual(Object.keys(CARD_IMAGES).map(Number), Array.from({ length: 54 }, (_, i) => i + 1));
  assert.equal(CARD_BACK_IMAGE, '/cards/card_back.png');
  const paths = filenames.map((filename, index) => {
    assert.equal(CARD_IMAGES[index + 1], `/cards/${filename}`);
    return CARD_IMAGES[index + 1];
  });
  paths.push(CARD_BACK_IMAGE);
  assert.equal(new Set(paths).size, 55);
  assert.equal(readdirSync(new URL('../../../client/public/cards/', import.meta.url)).length, 55);
  for (const path of paths) {
    const served = readFileSync(new URL(`../../../client/public${path}`, import.meta.url));
    const original = readFileSync(new URL(`../../../../project-managment/designs/Playing Cards/${path.split('/').at(-1)}`, import.meta.url));
    assert.deepEqual(served, original);
    assert.deepEqual([...served.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
});

