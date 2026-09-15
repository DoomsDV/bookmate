export const PANEL_NEW_QUERY = 'new';
export const PANEL_NEW_VALUE = '1';

export const CALENDAR_NEW_APPOINTMENT_HREF = '/panel/calendar?new=1';
export const CUSTOMERS_NEW_HREF = '/panel/customers?new=1';
export const CUSTOMERS_LIST_HREF = '/panel/customers';
export const PUBLIC_PROFILE_EDITOR_HREF = '/panel/perfil-publico';

const trimSlashes = (value: string) => String(value || '').trim().replace(/^\/+|\/+$/g, '');

const buildHubUrl = (publicOrigin: string, slug: string): string => {
	const path = `/${encodeURIComponent(trimSlashes(slug))}`;
	const domain = String(publicOrigin || '').trim();
	if (!domain) return path;

	const withScheme = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
	try {
		return `${new URL(withScheme).origin}${path}`;
	} catch {
		return `${domain.replace(/\/+$/, '')}${path}`;
	}
};

export const consumePanelNewQuery = (
	search: string
): { shouldOpen: boolean; nextSearch: string } => {
	const raw = String(search || '');
	const params = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
	const shouldOpen = params.get(PANEL_NEW_QUERY) === PANEL_NEW_VALUE;
	if (shouldOpen) params.delete(PANEL_NEW_QUERY);
	return { shouldOpen, nextSearch: params.toString() };
};

export const withCurrentLocation = (pathname: string, search: string, hash = ''): string =>
	`${pathname}${search ? `?${search}` : ''}${hash}`;

export const resolveNewCustomerHref = (canCreate: boolean): string =>
	canCreate ? CUSTOMERS_NEW_HREF : CUSTOMERS_LIST_HREF;

export const resolveDashboardHubHref = (
	slug: string,
	publicOrigin: string
): { href: string; external: boolean } => {
	const safeSlug = String(slug || '').trim();
	if (!safeSlug) {
		return { href: PUBLIC_PROFILE_EDITOR_HREF, external: false };
	}

	return {
		href: buildHubUrl(publicOrigin, safeSlug),
		external: true,
	};
};
