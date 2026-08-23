import {
	APPOINTMENT_ATTACHMENT_BFF_SAFE_JSON_BYTES,
	estimateAttachmentJsonBytes,
} from '../../lib/appointment-attachment';
import type {
	AppointmentAttachment,
	AppointmentCreatePayload,
	AppointmentDetail,
	AppointmentFormPayload,
	CalendarMetaResponse,
	CustomerOption,
} from './types';
import { ApiClientError, parseApiFieldErrors, readApiError } from './utils';

type ApiSuccess<TData = unknown> = {
	status: 'success';
	data?: TData;
	message?: string;
	id_appointment?: number;
};

type ApiFailure = {
	status?: string;
	message?: string;
	errors?: unknown;
	code?: string;
	schedule_misaligned_reason?: string;
};

type GoogleCalendarEventsPayload = {
	connected: boolean;
	events: unknown[];
};

const PAYLOAD_TOO_LARGE_MESSAGE =
	'El archivo es demasiado grande para subir por esta vía. Probá una foto más liviana o un PDF de hasta 20 MB.';

const parseJsonResponse = async (response: Response) => {
	if (response.status === 413) {
		throw new ApiClientError(PAYLOAD_TOO_LARGE_MESSAGE, 413);
	}

	try {
		return (await response.json()) as ApiSuccess | ApiFailure;
	} catch {
		throw new ApiClientError('No fue posible interpretar la respuesta del servidor.', response.status || 502);
	}
};

const ensureSuccess = (response: Response, data: ApiSuccess | ApiFailure, fallbackMessage: string) => {
	if (response.ok && data?.status === 'success') return;

	const failure = data as ApiFailure;
	throw new ApiClientError(
		readApiError(data, fallbackMessage),
		response.status || 500,
		parseApiFieldErrors(failure?.errors),
		{
			code: String(failure?.code || '').trim() || undefined,
			scheduleMisalignedReason: String(failure?.schedule_misaligned_reason || '').trim() || null,
		}
	);
};

export class AppointmentsClient {
	async getMeta() {
		const response = await fetch('/api/appointments/meta', {
			method: 'GET',
			headers: { Accept: 'application/json' },
		});
		const data = await parseJsonResponse(response);
		ensureSuccess(response, data, 'No fue posible cargar los catalogos del calendario.');

		const payload = (data as ApiSuccess<CalendarMetaResponse>).data;
		if (!payload) {
			throw new ApiClientError('No fue posible interpretar los catalogos del calendario.', 502);
		}
		return payload;
	}

	async getCalendarEvents(params: { start: string; end: string; pro_id?: number; loc_id?: number }) {
		const query = new URLSearchParams({
			start: params.start,
			end: params.end,
		});
		if (params.pro_id && params.pro_id > 0) query.set('pro_id', String(params.pro_id));
		if (params.loc_id && params.loc_id > 0) query.set('loc_id', String(params.loc_id));

		const response = await fetch(`/api/appointments/calendar?${query.toString()}`, {
			method: 'GET',
			headers: { Accept: 'application/json' },
		});
		const data = await parseJsonResponse(response);
		ensureSuccess(response, data, 'No fue posible cargar el calendario.');

		const events = (data as ApiSuccess<unknown>).data;
		return Array.isArray(events) ? events : [];
	}

	async getGoogleCalendarEvents(params: { start: string; end: string }): Promise<GoogleCalendarEventsPayload> {
		const query = new URLSearchParams({
			start: params.start,
			end: params.end,
		});

		const response = await fetch(`/api/google/events?${query.toString()}`, {
			method: 'GET',
			headers: { Accept: 'application/json' },
		});
		const data = await parseJsonResponse(response);
		ensureSuccess(response, data, 'No fue posible cargar eventos de Google Calendar.');

		const payload = (data as ApiSuccess<unknown>).data;
		if (!payload || typeof payload !== 'object') {
			return { connected: false, events: [] };
		}

		const source = payload as Record<string, unknown>;
		return {
			connected: Boolean(source.connected),
			events: Array.isArray(source.events) ? source.events : [],
		};
	}

	async getCustomers(params: { pro_id?: number; limit?: number } = {}): Promise<CustomerOption[]> {
		const query = new URLSearchParams({
			page: '1',
			limit: String(params.limit && params.limit > 0 ? params.limit : 50),
		});
		if (params.pro_id && params.pro_id > 0) query.set('pro_id', String(params.pro_id));

		const response = await fetch(`/api/customers?${query.toString()}`, {
			method: 'GET',
			headers: { Accept: 'application/json' },
		});
		const data = await parseJsonResponse(response);
		ensureSuccess(response, data, 'No fue posible cargar clientes.');

		const customers = (data as ApiSuccess<unknown>).data;
		if (!Array.isArray(customers)) return [];

		return customers.flatMap((entry) => {
			if (!entry || typeof entry !== 'object') return [];
			const source = entry as Record<string, unknown>;
			const customerId = Number(source.id_customer);
			const fullName = String(source.full_name || '').trim();
			if (!Number.isInteger(customerId) || customerId <= 0 || !fullName) return [];
			return [{
				id_customer: customerId,
				full_name: fullName,
				phone_number: String(source.phone_number || '').trim(),
			}];
		});
	}

	async getAppointment(appointmentId: number) {
		const response = await fetch(`/api/appointments/${appointmentId}`, {
			method: 'GET',
			headers: { Accept: 'application/json' },
		});
		const data = await parseJsonResponse(response);
		ensureSuccess(response, data, 'No fue posible cargar la cita seleccionada.');

		const appointment = (data as ApiSuccess<AppointmentDetail>).data;
		if (!appointment) {
			throw new ApiClientError('No fue posible interpretar la cita seleccionada.', 502);
		}
		return appointment;
	}

