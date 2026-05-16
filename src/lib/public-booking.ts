import { resolveOrdsPublicApiUrl } from './env-urls';

const toPositiveInt = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizePublicDomainOrigin = (value: string) => {
	const trimmed = String(value || '').trim();
	if (!trimmed) return '';
	const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

	try {
		return new URL(withScheme).origin;
	} catch {
		return '';
	}
};

export const PUBLIC_BOOKING_API_BASE_URL = resolveOrdsPublicApiUrl(
	import.meta.env.ORDS_PUBLIC_BOOKING_URL,
	'ORDS_PUBLIC_BOOKING_URL',
	''
);
export const PUBLIC_VALIDATE_CUSTOMER_API_URL = resolveOrdsPublicApiUrl(
	import.meta.env.PUBLIC_VALIDATE_CUSTOMER_URL,
	'PUBLIC_VALIDATE_CUSTOMER_URL',
	'validate-customer'
);
export const PUBLIC_RESERVATION_API_URL = resolveOrdsPublicApiUrl(
	import.meta.env.ORDS_PUBLIC_RESERVATION_URL,
	'ORDS_PUBLIC_RESERVATION_URL',
	'reservations/:token'
);

const resolvePublicDomainOrigin = () => {
	const fromPublicDomain = normalizePublicDomainOrigin(
		String(import.meta.env.PUBLIC_BOOKMATE_PUBLIC_DOMAIN ?? '')
	);
	if (fromPublicDomain) return fromPublicDomain;

	try {
		return new URL(PUBLIC_BOOKING_API_BASE_URL).origin;
	} catch {
		return '';
	}
};

export const PUBLIC_BOOKMATE_DOMAIN_ORIGIN = resolvePublicDomainOrigin();

const resolvePublicReservationApiUrl = (token: string) => {
	const safeToken = encodeURIComponent(String(token || '').trim());
	return PUBLIC_RESERVATION_API_URL.includes(':token')
		? PUBLIC_RESERVATION_API_URL.replace(':token', safeToken)
		: `${PUBLIC_RESERVATION_API_URL.replace(/\/+$/, '')}/${safeToken}`;
};

export interface PublicBookingService {
	id_service: number;
	name: string;
	duration_minutes: number;
	price: number;
}

export interface PublicBookingLocation {
	id_location: number;
	name: string;
	address: string;
	latitude?: number;
	longitude?: number;
}

export interface PublicBookingProfile {
	id_professional: number;
	org_id_organization: number;
	organization_name?: string;
	full_name: string;
	specialty: string;
	image_url: string;
	services: PublicBookingService[];
	locations: PublicBookingLocation[];
}

export interface PublicCreateAppointmentPayload {
	org_id_organization: number;
	loc_id_location: number;
	pro_id_professional: number;
	ser_id_service: number;
	customer_name: string;
	customer_phone: string;
	start_time: string;
	end_time: string;
}

export interface PublicCreatedAppointmentData {
	appointment_id?: number;
	start_time?: string;
	end_time?: string;
}

export interface PublicValidateCustomerPayload {
	org_id_organization: number;
	customer_phone: string;
}

export interface PublicValidatedCustomer {
	id_customer: number;
	full_name: string;
}

export interface PublicValidateCustomerResult {
	exists: boolean;
	message: string;
	customer: PublicValidatedCustomer | null;
}

export interface PublicReservationDetail {
	id_appointment: number;
	org_id_organization: number;
	loc_id_location: number;
	location_name: string;
	location_address: string;
	pro_id_professional: number;
	professional_name: string;
	ser_id_service: number;
	service_name: string;
	duration_minutes: number;
	customer_name: string;
	customer_phone: string;
	status: string;
	start_time: string;
	end_time: string;
}

export interface PublicReservationUpdatePayload {
	start_time: string;
	end_time: string;
}

interface PublicApiFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
}

const isOrdsResourceError = (message: string) =>
	/user defined resource|not found/i.test(String(message || ''));

const normalizePublicApiMessage = (message: unknown, fallbackMessage: string) => {
	const parsedMessage = typeof message === 'string' ? message.trim() : '';
	if (!parsedMessage) return fallbackMessage;

	if (isOrdsResourceError(parsedMessage)) {
		return 'No encontramos esta agenda publica. Verifica el enlace e intenta nuevamente.';
	}

	return parsedMessage;
};

const normalizePublicApiStatus = (
	status: unknown,
	message: string,
	fallbackStatus: number
) => {
	const parsedStatus = Number(status);
	if (!Number.isInteger(parsedStatus)) return fallbackStatus;

	if (parsedStatus === 555) {
		return isOrdsResourceError(message) ? 404 : 502;
	}

	if (parsedStatus < 400 || parsedStatus > 599) {
		return fallbackStatus;
	}

	return parsedStatus;
};

