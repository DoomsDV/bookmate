const ORG_MEMBER_QUERY_KEY = 'org_member_id';

const sanitizeRedirectPath = (value: string) => {
	const redirectTo = String(value || '').trim();
	if (!redirectTo || !redirectTo.startsWith('/') || redirectTo.startsWith('//')) {
		return '';
	}
	if (redirectTo.includes('\r') || redirectTo.includes('\n')) {
		return '';
	}
	if (redirectTo.startsWith('/auth/login') || redirectTo.startsWith('/api/')) {
		return '';
	}
	return redirectTo;
};

export const parseOrgMemberIdFromUrl = (url: URL) => {
	const raw = String(url.searchParams.get(ORG_MEMBER_QUERY_KEY) || '').trim();
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed <= 0) return 0;
	return parsed;
};

export const stripOrgMemberIdFromUrl = (url: URL) => {
	const cleaned = new URL(url.href);
	cleaned.searchParams.delete(ORG_MEMBER_QUERY_KEY);
	return cleaned;
};

export const parseOrgMemberIdFromRedirectPath = (redirectPath: string) => {
	const safePath = sanitizeRedirectPath(redirectPath);
	if (!safePath) return 0;
	try {
		const url = new URL(safePath, window.location.origin);
		return parseOrgMemberIdFromUrl(url);
	} catch {
		return 0;
	}
};

export const resolveOrgNotificationDeepLink = async (options: {
	currentOrgMemberId: number;
}) => {
	if (typeof window === 'undefined') return { handled: false as const };

	const currentUrl = new URL(window.location.href);
	const targetOrgMemberId = parseOrgMemberIdFromUrl(currentUrl);
	if (!targetOrgMemberId) return { handled: false as const };

	const currentOrgMemberId = Number(options.currentOrgMemberId || 0);
	const cleanedUrl = stripOrgMemberIdFromUrl(currentUrl);
	const destination =
		cleanedUrl.pathname + cleanedUrl.search + cleanedUrl.hash || '/panel/calendar';

	if (targetOrgMemberId === currentOrgMemberId) {
		window.history.replaceState({}, '', destination);
		return { handled: true as const, switched: false as const };
	}

	const response = await fetch('/api/session/switch-organization', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify({
			org_member_id: targetOrgMemberId,
			redirectTo: destination,
		}),
	});

	const payload = await response.json().catch(() => ({}));
	if (!response.ok || payload?.success !== true) {
		window.history.replaceState({}, '', destination);
		return { handled: true as const, switched: false as const, error: true as const };
	}

	const redirectTarget = sanitizeRedirectPath(String(payload?.redirect || destination)) || destination;
	window.location.replace(redirectTarget);
	return { handled: true as const, switched: true as const };
};
