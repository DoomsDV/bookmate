import type { APIRoute } from 'astro';

import { ROLES } from '../../../config/roles';
import {
	activateAddonWithOrds,
	AddonApiError,
	listAddonsWithOrds,
} from '../../../lib/addons';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new AddonApiError('No hay sesión válida.', 401);
	}
	return token;
};

const requireAdminRole = (roleId: number | undefined) => {
	if (Number(roleId || 0) !== ROLES.ADMIN) {
		throw new AddonApiError('Solo el administrador puede gestionar complementos.', 403);
	}
};

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const addonError =
		error instanceof AddonApiError ? error : new AddonApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: addonError.message,
			details: addonError.details,
		},
		{ status: addonError.status }
	);
};

export const GET: APIRoute = async ({ locals }) => {
	try {
		const token = requireToken(locals.token);
		requireAdminRole(locals.roleId);
		const catalog = await listAddonsWithOrds(token);
		return Response.json({ status: 'success', data: catalog }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener los complementos.');
	}
};

export const POST: APIRoute = async ({ request, locals }) => {
	try {
		const token = requireToken(locals.token);
		requireAdminRole(locals.roleId);
		const body = await request.json().catch(() => ({}));
		const addonCode = String((body as { addon_code?: string })?.addon_code ?? '')
			.trim()
			.toUpperCase();
		if (!addonCode) throw new AddonApiError('Falta el código del complemento.', 400);
		const result = await activateAddonWithOrds(token, addonCode);
		return Response.json({ status: 'success', data: result }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible activar el complemento.');
	}
};