	async createAppointment(payload: AppointmentCreatePayload) {
		const response = await fetch('/api/appointments', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			body: JSON.stringify(payload),
		});
		const data = await parseJsonResponse(response);
		ensureSuccess(response, data, 'No fue posible crear la cita.');
		return {
			message:
				(typeof data.message === 'string' && data.message.trim()) || 'Cita agendada correctamente.',
		};
	}

	async updateAppointment(appointmentId: number, payload: AppointmentFormPayload) {
		const response = await fetch(`/api/appointments/${appointmentId}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			body: JSON.stringify(payload),
		});
		const data = await parseJsonResponse(response);
		ensureSuccess(response, data, 'No fue posible actualizar la cita.');
		return {
			message:
				(typeof data.message === 'string' && data.message.trim()) ||
				'Cita actualizada correctamente.',
		};
	}

	async approveScheduleException(appointmentId: number) {
		const response = await fetch(`/api/appointments/${appointmentId}/schedule-exception`, {
			method: 'POST',
			headers: { Accept: 'application/json' },
		});
		const data = await parseJsonResponse(response);
		ensureSuccess(response, data, 'No fue posible descartar la advertencia.');
		return {
			message:
				(typeof data.message === 'string' && data.message.trim()) ||
				'Advertencia descartada. La cita queda como excepcion aprobada.',
		};
	}

	async uploadAttachment(
		appointmentId: number,
		payload: { file_base64: string; filename: string; mime_type: string }
	) {
		const estimatedBytes = estimateAttachmentJsonBytes(payload);
		const useDirect = estimatedBytes > APPOINTMENT_ATTACHMENT_BFF_SAFE_JSON_BYTES;

		if (useDirect) {
			return this.uploadAttachmentDirect(appointmentId, payload);
		}

		try {
			return await this.uploadAttachmentViaBff(appointmentId, payload);
		} catch (error) {
			if (error instanceof ApiClientError && error.status === 413) {
				return this.uploadAttachmentDirect(appointmentId, payload);
			}
			throw error;
		}
	}

	private async uploadAttachmentViaBff(
		appointmentId: number,
		payload: { file_base64: string; filename: string; mime_type: string }
	) {
		return this.postAttachmentJson(`/api/appointments/${appointmentId}/attachments`, payload);
	}

	private async uploadAttachmentDirect(
		appointmentId: number,
		payload: { file_base64: string; filename: string; mime_type: string }
	) {
		const session = await this.getDirectUpload(appointmentId);
		try {
			return await this.postAttachmentJson(session.url, payload, {
				Authorization: session.authorization,
			}, { credentials: 'omit' });
		} catch (error) {
			if (error instanceof ApiClientError) throw error;
			throw new ApiClientError(
				'No fue posible subir el archivo adjunto. Si pesa varios megas, revisá tu conexión e intentá de nuevo.',
				502
			);
		}
	}

	private async getDirectUpload(appointmentId: number) {
		const response = await fetch(`/api/appointments/${appointmentId}/attachments/direct-upload`, {
			method: 'GET',
			headers: { Accept: 'application/json' },
			cache: 'no-store',
		});
		const data = await parseJsonResponse(response);
		ensureSuccess(response, data, 'No fue posible preparar la subida del archivo.');

		const payload = (data as ApiSuccess<{ url?: string; authorization?: string }>).data;
		const url = String(payload?.url || '').trim();
		const authorization = String(payload?.authorization || '').trim();
		if (!url || !authorization) {
			throw new ApiClientError('No fue posible preparar la subida del archivo.', 502);
		}

		return { url, authorization };
	}

	private async postAttachmentJson(
		url: string,
		payload: { file_base64: string; filename: string; mime_type: string },
		extraHeaders: Record<string, string> = {},
		init: Pick<RequestInit, 'credentials'> = {}
	) {
		const response = await fetch(url, {
			method: 'POST',
			credentials: init.credentials,
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
				...extraHeaders,
			},
			body: JSON.stringify(payload),
		});
		const data = await parseJsonResponse(response);
		ensureSuccess(response, data, 'No fue posible subir el archivo adjunto.');
		return {
			attachment: (data as ApiSuccess<AppointmentAttachment>).data ?? null,
			message:
				(typeof data.message === 'string' && data.message.trim()) ||
				'Archivo adjuntado correctamente.',
		};
	}

	async deleteAttachment(appointmentId: number, attachmentId: number) {
		const response = await fetch(
			`/api/appointments/${appointmentId}/attachments/${attachmentId}`,
			{
				method: 'DELETE',
				headers: { Accept: 'application/json' },
			}
		);
		const data = await parseJsonResponse(response);
		ensureSuccess(response, data, 'No fue posible eliminar el archivo adjunto.');
		return {
			message:
				(typeof data.message === 'string' && data.message.trim()) ||
				'Adjunto eliminado correctamente.',
		};
	}

	async deleteAppointment(appointmentId: number) {
		const response = await fetch(`/api/appointments/${appointmentId}`, {
			method: 'DELETE',
			headers: { Accept: 'application/json' },
		});
		const data = await parseJsonResponse(response);
		ensureSuccess(response, data, 'No fue posible eliminar la cita.');
		return {
			message:
				(typeof data.message === 'string' && data.message.trim()) || 'Cita eliminada correctamente.',
		};
	}
}
