import { resolveOrdsApiUrl } from './env-urls';

export const LOGIN_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_AUTH_LOGIN_URL,
	'ORDS_AUTH_LOGIN_URL',
	'/auth/login'
);
export const SELECT_ORGANIZATION_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_AUTH_SELECT_ORG_URL,
	'ORDS_AUTH_SELECT_ORG_URL',
	'/auth/select-organization'
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
export const REGISTER_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_AUTH_REGISTER_URL,
	'ORDS_AUTH_REGISTER_URL',
	'/auth/register'
);
export const FORGOT_PASSWORD_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_FORGOT_PASSWORD_URL,
	'ORDS_FORGOT_PASSWORD_URL',
	'/auth/forgot-password'
);
export const RESET_PASSWORD_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_RESET_PASSWORD_URL,
	'ORDS_RESET_PASSWORD_URL',
	'/auth/reset-password'
);
export const VERIFY_EMAIL_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_VERIFY_EMAIL_URL,
	'ORDS_VERIFY_EMAIL_URL',
	'/auth/verify-email'
);
export const GET_INVITATION_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_AUTH_GET_INVITATION_URL,
	'ORDS_AUTH_GET_INVITATION_URL',
	'/auth/invitation'
);
export const ACCEPT_INVITATION_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_AUTH_ACCEPT_INVITATION_URL,
	'ORDS_AUTH_ACCEPT_INVITATION_URL',
	'/auth/accept-invitation'
);
export const RESEND_VERIFICATION_CODE_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_RESEND_VERIFICATION_CODE_URL,
	'ORDS_RESEND_VERIFICATION_CODE_URL',
	'/auth/resend-verification-code'
);
export const ORG_SPECIALTIES_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_ORG_SPECIALTIES_URL,
	'ORDS_ORG_SPECIALTIES_URL',
	'/organization/specialties'
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
	role?: string;
	access_token: string;
	refresh_token: string;
	expires_in: number;
	selection_required?: number;
}

export interface OrganizationLoginOption {
	org_member_id: number;
	organization_id: number;
	organization_name: string;
	role_id: number;
	role_name: string;
}

export interface LoginSelectionResponse {
	status: 'success';
	message: string;
	selection_required: 1;
	selection_token: string;
	organizations: OrganizationLoginOption[];
}

export type LoginResult = AuthSuccessResponse | LoginSelectionResponse;

export const ORG_SELECTION_COOKIE = 'org_selection_ctx';
const ORG_SELECTION_MAX_AGE_SECONDS = 60 * 10;

export interface AuthFieldError {
	field: string;
	message: string;
}

export interface RegisterPayload {
	business_name: string;
	phone?: string;
	email: string;
	password: string;
	first_name: string;
	last_name: string;
	company_email: string;
	id_org_specialty: number;
}

export interface OrgSpecialtyOption {
	id_org_specialty: number;
	name: string;
	description: string;
}

export interface RegisterSuccessResponse {
	status: 'success';
	message: string;
	organization_id?: number;
	user_id?: number;
	professional_id?: number;
}

export interface ForgotPasswordPayload {
	email: string;
}

export interface ResetPasswordPayload {
	token: string;
	new_password: string;
}

export interface InvitationPreview {
	organization_name: string;
	email: string;
	first_name: string;
	last_name: string;
	expires_at_label: string;
	login_required: boolean;
}

export interface AcceptInvitationPayload {
	token: string;
	password?: string;
	first_name?: string;
	last_name?: string;
}

export interface VerifyEmailPayload {
	email: string;
	code: string;
}

export interface ResendVerificationCodePayload {
	email: string;
}

interface AuthFailureResponse {
	status?: string;
	error?: unknown;
	message?: string;
	details?: unknown;
	errors?: unknown;
	fieldErrors?: unknown;
	email_verification_required?: number | boolean;
	email?: string;
	error_code?: string;
}

export type AuthApiErrorOptions = {
	emailVerificationRequired?: boolean;
	verificationEmail?: string;
	loginRequired?: boolean;
};

interface OrgSpecialtiesSuccessResponse {
	status: 'success';
	data?: unknown;
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
	emailVerificationRequired: boolean;
	verificationEmail: string;
	loginRequired: boolean;

