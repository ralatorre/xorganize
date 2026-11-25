/** Which colour a new tag gets (docs/DESIGN.md, 7). */

/** Size of the tag palette. Colours are stored as an index into it. */
export const TAG_COLOURS = 12;

/** The lowest colour no tag uses yet, or, when all are taken, the least used. */
export function nextColour(inUse: readonly number[], colours = TAG_COLOURS): number {
  const uses = new Array<number>(colours).fill(0);
  for (const colour of inUse) {
    if (Number.isInteger(colour) && colour >= 0 && colour < colours) uses[colour]! += 1;
  }
  return uses.indexOf(Math.min(...uses));
}