export class PublicBookingApiError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'PublicBookingApiError';
		this.status = status;
		this.details = details;
	}
}

const extractJsonCandidates = (rawBody: string) => {
	const candidates: string[] = [];
	const source = String(rawBody || '');
	let depth = 0;
	let startIndex = -1;
	let inString = false;
	let escaped = false;

	for (let index = 0; index < source.length; index += 1) {
		const char = source[index];

		if (inString) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === '\\') {
				escaped = true;
				continue;
			}
			if (char === '"') {
				inString = false;
			}
			continue;
		}

		if (char === '"') {
			inString = true;
			continue;
		}

		if (char === '{' || char === '[') {
			if (depth === 0) startIndex = index;
			depth += 1;
			continue;
		}

		if (char === '}' || char === ']') {
			if (depth === 0) continue;
			depth -= 1;
			if (depth === 0 && startIndex >= 0) {
				const snippet = source.slice(startIndex, index + 1).trim();
				if (snippet) candidates.push(snippet);
				startIndex = -1;
			}
		}
	}

	return candidates;
};

const selectRecoveredJsonData = (
	rawBody: string,
	responseOk: boolean
): Record<string, unknown> | null => {
	const parsedCandidates = extractJsonCandidates(rawBody)
		.map((snippet) => {
			try {
				return JSON.parse(snippet) as unknown;
			} catch {
				return null;
			}
		})
		.filter((candidate): candidate is Record<string, unknown> => {
			return Boolean(candidate) && typeof candidate === 'object' && !Array.isArray(candidate);
		});

	if (parsedCandidates.length === 0) return null;

	if (responseOk) {
		const successCandidate = [...parsedCandidates].reverse().find((candidate) => {
			return String(candidate.status || '').toLowerCase() === 'success';
		});
		if (successCandidate) return successCandidate;
	}

	const errorCandidate = parsedCandidates.find(
		(candidate) => String(candidate.status || '').toLowerCase() === 'error'
	);
	if (errorCandidate) return errorCandidate;

	return parsedCandidates[parsedCandidates.length - 1] || null;
};

const parseJsonBody = async (response: Response) => {
	const rawBody = await response.text();
	const normalizedPreview = String(rawBody || '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 420);

	if (!rawBody.trim()) {
		throw new PublicBookingApiError(
			'El servidor devolvio una respuesta vacia en reservas.',
			502,
			{
				url: response.url,
				status: response.status,
				status_text: response.statusText,
				response_body_preview: '',
			}
		);
	}

	try {
		return JSON.parse(rawBody) as Record<string, unknown>;
	} catch {
		const recoveredData = selectRecoveredJsonData(rawBody, response.ok);
		if (recoveredData) {
			if (import.meta.env.DEV) {
				console.warn('[public-booking] Respuesta JSON recuperada desde body mixto', {
					url: response.url,
					status: response.status,
					statusText: response.statusText,
					responseBodyPreview: normalizedPreview,
				});
			}
			return recoveredData;
		}

		if (import.meta.env.DEV) {
			console.error('[public-booking] Respuesta no JSON del servidor', {
				url: response.url,
				status: response.status,
				statusText: response.statusText,
				responseBodyPreview: normalizedPreview,
			});
		}

		throw new PublicBookingApiError(
			'No fue posible interpretar la respuesta del servicio de reservas.',
			502,
			{
				url: response.url,
				status: response.status,
				status_text: response.statusText,
				response_body_preview: normalizedPreview,
			}
		);
	}
};

const parseApiResponse = async (response: Response, fallbackMessage: string) => {
	const data = await parseJsonBody(response);
	if (!response.ok || data.status !== 'success') {
		const failureData = data as PublicApiFailureResponse;
		const resolvedMessage = normalizePublicApiMessage(
			failureData.message,
			fallbackMessage
		);
		const resolvedStatus = normalizePublicApiStatus(
			response.status,
			resolvedMessage,
			response.ok ? 500 : 502
		);

		throw new PublicBookingApiError(
			resolvedMessage,
			resolvedStatus,
			failureData.details
		);
	}

	return data;
};

const normalizeCreatedAppointmentData = (value: unknown): PublicCreatedAppointmentData | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const appointmentId = toPositiveInt(source.appointment_id, 0);

	return {
		appointment_id: appointmentId || undefined,
		start_time: String(source.start_time || '').trim() || undefined,
		end_time: String(source.end_time || '').trim() || undefined,
	};
};

