/**
 * Dev-only workaround. Aliased from astro.config.mjs when `command === 'serve'`.
 *
 * Vite 8 / Rolldown prebundles React 19's CJS `react/jsx-dev-runtime` to the
 * production stub (`exports.jsxDEV = void 0`) while `astro dev` still emits
 * `_jsxDEV(...)`. After changing this file, restart with `pnpm dev:force`
 * so optimizeDeps does not keep a stale prebundle.
 *
 * Delegate to `jsx` / `jsxs` — not createElement — so static children arrays
 * are not treated as keyed lists (false "unique key" warnings).
 */
import * as jsxRuntimeNs from 'react/jsx-runtime';

const runtime =
	typeof jsxRuntimeNs.jsx === 'function'
		? jsxRuntimeNs
		: jsxRuntimeNs.default;

if (typeof runtime?.jsx !== 'function' || typeof runtime?.jsxs !== 'function') {
	throw new Error(
		'[vite-shims/react-jsx-dev-runtime] jsx/jsxs missing from react/jsx-runtime',
	);
}

export const Fragment = runtime.Fragment;

export function jsxDEV(type, config, maybeKey, isStaticChildren) {
	const fn = isStaticChildren ? runtime.jsxs : runtime.jsx;
	return fn(type, config, maybeKey);
}

export default { Fragment, jsxDEV };
