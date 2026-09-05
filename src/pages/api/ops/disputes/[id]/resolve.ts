import type { APIRoute } from 'astro';

import { OpsApiError, resolveOpsDisputeWithOrds, type OpsResolutionCode } from '../../../../../lib/ops';

const CODES = new Set<OpsResolutionCode>(['SETTLED', 'DISMISS', 'ADVERSE', 'ISSUE_CREDIT']);

export const POST: APIRoute = async ({ locals, params, request }) => {
	try {
		const token = String(locals.token || '').trim();
		if (!token) throw new OpsApiError('No hay sesion valida.', 401);

		const disputeId = Number(params.id || 0);
		if (!Number.isInteger(disputeId) || disputeId <= 0) {
			throw new OpsApiError('ID de disputa inválido.', 400);
		}

		const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
		const resolution = String(body.resolution_code || '').trim().toUpperCase() as OpsResolutionCode;
		if (!CODES.has(resolution)) {
			throw new OpsApiError('resolution_code inválido.', 400);
		}

		const result = await resolveOpsDisputeWithOrds(token, disputeId, {
			resolution_code: resolution,
			notes: String(body.notes || '').trim() || undefined,
		});

		return Response.json({
			status: 'success',
			message: result.message,
			data: result.data,
		});
	} catch (error) {
		const err =
			error instanceof OpsApiError ? error : new OpsApiError('No fue posible resolver la disputa.', 500);
		return Response.json(
			{ status: 'error', message: err.message, details: err.details },
			{ status: err.status }
		);
	}
};