	constructor(
		message: string,
		status = 400,
		details?: unknown,
		fieldErrors: AuthFieldError[] = [],
		options: AuthApiErrorOptions = {}
	) {
		super(message);
		this.name = 'AuthApiError';
		this.status = status;
		this.details = details;
		this.fieldErrors = fieldErrors;
		this.emailVerificationRequired = Boolean(options.emailVerificationRequired);
		this.verificationEmail = String(options.verificationEmail || '').trim();
		this.loginRequired = Boolean(options.loginRequired);
	}
}

const parseFieldErrors = (value: unknown): AuthFieldError[] => {
	if (!Array.isArray(value)) return [];

	return value.flatMap((item) => {
		if (!item || typeof item !== 'object') return [];

		const field = 'field' in item ? String(item.field || '').trim().toLowerCase() : '';
		const message = 'message' in item ? String(item.message || '').trim() : '';

		if (!field || !message) return [];

		return [{ field, message }];
	});
};

const getFailureMessage = (failureData: AuthFailureResponse, fallbackMessage: string) => {
	const candidates = [failureData.message, failureData.error];

	for (const candidate of candidates) {
		if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
	}

	return fallbackMessage;
};

const getFailureDetails = (failureData: AuthFailureResponse, fallbackDetails?: unknown) =>
	failureData.details ?? fallbackDetails;

const getFailureFieldErrors = (failureData: AuthFailureResponse) =>
	parseFieldErrors(failureData.errors ?? failureData.fieldErrors);

const isEmailVerificationDetails = (details: unknown) => {
	const text = String(details || '').toLowerCase();
	return text.includes('verificar tu correo') || text.includes('verificar tu correo electr');
};

const getEmailVerificationFailureOptions = (
	failureData: AuthFailureResponse
): AuthApiErrorOptions => {
	const emailVerificationRequired =
		failureData.email_verification_required === 1 ||
		failureData.email_verification_required === true ||
		failureData.error_code === 'EMAIL_NOT_VERIFIED' ||
		isEmailVerificationDetails(failureData.details);

	if (!emailVerificationRequired) {
		return { emailVerificationRequired: false, verificationEmail: '' };
	}

	const verificationEmail =
		typeof failureData.email === 'string' && failureData.email.trim()
			? failureData.email.trim()
			: '';

	return { emailVerificationRequired: true, verificationEmail };
};

export const isEmailVerificationRequiredError = (error: unknown) =>
	error instanceof AuthApiError && error.emailVerificationRequired;

export const resolveVerificationEmailFromAuthError = (error: AuthApiError, identifier = '') => {
	if (error.verificationEmail) return error.verificationEmail;

	const identifierValue = String(identifier || '').trim();
	if (identifierValue.includes('@')) return identifierValue;

	return '';
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

const isLoginSelectionResponse = (value: unknown): value is LoginSelectionResponse => {
	if (!value || typeof value !== 'object') return false;
	const record = value as Record<string, unknown>;
	return (
		record.status === 'success' &&
		(record.selection_required === 1 || record.selection_required === true) &&
		typeof record.selection_token === 'string' &&
		Array.isArray(record.organizations)
	);
};

const normalizeOrganizationOption = (value: unknown): OrganizationLoginOption | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const orgMemberId = Number(source.org_member_id ?? 0);
	const organizationId = Number(source.organization_id ?? 0);
	const organizationName = String(source.organization_name || '').trim();
	const roleId = Number(source.role_id ?? 0);
	const roleName = String(source.role_name || '').trim();
	if (!orgMemberId || !organizationId || !organizationName) return null;
	return {
		org_member_id: orgMemberId,
		organization_id: organizationId,
		organization_name: organizationName,
		role_id: roleId,
		role_name: roleName,
	};
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
		const fieldErrors = getFailureFieldErrors(failureData);
		throw new AuthApiError(
			getFailureMessage(failureData, 'No fue posible autenticar la solicitud.'),
			response.status || 400,
			getFailureDetails(failureData),
			fieldErrors,
			getEmailVerificationFailureOptions(failureData)
		);
	}

	return data;
};

const parseRegisterResponseText = (responseText: string) => {
	const trimmedBody = responseText.trim();
	if (!trimmedBody) return null;

	try {
		return JSON.parse(trimmedBody) as RegisterSuccessResponse | AuthFailureResponse;
	} catch {
		return null;
	}
};

const getRegisterErrorStatus = (response: Response, fallbackStatus: number) =>
	!response.ok && response.status ? response.status : fallbackStatus;

