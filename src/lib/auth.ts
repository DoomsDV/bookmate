const DEFAULT_LOGIN_URL =
	'https://g9549f707e8ebfa-aox.adb.sa-saopaulo-1.oraclecloudapps.com/ords/bookmate/api/v1/auth/login';
const DEFAULT_REFRESH_URL =
	'https://g9549f707e8ebfa-aox.adb.sa-saopaulo-1.oraclecloudapps.com/ords/bookmate/api/v1/auth/refresh';
const DEFAULT_LOGOUT_URL =
	'https://g9549f707e8ebfa-aox.adb.sa-saopaulo-1.oraclecloudapps.com/ords/bookmate/api/v1/auth/logout';

export const LOGIN_URL = import.meta.env.ORDS_AUTH_LOGIN_URL ?? DEFAULT_LOGIN_URL;
export const REFRESH_URL = import.meta.env.ORDS_AUTH_REFRESH_URL ?? DEFAULT_REFRESH_URL;
export const LOGOUT_URL = import.meta.env.ORDS_AUTH_LOGOUT_URL ?? DEFAULT_LOGOUT_URL;

const ORGANIZATION_CACHE_COOKIE_KEYS = {
	id: 'org_id',
	name: 'org_name',
	slug: 'org_slug',
} as const;

export interface AuthSuccessResponse {
	status: 'success';
	message: string;
	user_id: number;
	organization_id: number;
	role: string;
	access_token: string;
	refresh_token: string;
	expires_in: number;
}

export interface AuthFieldError {
	field: string;
	message: string;
}

interface AuthFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
	errors?: unknown;
}

interface BasicSuccessResponse {
	status: 'success';
	message?: string;
}

export class AuthApiError extends Error {
	status: number;
	details?: unknown;
	fieldErrors: AuthFieldError[];

	constructor(message: string, status = 400, details?: unknown, fieldErrors: AuthFieldError[] = []) {
		super(message);
		this.name = 'AuthApiError';
		this.status = status;
		this.details = details;
		this.fieldErrors = fieldErrors;
	}
}

const parseFieldErrors = (value: unknown): AuthFieldError[] => {
	if (!Array.isArray(value)) return [];

	return value.flatMap((item) => {
		if (!item || typeof item !== 'object') return [];

		const field = 'field' in item ? String(item.field || '').trim() : '';
		const message = 'message' in item ? String(item.message || '').trim() : '';

		if (!field || !message) return [];

		return [{ field, message }];
	});
};

const isSuccessResponse = (value: unknown): value is AuthSuccessResponse => {
	if (!value || typeof value !== 'object') return false;

	return (
		'status' in value &&
		value.status === 'success' &&
		'access_token' in value &&
		'refresh_token' in value &&
		'expires_in' in value
	);
};

const parseAuthResponse = async (response: Response) => {
	let data: AuthSuccessResponse | AuthFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new AuthApiError('No fue posible interpretar la respuesta del servidor de autenticacion.', 502);
	}

	if (!response.ok || !isSuccessResponse(data)) {
		const failureData = (data ?? {}) as AuthFailureResponse;
		const fieldErrors = parseFieldErrors(failureData.errors);
		throw new AuthApiError(
			failureData.message || 'No fue posible autenticar la solicitud.',
			response.status || 400,
			failureData.details,
			fieldErrors
		);
	}

	return data;
};

const parseBasicResponse = async (response: Response) => {
	let data: BasicSuccessResponse | AuthFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new AuthApiError('No fue posible interpretar la respuesta del servidor.', 502);
	}

	if (!response.ok || !data || typeof data !== 'object' || data.status !== 'success') {
		const failureData = (data ?? {}) as AuthFailureResponse;
		throw new AuthApiError(
			failureData.message || 'No fue posible completar la solicitud.',
			response.status || 400,
			failureData.details
		);
	}

	return data;
};

export const loginWithOrds = async (payload: { email: string; password: string }) => {
	const response = await fetch(LOGIN_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(payload),
	});

	return parseAuthResponse(response);
};

export const refreshWithOrds = async (refreshToken: string) => {
	const response = await fetch(REFRESH_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ refresh_token: refreshToken }),
	});

	return parseAuthResponse(response);
};

export const logoutWithOrds = async (refreshToken?: string) => {
	const response = await fetch(LOGOUT_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			refresh_token: refreshToken ?? null,
		}),
	});

	return parseBasicResponse(response);
};

const isSecureRequest = (url: URL) => url.protocol === 'https:' || url.hostname !== 'localhost';

const getCookieBaseOptions = (url: URL) => ({
	httpOnly: true,
	secure: isSecureRequest(url),
	sameSite: 'strict' as const,
	path: '/',
});

export const setSessionCookies = (
	cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void },
	url: URL,
	session: AuthSuccessResponse
) => {
	const baseOptions = getCookieBaseOptions(url);

	cookies.set('access_token', session.access_token, {
		...baseOptions,
		maxAge: session.expires_in,
	});

	cookies.set('refresh_token', session.refresh_token, {
		...baseOptions,
		maxAge: 60 * 60 * 24 * 30,
	});
};

export const setOrganizationCacheCookies = (
	cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void },
	url: URL,
	organization: { id_organization: number; name: string; profile_slug?: string | null }
) => {
	const baseOptions = getCookieBaseOptions(url);
	const safeName = String(organization.name || '').trim();
	const safeSlug = String(organization.profile_slug || '').trim();

	cookies.set(ORGANIZATION_CACHE_COOKIE_KEYS.id, String(organization.id_organization || 0), baseOptions);
	cookies.set(ORGANIZATION_CACHE_COOKIE_KEYS.name, safeName, baseOptions);
	cookies.set(ORGANIZATION_CACHE_COOKIE_KEYS.slug, safeSlug, baseOptions);
};

export const clearSessionCookies = (
	cookies: { delete: (name: string, options?: Record<string, unknown>) => void }
) => {
	cookies.delete('access_token', { path: '/' });
	cookies.delete('refresh_token', { path: '/' });
	cookies.delete(ORGANIZATION_CACHE_COOKIE_KEYS.id, { path: '/' });
	cookies.delete(ORGANIZATION_CACHE_COOKIE_KEYS.name, { path: '/' });
	cookies.delete(ORGANIZATION_CACHE_COOKIE_KEYS.slug, { path: '/' });
};

export const isPublicPath = (pathname: string) => {
	return (
		pathname.startsWith('/login') ||
		pathname.startsWith('/api/auth') ||
		pathname.startsWith('/_astro') ||
		pathname === '/favicon.ico' ||
		pathname === '/favicon.svg'
	);
};
