/**
 * Styles for the controls added to x.com. They live in closed shadow roots, so
 * neither the page's styles nor these can leak across. Sizes and colours
 * follow X's own action bar so the button looks native (DESIGN, 2 and 7).
 */

/** Theme tokens, applied to a wrapper inside each shadow root. */
const TOKENS = `
  .theme {
    --text: #0f1419;
    --muted: #536471;
    --accent: #1d9bf0;
    --accent-tint: rgb(29 155 240 / 0.1);
    --surface: #ffffff;
    --row: #f7f9f9;
    --border: #eff3f4;
    --danger: #f4212e;
    --shadow: rgb(101 119 134 / 0.2) 0 0 15px, rgb(101 119 134 / 0.15) 0 0 3px 1px;
  }
  .theme[data-theme='dim'] {
    --text: #f7f9f9;
    --muted: #8b98a5;
    --surface: #15202b;
    --row: #1e2732;
    --border: #38444d;
    --shadow: rgb(136 153 166 / 0.2) 0 0 15px, rgb(136 153 166 / 0.15) 0 0 3px 1px;
  }
  .theme[data-theme='dark'] {
    --text: #e7e9ea;
    --muted: #71767b;
    --surface: #000000;
    --row: #16181c;
    --border: #2f3336;
    --shadow: rgb(255 255 255 / 0.2) 0 0 15px, rgb(255 255 255 / 0.15) 0 0 3px 1px;
  }
  .theme {
    font: 400 15px/20px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: var(--text);
  }
`;

export const BUTTON_STYLES = `
  :host { all: initial; display: flex; align-items: center; }
  ${TOKENS}
  .theme { display: flex; }
  button {
    display: inline-flex;
    align-items: center;
    min-height: 20px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 13px;
    line-height: 16px;
    cursor: pointer;
    outline: none;
  }
  .icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34.75px;
    height: 34.75px;
    margin: -7.5px -8px;
    border-radius: 9999px;
    transition: background-color 0.2s;
  }
  svg { width: 18.75px; height: 18.75px; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linejoin: round; }
  .count { padding: 0 4px 0 12px; font-variant-numeric: tabular-nums; }
  .count:empty { display: none; }
  button:hover, button:focus-visible, button[aria-pressed='true'] { color: var(--accent); }
  button:hover .icon, button:focus-visible .icon { background: var(--accent-tint); }
  button:focus-visible .icon { box-shadow: 0 0 0 2px var(--accent); }
  button[aria-pressed='true'] svg { fill: currentColor; }
  button[aria-pressed='true'] svg .hole { fill: var(--surface); }
  .shake { animation: shake 0.4s; color: var(--danger); }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-3px); }
    75% { transform: translateX(3px); }
  }
  @media (prefers-reduced-motion: reduce) {
    .icon { transition: none; }
    .shake { animation: none; }
  }
`;

export const POPOVER_STYLES = `
  :host { all: initial; }
  ${TOKENS}
  .dialog {
    position: fixed;
    z-index: 2147483647;
    box-sizing: border-box;
    width: 300px;
    max-width: calc(100vw - 16px);
    border-radius: 16px;
    background: var(--surface);
    box-shadow: var(--shadow);
    overflow: hidden;
  }
  .field {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    padding: 12px;
    border-bottom: 1px solid var(--border);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    padding: 2px 4px 2px 10px;
    border: 1px solid var(--border);
    border-radius: 9999px;
    font-size: 14px;
  }
  .chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; box-shadow: inset 0 0 0 1px var(--muted); }
  .chip button, .recent button {
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    cursor: pointer;
  }
  .chip button { width: 20px; height: 20px; padding: 0; border-radius: 50%; line-height: 1; }
  .chip button:hover, .chip button:focus-visible { background: var(--accent-tint); color: var(--accent); outline: none; }
  input {
    flex: 1 1 80px;
    min-width: 80px;
    padding: 4px 0;
    border: 0;
    outline: none;
    background: none;
    color: var(--text);
    font: inherit;
  }
  input::placeholder { color: var(--muted); }
  ul { margin: 0; padding: 4px 0; list-style: none; max-height: 240px; overflow-y: auto; }
  ul:empty { display: none; }
  li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    cursor: pointer;
  }
  li[aria-selected='true'], li:hover { background: var(--row); }
  li .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  li .uses { color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
  .recent {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    padding: 10px 16px;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 13px;
  }
  .recent:empty { display: none; }
  .recent button { padding: 0; color: var(--accent); }
  .recent button:hover, .recent button:focus-visible { text-decoration: underline; outline: none; }
  .error { margin: 0; padding: 8px 16px; color: var(--danger); font-size: 13px; }
`;
