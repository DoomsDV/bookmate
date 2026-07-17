/** Slugs reservados que chocan con rutas estáticas del sitio (alineado con PKG_AOX_UTIL). */
export const RESERVED_ORG_SLUGS = new Set([
	'panel',
	'auth',
	'api',
	'u',
	'r',
	'p',
	'pagopar',
	'reserva-exitosa',
	'politicas-y-privacidad',
	'politicas-de-cancelacion-y-reembolso',
	'icons',
	'assets',
	'static',
	'admin',
	'login',
	'register',
	'hasel',
	'bookmate',
	'www',
	'app',
	'support',
	'help',
	'pricing',
	'blog',
	'docs',
	'sitemap',
	'robots',
	'favicon',
	'_astro',
]);

export const isReservedOrgSlug = (slug: string): boolean => {
	const normalized = String(slug || '')
		.trim()
		.toLowerCase();
	if (!normalized) return false;
	return RESERVED_ORG_SLUGS.has(normalized);
};
