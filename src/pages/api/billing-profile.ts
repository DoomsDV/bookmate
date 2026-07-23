import type { APIRoute } from 'astro';

import { ROLES } from '../../config/roles';
import {
	BillingProfileApiError,
	getBillingProfileWithOrds,
	saveBillingProfileWithOrds,
	type BillingDocType,
	type BillingProfilePayload,
} from '../../lib/billing-profile';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new BillingProfileApiError('No hay sesion valida para gestionar facturación.', 401);
	}
	return token;
};

const requireAdminRole = (roleId: number | undefined) => {
	if (Number(roleId || 0) !== ROLES.ADMIN) {
		throw new BillingProfileApiError('Solo administradores pueden gestionar facturación.', 403);
	}
};

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const billingError =
		error instanceof BillingProfileApiError
			? error
			: new BillingProfileApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: billingError.message,
			details: billingError.details,
		},
		{ status: billingError.status }
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

const parseSavePayload = (source: any): BillingProfilePayload => {
	const docType = String(source?.billing_doc_type || '')
		.trim()
		.toUpperCase();
	return {
		billing_name: String(source?.billing_name ?? '').trim(),
		billing_doc_type: (docType === 'RUC' ? 'RUC' : 'CI') as BillingDocType,
		billing_doc_number: String(source?.billing_doc_number ?? '').trim(),
		billing_email: String(source?.billing_email ?? '').trim().toLowerCase(),
	};
};

export const GET: APIRoute = async ({ locals }) => {
	try {
		const token = requireToken(locals.token);
		requireAdminRole(locals.roleId);
		const data = await getBillingProfileWithOrds(token);
		return Response.json({ status: 'success', data }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible cargar los datos de facturación.');
	}
};

export const PUT: APIRoute = async ({ request, locals }) => {
	try {
		const token = requireToken(locals.token);
		requireAdminRole(locals.roleId);
		const body = await parseBody(request);
		const payload = parseSavePayload(body);
		const saved = await saveBillingProfileWithOrds(token, payload);
		return Response.json(
			{ status: 'success', message: saved.message, data: saved.data },
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible guardar los datos de facturación.');
	}
};
