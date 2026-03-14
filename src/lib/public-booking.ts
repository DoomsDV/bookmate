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

export interface PublicBookingService {
	id_service: number;
	name: string;
	duration_minutes: number;
	price: number;
}

export interface PublicBookingProfile {
	id_professional: number;
	org_id_organization: number;
	organization_name?: string;
	full_name: string;
	specialty: string;
	image_url: string;
	services: PublicBookingService[];
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

interface PublicApiFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
}

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

const parseJsonBody = async (response: Response) => {
	try {
		return (await response.json()) as Record<string, unknown>;
	} catch {
		throw new PublicBookingApiError(
			'No fue posible interpretar la respuesta del servicio de reservas.',
			502
		);
	}
};

const parseApiResponse = async (response: Response, fallbackMessage: string) => {
	const data = await parseJsonBody(response);
	if (!response.ok || data.status !== 'success') {
		const failureData = data as PublicApiFailureResponse;
		throw new PublicBookingApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) || fallbackMessage,
			response.status || 500,
			failureData.details
		);
	}

	return data;
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
	};
};
