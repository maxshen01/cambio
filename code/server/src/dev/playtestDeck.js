// Development-only deck preparation: preserve physical cards and reserve the first draws.
import { createDeck } from '../game/deck.js';

/** @typedef {import('../game/types.js').Card} Card */
/** @typedef {{ rank: number, suit?: string, cardId?: number, label: string }} CardRequest */

/** Parse one rank or exact face, keeping the configuration out of game/socket state.
 * @param {string} value @returns {CardRequest}
 */
function parseCard(value) {
  const label = value.trim().toLowerCase();
  if (label === 'joker') return { rank: 0, label };
  if (label === 'black_joker' || label === 'red_joker') {
    return { rank: 0, cardId: label === 'black_joker' ? 53 : 54, label };
  }
  const match = /^(ace|[2-9]|10|jack|queen|king)(?:_of_(clubs|diamonds|hearts|spades))?$/.exec(label);
  if (!match) throw new Error(`PLAYTEST_TOP_CARDS: unknown card "${label}".`);
  const faces = ['ace', 'jack', 'queen', 'king'];
  const rank = faces.includes(match[1]) ? [1, 11, 12, 13][faces.indexOf(match[1])] : Number(match[1]);
  return { rank, suit: match[2], label };
}

/** Compile and validate startup configuration before a server begins listening.
 * The callback runs on each freshly shuffled deck, before its 16 opening cards are dealt.
 * @param {string | undefined} value @returns {((cards: Card[]) => void) | undefined}
 */
export function createPlaytestDeckPreparer(value) {
  if (!value?.trim()) return undefined;
  const requests = value.split(',').map(parseCard);
  if (requests.length > 92) throw new Error('PLAYTEST_TOP_CARDS: at most 92 cards can be reserved.');
  const indexed = requests.map((request, index) => ({ request, index }));
  // Reserve specific faces first so a bare rank cannot consume a later exact request.
  const exact = (/** @type {CardRequest} */ request) => request.suit !== undefined || request.cardId !== undefined;
  const selectionOrder = [...indexed.filter(({ request }) => exact(request)), ...indexed.filter(({ request }) => !exact(request))];

  /** Select existing objects, then place the requested draw order below the opening deal.
   * @param {Card[]} cards
   */
  function prepareDeck(cards) {
    const remaining = [...cards];
    /** @type {Card[]} */
    const selected = new Array(requests.length);
    for (const { request, index } of selectionOrder) {
      const position = remaining.findIndex(card => card.rank === request.rank
        && (request.suit === undefined || card.suit === request.suit)
        && (request.cardId === undefined || card.cardId === request.cardId));
      if (position < 0) throw new Error(`PLAYTEST_TOP_CARDS: not enough copies for "${request.label}".`);
      [selected[index]] = remaining.splice(position, 1);
    }
    // Decks pop from the end: leave 16 deal cards above the reversed draw sequence.
    remaining.splice(remaining.length - 16, 0, ...selected.reverse());
    cards.splice(0, cards.length, ...remaining);
  }

  prepareDeck(createDeck());
  return prepareDeck;
}
