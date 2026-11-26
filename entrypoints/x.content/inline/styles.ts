/**
 * Styles for the tag button added to x.com. It lives in a closed shadow root,
 * so neither the page's styles nor these can leak across. Sizes and colours
 * follow X's own action bar so the button looks native (DESIGN, 2 and 7).
 */

import { THEME_TOKENS } from '@/src/ui/styles';

export const BUTTON_STYLES = `
  :host { all: initial; display: flex; align-items: center; }
  ${THEME_TOKENS}
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
