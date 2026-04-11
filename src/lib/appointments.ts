import { resolveOrdsApiUrl } from './env-urls';

export const APPOINTMENTS_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_APPOINTMENTS_URL,
	'ORDS_APPOINTMENTS_URL',
	'/appointments'
);
export const APPOINTMENTS_CALENDAR_URL =
	resolveOrdsApiUrl(
		import.meta.env.ORDS_APPOINTMENTS_CALENDAR_URL,
		'ORDS_APPOINTMENTS_CALENDAR_URL',
		'/appointments/calendar'
	);

export interface AppointmentFieldError {
	field: string;
	message: string;
}

export interface AppointmentCalendarEventExtendedProps {
	customer_phone: string;
	status: string;
	professional_name: string;
	service_name: string;
	location_name: string;
	pro_id_professional: number;
}

export interface AppointmentCalendarEvent {
	id: number;
	title: string;
	start: string;
	end: string;
	resourceId: number;
	backgroundColor?: string;
	extendedProps: AppointmentCalendarEventExtendedProps;
}

export interface AppointmentDetail {
	id_appointment: number;
	loc_id_location: number;
	location_name: string;
	pro_id_professional: number;
	professional_name: string;
	ser_id_service: number;
	service_name: string;
	customer_name: string;
	customer_phone: string;
	status: string;
	start_time: string;
	end_time: string;
}

export interface AppointmentCalendarFilters {
	start: string;
	end: string;
	pro_id?: number;
	loc_id?: number;
}

export interface AppointmentCreatePayload {
	loc_id_location: number;
	pro_id_professional: number;
	ser_id_service: number;
	customer_name: string;
	customer_phone?: string;
	start_time: string;
	end_time: string;
}

export interface AppointmentUpdatePayload extends AppointmentCreatePayload {
	status: 'PENDIENTE' | 'CONFIRMADO' | 'COMPLETADO' | 'CANCELADO';
}

interface AppointmentSuccessResponse {
	status: 'success';
	message?: string;
	data?: unknown;
	id_appointment?: number;
}

interface AppointmentFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
	errors?: unknown;
}

export class AppointmentsApiError extends Error {
	status: number;
	details?: unknown;
	fieldErrors: AppointmentFieldError[];

	constructor(
		message: string,
		status = 400,
		details?: unknown,
		fieldErrors: AppointmentFieldError[] = []
	) {
		super(message);
		this.name = 'AppointmentsApiError';
		this.status = status;
		this.details = details;
		this.fieldErrors = fieldErrors;
	}
}

const toNumber = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const parseFieldErrors = (value: unknown): AppointmentFieldError[] => {
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

const ensureToken = (token: string) => {
	if (!token) {
		throw new AppointmentsApiError('Token de acceso requerido.', 401);
	}
};

const parseJsonResponse = async (response: Response) => {
	let data: AppointmentSuccessResponse | AppointmentFailureResponse | null = null;
	try {
		data = await response.json();
	} catch {
		throw new AppointmentsApiError(
			'No fue posible interpretar la respuesta del servidor de citas.',
			502
		);
	}

	return { data, response };
};

const isSuccessResponse = (
	value: AppointmentSuccessResponse | AppointmentFailureResponse | null
): value is AppointmentSuccessResponse => {
	return Boolean(value && typeof value === 'object' && value.status === 'success');
};

const toApiError = (
	response: Response,
	data: AppointmentSuccessResponse | AppointmentFailureResponse | null,
	fallbackMessage: string
) => {
	const failureData = (data ?? {}) as AppointmentFailureResponse;
	return new AppointmentsApiError(
		(typeof failureData.message === 'string' && failureData.message.trim()) || fallbackMessage,
		response.status || 400,
		failureData.details,
		parseFieldErrors(failureData.errors)
	);
};

const normalizeExtendedProps = (value: unknown, resourceId: number) => {
	if (!value || typeof value !== 'object') {
		return {
			customer_phone: '',
			status: '',
			professional_name: '',
			service_name: '',
			location_name: '',
			pro_id_professional: resourceId,
		};
	}

	const source = value as Record<string, unknown>;
	const explicitProfessionalId = toNumber(source.pro_id_professional, resourceId);

	return {
		customer_phone: String(source.customer_phone || '').trim(),
		status: String(source.status || '').trim(),
		professional_name: String(source.professional_name || '').trim(),
		service_name: String(source.service_name || '').trim(),
		location_name: String(source.location_name || '').trim(),
		pro_id_professional: Number.isInteger(explicitProfessionalId)
			? explicitProfessionalId
			: resourceId,
	};
};

const normalizeCalendarEvent = (value: unknown): AppointmentCalendarEvent | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const id = toNumber(source.id ?? source.id_appointment, NaN);
	const resourceId = toNumber(
		source.resourceId ?? source.pro_id_professional ?? source.pro_id,
		0
	);
	const start = String(source.start ?? source.start_time ?? '').trim();
	const end = String(source.end ?? source.end_time ?? '').trim();
	const fallbackTitle = String(source.service_name ?? source.customer_name ?? '').trim();
	const rawExtendedProps =
		source.extendedProps && typeof source.extendedProps === 'object'
			? source.extendedProps
			: source;

	if (!Number.isInteger(id) || id <= 0) return null;
	if (!start || !end) return null;

	return {
		id,
		title: String(source.title || '').trim() || fallbackTitle,
		start,
		end,
		resourceId,
		backgroundColor:
			String(source.backgroundColor ?? source.background_color ?? '').trim() || undefined,
		extendedProps: normalizeExtendedProps(rawExtendedProps, resourceId),
	};
};

