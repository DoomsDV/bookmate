import { resolveOrdsPublicApiUrl } from './env-urls';
import { normalizePublicBookingLocations } from './public-booking-locations';
import type { PublicReservationNoRefundReason } from './public-reservation-refund';
import { isReceiptRejected } from './public-receipt-reconcile';

export { normalizePublicBookingLocations } from './public-booking-locations';
export {
	buildPublicProfileMetaDescription,
	getPublicProfileSpecialtyLabel,
} from './public-profile-labels';

const toPositiveInt = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const ORDS_FETCH_TIMEOUT_MS = 8000;

const parsePositiveIntEnv = (value: unknown, fallback: number) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/** Upload receipt: OCI + OCR síncrono; default 60s (configurable). */
export const ORDS_RECEIPT_UPLOAD_TIMEOUT_MS = parsePositiveIntEnv(
	import.meta.env.ORDS_RECEIPT_UPLOAD_TIMEOUT_MS,
	60000
);

const ordsFetch = (
	input: RequestInfo | URL,
	init: RequestInit = {},
	timeoutMs = ORDS_FETCH_TIMEOUT_MS
) =>
	fetch(input, {
		...init,
		signal: init.signal ?? AbortSignal.timeout(timeoutMs),
	});

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

const resolvePublicLocationApiUrl = (locationId: number) => {
	const safeId = encodeURIComponent(String(locationId));
	const template = String(import.meta.env.ORDS_PUBLIC_LOCATION_URL || '').trim();
	if (template) {
		return template.replace(':id', safeId);
	}

	return `${PUBLIC_BOOKING_API_BASE_URL.replace(/\/+$/, '')}/locations/${safeId}`;
};

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
	hide_public_price?: 0 | 1;
	hidden_price_label?: string | null;
	image_url?: string | null;
	requires_deposit?: 0 | 1;
	deposit_type?: 'PERCENT' | 'FIXED' | null;
	deposit_value?: number | null;
	deposit_amount?: number | null;
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
	organization_slug?: string;
	profile_slug?: string;
	full_name: string;
	specialty: string;
	image_url: string;
	services: PublicBookingService[];
	locations: PublicBookingLocation[];
	deposit_settings?: Record<string, unknown> | null;
}

export interface ResolvedPublicProfileSlug {
	organization_slug: string;
	profile_slug: string;
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
	reserve_for_deposit?: boolean;
	policy_accepted?: boolean;
}