const buildRegisterError = (
	response: Response,
	responseText: string,
	data: RegisterSuccessResponse | AuthFailureResponse | null
) => {
	const failureData = data && typeof data === 'object' ? (data as AuthFailureResponse) : {};
	const rawDetails = responseText.trim();
	const fieldErrors = getFailureFieldErrors(failureData);
	const message = getFailureMessage(
		failureData,
		rawDetails || 'No fue posible completar el registro.'
	);
	const details = getFailureDetails(failureData, rawDetails ? rawDetails : undefined);

	return new AuthApiError(message, getRegisterErrorStatus(response, 400), details, fieldErrors);
};

const parseRegisterResponse = (response: Response, responseText: string) => {
	const data = parseRegisterResponseText(responseText);

	if (!data) {
		const rawDetails = responseText.trim();
		throw new AuthApiError(
			rawDetails || 'No fue posible interpretar la respuesta del servidor de registro.',
			getRegisterErrorStatus(response, 502),
			rawDetails || undefined
		);
	}

	if (!response.ok || !data || typeof data !== 'object' || data.status !== 'success') {
		throw buildRegisterError(response, responseText, data);
	}

	return data as RegisterSuccessResponse;
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
			getFailureMessage(failureData, 'No fue posible completar la solicitud.'),
			response.status || 400,
			getFailureDetails(failureData)
		);
	}

	return data;
};

const parseStatusResponseWithFields = async (
	response: Response,
	fallbackMessage: string,
	debugLabel = 'ORDS auth status'
): Promise<{ message: string }> => {
	let data: BasicSuccessResponse | AuthFailureResponse | null = null;
	const responseText = await response.text();

	try {
		data = responseText.trim()
			? (JSON.parse(responseText) as BasicSuccessResponse | AuthFailureResponse)
			: null;
	} catch {
		console.error(`[${debugLabel}] Respuesta no JSON`, {
			status: response.status,
			statusText: response.statusText,
			url: response.url,
			contentType: response.headers.get('content-type'),
			body: responseText,
		});
		throw new AuthApiError(
			'No fue posible interpretar la respuesta del servidor.',
			502,
			responseText || undefined
		);
	}

	if (!response.ok || !data || typeof data !== 'object' || data.status !== 'success') {
		const failureData = (data ?? {}) as AuthFailureResponse;
		console.error(`[${debugLabel}] Error del backend`, {
			status: response.status,
			statusText: response.statusText,
			url: response.url,
			contentType: response.headers.get('content-type'),
			body: responseText,
		});
		throw new AuthApiError(
			getFailureMessage(failureData, fallbackMessage),
			response.status || 400,
			getFailureDetails(failureData),
			getFailureFieldErrors(failureData)
		);
	}

	return {
		message:
			typeof data.message === 'string' && data.message.trim()
				? data.message
				: fallbackMessage,
	};
};

const parseLoginResponse = async (response: Response): Promise<LoginResult> => {
	let data: AuthSuccessResponse | LoginSelectionResponse | AuthFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new AuthApiError('No fue posible interpretar la respuesta del servidor de autenticacion.', 502);
	}

	if (!response.ok) {
		const failureData = (data ?? {}) as AuthFailureResponse;
		const fieldErrors = getFailureFieldErrors(failureData);
		throw new AuthApiError(
			getFailureMessage(failureData, 'No fue posible autenticar la solicitud.'),
			response.status || 400,
			getFailureDetails(failureData),
			fieldErrors,
			getEmailVerificationFailureOptions(failureData)
		);
	}

	if (isLoginSelectionResponse(data)) {
		const organizations = data.organizations
			.map(normalizeOrganizationOption)
			.filter((item): item is OrganizationLoginOption => item !== null);
		if (organizations.length < 2) {
			throw new AuthApiError('No fue posible obtener las organizaciones disponibles.', 502);
		}
		return {
			...data,
			organizations,
		};
	}

	if (!isSuccessResponse(data)) {
		const failureData = (data ?? {}) as AuthFailureResponse;
		throw new AuthApiError(
			getFailureMessage(failureData, 'No fue posible autenticar la solicitud.'),
			response.status || 400,
			getFailureDetails(failureData),
			getFailureFieldErrors(failureData),
			getEmailVerificationFailureOptions(failureData)
		);
	}

	return data;
};

