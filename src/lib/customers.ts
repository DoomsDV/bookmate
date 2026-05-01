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
