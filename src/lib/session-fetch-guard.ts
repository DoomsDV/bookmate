import {
	SESSION_EXPIRED_API_CODE,
	shouldTreatUnauthorizedAsSessionExpired,
} from './session-auth-messages';

export const SESSION_FETCH_GUARD_HEADER = 'x-bookmate-skip-session-guard';
const SESSION_RETRY_HEADER = 'x-bookmate-session-retry';

const REFRESH_PATH = '/api/auth/refresh';
const LOGOUT_PATH = '/api/auth/logout';
const LOGIN_PATH = '/api/auth/login';

const EXCLUDED_API_PREFIXES = [
	'/api/public/',
	'/api/auth/login',
	'/api/auth/register',
	'/api/auth/forgot-password',
	'/api/auth/reset-password',
	'/api/auth/verify-email',
	'/api/auth/resend-verification-code',
	'/api/auth/invitation',
	'/api/auth/accept-invitation',
	'/api/auth/session',
	REFRESH_PATH,
	LOGOUT_PATH,
];

type ApiErrorPayload = {
	status?: string;
	code?: string;
	message?: string;
	error?: string;
};

let nativeFetch: typeof fetch | null = null;
let guardInstalled = false;
let sessionLogoutInProgress = false;
let refreshInFlight: Promise<boolean> | null = null;

const getRequestUrl = (input: RequestInfo | URL): string => {
	if (typeof input === 'string') return input;
	if (input instanceof URL) return input.href;
	return input.url;
};

const isSameOriginApiRequest = (url: string) => {
	if (!url.startsWith('/api/')) return false;
	return !EXCLUDED_API_PREFIXES.some((prefix) => url.startsWith(prefix));
};

const shouldBypassGuard = (input: RequestInfo | URL, init?: RequestInit) => {
	const headers = new Headers(init?.headers);
	if (headers.get(SESSION_FETCH_GUARD_HEADER) === '1') return true;
	const url = getRequestUrl(input);
	return !isSameOriginApiRequest(url);
};

const parseApiErrorPayload = async (response: Response): Promise<ApiErrorPayload | null> => {
	const contentType = response.headers.get('content-type') || '';
	if (!contentType.includes('application/json')) return null;

	try {
		const data = await response.clone().json();
		if (!data || typeof data !== 'object') return null;
		return data as ApiErrorPayload;
	} catch {
		return null;
	}
};

const readErrorMessage = (payload: ApiErrorPayload | null) => {
	if (!payload) return '';
	const message = String(payload.message || payload.error || '').trim();
	return message;
};

const tryRefreshSession = async (): Promise<boolean> => {
	if (refreshInFlight) return refreshInFlight;

	refreshInFlight = (async () => {
		const response = await (nativeFetch ?? fetch)(REFRESH_PATH, {
			method: 'POST',
			credentials: 'include',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				[SESSION_FETCH_GUARD_HEADER]: '1',
			},
			body: '{}',
		});

		return response.ok;
	})().finally(() => {
		refreshInFlight = null;
	});

	return refreshInFlight;
};

const buildLoginRedirectUrl = () => {
	const path = `${window.location.pathname}${window.location.search}`;
	if (!path || path.startsWith('/auth')) return LOGIN_PATH;
	return `${LOGIN_PATH}?redirectTo=${encodeURIComponent(path)}`;
};

const showSessionExpiredAlert = async () => {
	if (window.BookmateAlert?.alert) {
		await window.BookmateAlert.alert({
			type: 'warning',
			title: 'Tu sesión ha finalizado',
			message: 'Por seguridad, vuelve a iniciar sesión para continuar.',
			confirmText: 'Ir al login',
		});
		return;
	}

	window.alert('Tu sesión ha finalizado. Vuelve a iniciar sesión para continuar.');
};

const performLogoutRequest = async () => {
	try {
		await (nativeFetch ?? fetch)(LOGOUT_PATH, {
			method: 'POST',
			credentials: 'include',
			headers: {
				Accept: 'application/json',
				[SESSION_FETCH_GUARD_HEADER]: '1',
			},
		});
	} catch {
		// Idempotente: si falla, igual redirigimos al login.
	}
};

export const handleSessionExpired = async () => {
	if (sessionLogoutInProgress) return;
	sessionLogoutInProgress = true;

	await showSessionExpiredAlert();
	await performLogoutRequest();

	window.location.replace(buildLoginRedirectUrl());
};

const guardedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
	const fetchImpl = nativeFetch ?? fetch;

	if (shouldBypassGuard(input, init)) {
		return fetchImpl(input, init);
	}

	const isRetry = new Headers(init?.headers).get(SESSION_RETRY_HEADER) === '1';

	const fetchInit: RequestInit = {
		...init,
		redirect: init?.redirect ?? 'manual',
	};

	let response = await fetchImpl(input, fetchInit);

	if (
		!sessionLogoutInProgress &&
		(response.type === 'opaqueredirect' ||
			response.status === 301 ||
			response.status === 302 ||
			response.status === 303 ||
			response.status === 307 ||
			response.status === 308)
	) {
		await handleSessionExpired();
		return response;
	}

	if (response.status !== 401 || sessionLogoutInProgress) {
		return response;
	}

	if (!isRetry) {
		const refreshed = await tryRefreshSession();
		if (refreshed) {
			const retryHeaders = new Headers(init?.headers);
			retryHeaders.set(SESSION_RETRY_HEADER, '1');
			response = await fetchImpl(input, { ...init, headers: retryHeaders });
			if (response.status !== 401) {
				return response;
			}
		} else {
			await handleSessionExpired();
			return response;
		}
	}

	const payload = await parseApiErrorPayload(response);
	const message = readErrorMessage(payload);
	const code = String(payload?.code || '').trim();

	if (
		shouldTreatUnauthorizedAsSessionExpired({
			status: 401,
			message,
			code,
			refreshFailed: false,
		})
	) {
		await handleSessionExpired();
	}

	return response;
};

export const installSessionFetchGuard = () => {
	if (typeof window === 'undefined' || guardInstalled) return;

	nativeFetch = window.fetch.bind(window);
	window.fetch = guardedFetch as typeof fetch;
	guardInstalled = true;
};
