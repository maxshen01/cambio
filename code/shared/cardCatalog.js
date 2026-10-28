// Stable public face-image IDs: suits in order, ace through king, then two jokers.
const suits = ['clubs', 'diamonds', 'hearts', 'spades'];
const ranks = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];
const filenames = suits.flatMap(suit => ranks.map(rank => `${rank}_of_${suit}.png`));
filenames.push('black_joker.png', 'red_joker.png');

/** Client-served face artwork keyed by cardId (1–54); duplicate cards use the same image. */
export const CARD_IMAGES = Object.freeze(Object.fromEntries(
  filenames.map((filename, index) => [index + 1, `/cards/${filename}`]),
));

/** Artwork for every card whose face is hidden from the recipient. */
export const CARD_BACK_IMAGE = '/cards/card_back.png';
