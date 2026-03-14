import { LOCATIONS_URL } from './locations';
import { PROFESSIONALS_URL } from './professionals';

const DEFAULT_DAYS_URL =
	'https://g9549f707e8ebfa-aox.adb.sa-saopaulo-1.oraclecloudapps.com/ords/bookmate/api/v1/days';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export const PROFESSIONALS_LOV_URL =
	import.meta.env.ORDS_PROFESSIONALS_LOV_URL ??
	`${trimTrailingSlash(PROFESSIONALS_URL)}/lov`;

export const LOCATIONS_LOV_URL =
	import.meta.env.ORDS_LOCATIONS_LOV_URL ??
	`${trimTrailingSlash(LOCATIONS_URL)}/lov`;

export const DAYS_URL = import.meta.env.ORDS_DAYS_URL ?? DEFAULT_DAYS_URL;

export interface ScheduleProfessionalLov {
	id_professional: number;
	display_name: string;
}

export interface ScheduleLocationLov {
	id_location: number;
	name: string;
}

export interface ScheduleDay {
	day_of_week: number;
	name: string;
}

export interface ProfessionalScheduleItem {
	id_professional_schedule: number;
	loc_id_location: number;
	location_name: string;
	day_of_week: number;
	start_time: string;
	end_time: string;
}

export interface ScheduleUpdateItem {
	loc_id_location: number;
	day_of_week: number;
	start_time: string;
	end_time: string;
}

export interface ScheduleUpdatePayload {
	schedules: ScheduleUpdateItem[];
}

interface ApiSuccessResponse {
	status: 'success';
	data?: unknown;
	message?: string;
}

interface ApiFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
	errors?: unknown;
}

export class SchedulesApiError extends Error {
	status: number;
	details?: unknown;
	fieldErrors: { field: string; message: string }[];

	constructor(
		message: string,
		status = 400,
		details?: unknown,
		fieldErrors: { field: string; message: string }[] = []
	) {
		super(message);
		this.name = 'SchedulesApiError';
		this.status = status;
		this.details = details;
		this.fieldErrors = fieldErrors;
	}
}

const fallbackDays: ScheduleDay[] = [
	{ day_of_week: 1, name: 'Lunes' },
	{ day_of_week: 2, name: 'Martes' },
	{ day_of_week: 3, name: 'Miercoles' },
	{ day_of_week: 4, name: 'Jueves' },
	{ day_of_week: 5, name: 'Viernes' },
	{ day_of_week: 6, name: 'Sabado' },
	{ day_of_week: 7, name: 'Domingo' },
];

const toNumber = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const firstNumber = (source: Record<string, unknown>, keys: string[]) => {
	for (const key of keys) {
		if (!(key in source)) continue;
		const parsed = toNumber(source[key], NaN);
		if (Number.isFinite(parsed)) return parsed;
	}
	return NaN;
};

const firstString = (source: Record<string, unknown>, keys: string[]) => {
	for (const key of keys) {
		const value = source[key];
		if (value === undefined || value === null) continue;
		const text = String(value).trim();
		if (text) return text;
	}
	return '';
};

const parseFieldErrors = (value: unknown) => {
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

const parseArrayResponse = async (response: Response, fallbackMessage: string) => {
	let data: ApiSuccessResponse | ApiFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new SchedulesApiError('No fue posible interpretar la respuesta del servidor de horarios.', 502);
	}

	if (
		!response.ok ||
		!data ||
		typeof data !== 'object' ||
		data.status !== 'success' ||
		!('data' in data) ||
		!Array.isArray(data.data)
	) {
		const failureData = (data ?? {}) as ApiFailureResponse;
		throw new SchedulesApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) || fallbackMessage,
			response.status || 400,
			failureData.details,
			parseFieldErrors(failureData.errors)
		);
	}

	return data.data;
};

const parseActionResponse = async (response: Response, fallbackMessage: string) => {
	let data: ApiSuccessResponse | ApiFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new SchedulesApiError('No fue posible interpretar la respuesta del servidor de horarios.', 502);
	}

	if (!response.ok || !data || typeof data !== 'object' || data.status !== 'success') {
		const failureData = (data ?? {}) as ApiFailureResponse;
		throw new SchedulesApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) || fallbackMessage,
			response.status || 400,
			failureData.details,
			parseFieldErrors(failureData.errors)
		);
	}

	return {
		message:
			typeof data.message === 'string' && data.message.trim()
				? data.message
				: 'Horarios guardados correctamente.',
	};
};

const normalizeProfessionalLov = (value: unknown): ScheduleProfessionalLov | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const professionalId = firstNumber(source, [
		'id_professional',
		'pro_id_professional',
		'id',
		'value',
	]);
	if (!Number.isInteger(professionalId) || professionalId <= 0) return null;

	const explicitName = firstString(source, [
		'display_name',
		'full_name',
		'professional_name',
		'name',
		'label',
		'text',
	]);

	let displayName = explicitName;
	if (!displayName) {
		const firstName = firstString(source, ['first_name']);
		const lastName = firstString(source, ['last_name']);
		displayName = `${firstName} ${lastName}`.trim();
	}

	if (!displayName && source.user && typeof source.user === 'object') {
		const user = source.user as Record<string, unknown>;
		const firstName = firstString(user, ['first_name']);
		const lastName = firstString(user, ['last_name']);
		displayName = `${firstName} ${lastName}`.trim();
	}

	return {
		id_professional: professionalId,
		display_name: displayName || `Profesional #${professionalId}`,
	};
};

