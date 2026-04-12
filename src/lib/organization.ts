import { resolveOrdsApiUrl } from './env-urls';

export const ORGANIZATION_CURRENT_URL =
	resolveOrdsApiUrl(
		import.meta.env.ORDS_WORKSPACE_URL,
		'ORDS_WORKSPACE_URL',
		'/workspace'
	);

export interface OrganizationCurrent {
	id_organization: number;
	name: string;
	profile_slug: string;
	description: string;
	public_whatsapp: string;
	logo_url: string;
	timezone: string;
	time_format: string;
	theme_pref: string;
	unanswered_alert_action: string;
}

interface OrganizationSuccessResponse {
	status: 'success';
	data: unknown;
}

interface OrganizationFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
}

export class OrganizationApiError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'OrganizationApiError';
		this.status = status;
		this.details = details;
	}
}

const toNumber = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeOrganization = (value: unknown): OrganizationCurrent | null => {
	const candidate = Array.isArray(value) ? value[0] : value;
	if (!candidate || typeof candidate !== 'object') return null;

	const source = candidate as Record<string, unknown>;
	const idOrganization = toNumber(source.id_organization, NaN);
	if (!Number.isFinite(idOrganization)) return null;

	return {
		id_organization: idOrganization,
		name: String(source.name || '').trim(),
		profile_slug: String(source.profile_slug || '').trim(),
		description: String(source.description || '').trim(),
		public_whatsapp: String(source.public_whatsapp || '').trim(),
		logo_url: String(source.logo_url || '').trim(),
		timezone: String(source.timezone || '').trim(),
		time_format: String(source.time_format || '').trim(),
		theme_pref: String(source.theme_pref || '').trim(),
		unanswered_alert_action: String(source.unanswered_alert_action || '').trim(),
	};
};

export const getCurrentOrganizationWithOrds = async (token: string): Promise<OrganizationCurrent> => {
	if (!token) {
		throw new OrganizationApiError('Token de acceso requerido.', 401);
	}

	const response = await fetch(ORGANIZATION_CURRENT_URL, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	let data: OrganizationSuccessResponse | OrganizationFailureResponse | null = null;
	try {
		data = await response.json();
	} catch {
		throw new OrganizationApiError('No fue posible interpretar la respuesta del servidor.', 502);
	}

	if (
		!response.ok ||
		!data ||
		typeof data !== 'object' ||
		data.status !== 'success' ||
		!('data' in data)
	) {
		const failureData = (data ?? {}) as OrganizationFailureResponse;
		throw new OrganizationApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) ||
				'No fue posible obtener la organización actual.',
			response.status || 400,
			failureData.details
		);
	}

	const organization = normalizeOrganization(data.data);
	if (!organization) {
		throw new OrganizationApiError('No fue posible interpretar la organización actual.', 502);
	}

	return organization;
};
