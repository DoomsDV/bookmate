import type { APIRoute } from 'astro';

import { AuthApiError, resetPasswordWithOrds } from '../../../lib/auth';

const FLASH_MESSAGE_COOKIE = 'bookmate_flash_message';
const FLASH_TYPE_COOKIE = 'bookmate_flash_type';

const withQuery = (path: string, params: URLSearchParams) => {
	const queryString = params.toString();
	return queryString ? `${path}?${queryString}` : path;
};

const buildFlashCookie = (name: string, value: string) =>
	`${name}=${encodeURIComponent(value)}; Path=/; Max-Age=60; SameSite=Lax; HttpOnly`;

const toSafeStatus = (status: number) =>
	Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;

const mapFieldParamName = (field: string) => {
	const normalizedField = String(field || '').trim().toLowerCase();
	if (normalizedField === 'new_password') return 'new_password_error';
	if (normalizedField === 'password') return 'new_password_error';
	if (normalizedField === 'confirm_password') return 'confirm_password_error';
	if (normalizedField === 'confirmpassword') return 'confirm_password_error';
	return '';
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
				token: String(payload.token || '').trim(),
				new_password: String(payload.new_password || ''),
				confirm_password: String(payload.confirm_password || ''),
			};
		} catch {
			throw new AuthApiError('JSON inválido o malformado.', 400);
		}
	}

	try {
		const formData = await request.formData();
		return {
			token: String(formData.get('token') || '').trim(),
			new_password: String(formData.get('new_password') || ''),
			confirm_password: String(formData.get('confirm_password') || ''),
		};
	} catch {
		throw new AuthApiError('No fue posible leer los datos enviados.', 400);
	}
};

const getPasswordValidationMessage = (rawPassword: string) => {
	const password = String(rawPassword || '');
	if (password.trim().length < 8) {
		return 'La contraseña debe tener al menos 8 caracteres.';
	}
	if (!/[A-Z]/.test(password)) {
		return 'La contraseña debe contener al menos una letra mayúscula.';
	}
	if (!/[0-9]/.test(password)) {
		return 'La contraseña debe contener al menos un número.';
	}
	return '';
};

export const POST: APIRoute = async ({ request }) => {
	let token = '';

	try {
		const body = await parseBody(request);
		token = body.token;

		const localFieldErrors: Array<{ field: string; message: string }> = [];

		if (!token) {
			localFieldErrors.push({ field: 'token', message: 'El token es obligatorio.' });
		}

		const passwordMessage = getPasswordValidationMessage(body.new_password);
		if (passwordMessage) {
			localFieldErrors.push({ field: 'new_password', message: passwordMessage });
		}

		if (!body.confirm_password) {
			localFieldErrors.push({ field: 'confirm_password', message: 'Debes confirmar tu contraseña.' });
		} else if (body.confirm_password !== body.new_password) {
			localFieldErrors.push({ field: 'confirm_password', message: 'Las contraseñas no coinciden.' });
		}

		if (localFieldErrors.length > 0) {
			throw new AuthApiError(
				'Por favor, corrige los errores del formulario.',
				400,
				undefined,
				localFieldErrors
			);
		}

		const response = await resetPasswordWithOrds({
			token,
			new_password: body.new_password,
		});

		if (wantsHtml(request)) {
			const headers = new Headers({
				Location: '/auth/login',
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
			},
			{ status: 200 }
		);
	} catch (error) {
		const authError =
			error instanceof AuthApiError
				? error
				: new AuthApiError('No fue posible actualizar la contraseña.', 500);

		if (wantsHtml(request)) {
			const redirectParams = new URLSearchParams();
			if (token) {
				redirectParams.set('token', token);
			}

			redirectParams.set('error', authError.message);

			for (const fieldError of authError.fieldErrors) {
				const fieldName = mapFieldParamName(fieldError.field);
				if (fieldName) {
					redirectParams.set(fieldName, fieldError.message);
				}
			}

			return new Response(null, {
				status: 302,
				headers: {
					Location: withQuery('/auth/reset-password', redirectParams),
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
		const redirectParams = new URLSearchParams();
		const token = new URL(request.url).searchParams.get('token') || '';
		if (token) {
			redirectParams.set('token', token);
		}

		return new Response(null, {
			status: 302,
			headers: {
				Location: withQuery('/auth/reset-password', redirectParams),
			},
		});
	}

	return Response.json(
		{
			error: 'Metodo no permitido para este endpoint.',
			redirect: '/auth/reset-password',
		},
		{ status: 405 }
	);
};
