import type { APIRoute } from 'astro';

import { CAPABILITIES } from '../../../config/capabilities';
import { CobrosApiError, getCobrosPendingCountWithOrds } from '../../../lib/cobros';
import { requireCapability } from '../../../lib/permissions';

const requireToken = (token: string | undefined) => {
	if (!token) throw new CobrosApiError('No hay sesion valida.', 401);
	return token;
};

const requireStaff = (locals: App.Locals) => {
	requireCapability(
		locals,
		CAPABILITIES.COBROS_VIEW,
		(message, status) => new CobrosApiError(message, status),
		'No autorizado.'
	);
};

export const GET: APIRoute = async ({ locals }) => {
	try {
		const token = requireToken(locals.token);
		requireStaff(locals);
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
