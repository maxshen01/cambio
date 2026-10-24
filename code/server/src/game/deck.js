// Server-only construction and shuffling of the two physical decks used in a round.
/** @typedef {import('./types.js').Card} Card */
/** @typedef {import('./types.js').Rank} Rank */
/** @typedef {import('./types.js').Power} Power */
/** @type {import('./types.js').Suit[]} */
const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];

/** Rule metadata only; powers are not executed during deck construction.
 * @param {Rank} rank
 * @param {import('./types.js').Suit} suit
 * @returns {Power | null}
 */
function powerFor(rank, suit) {
  if (rank === 7 || rank === 8) return 'selfPeek';
  if (rank === 9 || rank === 10) return 'opponentPeek';
  if (rank === 11) return 'blindSwap';
  if (suit === 'clubs' || suit === 'spades') {
    if (rank === 12) return 'onePeekSwap';
    if (rank === 13) return 'twoPeekSwap';
  }
  return null;
}

/** Build 108 independent cards in catalog order, with the second deck after the first.
 * @returns {Card[]}
 */
export function createDeck() {
  /** @type {Card[]} */
  const cards = [];
  for (let copy = 0; copy < 2; copy++) {
    for (const [suitIndex, suit] of SUITS.entries()) {
      for (let value = 1; value <= 13; value++) {
        const rank = /** @type {Rank} */ (value);
        cards.push({ cardId: suitIndex * 13 + rank, suit, rank, power: powerFor(rank, suit) });
      }
    }
    cards.push(
      { cardId: 53, suit: 'joker', rank: 0, power: null },
      { cardId: 54, suit: 'joker', rank: 0, power: null },
    );
  }
  return cards;
}

/** Fisher–Yates shuffle in place; random supplies values in [0, 1), like Math.random.
 * The last element remains the deck's top. Returns the same array for setup composition.
 * @param {Card[]} cards
 * @param {() => number} [random]
 * @returns {Card[]}
 */
export function shuffleDeck(cards, random = Math.random) {
  for (let index = cards.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [cards[index], cards[target]] = [cards[target], cards[index]];
  }
  return cards;
}
