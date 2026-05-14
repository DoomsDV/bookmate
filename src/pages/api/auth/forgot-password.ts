import type { APIRoute } from 'astro';

import { AuthApiError, forgotPasswordWithOrds } from '../../../lib/auth';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FLASH_MESSAGE_COOKIE = 'bookmate_flash_message';
const FLASH_TYPE_COOKIE = 'bookmate_flash_type';
const FORGOT_PASSWORD_SUCCESS_MESSAGE =
	'Revisa tu bandeja de entrada. Encontrarás un enlace seguro con las instrucciones para crear tu nueva contraseña.';

const mapFieldParamName = (field: string) => {
	const normalizedField = String(field || '').trim().toLowerCase();
	if (normalizedField === 'email') return 'email_error';
	return '';
};

const toSafeStatus = (status: number) =>
	Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;

const buildFlashCookie = (name: string, value: string) =>
	`${name}=${encodeURIComponent(value)}; Path=/; Max-Age=60; SameSite=Lax; HttpOnly`;

const withQuery = (path: string, params: URLSearchParams) => {
	const queryString = params.toString();
	return queryString ? `${path}?${queryString}` : path;
};

const wantsHtml = (request: Request) => {
	const accept = request.headers.get('accept') || '';
	const contentType = request.headers.get('content-type') || '';

	return accept.includes('text/html') || contentType.includes('application/x-www-form-urlencoded');
};

const parseBody = async (request: Request) => {
	const contentType = request.headers.get('content-type') || '';

	if (contentType.includes('application/json')) {
		try {
			const body = await request.json();
			const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
			return {
				email: String(payload.email || '').trim(),
			};
		} catch {
			throw new AuthApiError('JSON inválido o malformado.', 400);
		}
	}

	try {
		const formData = await request.formData();
		return {
			email: String(formData.get('email') || '').trim(),
		};
	} catch {
		throw new AuthApiError('No fue posible leer los datos enviados.', 400);
	}
};

export const POST: APIRoute = async ({ request }) => {
	let email = '';

	try {
		const body = await parseBody(request);
		email = body.email;

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

		await forgotPasswordWithOrds({ email });

		if (wantsHtml(request)) {
			const headers = new Headers({
				Location: '/auth/login',
			});
			headers.append(
				'Set-Cookie',
				buildFlashCookie(FLASH_MESSAGE_COOKIE, FORGOT_PASSWORD_SUCCESS_MESSAGE)
			);
			headers.append('Set-Cookie', buildFlashCookie(FLASH_TYPE_COOKIE, 'info'));

			return new Response(null, {
				status: 302,
				headers,
			});
		}

		return Response.json(
			{
				status: 'success',
				message: FORGOT_PASSWORD_SUCCESS_MESSAGE,
			},
			{ status: 200 }
		);
	} catch (error) {
		const authError =
			error instanceof AuthApiError
				? error
				: new AuthApiError('No fue posible iniciar la recuperación de contraseña.', 500);

		console.error('[API forgot-password] Error procesando solicitud', {
			status: authError.status,
			message: authError.message,
			details: authError.details,
			fieldErrors: authError.fieldErrors,
		});

		if (wantsHtml(request)) {
			const redirectParams = new URLSearchParams();
			redirectParams.set('error', authError.message);

			if (email) {
				redirectParams.set('email', email);
			}

			for (const fieldError of authError.fieldErrors) {
				const fieldName = mapFieldParamName(fieldError.field);
				if (fieldName) {
					redirectParams.set(fieldName, fieldError.message);
				}
			}

			return new Response(null, {
				status: 302,
				headers: {
					Location: withQuery('/auth/forgot-password', redirectParams),
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
				Location: '/auth/forgot-password',
			},
		});
	}

	return Response.json(
		{
			error: 'Metodo no permitido para este endpoint.',
			redirect: '/auth/forgot-password',
		},
		{ status: 405 }
	);
};
