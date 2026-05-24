import { LOCATIONS_URL } from './locations';
import { resolveOrdsApiUrl } from './env-urls';
import { PROFESSIONALS_URL } from './professionals';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export const PROFESSIONALS_LOV_URL =
	import.meta.env.ORDS_PROFESSIONALS_LOV_URL ??
	`${trimTrailingSlash(PROFESSIONALS_URL)}/lov`;

export const LOCATIONS_LOV_URL =
	import.meta.env.ORDS_LOCATIONS_LOV_URL ??
	`${trimTrailingSlash(LOCATIONS_URL)}/lov`;

export const DAYS_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_DAYS_URL,
	'ORDS_DAYS_URL',
	'/days'
);

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

export type ScheduleExceptionType = 'BLOCKED' | 'OVERRIDE';

export interface ScheduleExceptionSummary {
	id_schedule_exception: number;
	exception_date: string;
	exception_type: ScheduleExceptionType;
	note: string | null;
	slot_count: number;
	is_past: boolean;
}

export interface ScheduleExceptionSlot {
	id_exception_slot?: number;
	loc_id_location: number;
	location_name?: string;
	start_time: string;
	end_time: string;
}

export interface ScheduleExceptionDetail {
	id_schedule_exception?: number;
	exception_date: string;
	exception_type: ScheduleExceptionType | null;
	note: string | null;
	slots: ScheduleExceptionSlot[];
	is_past: boolean;
	inherits_template: boolean;
}

export interface ScheduleExceptionSlotInput {
	loc_id_location: number;
	start_time: string;
	end_time: string;
}

export interface ScheduleExceptionUpsertPayload {
	exception_type: ScheduleExceptionType;
	note?: string | null;
	slots: ScheduleExceptionSlotInput[];
	acknowledge_existing_appointments?: boolean;
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

export class ScheduleExceptionConflictError extends SchedulesApiError {
	code: string;
	appointmentCount: number;

	constructor(message: string, appointmentCount: number, details?: unknown) {
		super(message, 409, details);
		this.name = 'ScheduleExceptionConflictError';
		this.code = 'EXISTING_APPOINTMENTS';
		this.appointmentCount = appointmentCount;
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
		const failureData = (data ?? {}) as ApiFailureResponse & {
			code?: string;
			appointment_count?: number;
		};
		const message =
			(typeof failureData.message === 'string' && failureData.message.trim()) || fallbackMessage;
		if (
			response.status === 409 &&
			String(failureData.code || '').trim() === 'EXISTING_APPOINTMENTS'
		) {
			throw new ScheduleExceptionConflictError(
				message,
				Number(failureData.appointment_count ?? 0),
				failureData.details
			);
		}
		throw new SchedulesApiError(
			message,
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

const getScheduleExceptionsUrlByProfessionalId = (professionalId: number) =>
	`${trimTrailingSlash(PROFESSIONALS_URL)}/${professionalId}/schedule-exceptions`;

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const parseDataObjectResponse = async (response: Response, fallbackMessage: string) => {
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
		!data.data ||
		typeof data.data !== 'object'
	) {
		const failureData = (data ?? {}) as ApiFailureResponse;
		throw new SchedulesApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) || fallbackMessage,
			response.status || 400,
			failureData.details,
			parseFieldErrors(failureData.errors)
		);
	}

	return data.data as Record<string, unknown>;
};

const normalizeExceptionSummary = (value: unknown): ScheduleExceptionSummary | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const exceptionDate = firstString(source, ['exception_date']);
	const exceptionType = firstString(source, ['exception_type']).toUpperCase();
	if (!DATE_KEY_REGEX.test(exceptionDate)) return null;
	if (exceptionType !== 'BLOCKED' && exceptionType !== 'OVERRIDE') return null;

	return {
		id_schedule_exception: toNumber(source.id_schedule_exception, 0),
		exception_date: exceptionDate,
		exception_type: exceptionType as ScheduleExceptionType,
		note: firstString(source, ['note']) || null,
		slot_count: toNumber(source.slot_count, 0),
		is_past: toNumber(source.is_past, 0) === 1,
	};
};

const normalizeExceptionSlot = (value: unknown): ScheduleExceptionSlot | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const locId = firstNumber(source, ['loc_id_location', 'id_location']);
	const startTime = firstString(source, ['start_time']);
	const endTime = firstString(source, ['end_time']);
	if (!Number.isInteger(locId) || locId <= 0 || !startTime || !endTime) return null;

	return {
		id_exception_slot: toNumber(source.id_exception_slot, 0) || undefined,
		loc_id_location: locId,
		location_name: firstString(source, ['location_name', 'name']),
		start_time: startTime,
		end_time: endTime,
	};
};

