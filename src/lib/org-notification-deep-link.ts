const ORG_MEMBER_QUERY_KEY = 'org_member_id';
export const PENDING_ORG_MEMBER_STORAGE_KEY = 'hasel:pending-org-member-id';
export const PUSH_NAVIGATE_MESSAGE_TYPE = 'BOOKMATE_PUSH_NAVIGATE';

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

export const getCurrentOrgMemberIdFromDom = () => {
	const raw = String(document.body?.dataset?.orgMemberId || '').trim();
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed <= 0) return 0;
	return parsed;
};

const rememberPendingOrgMemberId = (orgMemberId: number) => {
	if (!orgMemberId) return;
	sessionStorage.setItem(PENDING_ORG_MEMBER_STORAGE_KEY, String(orgMemberId));
};

const readPendingOrgMemberId = () => {
	const raw = String(sessionStorage.getItem(PENDING_ORG_MEMBER_STORAGE_KEY) || '').trim();
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed <= 0) return 0;
	return parsed;
};

const clearPendingOrgMemberId = () => {
	sessionStorage.removeItem(PENDING_ORG_MEMBER_STORAGE_KEY);
};

const resolveTargetOrgMemberId = (currentUrl: URL) => {
	const fromUrl = parseOrgMemberIdFromUrl(currentUrl);
	if (fromUrl > 0) {
		rememberPendingOrgMemberId(fromUrl);
		return fromUrl;
	}
	return readPendingOrgMemberId();
};

export const navigateToPushTarget = (rawUrl: string) => {
	const safePath = sanitizeRedirectPath(rawUrl);
	if (!safePath) return false;

	const target = new URL(safePath, window.location.origin);
	const orgMemberId = parseOrgMemberIdFromUrl(target);
	if (orgMemberId > 0) {
		rememberPendingOrgMemberId(orgMemberId);
	}

	if (`${window.location.pathname}${window.location.search}${window.location.hash}` === safePath) {
		void resolveOrgNotificationDeepLink();
		return true;
	}

	window.location.assign(safePath);
	return true;
};

export const resolveOrgNotificationDeepLink = async () => {
	if (typeof window === 'undefined') return { handled: false as const };

	const currentUrl = new URL(window.location.href);
	const targetOrgMemberId = resolveTargetOrgMemberId(currentUrl);
	if (!targetOrgMemberId) return { handled: false as const };

	const currentOrgMemberId = getCurrentOrgMemberIdFromDom();
	const cleanedUrl = stripOrgMemberIdFromUrl(currentUrl);
	const destination =
		cleanedUrl.pathname + cleanedUrl.search + cleanedUrl.hash || '/panel/calendar';

	if (targetOrgMemberId === currentOrgMemberId) {
		clearPendingOrgMemberId();
		window.history.replaceState({}, '', destination);
		return { handled: true as const, switched: false as const };
	}

	const response = await fetch('/api/session/switch-organization', {
		method: 'POST',
		credentials: 'same-origin',
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

	clearPendingOrgMemberId();
	const redirectTarget = sanitizeRedirectPath(String(payload?.redirect || destination)) || destination;
	window.location.replace(redirectTarget);
	return { handled: true as const, switched: true as const };
};

export const bindPushNotificationNavigation = () => {
	if (typeof window === 'undefined' || (window as Window & { __bookmatePushNavBound?: boolean }).__bookmatePushNavBound) {
		return;
	}
	(window as Window & { __bookmatePushNavBound?: boolean }).__bookmatePushNavBound = true;

	const handleServiceWorkerMessage = (event: MessageEvent) => {
		const data = event.data;
		if (!data || data.type !== PUSH_NAVIGATE_MESSAGE_TYPE) return;
		const url = String(data.url || '').trim();
		if (!url) return;
		navigateToPushTarget(url);
	};

	navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage);

	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') {
			void resolveOrgNotificationDeepLink();
		}
	});

	window.addEventListener('pageshow', () => {
		void resolveOrgNotificationDeepLink();
	});
};
