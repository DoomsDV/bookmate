import type { APIRoute } from 'astro';

import { ROLES } from '../../../config/roles';
import {
	CobrosApiError,
	listCobrosWithOrds,
	type CobrosDatePreset,
	type CobrosStatusFilter,
} from '../../../lib/cobros';

const requireToken = (token: string | undefined) => {
	if (!token) throw new CobrosApiError('No hay sesion valida.', 401);
	return token;
};

const requireStaff = (roleId: number | undefined) => {
	const role = Number(roleId || 0);
	if (role !== ROLES.ADMIN && role !== ROLES.RECEPCIONISTA) {
		throw new CobrosApiError('No autorizado para ver cobros.', 403);
	}
};

const toError = (error: unknown, fallback: string) => {
	const err = error instanceof CobrosApiError ? error : new CobrosApiError(fallback, 500);
	return Response.json(
		{ status: 'error', message: err.message, details: err.details },
		{ status: err.status }
	);
};

export const GET: APIRoute = async ({ locals, url }) => {
	try {
		const token = requireToken(locals.token);
		requireStaff(locals.roleId);

		const status = String(url.searchParams.get('status') || 'all').trim() as CobrosStatusFilter;
		const datePreset = (
			status === 'all'
				? 'all'
				: String(url.searchParams.get('date_preset') || 'this_month').trim()
		) as CobrosDatePreset;
		const dateFrom = String(url.searchParams.get('date_from') || '').trim() || undefined;
		const dateTo = String(url.searchParams.get('date_to') || '').trim() || undefined;
		const page = Number(url.searchParams.get('page') || 1);
		const limit = Number(url.searchParams.get('limit') || 9);

		const result = await listCobrosWithOrds(token, {
			status,
			date_preset: datePreset,
			date_from: dateFrom,
			date_to: dateTo,
			page,
			limit,
		});

		return Response.json({
			status: 'success',
			data: result.items,
			meta: result.meta,
		});
	} catch (error) {
		return toError(error, 'No fue posible cargar los cobros.');
	}
};