const normalizeAppointmentDetail = (value: unknown): AppointmentDetail | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const appointmentId = toNumber(source.id_appointment ?? source.id, NaN);
	const locationId = toNumber(
		source.loc_id_location ?? source.id_location ?? source.loc_id,
		0
	);
	const professionalId = toNumber(
		source.pro_id_professional ?? source.id_professional ?? source.pro_id,
		0
	);
	const serviceId = toNumber(
		source.ser_id_service ?? source.id_service ?? source.ser_id,
		0
	);
	const startTime = String(source.start_time ?? source.start ?? '').trim();
	const endTime = String(source.end_time ?? source.end ?? '').trim();
	const statusRaw = String(source.status || '').trim().toUpperCase();
	const status =
		statusRaw === 'PENDIENTE' ||
		statusRaw === 'CONFIRMADO' ||
		statusRaw === 'COMPLETADO' ||
		statusRaw === 'CANCELADO'
			? statusRaw
			: 'CONFIRMADO';

	if (!Number.isInteger(appointmentId) || appointmentId <= 0) return null;
	if (!startTime || !endTime) return null;

	return {
		id_appointment: appointmentId,
		loc_id_location: Number.isInteger(locationId) && locationId > 0 ? locationId : 0,
		location_name: String(source.location_name || '').trim(),
		pro_id_professional:
			Number.isInteger(professionalId) && professionalId > 0 ? professionalId : 0,
		professional_name: String(source.professional_name || '').trim(),
		ser_id_service: Number.isInteger(serviceId) && serviceId > 0 ? serviceId : 0,
		service_name: String(source.service_name || '').trim(),
		customer_name: String(source.customer_name ?? source.full_name ?? '').trim(),
		customer_phone: String(source.customer_phone ?? source.phone_number ?? '').trim(),
		status,
		start_time: startTime,
		end_time: endTime,
	};
};

