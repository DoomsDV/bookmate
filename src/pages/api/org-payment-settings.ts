import type { APIRoute } from 'astro';

import { ROLES } from '../../config/roles';
import {
	getPaymentSettingsWithOrds,
	PaymentSettingsApiError,
	savePaymentSettingsWithOrds,
	type PaymentSettingsPayload,
	type RefundPolicy,
} from '../../lib/org-payment-settings';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new PaymentSettingsApiError('No hay sesion valida para gestionar cobros.', 401);
	}
	return token;
};

const requireAdminRole = (roleId: number | undefined) => {
	if (Number(roleId || 0) !== ROLES.ADMIN) {
		throw new PaymentSettingsApiError('Solo administradores pueden gestionar cobros.', 403);
	}
};

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const paymentError =
		error instanceof PaymentSettingsApiError
			? error
			: new PaymentSettingsApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: paymentError.message,
			details: paymentError.details,
		},
		{ status: paymentError.status }
	);
};

const parseBody = async (request: Request) => {
	const contentType = request.headers.get('content-type') || '';
	if (contentType.includes('application/json')) {
		return request.json();
	}
	const formData = await request.formData();
	return Object.fromEntries(formData.entries());
};

const parseSavePayload = (source: any): PaymentSettingsPayload => {
	const enabledRaw = source?.deposits_enabled;
	const depositsEnabled =
		enabledRaw === true ||
		enabledRaw === 1 ||
		enabledRaw === '1' ||
		String(enabledRaw).toLowerCase() === 'true'
			? 1
			: 0;

	const policy = String(source?.refund_policy || '')
		.trim()
		.toUpperCase();
	const refundPolicy =
		policy === 'FLEXIBLE' || policy === 'MODERATE' || policy === 'STRICT'
			? (policy as RefundPolicy)
			: null;

	return {
		deposits_enabled: depositsEnabled as 0 | 1,
		refund_policy: refundPolicy,
		bank_name: String(source?.bank_name ?? '').trim() || null,
		account_holder: String(source?.account_holder ?? '').trim() || null,
		document_id: String(source?.document_id ?? '').trim() || null,
		bank_alias: String(source?.bank_alias ?? '').trim() || null,
	};
};

export const GET: APIRoute = async ({ locals }) => {
	try {
		const token = requireToken(locals.token);
		requireAdminRole(locals.roleId);
		const data = await getPaymentSettingsWithOrds(token);
		return Response.json({ status: 'success', data }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible cargar la configuración de cobros.');
	}
};

export const PUT: APIRoute = async ({ request, locals }) => {
	try {
		const token = requireToken(locals.token);
		requireAdminRole(locals.roleId);
		const body = await parseBody(request);
		const payload = parseSavePayload(body);
		const saved = await savePaymentSettingsWithOrds(token, payload);
		return Response.json(
			{ status: 'success', message: saved.message, data: saved.data },
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible guardar la configuración de cobros.');
	}
};
