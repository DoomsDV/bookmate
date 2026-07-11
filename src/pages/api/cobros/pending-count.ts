import type { APIRoute } from 'astro';

import { ROLES } from '../../../config/roles';
import { CobrosApiError, getCobrosPendingCountWithOrds } from '../../../lib/cobros';

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

export const GET: APIRoute = async ({ locals }) => {
	try {
		const token = requireToken(locals.token);
		requireStaff(locals.roleId);
		const pendingCount = await getCobrosPendingCountWithOrds(token);

		return Response.json({
			status: 'success',
			data: { pending_count: pendingCount },
		});
	} catch (error) {
		const err =
			error instanceof CobrosApiError
				? error
				: new CobrosApiError('No fue posible consultar pendientes.', 500);
		return Response.json(
			{ status: 'error', message: err.message, details: err.details },
			{ status: err.status }
		);
	}
};
