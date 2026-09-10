import type { APIRoute } from 'astro';

import { AuthApiError, listSessionsWithOrds } from '../../../lib/auth';

export const GET: APIRoute = async ({ cookies, locals }) => {
	const token = String(locals.token || '').trim();
	if (!token) {
		return Response.json(
			{ status: 'error', message: 'No hay una sesión válida.' },
			{ status: 401 }
		);
	}

	try {
		const refreshToken = String(cookies.get('refresh_token')?.value || '').trim();
		const sessions = await listSessionsWithOrds(token, refreshToken);
		return Response.json({ status: 'success', data: sessions });
	} catch (error) {
		const authError = error instanceof AuthApiError ? error : null;
		return Response.json(
			{
				status: 'error',
				message: authError?.message || 'No fue posible cargar las sesiones activas.',
			},
			{ status: authError?.status || 500 }
		);
	}
};
