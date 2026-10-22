// Defines the display-name policy shared by the lobby form and server.

const allowedName = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} .’'\-]*$/u;
const nameComparer = new Intl.Collator('und', { usage: 'search', sensitivity: 'accent' });

/** Normalize a submitted name and return a user-facing error when it is invalid. */
export function checkDisplayName(value) {
  if (typeof value !== 'string' || /\p{C}/u.test(value)) {
    return { name: null, error: 'Use letters, numbers, spaces, apostrophes, hyphens, or periods.' };
  }

  const name = value.trim().replace(/ {2,}/g, ' ').normalize('NFC');
  const length = Array.from(name).length;
  if (length < 1 || length > 20) {
    return { name: null, error: 'Enter a name with 1–20 characters.' };
  }
  if (!allowedName.test(name)) {
    return { name: null, error: 'Use letters, numbers, spaces, apostrophes, hyphens, or periods.' };
  }
  return { name, error: null };
}

/** Compare normalized names without case differences while retaining accent differences. */
export function sameDisplayName(first, second) {
  return nameComparer.compare(first.normalize('NFC'), second.normalize('NFC')) === 0;
}
