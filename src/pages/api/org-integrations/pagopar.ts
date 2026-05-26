import type { APIRoute } from 'astro';

import { ROLES } from '../../../config/roles';
import {
	deletePagoparIntegrationWithOrds,
	getPagoparIntegrationWithOrds,
	OrgIntegrationsApiError,
	savePagoparIntegrationWithOrds,
	type PagoparIntegrationPayload,
} from '../../../lib/org-integrations';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new OrgIntegrationsApiError('No hay sesion valida para gestionar integraciones.', 401);
	}
	return token;
};

const requireAdminRole = (roleId: number | undefined) => {
	if (Number(roleId || 0) !== ROLES.ADMIN) {
		throw new OrgIntegrationsApiError('Solo administradores pueden gestionar integraciones.', 403);
	}
};

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const integrationError =
		error instanceof OrgIntegrationsApiError
			? error
			: new OrgIntegrationsApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: integrationError.message,
			details: integrationError.details,
			errors: integrationError.fieldErrors,
		},
		{ status: integrationError.status }
	);
};

const parseBody = async (request: Request) => {
	const contentType = request.headers.get('content-type') || '';
	if (contentType.includes('application/json')) {
		return request.json();
	}

	const formData = await request.formData();
	return {
		public_key: formData.get('public_key'),
		private_key: formData.get('private_key'),
	};
};

const parseSavePayload = (source: any): PagoparIntegrationPayload => {
	const publicKey = String(source?.public_key ?? '').trim();
	const privateKey = String(source?.private_key ?? '').trim();
	if (!publicKey || !privateKey) {
		throw new OrgIntegrationsApiError('La clave pública y privada son obligatorias.', 400);
	}
	return {
		provider: 'pagopar',
		public_key: publicKey,
		private_key: privateKey,
	};
};

export const GET: APIRoute = async ({ locals }) => {
	try {
		const token = requireToken(locals.token);
		requireAdminRole(locals.roleId);
		const data = await getPagoparIntegrationWithOrds(token);
		return Response.json({ status: 'success', data }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible cargar la integración.');
	}
};

export const PUT: APIRoute = async ({ request, locals }) => {
	try {
		const token = requireToken(locals.token);
		requireAdminRole(locals.roleId);
		const body = await parseBody(request);
		const payload = parseSavePayload(body);
		const saved = await savePagoparIntegrationWithOrds(token, payload);
		return Response.json({ status: 'success', message: saved.message }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible guardar la integración.');
	}
};

export const DELETE: APIRoute = async ({ locals }) => {
	try {
		const token = requireToken(locals.token);
		requireAdminRole(locals.roleId);
		const deleted = await deletePagoparIntegrationWithOrds(token);
		return Response.json({ status: 'success', message: deleted.message }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible eliminar la integración.');
	}
};

