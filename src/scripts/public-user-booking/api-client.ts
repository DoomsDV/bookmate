import {
	buildApiAppointmentTimes,
	isValidApiTimeSlot,
	sortTimeSlotsChronologically,
} from '../../lib/booking-datetime';

export class PublicUserBookingClientError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = 'PublicUserBookingClientError';
		this.status = status;
	}
}

const readApiMessage = (data: unknown, fallbackMessage: string) => {
	if (!data || typeof data !== 'object') return fallbackMessage;
	const message = String((data as { message?: string }).message || '').trim();
	return message || fallbackMessage;
};

export const fetchJson = async <T>(url: string, init: RequestInit, fallbackMessage: string) => {
	const response = await fetch(url, init);
	const data = await response.json().catch(() => null) as T & { status?: string; message?: string };

	if (!response.ok || !data || data.status !== 'success') {
		throw new PublicUserBookingClientError(readApiMessage(data, fallbackMessage), response.status || 500);
	}

	return { response, data };
};

export const fetchAvailableSlots = async (params: {
	pro_id: number;
	loc_id: number;
	ser_id: number;
	target_date: string;
}) => {
	const query = new URLSearchParams({
		pro_id: String(params.pro_id),
		loc_id: String(params.loc_id),
		ser_id: String(params.ser_id),
		target_date: params.target_date,
	});

	const { data } = await fetchJson<{ data?: unknown[] }>(
		`/api/public/available-slots?${query.toString()}`,
		{
			method: 'GET',
			headers: { Accept: 'application/json' },
			cache: 'no-store',
		},
		'No fue posible consultar horarios disponibles.'
	);

	if (!Array.isArray(data.data)) {
		throw new PublicUserBookingClientError('No fue posible consultar horarios disponibles.', 502);
	}

	return sortTimeSlotsChronologically(
		data.data.map((value) => String(value || '').trim()).filter(isValidApiTimeSlot)
	);
};

export const fetchAvailableDates = async (params: {
	pro_id: number;
	loc_id: number;
	ser_id: number;
	from_date: string;
	to_date: string;
}) => {
	const query = new URLSearchParams({
		pro_id: String(params.pro_id),
		loc_id: String(params.loc_id),
		ser_id: String(params.ser_id),
		from_date: params.from_date,
		to_date: params.to_date,
	});

	const { data } = await fetchJson<{ data?: unknown[] }>(
		`/api/public/available-dates?${query.toString()}`,
		{
			method: 'GET',
			headers: { Accept: 'application/json' },
			cache: 'no-store',
		},
		'No fue posible consultar fechas disponibles.'
	);

	if (!Array.isArray(data.data)) {
		throw new PublicUserBookingClientError('No fue posible consultar fechas disponibles.', 502);
	}

	return data.data
		.map((value) => String(value || '').trim())
		.filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
};

export const validateCustomerPhone = async (phoneE164: string, orgId: number) => {
	const { data } = await fetchJson<{ data?: { full_name?: string }; exists?: boolean }>(
		'/api/public/validate-customer',
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify({
				customer_phone: phoneE164,
				org_id_organization: orgId,
			}),
		},
		'No fue posible validar el teléfono.'
	);

	return {
		exists: Boolean(data.exists),
		fullName: String(data.data?.full_name || '').trim(),
	};
};

export const createPublicAppointment = async (
	payload: Record<string, unknown>,
	idempotencyKey?: string
) => {
	const { data } = await fetchJson<Record<string, unknown>>(
		'/api/public/appointments',
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
				...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
			},
			body: JSON.stringify(payload),
		},
		'No fue posible confirmar la reserva.'
	);

	const raw = (data as any)?.data && typeof (data as any).data === 'object' ? (data as any).data : data;
	const appointmentId = Number(raw?.appointment_id || (data as any)?.appointment_id || 0);
	return {
		appointment_id: appointmentId,
		hold: raw as Record<string, unknown>,
	};
};

export { buildApiAppointmentTimes };
