import type { APIRoute } from 'astro';

import { AuthApiError, revokeSessionWithOrds } from '../../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies, locals }) => {
	const token = String(locals.token || '').trim();
	if (!token) {
		return Response.json(
			{ status: 'error', message: 'No hay una sesión válida.' },
			{ status: 401 }
		);
	}

	let sessionFamily = '';
	try {
		const body = await request.json();
		sessionFamily = String(body?.session_family || '').trim();
	} catch {
		sessionFamily = '';
	}

	if (!sessionFamily) {
		return Response.json(
			{ status: 'error', message: 'Falta la sesión a cerrar.' },
			{ status: 400 }
		);
	}

	try {
		const refreshToken = String(cookies.get('refresh_token')?.value || '').trim();
		const result = await revokeSessionWithOrds(token, {
			session_family: sessionFamily,
			refresh_token: refreshToken,
		});
		return Response.json({
			status: 'success',
			message:
				typeof result.message === 'string' && result.message.trim()
					? result.message
					: 'Sesión cerrada correctamente.',
		});
	} catch (error) {
		const authError = error instanceof AuthApiError ? error : null;
		return Response.json(
			{
				status: 'error',
				message: authError?.message || 'No fue posible cerrar esa sesión.',
			},
			{ status: authError?.status || 500 }
		);
	}
};
