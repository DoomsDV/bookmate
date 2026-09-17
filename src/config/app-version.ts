import packageJson from '../../package.json' with { type: 'json' };

/**
 * Versión visible de Hasel. Fuente canónica: `package.json`.
 * `PUBLIC_APP_VERSION` puede overridear en un build puntual.
 */
export const APP_VERSION =
	String(import.meta.env?.PUBLIC_APP_VERSION ?? '').trim() || String(packageJson.version ?? '').trim();
