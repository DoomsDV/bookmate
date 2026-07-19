import { parseBusinessHours } from './business-hours';
import { resolveOrdsApiUrl } from './env-urls';

import type {
	UpdateWorkspacePayload,
	WorkspaceCatalogOption,
	WorkspaceCatalogs,
	WorkspaceFieldError,
	WorkspaceGalleryImage,
	WorkspaceSettingsData,
} from './workspace-settings-shared';

export type {
	UpdateWorkspacePayload,
	WorkspaceCatalogOption,
	WorkspaceCatalogs,
	WorkspaceFieldError,
	WorkspaceGalleryImage,
	WorkspaceSettingsData,
} from './workspace-settings-shared';

export {
	getCancelWaitOptionsForReminder,
	getReminderHoursValue,
} from './workspace-settings-shared';

export const WORKSPACE_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_WORKSPACE_URL,
	'ORDS_WORKSPACE_URL',
	'/workspace'
);

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

const toNumber = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const toOptionalPositiveInt = (value: unknown): number | null => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeTimeFormat = (value: unknown): '12H' | '24H' => {
	const normalized = String(value || '').trim().toLowerCase();
	return normalized === '12h' ? '12H' : '24H';
};

const parseCatalogOptions = (value: unknown): WorkspaceCatalogOption[] => {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item) => {
		if (!item || typeof item !== 'object') return [];
		const source = item as Record<string, unknown>;
		const id = toOptionalPositiveInt(source.id);
		const label = String(source.label || '').trim();
		if (!id || !label) return [];
		return [
			{
				id,
				label,
				minutes: toOptionalPositiveInt(source.minutes) ?? undefined,
				hours: toOptionalPositiveInt(source.hours) ?? undefined,
			},
		];
	});
};

const parseCatalogs = (value: unknown): WorkspaceCatalogs | undefined => {
	if (!value || typeof value !== 'object') return undefined;
	const source = value as Record<string, unknown>;
	return {
		slot_intervals: parseCatalogOptions(source.slot_intervals),
		reminder_hours: parseCatalogOptions(source.reminder_hours),
		cancel_wait_hours: parseCatalogOptions(source.cancel_wait_hours),
	};
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

const parseGalleryImages = (value: unknown): WorkspaceGalleryImage[] => {
	if (!Array.isArray(value)) return [];
	return value
		.flatMap((item) => {
			if (!item || typeof item !== 'object') return [];
			const source = item as Record<string, unknown>;
			const id = toOptionalPositiveInt(source.id);
			const url = String(source.url || '').trim();
			if (!id || !url) return [];
			return [
				{
					id,
					url,
					filename: String(source.filename || '').trim() || undefined,
					mime_type: String(source.mime_type || '').trim() || undefined,
					sort_order: toNumber(source.sort_order, 0) || 0,
				},
			];
		})
		.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
};

const normalizeWorkspaceSettings = (value: unknown): WorkspaceSettingsData | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const idOrganization = toNumber(source.id_organization, 0);
	if (!idOrganization) return null;

	const cancelWaitRaw = source.cancel_wait_hours;
	const cancelWaitHours =
		cancelWaitRaw === null || cancelWaitRaw === undefined || cancelWaitRaw === ''
			? null
			: toNumber(cancelWaitRaw, 0) || null;

	return {
		id_organization: idOrganization,
		name: String(source.name || '').trim(),
		profile_slug: String(source.profile_slug || '').trim(),
		description: String(source.description || '').trim(),
		public_whatsapp: String(source.public_whatsapp || '').trim(),
		logo_url: String(source.logo_url || '').trim(),
		banner_url: String(source.banner_url || '').trim(),
		facebook_url: String(source.facebook_url || '').trim(),
		instagram_url: String(source.instagram_url || '').trim(),
		business_hours:
			source.business_hours == null || source.business_hours === ''
				? null
				: parseBusinessHours(source.business_hours),
		gallery_images: parseGalleryImages(source.gallery_images),
		time_format: normalizeTimeFormat(source.time_format),
		theme_pref: String(source.theme_pref || '').trim(),
		hidden_public_price_label:
			String(source.hidden_public_price_label || '').trim() || 'A evaluar',
		unanswered_alert_action: String(source.unanswered_alert_action || 'KEEP').trim().toUpperCase(),
		rsi_id_slot_interval: toOptionalPositiveInt(source.rsi_id_slot_interval),
		rh_id_reminder_hours: toOptionalPositiveInt(source.rh_id_reminder_hours),
		cwh_id_cancel_wait_hours: toOptionalPositiveInt(source.cwh_id_cancel_wait_hours),
		booking_slot_interval_minutes: toNumber(source.booking_slot_interval_minutes, 30) || 30,
		reminder_hours_before: toNumber(source.reminder_hours_before, 24) || 24,
		cancel_wait_hours: cancelWaitHours,
		notify_all_professionals:
			String(source.notify_all_professionals || 'N').trim().toUpperCase() === 'Y' ? 'Y' : 'N',
		catalogs: parseCatalogs(source.catalogs),
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

const WORKSPACE_GALLERY_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_WORKSPACE_GALLERY_URL,
	'ORDS_WORKSPACE_GALLERY_URL',
	'/workspace/gallery'
);

const parseGalleryMutationResponse = async (response: Response) => {
	let data: Record<string, unknown> | null = null;
	try {
		data = (await response.json()) as Record<string, unknown>;
	} catch {
		throw new WorkspaceSettingsApiError('No fue posible interpretar la respuesta de galería.', 502);
	}

	if (!response.ok || !data || data.status !== 'success') {
		throw new WorkspaceSettingsApiError(
			String(data?.message || 'No fue posible actualizar la galería.'),
			response.status || 400,
			data?.details
		);
	}

	const payload =
		data.data && typeof data.data === 'object'
			? (data.data as Record<string, unknown>)
			: {};

	return {
		message: String(data.message || '').trim(),
		gallery_images: parseGalleryImages(payload.gallery_images),
		item: (() => {
			const id = toOptionalPositiveInt(payload.id);
			const url = String(payload.url || '').trim();
			if (!id || !url) return null;
			return {
				id,
				url,
				filename: String(payload.filename || '').trim() || undefined,
				mime_type: String(payload.mime_type || '').trim() || undefined,
				sort_order: toNumber(payload.sort_order, 0) || 0,
			} satisfies WorkspaceGalleryImage;
		})(),
	};
};

export const addWorkspaceGalleryImageWithOrds = async (
	token: string,
	payload: { image_base64: string; image_name: string; image_mime: string }
) => {
	if (!token) throw new WorkspaceSettingsApiError('Token de acceso requerido.', 401);
	const response = await fetch(WORKSPACE_GALLERY_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});
	return parseGalleryMutationResponse(response);
};

