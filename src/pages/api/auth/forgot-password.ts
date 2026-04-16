import type { APIRoute } from 'astro';

import { AuthApiError, forgotPasswordWithOrds } from '../../../lib/auth';

const mapFieldParamName = (field: string) => {
	const normalizedField = String(field || '').trim().toLowerCase();
	if (normalizedField === 'email') return 'email_error';
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
			email: String(body.email || '').trim(),
		};
	}

	const formData = await request.formData();
	return {
		email: String(formData.get('email') || '').trim(),
	};
};

export const POST: APIRoute = async ({ request, url }) => {
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

		const response = await forgotPasswordWithOrds({ email });

		if (wantsHtml(request)) {
			const redirectUrl = new URL('/auth/login', url);
			redirectUrl.searchParams.set('flash_message', response.message);
			redirectUrl.searchParams.set('flash_type', 'info');

			return new Response(null, {
				status: 302,
				headers: {
					Location: redirectUrl.toString(),
				},
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
				: new AuthApiError('No fue posible iniciar la recuperación de contraseña.', 500);

		if (wantsHtml(request)) {
			const redirectUrl = new URL('/auth/forgot-password', url);
			redirectUrl.searchParams.set(
				'error',
				typeof authError.details === 'string' && authError.details.trim()
					? authError.details
					: authError.message
			);

			if (email) {
				redirectUrl.searchParams.set('email', email);
			}

			for (const fieldError of authError.fieldErrors) {
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
				status: 'error',
				message: authError.message,
				details: authError.details,
				errors: authError.fieldErrors,
			},
			{ status: authError.status }
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