const normalizeLocationLov = (value: unknown): ScheduleLocationLov | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const locationId = firstNumber(source, ['id_location', 'loc_id_location', 'id', 'value']);
	if (!Number.isInteger(locationId) || locationId <= 0) return null;

	const name = firstString(source, ['name', 'location_name', 'label', 'text']);
	return {
		id_location: locationId,
		name: name || `Sucursal #${locationId}`,
	};
};

const normalizeDay = (value: unknown): ScheduleDay | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const dayOfWeek = firstNumber(source, ['day_of_week', 'day_number', 'id_day', 'id', 'value']);
	if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) return null;
	const name =
		firstString(source, ['name', 'day_name', 'label', 'text']) ||
		fallbackDays.find((item) => item.day_of_week === dayOfWeek)?.name ||
		`Dia ${dayOfWeek}`;

	return {
		day_of_week: dayOfWeek,
		name,
	};
};

const normalizeScheduleItem = (value: unknown): ProfessionalScheduleItem | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;

	const dayOfWeek = firstNumber(source, ['day_of_week']);
	const locId = firstNumber(source, ['loc_id_location', 'id_location']);
	if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) return null;
	if (!Number.isInteger(locId) || locId <= 0) return null;

	const startTime = firstString(source, ['start_time']);
	const endTime = firstString(source, ['end_time']);
	if (!startTime || !endTime) return null;

	return {
		id_professional_schedule: toNumber(source.id_professional_schedule, 0),
		loc_id_location: locId,
		location_name: firstString(source, ['location_name', 'name']),
		day_of_week: dayOfWeek,
		start_time: startTime,
		end_time: endTime,
	};
};

const getScheduleUrlByProfessionalId = (professionalId: number) =>
	`${trimTrailingSlash(PROFESSIONALS_URL)}/${professionalId}/schedule`;

const ensureToken = (token: string) => {
	if (!token) throw new SchedulesApiError('Token de acceso requerido.', 401);
};

export const listProfessionalsLovWithOrds = async (
	token: string,
	options?: { onlyMe?: boolean }
): Promise<ScheduleProfessionalLov[]> => {
	ensureToken(token);

	let endpoint = String(PROFESSIONALS_LOV_URL || '').trim();
	if (options?.onlyMe) {
		endpoint = `${endpoint}${endpoint.includes('?') ? '&' : '?'}only_me=1`;
	}

	const response = await fetch(endpoint, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	const rows = await parseArrayResponse(response, 'No fue posible obtener el listado de profesionales.');
	return rows
		.map(normalizeProfessionalLov)
		.filter((item): item is ScheduleProfessionalLov => item !== null)
		.sort((a, b) => a.display_name.localeCompare(b.display_name, 'es', { sensitivity: 'base' }));
};

export const listLocationsLovWithOrds = async (token: string): Promise<ScheduleLocationLov[]> => {
	ensureToken(token);

	const response = await fetch(LOCATIONS_LOV_URL, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	const rows = await parseArrayResponse(response, 'No fue posible obtener el listado de sucursales.');
	return rows
		.map(normalizeLocationLov)
		.filter((item): item is ScheduleLocationLov => item !== null)
		.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
};

export const listScheduleDaysWithOrds = async (token: string): Promise<ScheduleDay[]> => {
	ensureToken(token);

	const response = await fetch(DAYS_URL, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	const rows = await parseArrayResponse(response, 'No fue posible obtener los dias de la semana.');
	const normalizedDays = rows.map(normalizeDay).filter((item): item is ScheduleDay => item !== null);
	if (normalizedDays.length === 0) return fallbackDays;

	const mapByDay = new Map<number, ScheduleDay>();
	for (const day of normalizedDays) {
		if (!mapByDay.has(day.day_of_week)) mapByDay.set(day.day_of_week, day);
	}

	return Array.from(mapByDay.values()).sort((a, b) => a.day_of_week - b.day_of_week);
};

export const getProfessionalScheduleWithOrds = async (
	token: string,
	professionalId: number
): Promise<ProfessionalScheduleItem[]> => {
	ensureToken(token);
	if (!Number.isInteger(professionalId) || professionalId <= 0) {
		throw new SchedulesApiError('ID de profesional invalido.', 400);
	}

	const response = await fetch(getScheduleUrlByProfessionalId(professionalId), {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	const rows = await parseArrayResponse(response, 'No fue posible obtener los horarios del profesional.');
	return rows
		.map(normalizeScheduleItem)
		.filter((item): item is ProfessionalScheduleItem => item !== null)
		.sort((a, b) => {
			if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
			if (a.start_time !== b.start_time) return a.start_time.localeCompare(b.start_time);
			return a.end_time.localeCompare(b.end_time);
		});
};

export const updateProfessionalScheduleWithOrds = async (
	token: string,
	professionalId: number,
	payload: ScheduleUpdatePayload
) => {
	ensureToken(token);
	if (!Number.isInteger(professionalId) || professionalId <= 0) {
		throw new SchedulesApiError('ID de profesional invalido.', 400);
	}

	const response = await fetch(getScheduleUrlByProfessionalId(professionalId), {
		method: 'PUT',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});

	return parseActionResponse(response, 'No fue posible guardar los horarios del profesional.');
};
