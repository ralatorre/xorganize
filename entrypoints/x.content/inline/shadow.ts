/** A closed shadow root with its own styles, for one control added to x.com. */

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

export function createShadowHost(styles: string): ShadowHost {
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'closed' });
  root.adoptedStyleSheets = [sheetFor(styles)];
  const container = document.createElement('div');
  container.className = 'theme';
  root.append(container);
  return { host, container };
}
