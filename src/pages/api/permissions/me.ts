import type { APIRoute } from 'astro';

import { fallbackPermissionsForRole, getMyPermissionsWithOrds } from '../../../lib/permissions';

export const GET: APIRoute = async ({ locals }) => {
	const token = locals.token;
	const roleId = Number(locals.roleId || 0);

	if (!token) {
		return Response.json(
			{ status: 'error', message: 'No hay sesion valida para consultar permisos.' },
			{ status: 401 }
		);
	}

	try {
		const permissions = await getMyPermissionsWithOrds(token, roleId);
		return Response.json({ status: 'success', data: permissions }, { status: 200 });
	} catch {
		const fallback = fallbackPermissionsForRole(roleId);
		return Response.json({ status: 'success', data: fallback }, { status: 200 });
	}
};
