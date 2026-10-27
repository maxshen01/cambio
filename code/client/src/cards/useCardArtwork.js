// Gates card presentation on only the artwork needed by the current recipient's view.
import { useEffect, useState } from 'react';
import { CARD_BACK_IMAGE, CARD_IMAGES } from '../../../shared/cardCatalog.js';
import { isCardArtworkReady, loadCardArtwork } from './cardArtwork.js';

/** Wait for download and decoding; stale deal completions cannot change the current status.
 * @param {({ faceUp: true, cardId: number } | { faceUp: false })[]} cards
 */
export function useCardArtwork(cards) {
  const key = [...new Set([CARD_BACK_IMAGE, ...cards.filter(card => card.faceUp)
    .map(card => CARD_IMAGES[card.cardId])])].sort().join('|');
  const [result, setResult] = useState({ key: '', failed: false });
  const [attempt, setAttempt] = useState(0);
  const ready = key.split('|').every(isCardArtworkReady);
  useEffect(() => {
    let active = true;
    setResult({ key, failed: false });
    void Promise.all(key.split('|').map(loadCardArtwork)).then(() => {
      if (active) setResult({ key, failed: false });
    }, () => {
      if (active) setResult({ key, failed: true });
    });
    return () => { active = false; };
  }, [key, attempt]);
  return { ready, failed: !ready && result.key === key && result.failed,
    retry: () => { setResult({ key, failed: false }); setAttempt(value => value + 1); } };
}