export const isLoginSelectionResult = (value: LoginResult): value is LoginSelectionResponse =>
	isLoginSelectionResponse(value);

export const loginWithOrds = async (payload: {
	email: string;
	password: string;
	org_member_id?: number;
}) => {
	const response = await fetch(LOGIN_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			username: payload.email,
			email: payload.email,
			password: payload.password,
			...(payload.org_member_id ? { org_member_id: payload.org_member_id } : {}),
		}),
	});

	return parseLoginResponse(response);
};

export const selectOrganizationWithOrds = async (payload: {
	selection_token: string;
	org_member_id: number;
}) => {
	const response = await fetch(SELECT_ORGANIZATION_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(payload),
	});

	return parseAuthResponse(response);
};

export type OrgSelectionContext = {
	selection_token: string;
	organizations: OrganizationLoginOption[];
	redirectTo: string;
};

export const setOrgSelectionCookie = (
	cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void },
	context: OrgSelectionContext
) => {
	cookies.set(ORG_SELECTION_COOKIE, JSON.stringify(context), {
		...getSessionCookieBaseOptions(),
		maxAge: ORG_SELECTION_MAX_AGE_SECONDS,
	});
};

export const getOrgSelectionCookie = (
	cookies: { get: (name: string) => { value?: string } | undefined }
): OrgSelectionContext | null => {
	const raw = String(cookies.get(ORG_SELECTION_COOKIE)?.value || '').trim();
	if (!raw) return null;

	try {
		const parsed = JSON.parse(raw) as Partial<OrgSelectionContext>;
		const selectionToken = String(parsed.selection_token || '').trim();
		const redirectTo = String(parsed.redirectTo || '').trim();
		const organizations = Array.isArray(parsed.organizations)
			? parsed.organizations
					.map(normalizeOrganizationOption)
					.filter((item): item is OrganizationLoginOption => item !== null)
			: [];
		if (!selectionToken || organizations.length < 2) return null;
		return {
			selection_token: selectionToken,
			organizations,
			redirectTo,
		};
	} catch {
		return null;
	}
};

export const clearOrgSelectionCookie = (
	cookies: { delete: (name: string, options?: Record<string, unknown>) => void }
) => {
	cookies.delete(ORG_SELECTION_COOKIE, { path: '/' });
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

export const registerWithOrds = async (payload: RegisterPayload) => {
	const response = await fetch(REGISTER_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});
	const responseText = await response.text();

	if (!response.ok) {
		console.error('[ORDS register] Backend error', {
			status: response.status,
			body: responseText,
		});
	}

	return parseRegisterResponse(response, responseText);
};

export const forgotPasswordWithOrds = async (payload: ForgotPasswordPayload) => {
	const response = await fetch(FORGOT_PASSWORD_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});

	return parseStatusResponseWithFields(
		response,
		'No fue posible iniciar la recuperación de contraseña.',
		'ORDS forgot-password'
	);
};

export const resetPasswordWithOrds = async (payload: ResetPasswordPayload) => {
	const response = await fetch(RESET_PASSWORD_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});

	return parseStatusResponseWithFields(
		response,
		'No fue posible actualizar tu contraseña.',
		'ORDS reset-password'
	);
};

export const verifyEmailWithOrds = async (payload: VerifyEmailPayload) => {
	const response = await fetch(VERIFY_EMAIL_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});

	return parseStatusResponseWithFields(
		response,
		'No fue posible verificar tu correo electrónico.',
		'ORDS verify-email'
	);
};

export const getInvitationWithOrds = async (token: string): Promise<InvitationPreview> => {
	const response = await fetch(GET_INVITATION_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify({ token }),
	});

	const responseText = await response.text();
	let data: Record<string, unknown> | null = null;
	try {
		data = responseText.trim() ? (JSON.parse(responseText) as Record<string, unknown>) : null;
	} catch {
		throw new AuthApiError('No fue posible interpretar la respuesta del servidor.', 502, responseText);
	}

	if (!response.ok || !data || data.status !== 'success') {
		const message =
			String(data?.message || data?.error || '').trim() ||
			'No fue posible cargar la invitación.';
		throw new AuthApiError(message, response.status || 400);
	}

	return {
		organization_name: String(data.organization_name || '').trim(),
		email: String(data.email || '').trim(),
		first_name: String(data.first_name || '').trim(),
		last_name: String(data.last_name || '').trim(),
		expires_at_label: String(data.expires_at_label || '').trim(),
		login_required:
			data.login_required === 1 || data.login_required === true || data.login_required === '1',
	};
};