export interface PublicCreatedAppointmentData {
	appointment_id?: number;
	start_time?: string;
	end_time?: string;
	payment_status?: string;
	deposit_amount?: number;
	payment_expires_at?: string;
	payment_reference?: string;
	public_manage_token?: string;
	provider?: string;
	sipap?: {
		bank_name?: string | null;
		account_holder?: string | null;
		document_id?: string | null;
		bank_alias?: string | null;
	};
	refund_policy?: string;
	refund_policy_label?: string;
	refund_policy_summary?: string;
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

export type { PublicReservationNoRefundReason } from './public-reservation-refund';
export {
	formatCustomerCancelNoRefundHint,
	inferNoRefundReason,
} from './public-reservation-refund';

export interface PublicReservationRefundPreview {
	amount: number;
	requires_alias: boolean;
	policy_code?: string | null;
	policy_label?: string | null;
	policy_summary?: string | null;
	no_refund_reason?: PublicReservationNoRefundReason | null;
}

export interface PublicReservationSipapBankDetails {
	bank_name?: string | null;
	account_holder?: string | null;
	document_id?: string | null;
	bank_alias?: string | null;
}

export interface PublicReservationDepositSettings {
	deposits_enabled?: 0 | 1;
	refund_policy?: string | null;
	refund_policy_label?: string | null;
	refund_policy_summary?: string | null;
	sipap?: PublicReservationSipapBankDetails | null;
}

export interface PublicRefundDispute {
	status?: string | null;
	can_open?: number | null;
	wait_modal_required?: number | null;
	has_viewable_proof?: number | null;
	can_confirm_received?: number | null;
	customer_insisted?: number | null;
	proof_due_at?: string | null;
	ops_review_due_at?: string | null;
	refund_sent_at?: string | null;
	public_whatsapp?: string | null;
	source?: string | null;
}

export interface PublicReservationDetail {
	id_appointment: number;
	org_id_organization: number;
	loc_id_location: number;
	location_name: string;
	location_address: string;
	pro_id_professional: number;
	professional_name: string;
	professional_slug?: string;
	professional_image_url?: string;
	organization_slug?: string;
	organization_name?: string;
	ser_id_service: number;
	service_name: string;
	service_image_url?: string;
	duration_minutes: number;
	customer_name: string;
	customer_phone: string;
	status: string;
	start_time: string;
	end_time: string;
	payment_status?: string | null;
	deposit_amount?: number | null;
	policy_code_snapshot?: string | null;
	policy_label?: string | null;
	refund_status?: string | null;
	refund_amount?: number | null;
	refund_alias?: string | null;
	refund_preview?: PublicReservationRefundPreview | null;
	can_claim_refund?: number | null;
	refund_claim_open?: number | null;
	refund_sent_at?: string | null;
	refund_dispute?: PublicRefundDispute | null;
	service_includes?: string[];
	visit_history?: PublicVisitHistoryItem[];
	visit_history_count?: number;
	last_recommendations?: string | null;
	/** Sucursales activas de la organización (evita un 2do fetch al perfil público). */
	locations?: PublicBookingLocation[];
	/** Solo presentes cuando payment_status='PENDING' (permite ofrecer subir/resubir comprobante). */
	ocr_status?: string | null;
	/** True si el comercio rechazó el último comprobante (independiente de reject_reason). */
	receipt_rejected?: boolean;
	/** Solo se expone si el último comprobante fue rechazado explícitamente por el comercio. */
	reject_reason?: string | null;
	payment_reference?: string | null;
	payment_expires_at?: string | null;
	deposit_settings?: PublicReservationDepositSettings | null;
}

export interface PublicVisitHistoryItem {
	start_time: string;
	service_name: string;
	status: string;
}

export interface PublicReservationUpdatePayload {
	start_time: string;
	end_time: string;
	loc_id_location?: number;
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
	const sipapRaw = source.sipap;
	const sipap =
		sipapRaw && typeof sipapRaw === 'object'
			? {
					bank_name: String((sipapRaw as any).bank_name || '').trim() || null,
					account_holder: String((sipapRaw as any).account_holder || '').trim() || null,
					document_id: String((sipapRaw as any).document_id || '').trim() || null,
					bank_alias: String((sipapRaw as any).bank_alias || '').trim() || null,
				}
			: undefined;

	return {
		appointment_id: appointmentId || undefined,
		start_time: String(source.start_time || '').trim() || undefined,
		end_time: String(source.end_time || '').trim() || undefined,
		payment_status: String(source.payment_status || '').trim() || undefined,
		deposit_amount: Number(source.deposit_amount ?? NaN) || undefined,
		payment_expires_at: String(source.payment_expires_at || '').trim() || undefined,
		payment_reference: String(source.payment_reference || '').trim() || undefined,
		public_manage_token: String(source.public_manage_token || '').trim() || undefined,
		provider: String(source.provider || '').trim() || undefined,
		sipap,
		refund_policy: String(source.refund_policy || '').trim() || undefined,
		refund_policy_label: String(source.refund_policy_label || '').trim() || undefined,
		refund_policy_summary: String(source.refund_policy_summary || '').trim() || undefined,
	};
};

const normalizeService = (value: unknown): PublicBookingService | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const idService = toPositiveInt(source.id_service, 0);
	const durationMinutes = toPositiveInt(source.duration_minutes, 0);
	const name = String(source.name || '').trim();
	if (!idService || !durationMinutes || !name) return null;

	const requiresDeposit =
		source.requires_deposit === 1 ||
		source.requires_deposit === '1' ||
		source.requires_deposit === true
			? 1
			: 0;
	const depositTypeRaw = String(source.deposit_type ?? '').trim().toUpperCase();
	const depositType =
		depositTypeRaw === 'PERCENT' || depositTypeRaw === 'FIXED' ? depositTypeRaw : null;
	const depositValueRaw = Number(source.deposit_value ?? NaN);
	const depositAmountRaw = Number(source.deposit_amount ?? NaN);

