/** Delete all data asks for a word to be typed first (docs/DESIGN.md, 4.7). */

export const DELETE_WORD = 'delete';

/** True once the word is typed, in any case, with any space around it. */
export const confirmsDeletion = (typed: string) => typed.trim().toLowerCase() === DELETE_WORD;

export const DELETE_ALL_MESSAGE =
  'This deletes every post, tag and tag assignment in the library, for every X account, from this browser. It cannot be undone, so export a JSON backup first if you may want them back. Settings are kept. Nothing on X changes.';
