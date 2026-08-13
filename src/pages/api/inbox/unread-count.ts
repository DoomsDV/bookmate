import type { APIRoute } from 'astro';

import { InboxApiError, getInboxUnreadCountWithOrds } from '../../../lib/inbox';

export const GET: APIRoute = async ({ locals }) => {
	try {
		const token = locals.token;
		if (!token) throw new InboxApiError('No hay sesion valida.', 401);
		const unreadCount = await getInboxUnreadCountWithOrds(token);
		return Response.json({
			status: 'success',
			data: { unread_count: unreadCount },
		});
	} catch (error) {
		const err = error instanceof InboxApiError ? error : new InboxApiError('No fue posible consultar notificaciones.', 500);
		return Response.json({ status: 'error', message: err.message }, { status: err.status });
	}
};
