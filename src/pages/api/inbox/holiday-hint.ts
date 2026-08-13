import type { APIRoute } from 'astro';

import { InboxApiError, getHolidayHintWithOrds } from '../../../lib/inbox';

export const GET: APIRoute = async ({ locals }) => {
	try {
		const token = locals.token;
		if (!token) throw new InboxApiError('No hay sesion valida.', 401);
		const hint = await getHolidayHintWithOrds(token);
		return Response.json({ status: 'success', data: hint });
	} catch (error) {
		const err = error instanceof InboxApiError ? error : new InboxApiError('No fue posible consultar el feriado.', 500);
		return Response.json({ status: 'error', message: err.message }, { status: err.status });
	}
};
