import type { APIRoute } from 'astro';

import { OpsApiError, restoreOpsEnforcementWithOrds } from '../../../../../../lib/ops';

export const POST: APIRoute = async ({ locals, params, request }) => {
	try {
		const token = String(locals.token || '').trim();
		if (!token) throw new OpsApiError('No hay sesion valida.', 401);

		const orgId = Number(params.id || 0);
		if (!Number.isInteger(orgId) || orgId <= 0) {
			throw new OpsApiError('ID de organización inválido.', 400);
		}

		const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
		const result = await restoreOpsEnforcementWithOrds(token, orgId, String(body.reason || ''));

		return Response.json({
			status: 'success',
			message: result.message,
			data: result.data,
		});
	} catch (error) {
		const err =
			error instanceof OpsApiError
				? error
				: new OpsApiError('No fue posible restaurar las sanciones.', 500);
		return Response.json(
			{ status: 'error', message: err.message, details: err.details },
			{ status: err.status }
		);
	}
};