const normalizeService = (value: unknown): PublicBookingService | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const idService = toPositiveInt(source.id_service, 0);
	const durationMinutes = toPositiveInt(source.duration_minutes, 0);
	const name = String(source.name || '').trim();
	if (!idService || !durationMinutes || !name) return null;

	return {
		id_service: idService,
		name,
		duration_minutes: durationMinutes,
		price: Number(source.price ?? 0),
	};
};

const normalizeLocation = (value: unknown): PublicBookingLocation | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const idLocation = toPositiveInt(source.id_location, 0);
	const name = String(source.name || '').trim();
	const address = String(source.address || '').trim();
	if (!idLocation || !address) return null;

	const latitude = Number(source.latitude);
	const longitude = Number(source.longitude);

	return {
		id_location: idLocation,
		name,
		address,
		latitude: Number.isFinite(latitude) ? latitude : undefined,
		longitude: Number.isFinite(longitude) ? longitude : undefined,
	};
};

const normalizeProfile = (value: unknown): PublicBookingProfile | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const professionalId = toPositiveInt(source.id_professional, 0);
	const organizationId = toPositiveInt(source.org_id_organization, 0);
	const fullName = String(source.full_name || '').trim();
	if (!professionalId || !organizationId || !fullName) return null;

	const services = Array.isArray(source.services)
		? source.services
				.map(normalizeService)
				.filter((service): service is PublicBookingService => service !== null)
		: [];
	const locations = Array.isArray(source.locations)
		? source.locations
				.map(normalizeLocation)
				.filter((location): location is PublicBookingLocation => location !== null)
		: [];

	return {
		id_professional: professionalId,
		org_id_organization: organizationId,
		organization_name: String(
			source.organization_name || source.org_name || source.business_name || ''
		).trim(),
		full_name: fullName,
		specialty: String(source.specialty || '').trim() || 'Sin especialidad',
		image_url: String(source.image_url || '').trim(),
		services,
		locations,
	};
};

export const getPublicProfileWithOrds = async (slug: string): Promise<PublicBookingProfile> => {
	const safeSlug = String(slug || '').trim();
	if (!safeSlug) {
		throw new PublicBookingApiError('Slug de profesional requerido.', 400);
	}

	const response = await fetch(
		`${PUBLIC_BOOKING_API_BASE_URL}/profile/${encodeURIComponent(safeSlug)}`,
		{
			method: 'GET',
			headers: { Accept: 'application/json' },
		}
	);

	const data = await parseApiResponse(response, 'No fue posible cargar el perfil publico.');
	const profile = normalizeProfile(data.data);
	if (!profile) {
		throw new PublicBookingApiError('No fue posible interpretar el perfil del profesional.', 502);
	}

	return profile;
};

export const getPublicAvailableSlotsWithOrds = async (params: {
	pro_id: number;
	loc_id: number;
	ser_id: number;
	target_date: string;
}) => {
	const proId = toPositiveInt(params.pro_id, 0);
	const locId = toPositiveInt(params.loc_id, 0);
	const serId = toPositiveInt(params.ser_id, 0);
	const targetDate = String(params.target_date || '').trim();
	if (!proId || !locId || !serId || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
		throw new PublicBookingApiError(
			'pro_id, loc_id, ser_id y target_date (YYYY-MM-DD) son obligatorios.',
			400
		);
	}

	const slotsUrl = new URL(`${PUBLIC_BOOKING_API_BASE_URL}/available-slots`);
	slotsUrl.searchParams.set('pro_id', String(proId));
	slotsUrl.searchParams.set('loc_id', String(locId));
	slotsUrl.searchParams.set('ser_id', String(serId));
	slotsUrl.searchParams.set('target_date', targetDate);

	const response = await fetch(slotsUrl.toString(), {
		method: 'GET',
		headers: { Accept: 'application/json' },
	});

	const data = await parseApiResponse(response, 'No fue posible cargar horarios disponibles.');
	if (!Array.isArray(data.data)) {
		throw new PublicBookingApiError(
			'No fue posible interpretar los horarios disponibles del servicio.',
			502
		);
	}

	return data.data
		.map((slot) => String(slot || '').trim())
		.filter((slot) => /^\d{2}:\d{2}$/.test(slot));
};

