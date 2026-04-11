import { resolveOrdsApiUrl } from './env-urls';

export const DASHBOARD_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_DASHBOARD_URL,
	'ORDS_DASHBOARD_URL',
	'/dashboard'
);

export const DASHBOARD_AI_SUMMARY_URL = resolveOrdsApiUrl(
	import.meta.env.AI_SUMMARIZATION_URL,
	'AI_SUMMARIZATION_URL',
	'/dashboard/ai-summary'
);

export interface DashboardKpis {
	today_appointments: number;
	pending_appointments: number;
	my_customers: number;
	total_customers: number | null;
}

export interface DashboardUpcomingAppointment {
	id: number;
	customer_name: string;
	time_start: string;
	time_end: string;
	service_name: string;
	status: string;
}

export interface DashboardMainData {
	kpis: DashboardKpis;
	upcoming_appointments: DashboardUpcomingAppointment[];
}

export interface DashboardAiSummaryData {
	ai_summary: string;
}

interface DashboardSuccessResponse {
	status: 'success';
	data?: unknown;
}

interface DashboardFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
	errors?: unknown;
}

export class DashboardApiError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'DashboardApiError';
		this.status = status;
		this.details = details;
	}
}

const toNumber = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const toText = (value: unknown) => String(value ?? '').trim();

const normalizeKpis = (value: unknown): DashboardKpis => {
	if (!value || typeof value !== 'object') {
		return {
			today_appointments: 0,
			pending_appointments: 0,
			my_customers: 0,
			total_customers: null,
		};
	}

	const source = value as Record<string, unknown>;
	const totalCustomersRaw = source.total_customers;
	const totalCustomers =
		totalCustomersRaw === null || typeof totalCustomersRaw === 'undefined'
			? null
			: Math.max(0, Math.floor(toNumber(totalCustomersRaw, 0)));

	return {
		today_appointments: Math.max(0, Math.floor(toNumber(source.today_appointments, 0))),
		pending_appointments: Math.max(0, Math.floor(toNumber(source.pending_appointments, 0))),
		my_customers: Math.max(0, Math.floor(toNumber(source.my_customers, 0))),
		total_customers: totalCustomers,
	};
};

const normalizeUpcomingAppointment = (value: unknown): DashboardUpcomingAppointment | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const appointmentId = toNumber(source.id ?? source.id_appointment, NaN);
	if (!Number.isInteger(appointmentId) || appointmentId <= 0) return null;

	return {
		id: appointmentId,
		customer_name: toText(source.customer_name) || 'Cliente',
		time_start: toText(source.time_start) || '--:--',
		time_end: toText(source.time_end) || '--:--',
		service_name: toText(source.service_name) || 'Servicio',
		status: toText(source.status).toUpperCase() || 'PENDIENTE',
	};
};

const normalizeMainData = (value: unknown): DashboardMainData => {
	if (!value || typeof value !== 'object') {
		return {
			kpis: normalizeKpis(null),
			upcoming_appointments: [],
		};
	}

	const source = value as Record<string, unknown>;
	const upcomingRaw = Array.isArray(source.upcoming_appointments) ? source.upcoming_appointments : [];
	const upcoming = upcomingRaw
		.map(normalizeUpcomingAppointment)
		.filter((item): item is DashboardUpcomingAppointment => item !== null);

	return {
		kpis: normalizeKpis(source.kpis),
		upcoming_appointments: upcoming,
	};
};

const normalizeAiSummaryData = (value: unknown): DashboardAiSummaryData => {
	if (!value || typeof value !== 'object') {
		return { ai_summary: '' };
	}

	const source = value as Record<string, unknown>;
	return {
		ai_summary: toText(source.ai_summary),
	};
};

export const getMainDashboardWithOrds = async (token: string): Promise<DashboardMainData> => {
	if (!token) {
		throw new DashboardApiError('Token de acceso requerido.', 401);
	}

	const response = await fetch(DASHBOARD_URL, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	let data: DashboardSuccessResponse | DashboardFailureResponse | null = null;
	try {
		data = await response.json();
	} catch {
		throw new DashboardApiError(
			'No fue posible interpretar la respuesta del servidor del dashboard.',
			502
		);
	}

	if (!response.ok || !data || typeof data !== 'object' || data.status !== 'success') {
		const failureData = (data ?? {}) as DashboardFailureResponse;
		throw new DashboardApiError(
			toText(failureData.message) || 'No fue posible cargar el dashboard.',
			response.status || 400,
			failureData.details
		);
	}

	return normalizeMainData(data.data);
};

export const getDashboardAiSummaryWithOrds = async (
	token: string
): Promise<DashboardAiSummaryData> => {
	if (!token) {
		throw new DashboardApiError('Token de acceso requerido.', 401);
	}

	const response = await fetch(DASHBOARD_AI_SUMMARY_URL, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	let data: DashboardSuccessResponse | DashboardFailureResponse | null = null;
	try {
		data = await response.json();
	} catch {
		throw new DashboardApiError(
			'No fue posible interpretar la respuesta del resumen IA.',
			502
		);
	}

	if (!response.ok || !data || typeof data !== 'object' || data.status !== 'success') {
		const failureData = (data ?? {}) as DashboardFailureResponse;
		throw new DashboardApiError(
			toText(failureData.message) || 'No fue posible obtener el resumen IA.',
			response.status || 400,
			failureData.details
		);
	}

	return normalizeAiSummaryData(data.data);
};
