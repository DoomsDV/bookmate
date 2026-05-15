import type {
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
};

type GoogleCalendarEventsPayload = {
	connected: boolean;
	events: unknown[];
};

const parseJsonResponse = async (response: Response) => {
	try {
		return (await response.json()) as ApiSuccess | ApiFailure;
	} catch {
		throw new ApiClientError('No fue posible interpretar la respuesta del servidor.', 502);
	}
};

const ensureSuccess = (response: Response, data: ApiSuccess | ApiFailure, fallbackMessage: string) => {
	if (response.ok && data?.status === 'success') return;

	throw new ApiClientError(
		readApiError(data, fallbackMessage),
		response.status || 500,
		parseApiFieldErrors((data as ApiFailure)?.errors)
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
