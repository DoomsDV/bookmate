import type { APIRoute } from 'astro';

import { CAPABILITIES } from '../../../config/capabilities';
import { AddonApiError, cancelAddonWithOrds } from '../../../lib/addons';
import { requireCapability } from '../../../lib/permissions';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new AddonApiError('No hay sesión válida.', 401);
	}
	return token;
};

const requireAddonsManage = (locals: App.Locals) => {
	requireCapability(
		locals,
		CAPABILITIES.ADDONS_MANAGE,
		(message, status) => new AddonApiError(message, status),
		'Solo el administrador puede cancelar complementos.'
	);
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

export const POST: APIRoute = async ({ request, locals }) => {
	try {
		const token = requireToken(locals.token);
		requireAddonsManage(locals);
		const body = await request.json().catch(() => ({}));
		const addonCode = String((body as { addon_code?: string })?.addon_code ?? '')
			.trim()
			.toUpperCase();
		if (!addonCode) throw new AddonApiError('Falta el código del complemento.', 400);
		const result = await cancelAddonWithOrds(token, addonCode);
		return Response.json({ status: 'success', data: result }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible cancelar el complemento.');
	}
};
