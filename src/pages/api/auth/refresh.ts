import type { APIRoute } from 'astro';

import { AuthApiError, refreshWithOrds, setOrganizationCacheCookies, setSessionCookies } from '../../../lib/auth';
import { getCurrentOrganizationWithOrds } from '../../../lib/organization';

export const POST: APIRoute = async ({ request, cookies, url }) => {
	try {
		const body = await request.json();
		const refreshToken = String(body.refresh_token || '').trim();

		if (!refreshToken) {
			throw new AuthApiError('Refresh token requerido.', 400);
		}

		const session = await refreshWithOrds(refreshToken);
		setSessionCookies(cookies, url, session);

		try {
			const organization = await getCurrentOrganizationWithOrds(session.access_token);
			setOrganizationCacheCookies(cookies, url, organization);
		} catch {
			// Si falla la cache de organización, mantenemos la sesión activa.
		}

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
