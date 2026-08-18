const trimSlashes = (value: string) => String(value || '').trim().replace(/^\/+|\/+$/g, '');

export const buildGlobalPublicProfilePath = (publicSlug: string): string => {
	const slug = trimSlashes(publicSlug);
	if (!slug) return '';
	return `/u/${encodeURIComponent(slug)}`;
};

export const buildGlobalPublicProfileUrl = (publicDomain: string, publicSlug: string): string => {
	const path = buildGlobalPublicProfilePath(publicSlug);
	if (!path) return '';

	const domain = String(publicDomain || '').trim();
	if (!domain) return path;

	const withScheme = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
	try {
		return `${new URL(withScheme).origin}${path}`;
	} catch {
		return `${domain.replace(/\/+$/, '')}${path}`;
	}
};

export const buildGlobalPublicProfilePrefix = (publicDomain: string): string => {
	const domain = String(publicDomain || '').trim();
	const pathSuffix = '/u/';

	if (!domain) return pathSuffix;

	const withScheme = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
	try {
		return `${new URL(withScheme).origin}${pathSuffix}`;
	} catch {
		return `${domain.replace(/\/+$/, '')}${pathSuffix}`;
	}
};

export const buildOrgHubPath = (organizationSlug: string): string => {
	const org = trimSlashes(organizationSlug);
	if (!org) return '';
	return `/${encodeURIComponent(org)}`;
};

export const buildOrgHubUrl = (publicDomain: string, organizationSlug: string): string => {
	const path = buildOrgHubPath(organizationSlug);
	if (!path) return '';

	const domain = String(publicDomain || '').trim();
	if (!domain) return path;

	const withScheme = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
	try {
		return `${new URL(withScheme).origin}${path}`;
	} catch {
		return `${domain.replace(/\/+$/, '')}${path}`;
	}
};

export const buildPublicProfilePath = (organizationSlug: string, professionalSlug: string): string => {
	const org = trimSlashes(organizationSlug);
	const pro = trimSlashes(professionalSlug);
	if (!org || !pro) return '';
	return `/${encodeURIComponent(org)}/p/${encodeURIComponent(pro)}`;
};

export const buildPublicProfileUrl = (
	publicDomain: string,
	organizationSlug: string,
	professionalSlug: string
): string => {
	const path = buildPublicProfilePath(organizationSlug, professionalSlug);
	if (!path) return '';

	const domain = String(publicDomain || '').trim();
	if (!domain) return path;

	const withScheme = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
	try {
		return `${new URL(withScheme).origin}${path}`;
	} catch {
		return `${domain.replace(/\/+$/, '')}${path}`;
	}
};

export const resolvePublicSiteOrigin = (fallbackOrigin = ''): string => {
	const fromEnv = String(import.meta.env.PUBLIC_BOOKMATE_PUBLIC_DOMAIN || '').trim();
	if (fromEnv) {
		const withScheme = /^https?:\/\//i.test(fromEnv) ? fromEnv : `https://${fromEnv}`;
		try {
			return new URL(withScheme).origin;
		} catch {
			// Sigue al fallback si el dominio público está mal configurado.
		}
	}

	const fallback = String(fallbackOrigin || '').trim();
	if (fallback) {
		try {
			return new URL(fallback).origin;
		} catch {
			return fallback;
		}
	}

	return '';
};

export const resolveOgImageUrl = (imageUrl: string, siteOrigin: string): string => {
	const trimmed = String(imageUrl || '').trim();
	const fallbackPath = '/icons/icon-512x512.png';

	if (!trimmed) {
		return siteOrigin ? new URL(fallbackPath, siteOrigin).href : fallbackPath;
	}

	if (/^https?:\/\//i.test(trimmed)) {
		return trimmed;
	}

	const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
	return siteOrigin ? new URL(normalizedPath, siteOrigin).href : normalizedPath;
};

export const buildPublicProfilePrefix = (publicDomain: string, organizationSlug: string): string => {
	const org = trimSlashes(organizationSlug);
	const domain = String(publicDomain || '').trim();
	const pathSuffix = org ? `/${encodeURIComponent(org)}/p/` : '/p/';

	if (!domain) return pathSuffix;

	const withScheme = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
	try {
		return `${new URL(withScheme).origin}${pathSuffix}`;
	} catch {
		return `${domain.replace(/\/+$/, '')}${pathSuffix}`;
	}
};

const normalizePublicProfilePath = (path: string): string => {
	let normalized = String(path || '').replace(/\/{2,}/g, '/');
	if (!normalized.startsWith('/')) normalized = `/${normalized}`;
	if (!normalized.endsWith('/')) normalized = `${normalized}/`;
	return normalized;
};

/** Ruta corta para mostrar en UI (copiar sigue usando la URL completa). */
export const formatPublicProfilePrefixDisplay = (prefix: string): string => {
	const trimmed = String(prefix || '').trim();
	if (!trimmed) return '/p/';

	let pathname = '';
	try {
		const withScheme = /^https?:\/\//i.test(trimmed)
			? trimmed
			: `https://${trimmed.replace(/^\/+/, '')}`;
		pathname = new URL(withScheme).pathname;
	} catch {
		if (trimmed.startsWith('/')) {
			pathname = trimmed;
		} else {
			const slashIndex = trimmed.indexOf('/');
			pathname = slashIndex >= 0 ? trimmed.slice(slashIndex) : '/p/';
		}
	}

	const normalized = normalizePublicProfilePath(pathname);
	if (normalized.includes('/p/')) return '/p/';
	if (normalized.includes('/u/')) return '/u/';
	return normalized;
};

export const PUBLIC_BOOKING_FROM_HUB_QUERY = 'from';
export const PUBLIC_BOOKING_FROM_HUB_VALUE = 'hub';

/** Marca enlaces del hub → agenda para mostrar la flecha atrás en mobile. */
export const appendPublicBookingFromHubParam = (path: string, origin = ''): string => {
	const raw = String(path || '').trim();
	if (!raw || raw.startsWith('#')) return raw;

	try {
		const base =
			origin && /^https?:\/\//i.test(origin)
				? origin
				: origin
					? `https://${origin.replace(/^\/+/, '')}`
					: 'https://hasel.app';
		const url = new URL(raw, base);
		url.searchParams.set(PUBLIC_BOOKING_FROM_HUB_QUERY, PUBLIC_BOOKING_FROM_HUB_VALUE);
		return `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return raw.includes('?') ? `${raw}&from=hub` : `${raw}?from=hub`;
	}
};

const normalizePathForCompare = (path: string) => {
	const trimmed = String(path || '').trim().replace(/\/+$/, '');
	return trimmed || '/';
};

/** true si el usuario llegó desde /{orgSlug} (query from=hub o referrer del hub). */
export const cameFromOrgPublicPage = (organizationSlug: string): boolean => {
	if (typeof window === 'undefined') return false;

	const slug = trimSlashes(organizationSlug);
	if (!slug) return false;

	const params = new URLSearchParams(window.location.search);
	if (params.get(PUBLIC_BOOKING_FROM_HUB_QUERY) === PUBLIC_BOOKING_FROM_HUB_VALUE) {
		return true;
	}

	try {
		const ref = new URL(document.referrer);
		if (ref.origin !== window.location.origin) return false;
		const hubPath = normalizePathForCompare(buildOrgHubPath(slug));
		const refPath = normalizePathForCompare(ref.pathname);
		return refPath === hubPath;
	} catch {
		return false;
	}
};
