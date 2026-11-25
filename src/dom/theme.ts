/** Which of X's three themes the page shows, judged from its background colour. */

export type Theme = 'light' | 'dim' | 'dark';

/** From a computed CSS colour such as `rgb(21, 32, 43)`. Anything unreadable is light. */
export function themeOfColour(colour: string): Theme {
  const channels = colour.match(/\d+(\.\d+)?/g);
  if (!channels || channels.length < 3) return 'light';
  const [red, green, blue, alpha] = channels.map(Number) as [number, number, number, number?];
  if (alpha === 0) return 'light'; // transparent: the browser's white shows through
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  if (luminance >= 128) return 'light';
  // X's dark theme is pure black; dim is a dark blue-grey.
  return luminance < 8 ? 'dark' : 'dim';
}
