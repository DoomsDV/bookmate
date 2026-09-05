import type { APIRoute } from 'astro';

import { ROLES } from '../../../../config/roles';
import {
	CobrosApiError,
	getStaffRefundProofMetaWithOrds,
	uploadRefundProofWithOrds,
} from '../../../../lib/cobros';
import { proxyRefundProof } from '../../../../lib/refund-proof-proxy';

const requireToken = (token: string | undefined) => {
	if (!token) throw new CobrosApiError('No hay sesion valida.', 401);
	return token;
};

const requireStaff = (roleId: number | undefined) => {
	const role = Number(roleId || 0);
	if (role !== ROLES.ADMIN && role !== ROLES.RECEPCIONISTA) {
		throw new CobrosApiError('No autorizado.', 403);
	}
};

const parseId = (value: string | undefined) => {
	const id = Number(value || 0);
	if (!Number.isInteger(id) || id <= 0) {
		throw new CobrosApiError('ID de cobro invalido.', 400);
	}
	return id;
};

export const GET: APIRoute = async ({ locals, params }) => {
	try {
		const token = requireToken(locals.token);
		requireStaff(locals.roleId);
		const meta = await getStaffRefundProofMetaWithOrds(token, parseId(params.id));
		return proxyRefundProof(meta.url, meta.mime_type);
	} catch (error) {
		const err =
			error instanceof CobrosApiError
				? error
				: new CobrosApiError('No fue posible obtener la prueba de reembolso.', 500);
		return Response.json({ status: 'error', message: err.message }, { status: err.status });
	}
};

export const POST: APIRoute = async ({ locals, params, request }) => {
	try {
		const token = requireToken(locals.token);
		requireStaff(locals.roleId);
		const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
		const result = await uploadRefundProofWithOrds(
			token,
			parseId(params.id),
			{
				file_base64: String(body.file_base64 || ''),
				filename: String(body.filename || 'reembolso'),
				mime_type: String(body.mime_type || 'application/octet-stream'),
			},
			request.headers.get('idempotency-key') || undefined
		);
		return Response.json({
			status: 'success',
			message: result.message,
			data: result.data,
		});
	} catch (error) {
		const err =
			error instanceof CobrosApiError
				? error
				: new CobrosApiError('No fue posible subir la prueba de reembolso.', 500);
		return Response.json(
			{ status: 'error', message: err.message, details: err.details },
			{ status: err.status }
		);
	}
};
