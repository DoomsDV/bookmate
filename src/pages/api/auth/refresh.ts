import type { APIRoute } from 'astro';

import { AuthApiError, refreshWithOrds, setOrganizationCacheCookies, setSessionCookies } from '../../../lib/auth';
import { getCurrentOrganizationWithOrds } from '../../../lib/organization';
import { clearPanelValidationCache } from '../../../lib/panel-validation-cache';

export const POST: APIRoute = async ({ cookies, url }) => {
	try {
		const refreshToken = String(cookies.get('refresh_token')?.value ?? '').trim();

		if (!refreshToken) {
			throw new AuthApiError('Refresh token requerido.', 400);
		}

		const session = await refreshWithOrds(refreshToken);
		setSessionCookies(cookies, url, session);
		clearPanelValidationCache(cookies);

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

		// No borrar cookies: otra request pudo rotar el refresh y dejar el par nuevo.
		return Response.json(
			{
				status: 'error',
				code: authError.status === 401 ? 'SESSION_EXPIRED' : undefined,
				message: authError.message,
				error: authError.message,
				details: authError.details,
			},
			{ status: authError.status }
		);
	}
};
