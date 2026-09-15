import type { APIRoute } from 'astro';

import { CAPABILITIES } from '../../../config/capabilities';
import { requireCapability } from '../../../lib/permissions';
import {
	activateAddonWithOrds,
	AddonApiError,
	listAddonsWithOrds,
	readIdempotencyKeyHeader,
} from '../../../lib/addons';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new AddonApiError('No hay sesión válida.', 401);
	}
	return token;
};

const requireAddonsView = (locals: App.Locals) => {
	requireCapability(
		locals,
		CAPABILITIES.ADDONS_VIEW,
		(message, status) => new AddonApiError(message, status),
		'Solo el administrador puede ver complementos.'
	);
};

const requireAddonsManage = (locals: App.Locals) => {
	requireCapability(
		locals,
		CAPABILITIES.ADDONS_MANAGE,
		(message, status) => new AddonApiError(message, status),
		'Solo el administrador puede gestionar complementos.'
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

export const GET: APIRoute = async ({ locals }) => {
	try {
		const token = requireToken(locals.token);
		requireAddonsView(locals);
		const catalog = await listAddonsWithOrds(token);
		return Response.json({ status: 'success', data: catalog }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener los complementos.');
	}
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
		const idempotencyKey = readIdempotencyKeyHeader(request);
		const { data: result, httpStatus } = await activateAddonWithOrds(
			token,
			addonCode,
			idempotencyKey
		);
		return Response.json({ status: 'success', data: result }, { status: httpStatus });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible activar el complemento.');
	}
};
