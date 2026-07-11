import type { APIRoute } from 'astro';

import { ROLES } from '../../../../config/roles';
import { CobrosApiError, waiveRefundWithOrds } from '../../../../lib/cobros';

const requireToken = (token: string | undefined) => {
	if (!token) throw new CobrosApiError('No hay sesion valida.', 401);
	return token;
};

const requireStaff = (roleId: number | undefined) => {
	const role = Number(roleId || 0);
	if (role !== ROLES.ADMIN && role !== ROLES.RECEPCIONISTA) {
		throw new CobrosApiError('No autorizado.', 403);
	}
};

export const POST: APIRoute = async ({ locals, params, request }) => {
	try {
		const token = requireToken(locals.token);
		requireStaff(locals.roleId);
		const id = Number(params.id || 0);
		if (!Number.isInteger(id) || id <= 0) {
			throw new CobrosApiError('ID de cobro invalido.', 400);
		}

		const body = await request.json().catch(() => ({}));
		const reason = String(body?.reason || '').trim();
		if (reason.length < 5) {
			throw new CobrosApiError('Indica un motivo de al menos 5 caracteres.', 400);
		}

		const result = await waiveRefundWithOrds(token, id, reason);
		return Response.json({
			status: 'success',
			message: result.message,
			data: result.data,
		});
	} catch (error) {
		const err =
			error instanceof CobrosApiError
				? error
				: new CobrosApiError('No fue posible renunciar al reembolso.', 500);
		return Response.json(
			{ status: 'error', message: err.message, details: err.details },
			{ status: err.status }
		);
	}
};
