import type { APIRoute } from 'astro';

import { InboxApiError, markInboxReadWithOrds } from '../../../../../lib/inbox';

export const POST: APIRoute = async ({ locals, params }) => {
	try {
		const token = locals.token;
		if (!token) throw new InboxApiError('No hay sesion valida.', 401);
		const id = Number(params.id);
		if (!Number.isInteger(id) || id <= 0) {
			throw new InboxApiError('Notificacion invalida.', 400);
		}
		await markInboxReadWithOrds(token, id);
		return Response.json({ status: 'success', data: { id_notification: id } });
	} catch (error) {
		const err = error instanceof InboxApiError ? error : new InboxApiError('No fue posible marcar la notificación.', 500);
		return Response.json({ status: 'error', message: err.message }, { status: err.status });
	}
};
