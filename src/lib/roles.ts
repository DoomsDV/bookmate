import { resolveOrdsApiUrl } from './env-urls';

export const ROLES_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_ROLES_URL,
	'ORDS_ROLES_URL',
	'/roles'
);

export interface Role {
	id_role: number;
	name: string;
	description: string;
	is_active: 0 | 1;
	created_at: string;
}

interface RolesSuccessResponse {
	status: 'success';
	data: unknown[];
}

interface RolesFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
}

export class RolesApiError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'RolesApiError';
		this.status = status;
		this.details = details;
	}
}

const toNumber = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeRole = (value: unknown): Role | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const idRole = toNumber(source.id_role, NaN);
	if (!Number.isFinite(idRole)) return null;

	return {
		id_role: idRole,
		name: String(source.name || '').trim(),
		description: String(source.description || '').trim(),
		is_active:
			source.is_active === 1 || source.is_active === '1' || source.is_active === true ? 1 : 0,
		created_at: String(source.created_at || '').trim(),
	};
};

const parseRolesResponse = async (response: Response) => {
	let data: RolesSuccessResponse | RolesFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new RolesApiError('No fue posible interpretar la respuesta del servidor de roles.', 502);
	}

	if (
		!response.ok ||
		!data ||
		typeof data !== 'object' ||
		data.status !== 'success' ||
		!('data' in data) ||
		!Array.isArray(data.data)
	) {
		const failureData = (data ?? {}) as RolesFailureResponse;
		throw new RolesApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) ||
				'No fue posible obtener los roles.',
			response.status || 400,
			failureData.details
		);
	}

	return data.data.map(normalizeRole).filter((role): role is Role => role !== null);
};

export const listRolesWithOrds = async () => {
	const response = await fetch(ROLES_URL, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
		},
	});

	return parseRolesResponse(response);
};