const normalizeExceptionDetail = (value: Record<string, unknown>): ScheduleExceptionDetail => {
	const exceptionDate = firstString(value, ['exception_date']);
	const rawType = firstString(value, ['exception_type']).toUpperCase();
	const exceptionType =
		rawType === 'BLOCKED' || rawType === 'OVERRIDE' ? (rawType as ScheduleExceptionType) : null;
	const slotsRaw = Array.isArray(value.slots) ? value.slots : [];

	return {
		id_schedule_exception: toNumber(value.id_schedule_exception, 0) || undefined,
		exception_date: exceptionDate,
		exception_type: exceptionType,
		note: firstString(value, ['note']) || null,
		slots: slotsRaw
			.map(normalizeExceptionSlot)
			.filter((item): item is ScheduleExceptionSlot => item !== null),
		is_past: toNumber(value.is_past, 0) === 1,
		inherits_template: toNumber(value.inherits_template, 0) === 1,
	};
};

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

export const listScheduleExceptionsWithOrds = async (
	token: string,
	professionalId: number,
	fromDate: string,
	toDate: string
): Promise<ScheduleExceptionSummary[]> => {
	ensureToken(token);
	if (!Number.isInteger(professionalId) || professionalId <= 0) {
		throw new SchedulesApiError('ID de profesional invalido.', 400);
	}
	if (!DATE_KEY_REGEX.test(fromDate) || !DATE_KEY_REGEX.test(toDate)) {
		throw new SchedulesApiError('Rango de fechas invalido. Use YYYY-MM-DD.', 400);
	}

	const endpoint = new URL(getScheduleExceptionsUrlByProfessionalId(professionalId));
	endpoint.searchParams.set('from', fromDate);
	endpoint.searchParams.set('to', toDate);

	const response = await fetch(endpoint.toString(), {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	const rows = await parseArrayResponse(
		response,
		'No fue posible obtener las excepciones del calendario.'
	);
	return rows
		.map(normalizeExceptionSummary)
		.filter((item): item is ScheduleExceptionSummary => item !== null);
};

export const getScheduleExceptionWithOrds = async (
	token: string,
	professionalId: number,
	exceptionDate: string
): Promise<ScheduleExceptionDetail> => {
	ensureToken(token);
	if (!Number.isInteger(professionalId) || professionalId <= 0) {
		throw new SchedulesApiError('ID de profesional invalido.', 400);
	}
	if (!DATE_KEY_REGEX.test(exceptionDate)) {
		throw new SchedulesApiError('Fecha invalida. Use YYYY-MM-DD.', 400);
	}

	const response = await fetch(
		`${getScheduleExceptionsUrlByProfessionalId(professionalId)}/${exceptionDate}`,
		{
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/json',
			},
		}
	);

	const data = await parseDataObjectResponse(
		response,
		'No fue posible obtener el detalle de la excepcion.'
	);
	return normalizeExceptionDetail(data);
};

export const upsertScheduleExceptionWithOrds = async (
	token: string,
	professionalId: number,
	exceptionDate: string,
	payload: ScheduleExceptionUpsertPayload
) => {
	ensureToken(token);
	if (!Number.isInteger(professionalId) || professionalId <= 0) {
		throw new SchedulesApiError('ID de profesional invalido.', 400);
	}
	if (!DATE_KEY_REGEX.test(exceptionDate)) {
		throw new SchedulesApiError('Fecha invalida. Use YYYY-MM-DD.', 400);
	}

	const response = await fetch(
		`${getScheduleExceptionsUrlByProfessionalId(professionalId)}/${exceptionDate}`,
		{
			method: 'PUT',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			body: JSON.stringify(payload),
		}
	);

	return parseActionResponse(response, 'No fue posible guardar la excepcion.');
};

export const deleteScheduleExceptionWithOrds = async (
	token: string,
	professionalId: number,
	exceptionDate: string
) => {
	ensureToken(token);
	if (!Number.isInteger(professionalId) || professionalId <= 0) {
		throw new SchedulesApiError('ID de profesional invalido.', 400);
	}
	if (!DATE_KEY_REGEX.test(exceptionDate)) {
		throw new SchedulesApiError('Fecha invalida. Use YYYY-MM-DD.', 400);
	}

	const response = await fetch(
		`${getScheduleExceptionsUrlByProfessionalId(professionalId)}/${exceptionDate}`,
		{
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/json',
			},
		}
	);

	return parseActionResponse(response, 'No fue posible eliminar la excepcion.');
};