export const acceptInvitationWithOrds = async (
	authHeader: string | undefined,
	payload: AcceptInvitationPayload
) => {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		Accept: 'application/json',
	};
	if (authHeader?.trim()) {
		headers.Authorization = authHeader.startsWith('Bearer ')
			? authHeader.trim()
			: `Bearer ${authHeader.trim()}`;
	}

	const response = await fetch(ACCEPT_INVITATION_URL, {
		method: 'POST',
		headers,
		body: JSON.stringify(payload),
	});

	const responseText = await response.text();
	let data: Record<string, unknown> | null = null;
	try {
		data = responseText.trim() ? (JSON.parse(responseText) as Record<string, unknown>) : null;
	} catch {
		data = null;
	}

	if (!response.ok) {
		const loginRequired =
			data?.login_required === 1 || data?.login_required === true || data?.login_required === '1';
		const message =
			String(data?.message || data?.error || '').trim() ||
			'No fue posible aceptar la invitación.';
		throw new AuthApiError(message, response.status, undefined, [], {
			loginRequired,
		});
	}

	return data;
};

export const resendVerificationCodeWithOrds = async (payload: ResendVerificationCodePayload) => {
	const response = await fetch(RESEND_VERIFICATION_CODE_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});

	return parseStatusResponseWithFields(
		response,
		'No fue posible reenviar el código de verificación.',
		'ORDS resend-verification-code'
	);
};

const normalizeOrgSpecialty = (value: unknown): OrgSpecialtyOption | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const specialtyId = Number(source.id_org_specialty);
	if (!Number.isFinite(specialtyId) || specialtyId <= 0) return null;

	const name = String(source.name || '').trim();
	if (!name) return null;

	return {
		id_org_specialty: specialtyId,
		name,
		description: String(source.description || '').trim(),
	};
};

const isOrgSpecialtiesSuccessResponse = (value: unknown): value is OrgSpecialtiesSuccessResponse => {
	return Boolean(value && typeof value === 'object' && 'status' in value && value.status === 'success');
};

export const listOrgSpecialtiesWithOrds = async (): Promise<OrgSpecialtyOption[]> => {
	const response = await fetch(ORG_SPECIALTIES_URL, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
		},
	});

	let data: OrgSpecialtiesSuccessResponse | AuthFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new AuthApiError('No fue posible interpretar la respuesta del catalogo de especialidades.', 502);
	}

	if (!response.ok || !isOrgSpecialtiesSuccessResponse(data)) {
		const failureData = (data ?? {}) as AuthFailureResponse;
		throw new AuthApiError(
			getFailureMessage(failureData, 'No fue posible obtener las especialidades de la organizacion.'),
			response.status || 400,
			getFailureDetails(failureData),
			getFailureFieldErrors(failureData)
		);
	}

	const rawItems = Array.isArray(data.data) ? data.data : [];
	return rawItems
		.map(normalizeOrgSpecialty)
		.filter((specialty): specialty is OrgSpecialtyOption => specialty !== null);
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
	cookies.delete('fcm_prompt_pending', { path: '/' });
	cookies.delete('fcm_device_token', { path: '/' });
	cookies.delete(ORGANIZATION_CACHE_COOKIE_KEYS.id, { path: '/' });
	cookies.delete(ORGANIZATION_CACHE_COOKIE_KEYS.name, { path: '/' });
	cookies.delete(ORGANIZATION_CACHE_COOKIE_KEYS.slug, { path: '/' });
	cookies.delete(ORGANIZATION_CACHE_COOKIE_KEYS.logoUrl, { path: '/' });
	clearOrgSelectionCookie(cookies);
};

export const isPublicPath = (pathname: string) => {
	return (
		pathname === '/' ||
		pathname === '/politicas-y-privacidad' ||
		pathname.startsWith('/auth') ||
		pathname.startsWith('/api/auth') ||
		pathname.startsWith('/api/public') ||
		pathname === '/p' ||
		pathname.startsWith('/p/') ||
		pathname === '/r' ||
		pathname.startsWith('/r/') ||
		pathname.startsWith('/_astro') ||
		pathname === '/favicon.ico' ||
		pathname === '/favicon.svg'
	);
};
