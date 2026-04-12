import { resolveOrdsApiUrl } from './env-urls';

export const WORKSPACE_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_WORKSPACE_URL,
	'ORDS_WORKSPACE_URL',
	'/workspace'
);

export interface WorkspaceSettingsData {
	id_organization: number;
	name: string;
	profile_slug: string;
	description: string;
	public_whatsapp: string;
	logo_url: string;
	time_format: string;
	theme_pref: string;
	unanswered_alert_action: string;
}

export interface UpdateWorkspacePayload {
	name?: string;
	profile_slug?: string;
	description?: string;
	public_whatsapp?: string;
	time_format?: string;
	theme_pref?: string;
	unanswered_alert_action?: string;
	panel_theme?: string;
	logo_base64?: string;
	logo_name?: string;
	logo_mime?: string;
}

export interface WorkspaceFieldError {
	field: string;
	message: string;
}

interface WorkspaceSuccessResponse {
	status: 'success';
	data?: unknown;
	message?: string;
}

interface WorkspaceFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
	errors?: unknown;
}

export class WorkspaceSettingsApiError extends Error {
	status: number;
	details?: unknown;
	fieldErrors: WorkspaceFieldError[];

	constructor(
		message: string,
		status = 400,
		details?: unknown,
		fieldErrors: WorkspaceFieldError[] = []
	) {
		super(message);
		this.name = 'WorkspaceSettingsApiError';
		this.status = status;
		this.details = details;
		this.fieldErrors = fieldErrors;
	}
}

const toNumber = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeTimeFormat = (value: unknown): '12H' | '24H' => {
	const normalized = String(value || '').trim().toLowerCase();
	return normalized === '12h' ? '12H' : '24H';
};

const parseFieldErrors = (value: unknown): WorkspaceFieldError[] => {
	if (!Array.isArray(value)) return [];

	return value.flatMap((item) => {
		if (!item || typeof item !== 'object') return [];
		const source = item as Record<string, unknown>;
		const field = String(source.field || '').trim();
		const message = String(source.message || '').trim();
		if (!field || !message) return [];
		return [{ field, message }];
	});
};

const normalizeWorkspaceSettings = (value: unknown): WorkspaceSettingsData | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const idOrganization = toNumber(source.id_organization, 0);
	if (!idOrganization) return null;

	return {
		id_organization: idOrganization,
		name: String(source.name || '').trim(),
		profile_slug: String(source.profile_slug || '').trim(),
		description: String(source.description || '').trim(),
		public_whatsapp: String(source.public_whatsapp || '').trim(),
		logo_url: String(source.logo_url || '').trim(),
		time_format: normalizeTimeFormat(source.time_format),
		theme_pref: String(source.theme_pref || '').trim(),
		unanswered_alert_action: String(source.unanswered_alert_action || '').trim(),
	};
};

const parseWorkspaceResponse = async (response: Response) => {
	let data: WorkspaceSuccessResponse | WorkspaceFailureResponse | null = null;
	try {
		data = await response.json();
	} catch {
		throw new WorkspaceSettingsApiError(
			'No fue posible interpretar la respuesta de configuración.',
			502
		);
	}

	if (
		!response.ok ||
		!data ||
		typeof data !== 'object' ||
		data.status !== 'success' ||
		!('data' in data)
	) {
		const failureData = (data ?? {}) as WorkspaceFailureResponse;
		throw new WorkspaceSettingsApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) ||
				'No fue posible obtener la configuración del negocio.',
			response.status || 400,
			failureData.details,
			parseFieldErrors(failureData.errors)
		);
	}

	const normalized = normalizeWorkspaceSettings(data.data);
	if (!normalized) {
		throw new WorkspaceSettingsApiError(
			'No fue posible interpretar la configuración del negocio.',
			502
		);
	}

	return normalized;
};

const parseWorkspaceActionResponse = async (response: Response) => {
	let data: WorkspaceSuccessResponse | WorkspaceFailureResponse | null = null;
	try {
		data = await response.json();
	} catch {
		throw new WorkspaceSettingsApiError(
			'No fue posible interpretar la respuesta de configuración.',
			502
		);
	}

	if (!response.ok || !data || typeof data !== 'object' || data.status !== 'success') {
		const failureData = (data ?? {}) as WorkspaceFailureResponse;
		throw new WorkspaceSettingsApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) ||
				'No fue posible actualizar la configuración del negocio.',
			response.status || 400,
			failureData.details,
			parseFieldErrors(failureData.errors)
		);
	}

	return {
		message:
			typeof data.message === 'string' && data.message.trim()
				? data.message
				: 'Configuración del negocio guardada correctamente.',
	};
};

export const getWorkspaceSettingsWithOrds = async (token: string) => {
	if (!token) throw new WorkspaceSettingsApiError('Token de acceso requerido.', 401);

	const response = await fetch(WORKSPACE_URL, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	return parseWorkspaceResponse(response);
};

export const updateWorkspaceSettingsWithOrds = async (
	token: string,
	payload: UpdateWorkspacePayload
) => {
	if (!token) throw new WorkspaceSettingsApiError('Token de acceso requerido.', 401);

	const response = await fetch(WORKSPACE_URL, {
		method: 'PUT',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});

	return parseWorkspaceActionResponse(response);
};