export const createPublicAppointmentWithOrds = async (payload: PublicCreateAppointmentPayload) => {
	const response = await fetch(`${PUBLIC_BOOKING_API_BASE_URL}/appointments`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});

	const data = await parseApiResponse(response, 'No fue posible confirmar la cita.');
	const successMessage = String(data.message || '').trim();

	return {
		statusCode: response.status || 201,
		message: successMessage || 'Cita confirmada!',
		data: normalizeCreatedAppointmentData(data.data),
	};
};

const normalizeValidatedCustomer = (value: unknown): PublicValidatedCustomer | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const idCustomer = toPositiveInt(source.id_customer, 0);
	const fullName = String(source.full_name || '').trim();
	if (!idCustomer || !fullName) return null;

	return {
		id_customer: idCustomer,
		full_name: fullName,
	};
};

const normalizeReservationDetail = (value: unknown): PublicReservationDetail | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const appointmentId = toPositiveInt(source.id_appointment, 0);
	const orgId = toPositiveInt(source.org_id_organization, 0);
	const locationId = toPositiveInt(source.loc_id_location, 0);
	const professionalId = toPositiveInt(source.pro_id_professional, 0);
	const serviceId = toPositiveInt(source.ser_id_service, 0);
	const durationMinutes = toPositiveInt(source.duration_minutes, 0);
	const startTime = String(source.start_time || '').trim();
	const endTime = String(source.end_time || '').trim();

	if (!appointmentId || !orgId || !locationId || !professionalId || !serviceId || !startTime || !endTime) {
		return null;
	}

	return {
		id_appointment: appointmentId,
		org_id_organization: orgId,
		loc_id_location: locationId,
		location_name: String(source.location_name || '').trim(),
		location_address: String(source.location_address || '').trim(),
		pro_id_professional: professionalId,
		professional_name: String(source.professional_name || '').trim(),
		ser_id_service: serviceId,
		service_name: String(source.service_name || '').trim(),
		duration_minutes: durationMinutes,
		customer_name: String(source.customer_name || '').trim(),
		customer_phone: String(source.customer_phone || '').trim(),
		status: String(source.status || '').trim().toUpperCase(),
		start_time: startTime,
		end_time: endTime,
	};
};

export const getPublicReservationWithOrds = async (token: string): Promise<PublicReservationDetail> => {
	const safeToken = String(token || '').trim();
	if (!safeToken) {
		throw new PublicBookingApiError('Token de reserva requerido.', 400);
	}

	const response = await fetch(resolvePublicReservationApiUrl(safeToken), {
		method: 'GET',
		headers: { Accept: 'application/json' },
	});

	const data = await parseApiResponse(response, 'No fue posible cargar la reserva.');
	const reservation = normalizeReservationDetail(data.data);
	if (!reservation) {
		throw new PublicBookingApiError('No fue posible interpretar la reserva.', 502);
	}

	return reservation;
};

export const updatePublicReservationWithOrds = async (
	token: string,
	payload: PublicReservationUpdatePayload
) => {
	const safeToken = String(token || '').trim();
	if (!safeToken) {
		throw new PublicBookingApiError('Token de reserva requerido.', 400);
	}

	const response = await fetch(resolvePublicReservationApiUrl(safeToken), {
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});

	const data = await parseApiResponse(response, 'No fue posible actualizar la reserva.');
	return {
		message: String(data.message || '').trim() || 'Reserva actualizada correctamente.',
	};
};

export const cancelPublicReservationWithOrds = async (token: string) => {
	const safeToken = String(token || '').trim();
	if (!safeToken) {
		throw new PublicBookingApiError('Token de reserva requerido.', 400);
	}

	const response = await fetch(resolvePublicReservationApiUrl(safeToken), {
		method: 'DELETE',
		headers: { Accept: 'application/json' },
	});

	const data = await parseApiResponse(response, 'No fue posible cancelar la reserva.');
	return {
		message: String(data.message || '').trim() || 'Reserva cancelada correctamente.',
	};
};

export const validatePublicCustomerWithOrds = async (
	payload: PublicValidateCustomerPayload
): Promise<PublicValidateCustomerResult> => {
	const response = await fetch(PUBLIC_VALIDATE_CUSTOMER_API_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});

	const data = await parseApiResponse(response, 'No fue posible validar el cliente.');
	const exists = data.exists === true;
	const message = String(data.message || '').trim();

	if (!exists) {
		return {
			exists: false,
			message: message || 'Cliente nuevo, se requiere nombre.',
			customer: null,
		};
	}

	const customer = normalizeValidatedCustomer(data.data);
	if (!customer) {
		throw new PublicBookingApiError(
			'No fue posible interpretar los datos del cliente existente.',
			502
		);
	}

	return {
		exists: true,
		message: message || 'Cliente existente.',
		customer,
	};
};
