import { resolveOrdsApiUrl } from './env-urls';

export const LOGIN_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_AUTH_LOGIN_URL,
	'ORDS_AUTH_LOGIN_URL',
	'/auth/login'
);
export const REFRESH_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_AUTH_REFRESH_URL,
	'ORDS_AUTH_REFRESH_URL',
	'/auth/refresh'
);
export const LOGOUT_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_AUTH_LOGOUT_URL,
	'ORDS_AUTH_LOGOUT_URL',
	'/auth/logout'
);
export const CHANGE_PASSWORD_URL =
	resolveOrdsApiUrl(
		import.meta.env.ORDS_AUTH_CHANGE_PASSWORD_URL,
		'ORDS_AUTH_CHANGE_PASSWORD_URL',
		'/auth/change-password'
	);

const ORGANIZATION_CACHE_COOKIE_KEYS = {
	id: 'org_id',
	name: 'org_name',
	slug: 'org_slug',
	logoUrl: 'org_logo_url',
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

export interface ChangePasswordPayload {
	current_password: string;
	new_password: string;
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

export const changePasswordWithOrds = async (token: string, payload: ChangePasswordPayload) => {
	if (!token) {
		throw new AuthApiError('Token de acceso requerido.', 401);
	}

	const response = await fetch(CHANGE_PASSWORD_URL, {
		method: 'PUT',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});

	const data = await parseBasicResponse(response);
	return {
		message:
			typeof data.message === 'string' && data.message.trim()
				? data.message
				: 'Tu contraseña se actualizó correctamente.',
	};
};

const ACCESS_TOKEN_MAX_AGE_SECONDS = 60 * 60;
const REFRESH_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const UI_CACHE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const isProduction = import.meta.env.PROD;

const getSessionCookieBaseOptions = () => ({
	httpOnly: true,
	secure: isProduction,
	sameSite: 'lax' as const,
	path: '/',
});

const getUiCacheCookieBaseOptions = () => ({
	httpOnly: false,
	secure: isProduction,
	sameSite: 'lax' as const,
	path: '/',
	maxAge: UI_CACHE_COOKIE_MAX_AGE_SECONDS,
});

export const setSessionCookies = (
	cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void },
	_url: URL,
	session: AuthSuccessResponse
) => {
	const baseOptions = getSessionCookieBaseOptions();

	cookies.set('access_token', session.access_token, {
		...baseOptions,
		maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
	});

	cookies.set('refresh_token', session.refresh_token, {
		...baseOptions,
		maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
	});
};

export const setOrganizationCacheCookies = (
	cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void },
	_url: URL,
	organization: {
		id_organization: number;
		name: string;
		profile_slug?: string | null;
		logo_url?: string | null;
	}
) => {
	const baseOptions = getUiCacheCookieBaseOptions();
	const safeName = String(organization.name || '').trim();
	const safeSlug = String(organization.profile_slug || '').trim();
	const safeLogoUrl = String(organization.logo_url || '').trim();

	cookies.set(ORGANIZATION_CACHE_COOKIE_KEYS.id, String(organization.id_organization || 0), baseOptions);
	cookies.set(ORGANIZATION_CACHE_COOKIE_KEYS.name, safeName, baseOptions);
	cookies.set(ORGANIZATION_CACHE_COOKIE_KEYS.slug, safeSlug, baseOptions);
	cookies.set(ORGANIZATION_CACHE_COOKIE_KEYS.logoUrl, safeLogoUrl, baseOptions);
};

export const clearSessionCookies = (
	cookies: { delete: (name: string, options?: Record<string, unknown>) => void }
) => {
	cookies.delete('access_token', { path: '/' });
	cookies.delete('refresh_token', { path: '/' });
	cookies.delete(ORGANIZATION_CACHE_COOKIE_KEYS.id, { path: '/' });
	cookies.delete(ORGANIZATION_CACHE_COOKIE_KEYS.name, { path: '/' });
	cookies.delete(ORGANIZATION_CACHE_COOKIE_KEYS.slug, { path: '/' });
	cookies.delete(ORGANIZATION_CACHE_COOKIE_KEYS.logoUrl, { path: '/' });
};

export const isPublicPath = (pathname: string) => {
	return (
		pathname === '/' ||
		pathname.startsWith('/auth') ||
		pathname.startsWith('/api/auth') ||
		pathname.startsWith('/api/public') ||
		pathname === '/p' ||
		pathname.startsWith('/p/') ||
		pathname.startsWith('/_astro') ||
		pathname === '/favicon.ico' ||
		pathname === '/favicon.svg'
	);
};
