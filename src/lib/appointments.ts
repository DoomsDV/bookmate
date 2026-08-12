import {
	type AttendanceStatus,
	isAttendanceReconfirmed,
	normalizeAttendanceConfirmed,
	normalizeAttendanceReplyAt,
	normalizeAttendanceStatus,
} from './attendance';
import { resolveOrdsApiUrl } from './env-urls';
import {
	isScheduleMisalignedFlag,
	normalizeScheduleMisalignedReason,
	type ScheduleMisalignedReason,
} from './schedule-misaligned';
import { normalizeSessionNotesHistory } from './session-notes';

export type { AttendanceStatus, ScheduleMisalignedReason };
export { isAttendanceReconfirmed, normalizeAttendanceStatus };

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
	attendance_status: AttendanceStatus;
	attendance_confirmed: boolean;
	attendance_reply_at?: string;
	professional_name: string;
	service_name: string;
	location_name: string;
	pro_id_professional: number;
	schedule_misaligned?: boolean;
	schedule_misaligned_reason?: ScheduleMisalignedReason | null;
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

export interface AppointmentAttachment {
	id_attachment: number;
	file_name: string;
	mime_type: string;
	size_bytes: number;
	url: string;
	created_at?: string;
}

export interface SessionNotes {
	consultation_reason?: string | null;
	procedure_notes?: string | null;
	recommendations?: string | null;
}

export interface AppointmentHistory extends SessionNotes {
	notes?: string | null;
	attachments: AppointmentAttachment[];
}

export interface AppointmentDetail {
	id_appointment: number;
	id_customer: number;
	loc_id_location: number;
	location_name: string;
	pro_id_professional: number;
	professional_name: string;
	ser_id_service: number;
	service_name: string;
	customer_name: string;
	customer_phone: string;
	status: string;
	attendance_status: AttendanceStatus;
	attendance_confirmed: boolean;
	attendance_reply_at?: string;
	start_time: string;
	end_time: string;
	schedule_misaligned?: boolean;
	schedule_misaligned_reason?: ScheduleMisalignedReason | null;
	history_enabled: boolean;
	history: AppointmentHistory;
	payment_status?: string | null;
	deposit_amount?: number | null;
	refund_status?: string | null;
	refund_amount?: number | null;
}

export interface AppointmentCalendarFilters {
	start: string;
	end: string;
	pro_id?: number;
	loc_id?: number;
}

export interface AppointmentCreatePayload {
	id_customer?: number;
	loc_id_location: number;
	pro_id_professional: number;
	ser_id_service: number;
	customer_name: string;
	customer_phone?: string;
	start_time: string;
	end_time: string;
	payment_status?: 'NONE' | 'PENDING' | 'PAID' | 'PAID_TRANSFER' | 'PAID_CASH' | 'EXEMPT';
	acknowledge_schedule_misalignment?: boolean;
	notify_customer?: boolean;
}

export interface AppointmentUpdatePayload extends AppointmentCreatePayload {
	status: 'PENDIENTE' | 'CONFIRMADO' | 'COMPLETADO' | 'CANCELADO';
	// Fase 4: notas de la sesion, se guardan al pasar a COMPLETADO (solo Premium).
	session_notes?: SessionNotes | string;
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
	code?: string;
	schedule_misaligned_reason?: string;
}

export class AppointmentsApiError extends Error {
	status: number;
	details?: unknown;
	fieldErrors: AppointmentFieldError[];
	code?: string;
	scheduleMisalignedReason?: string | null;

