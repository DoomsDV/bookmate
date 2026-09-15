import type { APIRoute } from 'astro';

import { CAPABILITIES } from '../../../config/capabilities';
import { clearCachedPermissions } from '../../../lib/permission-cache';
import {
	getPermissionMatrixWithOrds,
	PermissionsApiError,
	resetPermissionMatrixWithOrds,
	savePermissionMatrixWithOrds,
} from '../../../lib/permissions';
import { requireCapability } from '../../../lib/permissions';

const toErrorResponse = (error: unknown, fallback: string) => {
	const known = error instanceof PermissionsApiError ? error : new PermissionsApiError(fallback, 500);
	return Response.json(
		{ status: 'error', message: known.message, details: known.details },
		{ status: known.status }
	);
};

export const GET: APIRoute = async ({ locals }) => {
	try {
		requireCapability(locals, CAPABILITIES.PERMISSIONS_MANAGE, (message, status) =>
			new PermissionsApiError(message, status)
		);
		const token = locals.token;
		if (!token) {
			throw new PermissionsApiError('No hay sesion valida para consultar la matriz.', 401);
		}
		const matrix = await getPermissionMatrixWithOrds(token);
		return Response.json({ status: 'success', data: matrix }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener la matriz de permisos.');
	}
};

export const PUT: APIRoute = async ({ locals, request, cookies }) => {
	try {
		requireCapability(locals, CAPABILITIES.PERMISSIONS_MANAGE, (message, status) =>
			new PermissionsApiError(message, status)
		);
		const token = locals.token;
		if (!token) {
			throw new PermissionsApiError('No hay sesion valida para guardar la matriz.', 401);
		}
		const body = await request.json();
		const grants = Array.isArray(body?.grants) ? body.grants : [];
		const normalized = grants
			.map((item: { role_id?: unknown; code?: unknown; granted?: unknown }) => ({
				role_id: Number(item.role_id),
				code: String(item.code || '').trim(),
				granted: item.granted === true || item.granted === 1 || item.granted === '1',
			}))
			.filter((item: { role_id: number; code: string }) => item.role_id > 0 && item.code);

		await savePermissionMatrixWithOrds(token, normalized);
		clearCachedPermissions(cookies);
		return Response.json({ status: 'success', message: 'Permisos actualizados.' }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible guardar los permisos.');
	}
};

export const POST: APIRoute = async ({ locals, cookies }) => {
	try {
		requireCapability(locals, CAPABILITIES.PERMISSIONS_MANAGE, (message, status) =>
			new PermissionsApiError(message, status)
		);
		const token = locals.token;
		if (!token) {
			throw new PermissionsApiError('No hay sesion valida para restaurar defaults.', 401);
		}
		await resetPermissionMatrixWithOrds(token);
		clearCachedPermissions(cookies);
		return Response.json(
			{ status: 'success', message: 'Se restauraron los permisos por defecto.' },
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible restaurar los defaults.');
	}
};
