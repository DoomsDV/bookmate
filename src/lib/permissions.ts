import {
	CAPABILITIES,
	SAFE_FALLBACK_CAPABILITIES,
	canAccessPathWithCapabilities,
	isCapabilityGranted,
	type CapabilityCode,
} from '../config/capabilities';
import { resolveOrdsApiUrl } from './env-urls';

export const PERMISSIONS_ME_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_PERMISSIONS_ME_URL,
	'ORDS_PERMISSIONS_ME_URL',
	'/permissions/me'
);

export const PERMISSIONS_MATRIX_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_PERMISSIONS_MATRIX_URL,
	'ORDS_PERMISSIONS_MATRIX_URL',
	'/permissions/matrix'
);

export const PERMISSIONS_RESET_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_PERMISSIONS_RESET_URL,
	'ORDS_PERMISSIONS_RESET_URL',
	'/permissions/reset'
);

export class PermissionsApiError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'PermissionsApiError';
		this.status = status;
		this.details = details;
	}
}

export type EffectivePermissions = {
	roleId: number;
	roleName: string;
	capabilities: string[];
	entitlements: Record<string, boolean>;
	source: 'ords' | 'unavailable';
};

export type PermissionGrant = {
	granted: boolean;
	default_granted: boolean;
	source: 'default' | 'override';
	locked?: boolean;
};

export type PermissionCatalogItem = {
	code: string;
	group_code: string;
	group_label: string;
	label: string;
	description: string;
	kind: 'MENU' | 'ACTION' | 'ADDON';
	sort_order: number;
	locked?: boolean;
	requires_entitlement?: string;
	entitlement_active?: boolean;
};

export type PermissionRole = {
	role_id: number;
	name: string;
	is_base: boolean;
	deletable: boolean;
};

export type PermissionMatrix = {
	roles: PermissionRole[];
	catalog: PermissionCatalogItem[];
	grants: Record<string, Record<string, PermissionGrant>>;
	entitlements: Record<string, boolean>;
};

type LocalsLike = {
	roleId?: number;
	capabilities?: string[];
};

const authHeaders = (token: string) => ({
	Authorization: `Bearer ${token}`,
	Accept: 'application/json',
});

const readJson = async (response: Response) => {
	const text = await response.text();
	if (!text) return {};
	try {
		return JSON.parse(text) as Record<string, unknown>;
	} catch {
		return { message: text };
	}
};

const toPermissionsError = (body: Record<string, unknown>, status: number, fallback: string) =>
	new PermissionsApiError(String(body.message || fallback), status, body);

export const safeFallbackPermissions = (roleId: number): EffectivePermissions => ({
	roleId,
	roleName: '',
	capabilities: [...SAFE_FALLBACK_CAPABILITIES],
	entitlements: {},
	source: 'unavailable',
});

export const getMyPermissionsWithOrds = async (
	token: string,
	roleId: number,
	fetchImpl: typeof fetch = fetch
): Promise<EffectivePermissions> => {
	try {
		const response = await fetchImpl(PERMISSIONS_ME_URL, { headers: authHeaders(token) });
		const body = await readJson(response);
		if (!response.ok || body.status === 'error') {
			throw toPermissionsError(body, response.status, 'No fue posible obtener los permisos.');
		}
		const data = (body.data || {}) as Record<string, unknown>;
		const capabilities = Array.isArray(data.capabilities)
			? data.capabilities.map((item) => String(item || '').trim()).filter(Boolean)
			: [];
		return {
			roleId: Number(data.role_id || roleId),
			roleName: String(data.role_name || ''),
			capabilities,
			entitlements:
				data.entitlements && typeof data.entitlements === 'object' && !Array.isArray(data.entitlements)
					? (data.entitlements as Record<string, boolean>)
					: {},
			source: 'ords',
		};
	} catch (error) {
		if (error instanceof PermissionsApiError && error.status >= 400 && error.status < 500) {
			throw error;
		}
		return safeFallbackPermissions(roleId);
	}
};

export const getPermissionMatrixWithOrds = async (token: string): Promise<PermissionMatrix> => {
	const response = await fetch(PERMISSIONS_MATRIX_URL, { headers: authHeaders(token) });
	const body = await readJson(response);
	if (!response.ok || body.status === 'error') {
		throw toPermissionsError(body, response.status, 'No fue posible obtener la matriz de permisos.');
	}
	const data = (body.data || {}) as PermissionMatrix;
	return {
		roles: Array.isArray(data.roles) ? data.roles : [],
		catalog: Array.isArray(data.catalog) ? data.catalog : [],
		grants: data.grants && typeof data.grants === 'object' ? data.grants : {},
		entitlements:
			data.entitlements && typeof data.entitlements === 'object' ? data.entitlements : {},
	};
};

export const savePermissionMatrixWithOrds = async (
	token: string,
	grants: { role_id: number; code: string; granted: boolean }[]
) => {
	const response = await fetch(PERMISSIONS_MATRIX_URL, {
		method: 'PUT',
		headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
		body: JSON.stringify({ grants }),
	});
	const body = await readJson(response);
	if (!response.ok || body.status === 'error') {
		throw toPermissionsError(body, response.status, 'No fue posible guardar los permisos.');
	}
	return body;
};

export const resetPermissionMatrixWithOrds = async (token: string) => {
	const response = await fetch(PERMISSIONS_RESET_URL, {
		method: 'POST',
		headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
		body: '{}',
	});
	const body = await readJson(response);
	if (!response.ok || body.status === 'error') {
		throw toPermissionsError(body, response.status, 'No fue posible restaurar los defaults.');
	}
	return body;
};

export const hasCapability = (locals: LocalsLike, code: CapabilityCode | string) =>
	isCapabilityGranted(locals.capabilities, code, Number(locals.roleId || 0));

export const requireCapability = (
	locals: LocalsLike,
	code: CapabilityCode | string,
	createError: (message: string, status: number) => Error,
	message = 'No tienes permisos para esta acción.'
) => {
	if (!hasCapability(locals, code)) {
		throw createError(message, 403);
	}
};

export const canAccessPathForLocals = (pathname: string, locals: LocalsLike) =>
	canAccessPathWithCapabilities(pathname, locals.capabilities, Number(locals.roleId || 0));

export { CAPABILITIES };
