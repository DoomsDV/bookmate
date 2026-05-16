import type { APIRoute } from 'astro';

import {
	AuthApiError,
	resendVerificationCodeWithOrds,
	verifyEmailWithOrds,
} from '../../../lib/auth';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFY_ACTION = 'verify';
const RESEND_ACTION = 'resend';
const FLASH_MESSAGE_COOKIE = 'bookmate_flash_message';
const FLASH_TYPE_COOKIE = 'bookmate_flash_type';

const buildFlashCookie = (name: string, value: string) =>
	`${name}=${encodeURIComponent(value)}; Path=/; Max-Age=60; SameSite=Lax; HttpOnly`;

const toSafeStatus = (status: number) =>
	Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;

const withQuery = (path: string, params: URLSearchParams) => {
	const queryString = params.toString();
	return queryString ? `${path}?${queryString}` : path;
};

const wantsHtml = (request: Request) => {
	const accept = request.headers.get('accept') || '';
	const contentType = request.headers.get('content-type') || '';

	return accept.includes('text/html') || contentType.includes('application/x-www-form-urlencoded');
};

const mapFieldParamName = (field: string) => {
	const normalizedField = String(field || '').trim().toLowerCase();
	if (normalizedField === 'email') return 'email_error';
	if (normalizedField === 'code') return 'code_error';
	return '';
};

const normalizeAction = (value: unknown) =>
	String(value || '').trim().toLowerCase() === RESEND_ACTION ? RESEND_ACTION : VERIFY_ACTION;

const parseBody = async (request: Request) => {
	const contentType = request.headers.get('content-type') || '';

	if (contentType.includes('application/json')) {
		try {
			const body = await request.json();
			const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
			return {
				action: normalizeAction(payload.action),
				email: String(payload.email || '').trim(),
				code: String(payload.code || '').trim(),
			};
		} catch {
			throw new AuthApiError('JSON inválido o malformado.', 400);
		}
	}

	try {
		const formData = await request.formData();
		return {
			action: normalizeAction(formData.get('action')),
			email: String(formData.get('email') || '').trim(),
			code: String(formData.get('code') || '').trim(),
		};
	} catch {
		throw new AuthApiError('No fue posible leer los datos enviados.', 400);
	}
};

const validateEmail = (email: string) => {
	if (!email) {
		throw new AuthApiError(
			'El correo electrónico es obligatorio.',
			400,
			undefined,
			[{ field: 'email', message: 'El correo electrónico es obligatorio.' }]
		);
	}

	if (!EMAIL_PATTERN.test(email)) {
		throw new AuthApiError(
			'Ingresa un correo electrónico válido.',
			400,
			undefined,
			[{ field: 'email', message: 'Ingresa un correo electrónico válido.' }]
		);
	}
};

const validateCode = (code: string) => {
	if (!/^\d{6}$/.test(code)) {
		throw new AuthApiError(
			'El código debe tener 6 dígitos.',
			400,
			undefined,
			[{ field: 'code', message: 'El código debe tener 6 dígitos.' }]
		);
	}
};

const buildErrorRedirect = (email: string, error: AuthApiError) => {
	const redirectParams = new URLSearchParams();
	redirectParams.set('error', error.message);

	if (email) {
		redirectParams.set('email', email);
	}

	for (const fieldError of error.fieldErrors) {
		const fieldName = mapFieldParamName(fieldError.field);
		if (fieldName) {
			redirectParams.set(fieldName, fieldError.message);
		}
	}

	return withQuery('/auth/verify-email', redirectParams);
};

export const POST: APIRoute = async ({ request }) => {
	let email = '';
	let action: typeof VERIFY_ACTION | typeof RESEND_ACTION = VERIFY_ACTION;

	try {
		const body = await parseBody(request);
		email = body.email;
		action = body.action;

		validateEmail(email);

		if (action === RESEND_ACTION) {
			const response = await resendVerificationCodeWithOrds({ email });

			if (wantsHtml(request)) {
				const redirectParams = new URLSearchParams({ email, resent: '1' });
				const headers = new Headers({
					Location: withQuery('/auth/verify-email', redirectParams),
				});
				headers.append('Set-Cookie', buildFlashCookie(FLASH_MESSAGE_COOKIE, response.message));
				headers.append('Set-Cookie', buildFlashCookie(FLASH_TYPE_COOKIE, 'info'));

				return new Response(null, {
					status: 302,
					headers,
				});
			}

			return Response.json(
				{
					status: 'success',
					message: response.message,
				},
				{ status: 200 }
			);
		}

		validateCode(body.code);

		const response = await verifyEmailWithOrds({
			email,
			code: body.code,
		});

		const redirectTo = `/auth/login?identifier=${encodeURIComponent(email)}&verified=1`;

		if (wantsHtml(request)) {
			const headers = new Headers({
				Location: redirectTo,
			});
			headers.append('Set-Cookie', buildFlashCookie(FLASH_MESSAGE_COOKIE, response.message));
			headers.append('Set-Cookie', buildFlashCookie(FLASH_TYPE_COOKIE, 'success'));

			return new Response(null, {
				status: 302,
				headers,
			});
		}

		return Response.json(
			{
				status: 'success',
				message: response.message,
				redirect: redirectTo,
			},
			{ status: 200 }
		);
	} catch (error) {
		const authError =
			error instanceof AuthApiError
				? error
				: new AuthApiError('No fue posible verificar tu correo electrónico.', 500);

		if (wantsHtml(request)) {
			return new Response(null, {
				status: 302,
				headers: {
					Location: buildErrorRedirect(email, authError),
				},
			});
		}

		return Response.json(
			{
				status: 'error',
				message: authError.message,
				details: authError.details,
				errors: authError.fieldErrors,
			},
			{ status: toSafeStatus(authError.status) }
		);
	}
};

export const GET: APIRoute = async ({ request }) => {
	if (wantsHtml(request)) {
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/auth/verify-email',
			},
		});
	}

	return Response.json(
		{
			error: 'Metodo no permitido para este endpoint.',
			redirect: '/auth/verify-email',
		},
		{ status: 405 }
	);
};

