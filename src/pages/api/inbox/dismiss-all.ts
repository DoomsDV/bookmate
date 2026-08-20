import type { APIRoute } from 'astro';

import { InboxApiError, dismissAllInboxWithOrds } from '../../../lib/inbox';

export const POST: APIRoute = async ({ locals }) => {
	try {
		const token = locals.token;
		if (!token) throw new InboxApiError('No hay sesion valida.', 401);
		await dismissAllInboxWithOrds(token);
		return Response.json({ status: 'success' });
	} catch (error) {
		const err = error instanceof InboxApiError ? error : new InboxApiError('No fue posible eliminar las notificaciones.', 500);
		return Response.json({ status: 'error', message: err.message }, { status: err.status });
	}
};