	return {
		id_service: idService,
		name,
		duration_minutes: durationMinutes,
		price: Number(source.price ?? 0),
		hide_public_price:
			source.hide_public_price === 1 ||
			source.hide_public_price === '1' ||
			source.hide_public_price === true
				? 1
				: 0,
		hidden_price_label:
			String(source.hidden_price_label ?? '').trim() || null,
		image_url: (() => {
			const raw = String(source.image_url ?? '').trim();
			return raw || null;
		})(),
		requires_deposit: requiresDeposit,
		deposit_type: depositType,
		deposit_value: Number.isFinite(depositValueRaw) ? depositValueRaw : null,
		deposit_amount: Number.isFinite(depositAmountRaw) ? depositAmountRaw : null,
	};
};

const normalizePublicLocationDetail = (value: unknown): PublicBookingLocation | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const idLocation = toPositiveInt(source.id_location, 0);
	if (!idLocation) return null;

	const latitude = Number(source.latitude);
	const longitude = Number(source.longitude);

	return {
		id_location: idLocation,
		name: String(source.name || '').trim() || `Sucursal #${idLocation}`,
		address: String(source.address || '').trim(),
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
	const locations = normalizePublicBookingLocations(source.locations) as PublicBookingLocation[];

	return {
		id_professional: professionalId,
		org_id_organization: organizationId,
		organization_name: String(
			source.organization_name || source.org_name || source.business_name || ''
		).trim(),
		organization_slug: String(
			source.organization_slug || source.org_slug || ''
		).trim(),
		profile_slug: String(source.profile_slug || source.professional_slug || '').trim(),
		full_name: fullName,
		specialty: String(source.specialty || '').trim() || 'Sin especialidad',
		image_url: String(source.image_url || '').trim(),
		services,
		locations,
		deposit_settings:
			source.deposit_settings && typeof source.deposit_settings === 'object'
				? (source.deposit_settings as Record<string, unknown>)
				: null,
	};
};

const normalizeResolvedProfileSlug = (value: unknown): ResolvedPublicProfileSlug | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const organizationSlug = String(source.organization_slug || source.org_slug || '').trim();
	const profileSlug = String(source.profile_slug || source.professional_slug || '').trim();
	if (!organizationSlug || !profileSlug) return null;
	return { organization_slug: organizationSlug, profile_slug: profileSlug };
};

export const resolvePublicProfileSlugWithOrds = async (
	professionalSlug: string
): Promise<ResolvedPublicProfileSlug> => {
	const safeSlug = String(professionalSlug || '').trim();
	if (!safeSlug) {
		throw new PublicBookingApiError('Slug de profesional requerido.', 400);
	}

	const response = await ordsFetch(
		`${PUBLIC_BOOKING_API_BASE_URL}/profile/resolve/${encodeURIComponent(safeSlug)}`,
		{
			method: 'GET',
			headers: { Accept: 'application/json' },
		}
	);

	const data = await parseApiResponse(response, 'No fue posible resolver el enlace del perfil.');
	const resolved = normalizeResolvedProfileSlug(data.data);
	if (!resolved) {
		throw new PublicBookingApiError('No fue posible interpretar el enlace del perfil.', 502);
	}

	return resolved;
};

