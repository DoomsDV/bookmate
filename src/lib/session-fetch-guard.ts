import {
	ORG_ACCESS_INACTIVE_MESSAGE,
	isOrgAccessInactiveResponse,
} from './session-auth-messages';

export const SESSION_FETCH_GUARD_HEADER = 'x-bookmate-skip-session-guard';
const SESSION_RETRY_HEADER = 'x-bookmate-session-retry';

const REFRESH_PATH = '/api/auth/refresh';
const LOGOUT_PATH = '/api/auth/logout';
const LOGIN_PATH = '/auth/login';
const REFRESH_LOCK_NAME = 'hasel-session-refresh';
const REFRESH_RACE_RETRY_MS = 200;

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

type RefreshOutcome = 'success' | 'rejected' | 'unavailable';

let nativeFetch: typeof fetch | null = null;
let guardInstalled = false;
let sessionLogoutInProgress = false;
let refreshInFlight: Promise<RefreshOutcome> | null = null;

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

const isLoginRedirectResponse = (response: Response) => {
	const status = response.status;
	if (status !== 301 && status !== 302 && status !== 303 && status !== 307 && status !== 308) {
		return false;
	}

	const location = response.headers.get('location');
	if (!location) return false;

	try {
		const resolved = new URL(location, window.location.origin);
		return resolved.pathname === LOGIN_PATH;
	} catch {
		return false;
	}
};

const classifyRefreshResponse = (response: Response): RefreshOutcome => {
	if (response.ok) return 'success';
	if (response.status >= 500 || response.status === 429) return 'unavailable';
	return 'rejected';
};

const postRefresh = async () =>
	(nativeFetch ?? fetch)(REFRESH_PATH, {
		method: 'POST',
		credentials: 'include',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			[SESSION_FETCH_GUARD_HEADER]: '1',
		},
		body: '{}',
	});

const runRefreshAttempt = async (): Promise<RefreshOutcome> => {
	try {
		const first = classifyRefreshResponse(await postRefresh());
		if (first !== 'rejected') return first;

		// Otra pestaña pudo rotar el refresh: reintentar una vez con las cookies nuevas.
		await new Promise((resolve) => window.setTimeout(resolve, REFRESH_RACE_RETRY_MS));
		return classifyRefreshResponse(await postRefresh());
	} catch {
		return 'unavailable';
	}
};

const tryRefreshSession = async (): Promise<RefreshOutcome> => {
	if (refreshInFlight) return refreshInFlight;

	refreshInFlight = (async () => {
		const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
		if (locks?.request) {
			return locks.request(REFRESH_LOCK_NAME, runRefreshAttempt);
		}
		return runRefreshAttempt();
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

const showOrgAccessInactiveAlert = async (message?: string) => {
	const text =
		String(message || '').trim() ||
		ORG_ACCESS_INACTIVE_MESSAGE;

	if (window.BookmateAlert?.alert) {
		await window.BookmateAlert.alert({
			type: 'warning',
			title: 'Acceso desactivado',
			message: text,
			confirmText: 'Ir al login',
		});
		return;
	}

	window.alert(text);
};

export const handleOrgAccessInactive = async (message?: string) => {
	if (sessionLogoutInProgress) return;
	sessionLogoutInProgress = true;

	await showOrgAccessInactiveAlert(message);
	await performLogoutRequest();

	const params = new URLSearchParams();
	params.set('error', String(message || '').trim() || ORG_ACCESS_INACTIVE_MESSAGE);
	window.location.replace(`${LOGIN_PATH}?${params.toString()}`);
};

export const handleSessionExpired = async () => {
	if (sessionLogoutInProgress) return;
	sessionLogoutInProgress = true;

	await showSessionExpiredAlert();
	await performLogoutRequest();

	window.location.replace(buildLoginRedirectUrl());
};

const handleOrgAccessIfNeeded = async (response: Response) => {
	if (response.status !== 401 && response.status !== 403) return false;

	const payload = await parseApiErrorPayload(response);
	const message = readErrorMessage(payload);
	const code = String(payload?.code || '').trim();

	if (!isOrgAccessInactiveResponse({ status: response.status, message, code })) {
		return false;
	}

	await handleOrgAccessInactive(message);
	return true;
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

	if (sessionLogoutInProgress) {
		return response;
	}

	if (await handleOrgAccessIfNeeded(response)) {
		return response;
	}

	const needsRefresh = !isRetry && (response.status === 401 || isLoginRedirectResponse(response));
	if (!needsRefresh) {
		return response;
	}

	const refreshOutcome = await tryRefreshSession();

	if (refreshOutcome === 'success') {
		const retryHeaders = new Headers(init?.headers);
		retryHeaders.set(SESSION_RETRY_HEADER, '1');
		response = await fetchImpl(input, {
			...fetchInit,
			headers: retryHeaders,
		});

		if (await handleOrgAccessIfNeeded(response)) {
			return response;
		}

		return response;
	}

	if (refreshOutcome === 'unavailable') {
		return response;
	}

	await handleSessionExpired();
	return response;
};

export const installSessionFetchGuard = () => {
	if (typeof window === 'undefined' || guardInstalled) return;

	nativeFetch = window.fetch.bind(window);
	window.fetch = guardedFetch as typeof fetch;
	guardInstalled = true;
};
