import { resolveOrdsApiUrl } from './env-urls';

export const CUSTOMERS_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_CUSTOMERS_URL,
	'ORDS_CUSTOMERS_URL',
	'/customers'
);

export interface Customer {
	id_customer: number;
	full_name: string;
	phone_number: string;
	created_at: string;
}

export interface CustomersListMeta {
	current_page: number;
	per_page: number;
	total_records: number;
	total_pages: number;
}

export interface CustomersListResult {
	data: Customer[];
	meta: CustomersListMeta;
}

export interface CustomerAppointmentSummary {
	start_time: string;
	end_time?: string;
	service_name: string;
	professional_name: string;
	status: string;
	payment_status?: string;
}

export interface CustomerTopService {
	id_service: number;
	name: string;
	count: number;
}

export interface CustomerProfileStats {
	attended_count: number;
	cancelled_count: number;
	attendance_rate: number | null;
	lifetime_value: number;
	last_appointment: CustomerAppointmentSummary | null;
	next_appointment: CustomerAppointmentSummary | null;
	pending_count: number;
	pending_appointments: CustomerAppointmentSummary[];
	top_services: CustomerTopService[];
}

export interface CustomerProfile {
	id_customer: number;
	full_name: string;
	phone_number: string;
	created_at: string;
	stats: CustomerProfileStats;
}

interface CustomersSuccessResponse {
	status: 'success';
	data: unknown[];
	meta?: unknown;
}

interface CustomersFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
	errors?: unknown;
}

export class CustomersApiError extends Error {
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
		this.name = 'CustomersApiError';
		this.status = status;
		this.details = details;
		this.fieldErrors = fieldErrors;
	}
}

const toNumber = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
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

const normalizeCustomer = (value: unknown): Customer | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const customerId = toNumber(source.id_customer, NaN);
	if (!Number.isInteger(customerId) || customerId <= 0) return null;

	return {
		id_customer: customerId,
		full_name: String(source.full_name || '').trim(),
		phone_number: String(source.phone_number || '').trim(),
		created_at: String(source.created_at || '').trim(),
	};
};

const normalizeMeta = (
	value: unknown,
	fallback: { page: number; limit: number; totalRecords: number }
): CustomersListMeta => {
	if (!value || typeof value !== 'object') {
		return {
			current_page: fallback.page,
			per_page: fallback.limit,
			total_records: fallback.totalRecords,
			total_pages: Math.ceil(fallback.totalRecords / fallback.limit),
		};
	}

	const source = value as Record<string, unknown>;
	const currentPage = toNumber(source.current_page, fallback.page);
	const perPage = toNumber(source.per_page, fallback.limit);
	const totalRecords = toNumber(source.total_records, fallback.totalRecords);
	const totalPages = toNumber(
		source.total_pages,
		Math.ceil(Math.max(0, totalRecords) / Math.max(1, perPage))
	);

	return {
		current_page: Math.max(1, Math.floor(currentPage)),
		per_page: Math.max(1, Math.floor(perPage)),
		total_records: Math.max(0, Math.floor(totalRecords)),
		total_pages: Math.max(0, Math.floor(totalPages)),
	};
};

const parseCustomersResponse = async (
	response: Response,
	pagination: { page: number; limit: number }
): Promise<CustomersListResult> => {
	let data: CustomersSuccessResponse | CustomersFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new CustomersApiError(
			'No fue posible interpretar la respuesta del servidor de clientes.',
			502
		);
	}

	if (
		!response.ok ||
		!data ||
		typeof data !== 'object' ||
		data.status !== 'success' ||
		!('data' in data) ||
		!Array.isArray(data.data)
	) {
		const failureData = (data ?? {}) as CustomersFailureResponse;
		throw new CustomersApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) ||
				'No fue posible obtener el listado de clientes.',
			response.status || 400,
			failureData.details,
			parseFieldErrors(failureData.errors)
		);
	}

	const customers = data.data
		.map(normalizeCustomer)
		.filter((customer): customer is Customer => customer !== null);

	return {
		data: customers,
		meta: normalizeMeta(data.meta, {
			page: pagination.page,
			limit: pagination.limit,
			totalRecords: customers.length,
		}),
	};
};

const ensureToken = (token: string) => {
	if (!token) throw new CustomersApiError('Token de acceso requerido.', 401);
};

