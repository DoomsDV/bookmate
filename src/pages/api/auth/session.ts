import type { APIRoute } from 'astro';

/**
 * Comprobación ligera de cookies de sesión (no llama a ORDS ni rota refresh).
 * Para validación profunda usar POST /api/auth/refresh.
 */
export const GET: APIRoute = async ({ cookies }) => {
	const hasRefresh = Boolean(String(cookies.get('refresh_token')?.value || '').trim());
	const hasAccess = Boolean(String(cookies.get('access_token')?.value || '').trim());

	if (!hasRefresh && !hasAccess) {
		return Response.json(
			{
				status: 'error',
				code: 'SESSION_EXPIRED',
				active: false,
				reason: 'NO_SESSION',
				message: 'No hay sesión activa.',
			},
			{ status: 401 }
		);
	}

	return Response.json({
		status: 'success',
		active: true,
		has_refresh: hasRefresh,
		has_access: hasAccess,
	});
};
