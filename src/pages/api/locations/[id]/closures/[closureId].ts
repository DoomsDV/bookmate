import type { APIRoute } from 'astro';

import {
	LocationClosuresApiError,
	deleteLocationClosure,
} from '../../../../../lib/location-closures';

const parseId = (value: string | undefined) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

const requireToken = (token: string | undefined) => {
	if (!token) throw new LocationClosuresApiError('No hay sesión válida.', 401);
	return token;
};

const toErrorResponse = (error: unknown, fallback: string) => {
	const err =
		error instanceof LocationClosuresApiError
			? error
			: new LocationClosuresApiError(fallback, 500);
	return Response.json(
		{ status: 'error', message: err.message, errors: err.fieldErrors },
		{ status: err.status }
	);
};

export const DELETE: APIRoute = async ({ params, url, locals }) => {
	try {
		const token = requireToken(locals.token);
		const locationId = parseId(params.id);
		const closureId = parseId(params.closureId);
		if (!locationId) throw new LocationClosuresApiError('ID de sucursal inválido.', 400);
		if (!closureId) throw new LocationClosuresApiError('ID de cierre inválido.', 400);

		const deleteGroup = url.searchParams.get('delete_group') === '1';

		const result = await deleteLocationClosure(token, locationId, closureId, { deleteGroup });
		return Response.json({ status: 'success', ...result }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible eliminar el cierre.');
	}
};