export const listCustomersWithOrds = async (
	token: string,
	options: { page?: number; limit?: number; pro_id?: number } = {}
): Promise<CustomersListResult> => {
	ensureToken(token);

	const page = Number.isInteger(options.page) && Number(options.page) > 0 ? Number(options.page) : 1;
	const limit =
		Number.isInteger(options.limit) && Number(options.limit) > 0 ? Number(options.limit) : 9;

	const customersUrl = new URL(CUSTOMERS_URL);
	customersUrl.searchParams.set('page', String(page));
	customersUrl.searchParams.set('limit', String(limit));

	if (Number.isInteger(options.pro_id) && Number(options.pro_id) > 0) {
		customersUrl.searchParams.set('pro_id', String(options.pro_id));
	}

	const response = await fetch(customersUrl.toString(), {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	return parseCustomersResponse(response, { page, limit });
};

const normalizeAppointmentSummary = (value: unknown): CustomerAppointmentSummary | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const startTime = String(source.start_time || '').trim();
	if (!startTime) return null;

	const endTime = String(source.end_time || '').trim();

	return {
		start_time: startTime,
		...(endTime ? { end_time: endTime } : {}),
		service_name: String(source.service_name || 'Servicio').trim() || 'Servicio',
		professional_name: String(source.professional_name || '').trim(),
		status: String(source.status || '').trim(),
		...(String(source.payment_status || '').trim()
			? { payment_status: String(source.payment_status).trim() }
			: {}),
	};
};

const normalizeTopService = (value: unknown): CustomerTopService | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const idService = toNumber(source.id_service, NaN);
	if (!Number.isInteger(idService) || idService <= 0) return null;

	const name = String(source.name || '').trim();
	const count = toNumber(source.count, 0);
	if (!name) return null;

	return {
		id_service: idService,
		name,
		count: Math.max(0, Math.floor(count)),
	};
};

const normalizeCustomerProfileStats = (value: unknown): CustomerProfileStats => {
	const emptyStats: CustomerProfileStats = {
		attended_count: 0,
		cancelled_count: 0,
		attendance_rate: null,
		lifetime_value: 0,
		last_appointment: null,
		next_appointment: null,
		pending_count: 0,
		pending_appointments: [],
		top_services: [],
	};

	if (!value || typeof value !== 'object') return emptyStats;

	const source = value as Record<string, unknown>;
	const attendanceRaw = source.attendance_rate;
	const attendanceRate =
		attendanceRaw === null || attendanceRaw === undefined
			? null
			: Number.isFinite(Number(attendanceRaw))
				? Number(attendanceRaw)
				: null;

	const pendingRaw = source.pending_appointments;
	const pendingAppointments = Array.isArray(pendingRaw)
		? pendingRaw
				.map(normalizeAppointmentSummary)
				.filter((item): item is CustomerAppointmentSummary => item !== null)
		: [];

	const topRaw = source.top_services;
	const topServices = Array.isArray(topRaw)
		? topRaw
				.map(normalizeTopService)
				.filter((item): item is CustomerTopService => item !== null)
		: [];

	return {
		attended_count: Math.max(0, Math.floor(toNumber(source.attended_count, 0))),
		cancelled_count: Math.max(0, Math.floor(toNumber(source.cancelled_count, 0))),
		attendance_rate: attendanceRate,
		lifetime_value: Math.max(0, toNumber(source.lifetime_value, 0)),
		last_appointment: normalizeAppointmentSummary(source.last_appointment),
		next_appointment: normalizeAppointmentSummary(source.next_appointment),
		pending_count: Math.max(0, Math.floor(toNumber(source.pending_count, pendingAppointments.length))),
		pending_appointments: pendingAppointments,
		top_services: topServices,
	};
};

const normalizeCustomerProfile = (value: unknown): CustomerProfile | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const customerId = toNumber(source.id_customer, NaN);
	if (!Number.isInteger(customerId) || customerId <= 0) return null;

	return {
		id_customer: customerId,
		full_name: String(source.full_name || '').trim(),
		phone_number: String(source.phone_number || '').trim(),
		created_at: String(source.created_at || '').trim(),
		stats: normalizeCustomerProfileStats(source.stats),
	};
};

const parseCustomerProfileResponse = async (
	response: Response
): Promise<CustomerProfile> => {
	let data: CustomersSuccessResponse | CustomersFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new CustomersApiError(
			'No fue posible interpretar la respuesta del servidor de clientes.',
			502
		);
	}

	if (
		!response.ok ||
		!data ||
		typeof data !== 'object' ||
		data.status !== 'success' ||
		!('data' in data)
	) {
		const failureData = (data ?? {}) as CustomersFailureResponse;
		throw new CustomersApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) ||
				'No fue posible obtener el perfil del cliente.',
			response.status || 400,
			failureData.details,
			parseFieldErrors(failureData.errors)
		);
	}

	const profile = normalizeCustomerProfile(data.data);
	if (!profile) {
		throw new CustomersApiError('Perfil de cliente invalido.', 502);
	}

	return profile;
};

export const getCustomerProfileWithOrds = async (
	token: string,
	customerId: number,
	options: { pro_id?: number } = {}
): Promise<CustomerProfile> => {
	ensureToken(token);

	if (!Number.isInteger(customerId) || customerId <= 0) {
		throw new CustomersApiError('ID de cliente invalido.', 400);
	}

	const profileUrl = new URL(`${CUSTOMERS_URL.replace(/\/+$/, '')}/${customerId}`);

	if (Number.isInteger(options.pro_id) && Number(options.pro_id) > 0) {
		profileUrl.searchParams.set('pro_id', String(options.pro_id));
	}

	const response = await fetch(profileUrl.toString(), {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	return parseCustomerProfileResponse(response);
};