export const getPublicProfileWithOrds = async (
	organizationSlug: string,
	professionalSlug: string
): Promise<PublicBookingProfile> => {
	const safeOrgSlug = String(organizationSlug || '').trim();
	const safeProSlug = String(professionalSlug || '').trim();
	if (!safeOrgSlug || !safeProSlug) {
		throw new PublicBookingApiError('Slug de organización y profesional requeridos.', 400);
	}

	const response = await ordsFetch(
		`${PUBLIC_BOOKING_API_BASE_URL}/profile/${encodeURIComponent(safeOrgSlug)}/${encodeURIComponent(safeProSlug)}`,
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

/** Compatibilidad con enlaces legacy `/p/{slug}` (solo si hay una sola coincidencia). */
export const getPublicProfileWithOrdsLegacy = async (
	professionalSlug: string
): Promise<PublicBookingProfile> => {
	const resolved = await resolvePublicProfileSlugWithOrds(professionalSlug);
	return getPublicProfileWithOrds(resolved.organization_slug, resolved.profile_slug);
};

export const getPublicAvailableSlotsWithOrds = async (params: {
	pro_id: number;
	loc_id: number;
	ser_id: number;
	target_date: string;
	/** Al reprogramar: excluye el bloqueo de esta cita en Oracle. */
	exclude_app_id?: number;
}) => {
	const proId = toPositiveInt(params.pro_id, 0);
	const locId = toPositiveInt(params.loc_id, 0);
	const serId = toPositiveInt(params.ser_id, 0);
	const excludeAppId = toPositiveInt(params.exclude_app_id, 0);
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
	if (excludeAppId > 0) {
		slotsUrl.searchParams.set('exclude_app_id', String(excludeAppId));
	}

	const response = await ordsFetch(slotsUrl.toString(), {
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

export const getPublicAvailableDatesWithOrds = async (params: {
	pro_id: number;
	loc_id: number;
	ser_id: number;
	from_date: string;
	to_date: string;
	exclude_app_id?: number;
}) => {
	const proId = toPositiveInt(params.pro_id, 0);
	const locId = toPositiveInt(params.loc_id, 0);
	const serId = toPositiveInt(params.ser_id, 0);
	const excludeAppId = toPositiveInt(params.exclude_app_id, 0);
	const fromDate = String(params.from_date || '').trim();
	const toDate = String(params.to_date || '').trim();
	if (
		!proId ||
		!locId ||
		!serId ||
		!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) ||
		!/^\d{4}-\d{2}-\d{2}$/.test(toDate)
	) {
		throw new PublicBookingApiError(
			'pro_id, loc_id, ser_id, from_date y to_date (YYYY-MM-DD) son obligatorios.',
			400
		);
	}

	const datesUrl = new URL(`${PUBLIC_BOOKING_API_BASE_URL}/available-dates`);
	datesUrl.searchParams.set('pro_id', String(proId));
	datesUrl.searchParams.set('loc_id', String(locId));
	datesUrl.searchParams.set('ser_id', String(serId));
	datesUrl.searchParams.set('from_date', fromDate);
	datesUrl.searchParams.set('to_date', toDate);
	if (excludeAppId > 0) {
		datesUrl.searchParams.set('exclude_app_id', String(excludeAppId));
	}

	const response = await ordsFetch(datesUrl.toString(), {
		method: 'GET',
		headers: { Accept: 'application/json' },
	});

	const data = await parseApiResponse(response, 'No fue posible cargar fechas disponibles.');
	if (!Array.isArray(data.data)) {
		throw new PublicBookingApiError(
			'No fue posible interpretar las fechas disponibles del servicio.',
			502
		);
	}

	return data.data
		.map((date) => String(date || '').trim())
		.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
};

export const getPublicLocationWithOrds = async (locationId: number): Promise<PublicBookingLocation> => {
	const safeLocationId = toPositiveInt(locationId, 0);
	if (!safeLocationId) {
		throw new PublicBookingApiError('id de ubicación requerido.', 400);
	}

	const response = await ordsFetch(resolvePublicLocationApiUrl(safeLocationId), {
		method: 'GET',
		headers: { Accept: 'application/json' },
	});

	const data = await parseApiResponse(response, 'No fue posible cargar la ubicación.');
	const rawLocation = Array.isArray(data.data) ? data.data[0] : data.data;
	const location = normalizePublicLocationDetail(rawLocation);
	if (!location) {
		throw new PublicBookingApiError('No fue posible interpretar la ubicación.', 502);
	}

	return {
		...location,
		name: location.name || `Sucursal #${location.id_location}`,
	} satisfies PublicBookingLocation;
};

export const createPublicAppointmentWithOrds = async (
	payload: PublicCreateAppointmentPayload,
	idempotencyKey?: string
) => {
	const response = await ordsFetch(`${PUBLIC_BOOKING_API_BASE_URL}/appointments`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
		},
		body: JSON.stringify(payload),
	});

	const data = await parseApiResponse(response, 'No fue posible confirmar la cita.');
	const successMessage = String(data.message || '').trim();
	// Hold SIPAP: campos en top-level del JSON ORDS (no siempre en data).
	const merged = {
		...(typeof data === 'object' ? data : {}),
		...(data.data && typeof data.data === 'object' ? data.data : {}),
	} as Record<string, unknown>;
	const normalized = normalizeCreatedAppointmentData(merged);
	const appointmentId = toPositiveInt(
		merged.appointment_id ?? (data as any).appointment_id ?? normalized?.appointment_id,
		0
	);

	return {
		statusCode: response.status || 201,
		message: successMessage || 'Cita confirmada!',
		data: {
			...(normalized || {}),
			appointment_id: appointmentId || normalized?.appointment_id,
		},
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
		professional_slug: String(source.professional_slug || '').trim() || undefined,
		professional_image_url: String(source.professional_image_url || '').trim() || undefined,
		organization_slug: String(source.organization_slug || source.org_slug || '').trim() || undefined,
		organization_name: String(source.organization_name || '').trim() || undefined,
		ser_id_service: serviceId,
		service_name: String(source.service_name || '').trim(),
		service_image_url: String(source.service_image_url || '').trim() || undefined,
		duration_minutes: durationMinutes,
		customer_name: String(source.customer_name || '').trim(),
		customer_phone: String(source.customer_phone || '').trim(),
		status: String(source.status || '').trim().toUpperCase(),
		start_time: startTime,
		end_time: endTime,
		payment_status: String(source.payment_status || '').trim() || null,
		deposit_amount: Number(source.deposit_amount ?? NaN) || null,
		policy_code_snapshot: String(source.policy_code_snapshot || '').trim() || null,
		policy_label: String(source.policy_label || '').trim() || null,
		refund_status: String(source.refund_status || '').trim() || null,
		refund_amount: Number(source.refund_amount ?? NaN) || null,
		refund_alias: String(source.refund_alias || '').trim() || null,
		refund_preview: (() => {
			const preview = source.refund_preview;
			if (!preview || typeof preview !== 'object') return null;
			const p = preview as Record<string, unknown>;
			return {
				amount: Number(p.amount ?? 0) || 0,
				requires_alias: Boolean(Number(p.requires_alias) === 1 || p.requires_alias === true),
				policy_code: String(p.policy_code || '').trim() || null,
				policy_label: String(p.policy_label || '').trim() || null,
				policy_summary: String(p.policy_summary || '').trim() || null,
				no_refund_reason: (() => {
					const reason = String(p.no_refund_reason || '').trim().toUpperCase();
					if (reason === 'WITHIN_24H' || reason === 'POLICY_STRICT') {
						return reason as PublicReservationNoRefundReason;
					}
					return null;
				})(),
			};
		})(),
		can_claim_refund: Number(source.can_claim_refund ?? 0) === 1 ? 1 : 0,
		refund_claim_open: Number(source.refund_claim_open ?? 0) === 1 ? 1 : 0,
		refund_sent_at: String(source.refund_sent_at || '').trim() || null,
		refund_dispute: (() => {
			const raw = source.refund_dispute;
			if (!raw || typeof raw !== 'object') return null;
			const d = raw as Record<string, unknown>;
			return {
				status: String(d.status || '').trim() || null,
				can_open: Number(d.can_open ?? 0) === 1 ? 1 : 0,
				wait_modal_required: Number(d.wait_modal_required ?? 0) === 1 ? 1 : 0,
				has_viewable_proof: Number(d.has_viewable_proof ?? 0) === 1 ? 1 : 0,
				can_confirm_received: Number(d.can_confirm_received ?? 0) === 1 ? 1 : 0,
				customer_insisted: Number(d.customer_insisted ?? 0) === 1 ? 1 : 0,
				proof_due_at: String(d.proof_due_at || '').trim() || null,
				ops_review_due_at: String(d.ops_review_due_at || '').trim() || null,
				refund_sent_at: String(d.refund_sent_at || '').trim() || null,
				public_whatsapp: String(d.public_whatsapp || '').trim() || null,
				source: String(d.source || '').trim() || null,
			};
		})(),
		service_includes: Array.isArray(source.service_includes)
			? source.service_includes.map((item) => String(item || '').trim()).filter(Boolean)
			: [],
		visit_history: Array.isArray(source.visit_history)
			? source.visit_history.flatMap((item) => {
					if (!item || typeof item !== 'object') return [];
					const row = item as Record<string, unknown>;
					const startTime = String(row.start_time || '').trim();
					const serviceName = String(row.service_name || '').trim();
					const status = String(row.status || '').trim();
					if (!startTime || !serviceName) return [];
					return [{ start_time: startTime, service_name: serviceName, status }];
				})
			: [],
		visit_history_count: Number(source.visit_history_count ?? 0) || 0,
		last_recommendations: String(source.last_recommendations || '').trim() || null,
		locations: normalizePublicBookingLocations(source.locations) as PublicBookingLocation[],
		ocr_status: String(source.ocr_status || '').trim() || null,
		receipt_rejected: isReceiptRejected(source.receipt_rejected),
		reject_reason: String(source.reject_reason || '').trim() || null,
		payment_reference: String(source.payment_reference || '').trim() || null,
		payment_expires_at: String(source.payment_expires_at || '').trim() || null,
		deposit_settings: (() => {
			const settings = source.deposit_settings;
			if (!settings || typeof settings !== 'object') return null;
			const s = settings as Record<string, unknown>;
			const sipapSource = s.sipap;
			const sipap =
				sipapSource && typeof sipapSource === 'object'
					? (() => {
							const b = sipapSource as Record<string, unknown>;
							return {
								bank_name: String(b.bank_name || '').trim() || null,
								account_holder: String(b.account_holder || '').trim() || null,
								document_id: String(b.document_id || '').trim() || null,
								bank_alias: String(b.bank_alias || '').trim() || null,
							};
						})()
					: null;
			return {
				deposits_enabled: Number(s.deposits_enabled ?? 0) === 1 ? 1 : 0,
				refund_policy: String(s.refund_policy || '').trim() || null,
				refund_policy_label: String(s.refund_policy_label || '').trim() || null,
				refund_policy_summary: String(s.refund_policy_summary || '').trim() || null,
				sipap,
			};
		})(),
	};
};

export const getPublicReservationWithOrds = async (token: string): Promise<PublicReservationDetail> => {
	const safeToken = String(token || '').trim();
	if (!safeToken) {
		throw new PublicBookingApiError('Token de reserva requerido.', 400);
	}

	const response = await ordsFetch(resolvePublicReservationApiUrl(safeToken), {
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

	const response = await ordsFetch(resolvePublicReservationApiUrl(safeToken), {
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

export const cancelPublicReservationWithOrds = async (
	token: string,
	options?: { refund_alias?: string }
) => {
	const safeToken = String(token || '').trim();
	if (!safeToken) {
		throw new PublicBookingApiError('Token de reserva requerido.', 400);
	}

	const body: Record<string, string> = {};
	const alias = String(options?.refund_alias || '').trim();
	if (alias) body.refund_alias = alias;

	const response = await ordsFetch(resolvePublicReservationApiUrl(safeToken), {
		method: 'DELETE',
		headers: {
			Accept: 'application/json',
			...(alias ? { 'Content-Type': 'application/json' } : {}),
		},
		body: alias ? JSON.stringify(body) : undefined,
	});

	const data = await parseApiResponse(response, 'No fue posible cancelar la reserva.');
	return {
		message: String(data.message || '').trim() || 'Reserva cancelada correctamente.',
		refund_status: String(data.data?.refund_status || '').trim() || null,
		refund_amount: Number(data.data?.refund_amount ?? NaN) || null,
	};
};

export const submitRefundAliasWithOrds = async (token: string, refundAlias: string) => {
	const safeToken = String(token || '').trim();
	const alias = String(refundAlias || '').trim();
	if (!safeToken) {
		throw new PublicBookingApiError('Token de reserva requerido.', 400);
	}
	if (!alias) {
		throw new PublicBookingApiError('Indica tu alias SIPAP.', 400);
	}

	const response = await ordsFetch(`${resolvePublicReservationApiUrl(safeToken)}/refund-alias`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ refund_alias: alias }),
	});

	const data = await parseApiResponse(response, 'No fue posible guardar el alias.');
	return {
		message: String(data.message || '').trim() || 'Alias recibido.',
		refund_status: String(data.data?.refund_status || '').trim() || null,
		refund_amount: Number(data.data?.refund_amount ?? NaN) || null,
	};
};

export const openRefundDisputeWithOrds = async (
	token: string,
	payload: { phone_last4: string; notes?: string }
) => {
	const safeToken = String(token || '').trim();
	if (!safeToken) {
		throw new PublicBookingApiError('Token de reserva requerido.', 400);
	}

	const response = await ordsFetch(`${resolvePublicReservationApiUrl(safeToken)}/refund-dispute`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			phone_last4: String(payload.phone_last4 || '').trim(),
			notes: String(payload.notes || '').trim() || null,
		}),
	});

	const data = await parseApiResponse(response, 'No fue posible abrir la disputa.');
	return {
		message: String(data.message || '').trim() || 'Disputa abierta.',
		data: data.data || null,
	};
};

export const confirmRefundReceivedWithOrds = async (
	token: string,
	payload: { phone_last4: string }
) => {
	const safeToken = String(token || '').trim();
	if (!safeToken) {
		throw new PublicBookingApiError('Token de reserva requerido.', 400);
	}

	const response = await ordsFetch(
		`${resolvePublicReservationApiUrl(safeToken)}/refund-dispute/confirm-received`,
		{
			method: 'POST',
			headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
			body: JSON.stringify({ phone_last4: String(payload.phone_last4 || '').trim() }),
		}
	);

	const data = await parseApiResponse(response, 'No fue posible confirmar el reembolso.');
	return {
		message: String(data.message || '').trim() || 'Reembolso confirmado.',
		data: data.data || null,
	};
};

export const insistRefundDisputeWithOrds = async (token: string) => {
	const safeToken = String(token || '').trim();
	if (!safeToken) {
		throw new PublicBookingApiError('Token de reserva requerido.', 400);
	}

	const response = await ordsFetch(
		`${resolvePublicReservationApiUrl(safeToken)}/refund-dispute/insist`,
		{
			method: 'POST',
			headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
			body: '{}',
		}
	);

	const data = await parseApiResponse(response, 'No fue posible registrar el seguimiento.');
	return {
		message: String(data.message || '').trim() || 'Seguimiento registrado.',
		data: data.data || null,
	};
};

export const getPublicRefundProofMetaWithOrds = async (token: string) => {
	const safeToken = String(token || '').trim();
	if (!safeToken) {
		throw new PublicBookingApiError('Token de reserva requerido.', 400);
	}

	const response = await ordsFetch(`${resolvePublicReservationApiUrl(safeToken)}/refund-proof`, {
		method: 'GET',
		headers: { Accept: 'application/json' },
	});

	const data = await parseApiResponse(response, 'No fue posible obtener la prueba.');
	return {
		url: String(data.data?.url || '').trim(),
		mime_type: String(data.data?.mime_type || 'application/octet-stream').trim(),
	};
};

export interface PublicReceiptUploadPayload {
	file_base64: string;
	filename: string;
	mime_type: string;
}

export interface PublicReceiptUploadResult {
	message: string;
	appointment_id?: number;
	ocr_status?: string;
	payment_status?: string;
	receipt_url?: string;
	ocr_reference?: string;
	ocr_amount?: number;
	ocr_confidence?: number;
}

export const uploadPublicReceiptWithOrds = async (
	token: string,
	payload: PublicReceiptUploadPayload,
	idempotencyKey?: string
): Promise<PublicReceiptUploadResult> => {
	const safeToken = String(token || '').trim();
	if (!safeToken) {
		throw new PublicBookingApiError('Token de reserva requerido.', 400);
	}
	if (!payload?.file_base64) {
		throw new PublicBookingApiError('Debes enviar el comprobante.', 400);
	}

	const response = await ordsFetch(
		`${resolvePublicReservationApiUrl(safeToken)}/receipt`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
				...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
			},
			body: JSON.stringify({
				file_base64: payload.file_base64,
				filename: payload.filename || 'comprobante.jpg',
				mime_type: payload.mime_type || 'image/jpeg',
			}),
		},
		ORDS_RECEIPT_UPLOAD_TIMEOUT_MS
	);

	const data = await parseApiResponse(response, 'No fue posible subir el comprobante.');
	const raw = (data.data ?? data) as Record<string, unknown>;

	return {
		message: String(data.message || '').trim() || 'Comprobante recibido.',
		appointment_id: toPositiveInt(raw.appointment_id, 0) || undefined,
		ocr_status: String(raw.ocr_status || '').trim() || undefined,
		payment_status: String(raw.payment_status || '').trim() || undefined,
		receipt_url: String(raw.receipt_url || '').trim() || undefined,
		ocr_reference: String(raw.ocr_reference || '').trim() || undefined,
		ocr_amount: Number(raw.ocr_amount ?? NaN) || undefined,
		ocr_confidence: Number(raw.ocr_confidence ?? NaN) || undefined,
	};
};

export const validatePublicCustomerWithOrds = async (
	payload: PublicValidateCustomerPayload
): Promise<PublicValidateCustomerResult> => {
	const response = await ordsFetch(PUBLIC_VALIDATE_CUSTOMER_API_URL, {
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
