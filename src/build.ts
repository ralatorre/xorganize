/**
 * True only in the diagnostics build (`pnpm build:diagnostics`).
 *
 * The comparison is folded at build time, so everything guarded by this
 * constant is removed from production bundles. A test checks that it is.
 */
export const DIAGNOSTICS: boolean = import.meta.env.MODE === 'diagnostics';
