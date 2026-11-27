/**
 * The library's own icons (DESIGN, 7.3): drawn on a 24 px grid, stroked at
 * 1.75 px with round ends unless filled. Drawn by `components/Icon.tsx`.
 */

/** One shape of an icon. Shapes are stroked unless `filled`. */
export type Shape =
  | { path: string; filled?: true }
  | { circle: readonly [cx: number, cy: number, r: number]; filled?: true }
  | { rect: readonly [x: number, y: number, width: number, height: number, radius: number] };

const TAG_OUTLINE =
  'M3 4.5A1.5 1.5 0 0 1 4.5 3H11a1.5 1.5 0 0 1 1.06.44l8.5 8.5a1.5 1.5 0 0 1 0 2.12l-6.5 6.5a1.5 1.5 0 0 1-2.12 0l-8.5-8.5A1.5 1.5 0 0 1 3 11z';

export const ICONS = {
  all: [{ path: 'm12 3 9 5-9 5-9-5z' }, { path: 'm3 13 9 5 9-5' }],
  bookmark: [{ path: 'M6.5 4.5A1.5 1.5 0 0 1 8 3h8a1.5 1.5 0 0 1 1.5 1.5V21L12 17l-5.5 4z' }],
  like: [
    {
      path: 'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z',
    },
  ],
  tag: [{ path: TAG_OUTLINE }, { circle: [7.5, 7.5, 1.5] }],
  untagged: [
    { path: 'M3 13h5l1.5 3h5l1.5-3h5' },
    { path: 'M5.5 5h13l2.5 8v5.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5V13z' },
  ],
  search: [{ circle: [11, 11, 7] }, { path: 'm20 20-3.5-3.5' }],
  settings: [
    { path: 'M4 7h9M17 7h3M4 17h3M11 17h9' },
    { circle: [15, 7, 2] },
    { circle: [9, 17, 2] },
  ],
  help: [
    { circle: [12, 12, 9] },
    { path: 'M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.4' },
    { path: 'M12 17.2h.01' },
  ],
  account: [{ circle: [12, 8, 4] }, { path: 'M4.5 20a7.5 7.5 0 0 1 15 0' }],
  plus: [{ path: 'M12 5v14M5 12h14' }],
  close: [{ path: 'M7 7l10 10M17 7 7 17' }],
  chevron: [{ path: 'm6 9 6 6 6-6' }],
  more: [
    { circle: [5.5, 12, 1.6], filled: true },
    { circle: [12, 12, 1.6], filled: true },
    { circle: [18.5, 12, 1.6], filled: true },
  ],
  open: [
    { path: 'M14 4h6v6' },
    { path: 'M20 4 11 13' },
    { path: 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5' },
  ],
  copy: [
    { path: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1' },
    { path: 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1' },
  ],
  remove: [
    { path: 'M4 7h16' },
    { path: 'M10 11v6M14 11v6' },
    { path: 'm6 7 1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12' },
    { path: 'M9 7V4h6v3' },
  ],
  rename: [{ path: 'M4 20h4L19 9l-4-4L4 16z' }, { path: 'm13.5 6.5 4 4' }],
  colour: [
    { circle: [12, 12, 8.5] },
    { circle: [8.5, 10, 1.2] },
    { circle: [12, 7.5, 1.2] },
    { circle: [15.5, 10, 1.2] },
  ],
  merge: [{ path: 'M7 4v5a4 4 0 0 0 4 4h8' }, { path: 'm15 9 4 4-4 4' }, { path: 'M7 20v-3' }],
  sort: [
    { path: 'M7 4v16' },
    { path: 'm3.5 16.5 3.5 3.5 3.5-3.5' },
    { path: 'M17 20V4' },
    { path: 'm13.5 7.5 3.5-3.5 3.5 3.5' },
  ],
  export: [{ path: 'M12 4v11' }, { path: 'm7 10 5 5 5-5' }, { path: 'M5 20h14' }],
  import: [{ path: 'M12 20V9' }, { path: 'm7 14 5-5 5 5' }, { path: 'M5 4h14' }],
  backup: [
    { rect: [3, 4, 18, 5, 1.5] },
    { path: 'M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9' },
    { path: 'M10 13h4' },
  ],
  privacy: [{ rect: [5, 11, 14, 10, 2] }, { path: 'M8 11V8a4 4 0 0 1 8 0v3' }],
  warning: [{ path: 'M12 4 2.5 20h19z' }, { path: 'M12 10v4.5M12 17.2h.01' }],
  tick: [{ path: 'm5 12 5 5 9-10' }],
  image: [{ rect: [3, 4, 18, 16, 2] }, { circle: [9, 10, 2] }, { path: 'm21 16-5-5-9 9' }],
  play: [{ path: 'M8 5v14l11-7z', filled: true }],
} as const satisfies Record<string, readonly Shape[]>;

export type IconName = keyof typeof ICONS;
