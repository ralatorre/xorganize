/** The tag palette, and which colour a new tag gets (docs/DESIGN.md, 7). */

/**
 * Colours for tag dots, by palette index. Shared by the popover on x.com and
 * the library. Tags store the index, so the order here never changes; new
 * colours may only be added at the end.
 */
export const TAG_PALETTE = [
  '#1d9bf0',
  '#00ba7c',
  '#f91880',
  '#ff7a00',
  '#7856ff',
  '#ffd400',
  '#00a8a8',
  '#f4212e',
  '#a0632d',
  '#5c6bc0',
  '#8bc34a',
  '#8b98a5',
] as const;

/** What each colour is called, for people who cannot see it. In palette order. */
export const TAG_COLOUR_NAMES = [
  'Blue',
  'Green',
  'Pink',
  'Orange',
  'Purple',
  'Yellow',
  'Teal',
  'Red',
  'Brown',
  'Indigo',
  'Lime',
  'Grey',
] as const satisfies { length: (typeof TAG_PALETTE)['length'] };

/** Size of the tag palette. Colours are stored as an index into it. */
export const TAG_COLOURS = TAG_PALETTE.length;

/** The colour for a palette index. Anything else, such as a tag still being created, has none. */
export function tagColour(index: number): string {
  return TAG_PALETTE[index] ?? 'transparent';
}

/** The lowest colour no tag uses yet, or, when all are taken, the least used. */
export function nextColour(inUse: readonly number[], colours = TAG_COLOURS): number {
  const uses = new Array<number>(colours).fill(0);
  for (const colour of inUse) {
    if (Number.isInteger(colour) && colour >= 0 && colour < colours) uses[colour]! += 1;
  }
  return uses.indexOf(Math.min(...uses));
}