	constructor(
		message: string,
		status = 400,
		details?: unknown,
		fieldErrors: AppointmentFieldError[] = [],
		options?: { code?: string; scheduleMisalignedReason?: string | null }
	) {
		super(message);
		this.name = 'AppointmentsApiError';
		this.status = status;
		this.details = details;
		this.fieldErrors = fieldErrors;
		this.code = options?.code;
		this.scheduleMisalignedReason = options?.scheduleMisalignedReason ?? null;
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
	const code = String(failureData.code || '').trim() || undefined;
	const scheduleMisalignedReason = String(failureData.schedule_misaligned_reason || '').trim() || null;
	const details =
		failureData.details && typeof failureData.details === 'object' && !Array.isArray(failureData.details)
			? {
					...(failureData.details as Record<string, unknown>),
					...(code ? { code } : {}),
					...(scheduleMisalignedReason ? { schedule_misaligned_reason: scheduleMisalignedReason } : {}),
				}
			: {
					...(code ? { code } : {}),
					...(scheduleMisalignedReason ? { schedule_misaligned_reason: scheduleMisalignedReason } : {}),
				};

	return new AppointmentsApiError(
		(typeof failureData.message === 'string' && failureData.message.trim()) || fallbackMessage,
		response.status || 400,
		Object.keys(details).length > 0 ? details : failureData.details,
		parseFieldErrors(failureData.errors),
		{ code, scheduleMisalignedReason }
	);
};

const normalizeExtendedProps = (value: unknown, resourceId: number) => {
	if (!value || typeof value !== 'object') {
		return {
			customer_phone: '',
			status: '',
			attendance_status: 'NOT_REQUESTED' as AttendanceStatus,
			attendance_confirmed: false,
			professional_name: '',
			service_name: '',
			location_name: '',
			pro_id_professional: resourceId,
		};
	}

	const source = value as Record<string, unknown>;
	const explicitProfessionalId = toNumber(source.pro_id_professional, resourceId);
	const attendanceStatus = normalizeAttendanceStatus(source.attendance_status);

	const scheduleMisaligned = isScheduleMisalignedFlag(source.schedule_misaligned);
	const scheduleMisalignedReason = scheduleMisaligned
		? normalizeScheduleMisalignedReason(source.schedule_misaligned_reason)
		: null;

	return {
		customer_phone: String(source.customer_phone || '').trim(),
		status: String(source.status || '').trim(),
		attendance_status: attendanceStatus,
		attendance_confirmed: normalizeAttendanceConfirmed(
			source.attendance_confirmed,
			attendanceStatus
		),
		attendance_reply_at: normalizeAttendanceReplyAt(source.attendance_reply_at),
		professional_name: String(source.professional_name || '').trim(),
		service_name: String(source.service_name || '').trim(),
		location_name: String(source.location_name || '').trim(),
		pro_id_professional: Number.isInteger(explicitProfessionalId)
			? explicitProfessionalId
			: resourceId,
		schedule_misaligned: scheduleMisaligned,
		schedule_misaligned_reason: scheduleMisalignedReason,
	};
};

const applyScheduleMisalignedFields = (
	target: {
		schedule_misaligned?: boolean;
		schedule_misaligned_reason?: ScheduleMisalignedReason | null;
	},
	source: Record<string, unknown>,
	status: string,
	startTime: string
) => {
	const statusUpper = status.trim().toUpperCase();
	const startDate = new Date(startTime);
	const isActiveStatus = statusUpper === 'PENDIENTE' || statusUpper === 'CONFIRMADO';
	const isFutureOrToday =
		!Number.isNaN(startDate.getTime()) &&
		startDate.setHours(0, 0, 0, 0) >= new Date().setHours(0, 0, 0, 0);

	if (!isActiveStatus || !isFutureOrToday) {
		target.schedule_misaligned = false;
		target.schedule_misaligned_reason = null;
		return;
	}

	target.schedule_misaligned = isScheduleMisalignedFlag(source.schedule_misaligned);
	target.schedule_misaligned_reason = target.schedule_misaligned
		? normalizeScheduleMisalignedReason(source.schedule_misaligned_reason)
		: null;
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

const normalizeAttachment = (value: unknown): AppointmentAttachment | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const id = toNumber(source.id_attachment ?? source.id, NaN);
	if (!Number.isInteger(id) || id <= 0) return null;
	return {
		id_attachment: id,
		file_name: String(source.file_name ?? source.name ?? '').trim() || 'archivo',
		mime_type: String(source.mime_type ?? '').trim(),
		size_bytes: toNumber(source.size_bytes, 0),
		url: String(source.url ?? source.storage_url ?? '').trim(),
		created_at: String(source.created_at ?? '').trim() || undefined,
	};
};

const normalizeAppointmentHistory = (value: unknown): AppointmentHistory => {
	if (!value || typeof value !== 'object') {
		return {
			consultation_reason: null,
			procedure_notes: null,
			recommendations: null,
			notes: null,
			attachments: [],
		};
	}
	const source = value as Record<string, unknown>;
	const notes = normalizeSessionNotesHistory(source);
	const attachments = Array.isArray(source.attachments)
		? source.attachments
				.map(normalizeAttachment)
				.filter((item): item is AppointmentAttachment => item !== null)
		: [];
	return { ...notes, attachments };
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

	const attendanceStatus = normalizeAttendanceStatus(source.attendance_status);
	const history = normalizeAppointmentHistory(source.history);

	const detail: AppointmentDetail = {
		id_appointment: appointmentId,
		id_customer: toNumber(source.id_customer ?? source.cus_id_customer, 0),
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
		attendance_status: attendanceStatus,
		attendance_confirmed: normalizeAttendanceConfirmed(
			source.attendance_confirmed,
			attendanceStatus
		),
		attendance_reply_at: normalizeAttendanceReplyAt(source.attendance_reply_at),
		start_time: startTime,
		end_time: endTime,
		history_enabled: source.history_enabled === true,
		history,
		payment_status: String(source.payment_status || '').trim() || null,
		deposit_amount: Number(source.deposit_amount ?? NaN) || null,
		refund_status: String(source.refund_status || '').trim() || null,
		refund_amount: Number(source.refund_amount ?? NaN) || null,
	};

	applyScheduleMisalignedFields(detail, source, status, startTime);

	return detail;
};

export const listAppointmentsForCalendarWithOrds = async (
	token: string,
	filters: AppointmentCalendarFilters
) => {
	ensureToken(token);

	const start = String(filters.start || '').trim();
	const end = String(filters.end || '').trim();
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

export interface AppointmentBulkRowResult {
	index: number;
	status: 'created' | 'error';
	id_appointment?: number;
	message?: string;
}

export interface AppointmentBulkResult {
	created: number;
	failed: number;
	results: AppointmentBulkRowResult[];
}

/**
 * Guardado masivo de citas (escaneo de agenda). Una sola llamada HTTP al
 * endpoint ORDS /appointments/bulk, que resuelve identidad/suscripcion una
 * vez y procesa todas las filas dentro de la misma conexion PL/SQL (sin un
 * round-trip HTTP por fila). No aborta el lote si una fila falla; el backend
 * devuelve resultado por fila.
 */
export const createAppointmentsBulkWithOrds = async (
	token: string,
	rows: AppointmentCreatePayload[]
): Promise<AppointmentBulkResult> => {
	ensureToken(token);

	if (!Array.isArray(rows) || rows.length === 0) {
		throw new AppointmentsApiError('No hay citas para guardar.', 400);
	}

	const response = await fetch(`${APPOINTMENTS_URL}/bulk`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify({ appointments: rows }),
	});

	const { data } = await parseJsonResponse(response);
	const bulkData = data as unknown as
		| (AppointmentSuccessResponse & Partial<AppointmentBulkResult>)
		| null;

	// El status HTTP puede ser 400 cuando ninguna fila se creo (created = 0),
	// asi que la forma del body (status success + results[]) es lo que decide
	// si es un resultado por lote o un error real (auth, suscripcion, payload).
	if (!bulkData || bulkData.status !== 'success' || !Array.isArray(bulkData.results)) {
		throw toApiError(response, data, 'No fue posible guardar las citas.');
	}

	const results: AppointmentBulkRowResult[] = bulkData.results.map((row) => {
		const rawRow = row as Partial<AppointmentBulkRowResult>;
		return {
			index: toNumber(rawRow.index, 0),
			status: rawRow.status === 'created' ? 'created' : 'error',
			...(rawRow.id_appointment !== undefined
				? { id_appointment: toNumber(rawRow.id_appointment, 0) }
				: {}),
			...(rawRow.message ? { message: String(rawRow.message) } : {}),
		};
	});

	return {
		created: toNumber(bulkData.created, 0),
		failed: toNumber(bulkData.failed, 0),
		results,
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

export interface AppointmentAttachmentUploadPayload {
	file_base64: string;
	filename: string;
	mime_type: string;
}

export const uploadAppointmentAttachmentWithOrds = async (
	token: string,
	appointmentId: number,
	payload: AppointmentAttachmentUploadPayload
) => {
	ensureToken(token);
	if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
		throw new AppointmentsApiError('ID de cita invalido.', 400);
	}

	const response = await fetch(`${APPOINTMENTS_URL}/${appointmentId}/attachments`, {
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
		throw toApiError(response, data, 'No fue posible subir el archivo adjunto.');
	}

	const attachment = normalizeAttachment(
		data.data && typeof data.data === 'object' ? data.data : null
	);

	return {
		attachment,
		message:
			typeof data.message === 'string' && data.message.trim()
				? data.message
				: 'Archivo adjuntado correctamente.',
	};
};

export const deleteAppointmentAttachmentWithOrds = async (
	token: string,
	appointmentId: number,
	attachmentId: number
) => {
	ensureToken(token);
	if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
		throw new AppointmentsApiError('ID de cita invalido.', 400);
	}
	if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
		throw new AppointmentsApiError('ID de adjunto invalido.', 400);
	}

	const response = await fetch(
		`${APPOINTMENTS_URL}/${appointmentId}/attachments/${attachmentId}`,
		{
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/json',
			},
		}
	);

	const { data } = await parseJsonResponse(response);
	if (!response.ok || !data || typeof data !== 'object' || data.status !== 'success') {
		throw toApiError(response, data, 'No fue posible eliminar el archivo adjunto.');
	}

	return {
		message:
			typeof data.message === 'string' && data.message.trim()
				? data.message
				: 'Adjunto eliminado correctamente.',
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
