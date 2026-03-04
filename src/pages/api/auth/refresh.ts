import type { APIRoute } from 'astro';

import { AuthApiError, refreshWithOrds, setSessionCookies } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies, url }) => {
	try {
		const body = await request.json();
		const refreshToken = String(body.refresh_token || '').trim();

		if (!refreshToken) {
			throw new AuthApiError('Refresh token requerido.', 400);
		}

		const session = await refreshWithOrds(refreshToken);
		setSessionCookies(cookies, url, session);

		return Response.json({ status: 'success' });
	} catch (error) {
		const authError =
			error instanceof AuthApiError
				? error
				: new AuthApiError('No fue posible refrescar la sesion.', 401);

		return Response.json(
			{
				error: authError.message,
				details: authError.details,
			},
			{ status: authError.status }
		);
	}
};
