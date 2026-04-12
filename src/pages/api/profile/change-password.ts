import type { APIRoute } from 'astro';

import { AuthApiError, changePasswordWithOrds, type ChangePasswordPayload } from '../../../lib/auth';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new AuthApiError('No hay una sesión válida para cambiar tu contraseña.', 401);
	}
	return token;
};

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const authError = error instanceof AuthApiError ? error : new AuthApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: authError.message,
			details: authError.details,
			errors: authError.fieldErrors,
		},
		{ status: authError.status }
	);
};

const parseBody = async (request: Request) => {
	const contentType = request.headers.get('content-type') || '';
	if (contentType.includes('application/json')) {
		return request.json();
	}

	const formData = await request.formData();
	return {
		current_password: formData.get('current_password'),
		new_password: formData.get('new_password'),
	};
};

const parseChangePasswordPayload = (source: any): ChangePasswordPayload => {
	const currentPassword = String(source?.current_password ?? '').trim();
	const newPassword = String(source?.new_password ?? '').trim();

	if (!currentPassword || !newPassword) {
		throw new AuthApiError('Ingresa tu contraseña actual y la nueva contraseña.', 400);
	}

	return {
		current_password: currentPassword,
		new_password: newPassword,
	};
};

export const PUT: APIRoute = async ({ request, locals }) => {
	try {
		const token = requireToken(locals.token);
		const body = await parseBody(request);
		const payload = parseChangePasswordPayload(body);
		const updated = await changePasswordWithOrds(token, payload);

		return Response.json(
			{
				status: 'success',
				message: updated.message,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No pudimos actualizar tu contraseña. Intenta nuevamente.');
	}
};

