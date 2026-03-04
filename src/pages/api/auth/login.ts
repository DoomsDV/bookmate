import type { APIRoute } from 'astro';

import { AuthApiError, loginWithOrds, setSessionCookies } from '../../../lib/auth';

const mapFieldParamName = (field: string) => {
	if (field === 'username' || field === 'email' || field === 'identifier') return 'identifier_error';
	if (field === 'password') return 'password_error';
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
		const body = await request.json();
		return {
			identifier: String(body.identifier || body.email || body.username || '').trim(),
			password: String(body.password || ''),
		};
	}

	const formData = await request.formData();
	return {
		identifier: String(formData.get('identifier') || formData.get('email') || '').trim(),
		password: String(formData.get('password') || ''),
	};
};

export const POST: APIRoute = async ({ request, cookies, url }) => {
	let identifier = '';

	try {
		const parsedBody = await parseBody(request);
		identifier = parsedBody.identifier;
		const { password } = parsedBody;

		if (!identifier || !password) {
			throw new AuthApiError('Debes completar correo y contrasena.', 400);
		}

		const session = await loginWithOrds({ email: identifier, password });
		setSessionCookies(cookies, url, session);

		if (wantsHtml(request)) {
			return new Response(null, {
				status: 302,
				headers: {
					Location: '/',
				},
			});
		}

		return Response.json({ success: true, redirect: '/' });
	} catch (error) {
		const authError =
			error instanceof AuthApiError
				? error
				: new AuthApiError('Ocurrio un error inesperado al iniciar sesion.', 500);
		const fieldErrors = authError.fieldErrors;

		if (wantsHtml(request)) {
			const redirectUrl = new URL('/login', url);
			redirectUrl.searchParams.set(
				'error',
				typeof authError.details === 'string' && authError.details.trim()
					? authError.details
					: authError.message
			);

			if (identifier) {
				redirectUrl.searchParams.set('identifier', identifier);
			}

			for (const fieldError of fieldErrors) {
				const fieldName = mapFieldParamName(fieldError.field);

				if (fieldName) {
					redirectUrl.searchParams.set(fieldName, fieldError.message);
				}
			}

			return new Response(null, {
				status: 302,
				headers: {
					Location: redirectUrl.toString(),
				},
			});
		}

		return Response.json(
			{
				error: authError.message,
				details: authError.details,
				fieldErrors,
			},
			{ status: authError.status }
		);
	}
};