export const deleteWorkspaceGalleryImageWithOrds = async (token: string, galleryId: number) => {
	if (!token) throw new WorkspaceSettingsApiError('Token de acceso requerido.', 401);
	const response = await fetch(`${WORKSPACE_GALLERY_URL.replace(/\/+$/, '')}/${galleryId}`, {
		method: 'DELETE',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});
	return parseGalleryMutationResponse(response);
};

export const reorderWorkspaceGalleryWithOrds = async (token: string, ids: number[]) => {
	if (!token) throw new WorkspaceSettingsApiError('Token de acceso requerido.', 401);
	const response = await fetch(WORKSPACE_GALLERY_URL, {
		method: 'PUT',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify({ ids }),
	});
	return parseGalleryMutationResponse(response);
};

export type ProfileSlugAvailability = {
	slug: string;
	available: boolean;
	reason: 'ok' | 'reserved' | 'taken' | 'invalid';
};

const PROFILE_SLUG_AVAILABLE_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_WORKSPACE_SLUG_AVAILABLE_URL,
	'ORDS_WORKSPACE_SLUG_AVAILABLE_URL',
	'/workspace/profile-slug-available'
);

export const checkProfileSlugAvailableWithOrds = async (
	token: string,
	slug: string
): Promise<ProfileSlugAvailability> => {
	if (!token) throw new WorkspaceSettingsApiError('Token de acceso requerido.', 401);
	const safeSlug = String(slug || '').trim();
	if (!safeSlug) {
		return { slug: '', available: false, reason: 'invalid' };
	}

	const url = new URL(PROFILE_SLUG_AVAILABLE_URL);
	url.searchParams.set('slug', safeSlug);

	const response = await fetch(url.toString(), {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	let data: Record<string, unknown> | null = null;
	try {
		data = (await response.json()) as Record<string, unknown>;
	} catch {
		throw new WorkspaceSettingsApiError('No fue posible validar el enlace público.', 502);
	}

	if (!response.ok || !data || data.status !== 'success') {
		throw new WorkspaceSettingsApiError(
			String(data?.message || 'No fue posible validar el enlace público.'),
			response.status || 400
		);
	}

	const payload =
		data.data && typeof data.data === 'object'
			? (data.data as Record<string, unknown>)
			: {};
	const reasonRaw = String(payload.reason || '').trim().toLowerCase();
	const reason: ProfileSlugAvailability['reason'] =
		reasonRaw === 'reserved' || reasonRaw === 'taken' || reasonRaw === 'ok'
			? reasonRaw
			: 'invalid';

	return {
		slug: String(payload.slug || safeSlug).trim(),
		available: payload.available === true || payload.available === 'true',
		reason,
	};
};