export const listAppointmentsForCalendarWithOrds = async (
	token: string,
	filters: AppointmentCalendarFilters
) => {
	ensureToken(token);

	const start = String(filters.start || '').trim();
	const end = String(filters.end || '').trim();
	console.info('[appointments-lib] listAppointmentsForCalendarWithOrds:start', {
		start,
		end,
		pro_id: filters.pro_id ?? null,
		loc_id: filters.loc_id ?? null,
	});
	if (!start || !end) {
		throw new AppointmentsApiError('Las fechas de inicio y fin son obligatorias.', 400);
	}

	const calendarUrl = new URL(APPOINTMENTS_CALENDAR_URL);
	calendarUrl.searchParams.set('start', start);
	calendarUrl.searchParams.set('end', end);

	if (Number.isInteger(filters.pro_id) && Number(filters.pro_id) > 0) {
		calendarUrl.searchParams.set('pro_id', String(filters.pro_id));
	}
	if (Number.isInteger(filters.loc_id) && Number(filters.loc_id) > 0) {
		calendarUrl.searchParams.set('loc_id', String(filters.loc_id));
	}

	const response = await fetch(calendarUrl.toString(), {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});
	console.info('[appointments-lib] ords-calendar-response', {
		status: response.status,
		ok: response.ok,
		url: calendarUrl.toString(),
	});

	const { data } = await parseJsonResponse(response);

	if (
		!response.ok ||
		!data ||
		typeof data !== 'object' ||
		data.status !== 'success' ||
		!('data' in data) ||
		!Array.isArray(data.data)
	) {
		throw toApiError(response, data, 'No fue posible cargar las citas del calendario.');
	}

	const normalizedEvents = data.data
		.map(normalizeCalendarEvent)
		.filter((item): item is AppointmentCalendarEvent => item !== null);
	console.info('[appointments-lib] normalized-calendar-events', {
		rawTotal: data.data.length,
		normalizedTotal: normalizedEvents.length,
	});

	return normalizedEvents;
};

export const getAppointmentByIdWithOrds = async (token: string, appointmentId: number) => {
	ensureToken(token);
	if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
		throw new AppointmentsApiError('ID de cita invalido.', 400);
	}

	const response = await fetch(`${APPOINTMENTS_URL}/${appointmentId}`, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	const { data } = await parseJsonResponse(response);
	if (
		!response.ok ||
		!data ||
		typeof data !== 'object' ||
		data.status !== 'success' ||
		!('data' in data)
	) {
		throw toApiError(response, data, 'No fue posible obtener el detalle de la cita.');
	}

	const normalized = normalizeAppointmentDetail(data.data);
	if (!normalized) {
		throw new AppointmentsApiError('No fue posible interpretar el detalle de la cita.', 502);
	}

	return normalized;
};

export const createAppointmentWithOrds = async (token: string, payload: AppointmentCreatePayload) => {
	ensureToken(token);

	const response = await fetch(APPOINTMENTS_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});

	const { data } = await parseJsonResponse(response);
	if (!response.ok || !isSuccessResponse(data)) {
		throw toApiError(response, data, 'No fue posible crear la cita.');
	}

	return {
		id_appointment: toNumber(data.id_appointment, 0),
		message:
			typeof data.message === 'string' && data.message.trim()
				? data.message
				: 'Cita creada correctamente.',
	};
};

export const updateAppointmentWithOrds = async (
	token: string,
	appointmentId: number,
	payload: AppointmentUpdatePayload
) => {
	ensureToken(token);
	if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
		throw new AppointmentsApiError('ID de cita invalido.', 400);
	}

	const response = await fetch(`${APPOINTMENTS_URL}/${appointmentId}`, {
		method: 'PUT',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});

	const { data } = await parseJsonResponse(response);
	if (!response.ok || !data || typeof data !== 'object' || data.status !== 'success') {
		throw toApiError(response, data, 'No fue posible actualizar la cita.');
	}

	return {
		message:
			typeof data.message === 'string' && data.message.trim()
				? data.message
				: 'Cita actualizada correctamente.',
	};
};

export const deleteAppointmentWithOrds = async (token: string, appointmentId: number) => {
	ensureToken(token);
	if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
		throw new AppointmentsApiError('ID de cita invalido.', 400);
	}

	const response = await fetch(`${APPOINTMENTS_URL}/${appointmentId}`, {
		method: 'DELETE',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	const { data } = await parseJsonResponse(response);
	if (!response.ok || !data || typeof data !== 'object' || data.status !== 'success') {
		throw toApiError(response, data, 'No fue posible eliminar la cita.');
	}

	return {
		message:
			typeof data.message === 'string' && data.message.trim()
				? data.message
				: 'Cita eliminada correctamente.',
	};
};
