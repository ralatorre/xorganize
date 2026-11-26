/**
 * A closed shadow root with its own styles, for one control: added to x.com,
 * or to the library for the tag popover they share.
 */

const sheets = new Map<string, CSSStyleSheet>();

/** One stylesheet per set of styles, shared by every host that uses it. */
function sheetFor(styles: string): CSSStyleSheet {
  let sheet = sheets.get(styles);
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(styles); // a constructed stylesheet is not subject to the page's style policy
    sheets.set(styles, sheet);
  }
  return sheet;
}

export interface ShadowHost {
  host: HTMLElement;
  /** Holds the theme. Everything the control shows goes inside it. */
  container: HTMLElement;
}

export function createShadowHost(doc: Document, styles: string): ShadowHost {
  const host = doc.createElement('div');
  const root = host.attachShadow({ mode: 'closed' });
  root.adoptedStyleSheets = [sheetFor(styles)];
  const container = doc.createElement('div');
  container.className = 'theme';
  root.append(container);
  return { host, container };
}
