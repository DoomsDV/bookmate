import { resolveOrdsApiUrl } from './env-urls';
import {
	DASHBOARD_CHART_WINDOWS,
	fillAppointmentsByDay,
	normalizeChartWindow,
	type DashboardDayCount,
} from './dashboard-chart';

export const getAnalyticsUrl = () =>
	resolveOrdsApiUrl(
		import.meta.env.ORDS_ANALYTICS_URL,
		'ORDS_ANALYTICS_URL',
		'/dashboard/analytics'
	);

export const ANALYTICS_PERIODS = DASHBOARD_CHART_WINDOWS;
export const ANALYTICS_MAX_CUSTOM_DAYS = 90;
export type AnalyticsPeriodKind = 'preset' | 'custom';
export type AnalyticsPeriod = number;

export interface AnalyticsStatusCounts {
	pendiente: number;
	confirmada: number;
	completada: number;
	cancelada: number;
}

export interface AnalyticsNoShow {
	count: number;
	eligible_count: number;
	pct: number | null;
	prev_pct: number | null;
	delta_pct: number | null;
}

export interface AnalyticsNamedCount {
	id: number;
	name: string;
	count: number;
}

export interface AnalyticsPayments {
	currency: string;
	paid_total: number;
	pending_total: number;
	paid_count: number;
	pending_count: number;
	deposit_count: number;
}

export interface AnalyticsFilterOption {
	id: number;
	name: string;
}

export interface AnalyticsFilters {
	period_days: AnalyticsPeriod;
	period_kind: AnalyticsPeriodKind;
	from_date: string | null;
	to_date: string | null;
	location_id: number | null;
	professional_id: number | null;
	can_filter_professional: boolean;
	branches: AnalyticsFilterOption[];
	professionals: AnalyticsFilterOption[];
}

export interface AnalyticsMeta {
	timezone: string;
	period_start: string;
	period_end: string;
	period_kind: AnalyticsPeriodKind;
	generated_at_local: string;
}

export interface AnalyticsData {
	period_days: AnalyticsPeriod;
	period_kind: AnalyticsPeriodKind;
	total_appointments: number;
	appointments_by_day: DashboardDayCount[];
	by_status: AnalyticsStatusCounts;
	no_show: AnalyticsNoShow;
	by_branch: AnalyticsNamedCount[];
	by_professional: AnalyticsNamedCount[];
	payments: AnalyticsPayments;
	filters: AnalyticsFilters;
	meta: AnalyticsMeta;
}

export type AnalyticsQuery = {
	days?: unknown;
	from?: unknown;
	to?: unknown;
	location_id?: unknown;
	professional_id?: unknown;
};

interface AnalyticsSuccessResponse {
	status: 'success';
	data?: unknown;
}

interface AnalyticsFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
}

export class AnalyticsApiError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'AnalyticsApiError';
		this.status = status;
		this.details = details;
	}
}

const toNumber = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const toText = (value: unknown) => String(value ?? '').trim();
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const parseAnalyticsIsoDate = (value: unknown): string | null => {
	const text = toText(value);
	if (!ISO_DATE_RE.test(text)) return null;
	const [year, month, day] = text.split('-').map(Number);
	const utc = new Date(Date.UTC(year, month - 1, day));
	if (
		utc.getUTCFullYear() !== year ||
		utc.getUTCMonth() !== month - 1 ||
		utc.getUTCDate() !== day
	) {
		return null;
	}
	return text;
};

export const analyticsInclusiveDays = (from: string, to: string) => {
	const start = Date.parse(`${from}T00:00:00Z`);
	const end = Date.parse(`${to}T00:00:00Z`);
	if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
	return Math.floor((end - start) / 86_400_000) + 1;
};

const toOptionalId = (value: unknown): number | null => {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) return null;
	return parsed;
};

const toNullableNumber = (value: unknown): number | null => {
	if (value === null || value === undefined || value === '') return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
};

const normalizeNamedCount = (value: unknown): AnalyticsNamedCount | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const name = toText(source.name);
	if (!name) return null;
	return {
		id: Math.max(0, Math.floor(toNumber(source.id, 0))),
		name,
		count: Math.max(0, Math.floor(toNumber(source.count, 0))),
	};
};

const normalizeFilterOption = (value: unknown): AnalyticsFilterOption | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const id = Math.floor(toNumber(source.id, 0));
	const name = toText(source.name);
	if (id <= 0 || !name) return null;
	return { id, name };
};

const emptyStatus = (): AnalyticsStatusCounts => ({
	pendiente: 0,
	confirmada: 0,
	completada: 0,
	cancelada: 0,
});

const emptyNoShow = (): AnalyticsNoShow => ({
	count: 0,
	eligible_count: 0,
	pct: null,
	prev_pct: null,
	delta_pct: null,
});

const emptyPayments = (): AnalyticsPayments => ({
	currency: 'PYG',
	paid_total: 0,
	pending_total: 0,
	paid_count: 0,
	pending_count: 0,
	deposit_count: 0,
});

export const normalizeAnalyticsQuery = (query: AnalyticsQuery = {}) => {
	const locationId = toOptionalId(query.location_id);
	const professionalId = toOptionalId(query.professional_id);
	const rawFrom = parseAnalyticsIsoDate(query.from);
	const rawTo = parseAnalyticsIsoDate(query.to);
	if (rawFrom && rawTo) {
		const from = rawFrom <= rawTo ? rawFrom : rawTo;
		const to = rawFrom <= rawTo ? rawTo : rawFrom;
		const days = analyticsInclusiveDays(from, to);
		if (days >= 1 && days <= ANALYTICS_MAX_CUSTOM_DAYS) {
			return {
				kind: 'custom' as const,
				days,
				from,
				to,
				location_id: locationId,
				professional_id: professionalId,
			};
		}
	}

	return {
		kind: 'preset' as const,
		days: normalizeChartWindow(query.days),
		from: null,
		to: null,
		location_id: locationId,
		professional_id: professionalId,
	};
};

export const hasAnalyticsVolume = (data: AnalyticsData) =>
	data.total_appointments > 0 || data.appointments_by_day.some((item) => item.count > 0);

export const hasAnalyticsStatus = (data: AnalyticsData) =>
	data.by_status.pendiente +
		data.by_status.confirmada +
		data.by_status.completada +
		data.by_status.cancelada >
	0;

export const normalizeAnalyticsData = (
	value: unknown,
	query: ReturnType<typeof normalizeAnalyticsQuery>
): AnalyticsData => {
	const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
	const statusSource =
		source.by_status && typeof source.by_status === 'object'
			? (source.by_status as Record<string, unknown>)
			: {};
	const noShowSource =
		source.no_show && typeof source.no_show === 'object'
			? (source.no_show as Record<string, unknown>)
			: {};
	const paymentsSource =
		source.payments && typeof source.payments === 'object'
			? (source.payments as Record<string, unknown>)
			: {};
	const filtersSource =
		source.filters && typeof source.filters === 'object'
			? (source.filters as Record<string, unknown>)
			: {};
	const metaSource =
		source.meta && typeof source.meta === 'object' ? (source.meta as Record<string, unknown>) : {};

	const periodKind: AnalyticsPeriodKind =
		toText(source.period_kind ?? filtersSource.period_kind ?? query.kind) === 'custom'
			? 'custom'
			: 'preset';
	const periodDays =
		periodKind === 'custom'
			? Math.max(1, Math.min(ANALYTICS_MAX_CUSTOM_DAYS, Math.floor(toNumber(source.period_days, query.days))))
			: normalizeChartWindow(source.period_days ?? query.days);
	const locationId = toOptionalId(filtersSource.location_id ?? query.location_id);
	const professionalId = toOptionalId(filtersSource.professional_id ?? query.professional_id);
	const fromDate =
		parseAnalyticsIsoDate(filtersSource.from_date) ??
		parseAnalyticsIsoDate(metaSource.period_start) ??
		query.from;
	const toDate =
		parseAnalyticsIsoDate(filtersSource.to_date) ??
		parseAnalyticsIsoDate(metaSource.period_end) ??
		query.to;

	return {
		period_days: periodDays,
		period_kind: periodKind,
		total_appointments: Math.max(0, Math.floor(toNumber(source.total_appointments, 0))),
		appointments_by_day: fillAppointmentsByDay(source.appointments_by_day, {
			days: periodDays,
			direction: 'back',
			startDate: fromDate ?? undefined,
			endDate: toDate ?? undefined,
		}),
		by_status: {
			pendiente: Math.max(0, Math.floor(toNumber(statusSource.pendiente, 0))),
			confirmada: Math.max(0, Math.floor(toNumber(statusSource.confirmada, 0))),
			completada: Math.max(0, Math.floor(toNumber(statusSource.completada, 0))),
			cancelada: Math.max(0, Math.floor(toNumber(statusSource.cancelada, 0))),
		},
		no_show: {
			count: Math.max(0, Math.floor(toNumber(noShowSource.count, 0))),
			eligible_count: Math.max(0, Math.floor(toNumber(noShowSource.eligible_count, 0))),
			pct: toNullableNumber(noShowSource.pct),
			prev_pct: toNullableNumber(noShowSource.prev_pct),
			delta_pct: toNullableNumber(noShowSource.delta_pct),
		},
		by_branch: Array.isArray(source.by_branch)
			? source.by_branch
					.map(normalizeNamedCount)
					.filter((item): item is AnalyticsNamedCount => item !== null)
			: [],
		by_professional: Array.isArray(source.by_professional)
			? source.by_professional
					.map(normalizeNamedCount)
					.filter((item): item is AnalyticsNamedCount => item !== null)
			: [],
		payments: {
			currency: toText(paymentsSource.currency) || 'PYG',
			paid_total: Math.max(0, toNumber(paymentsSource.paid_total, 0)),
			pending_total: Math.max(0, toNumber(paymentsSource.pending_total, 0)),
			paid_count: Math.max(0, Math.floor(toNumber(paymentsSource.paid_count, 0))),
			pending_count: Math.max(0, Math.floor(toNumber(paymentsSource.pending_count, 0))),
			deposit_count: Math.max(0, Math.floor(toNumber(paymentsSource.deposit_count, 0))),
		},
		filters: {
			period_days: periodDays,
			period_kind: periodKind,
			from_date: fromDate,
			to_date: toDate,
			location_id: locationId,
			professional_id: professionalId,
			can_filter_professional: toNumber(filtersSource.can_filter_professional, 0) === 1,
			branches: Array.isArray(filtersSource.branches)
				? filtersSource.branches
						.map(normalizeFilterOption)
						.filter((item): item is AnalyticsFilterOption => item !== null)
				: [],
			professionals: Array.isArray(filtersSource.professionals)
				? filtersSource.professionals
						.map(normalizeFilterOption)
						.filter((item): item is AnalyticsFilterOption => item !== null)
				: [],
		},
		meta: {
			timezone: toText(metaSource.timezone) || 'America/Asuncion',
			period_start: toText(metaSource.period_start) || fromDate || '',
			period_end: toText(metaSource.period_end) || toDate || '',
			period_kind: periodKind,
			generated_at_local: toText(metaSource.generated_at_local),
		},
	};
};

export const emptyAnalyticsData = (
	query: ReturnType<typeof normalizeAnalyticsQuery>
): AnalyticsData =>
	normalizeAnalyticsData(
		{
			period_days: query.days,
			period_kind: query.kind,
			by_status: emptyStatus(),
			no_show: emptyNoShow(),
			payments: emptyPayments(),
			filters: {
				period_days: query.days,
				period_kind: query.kind,
				from_date: query.from,
				to_date: query.to,
				location_id: query.location_id,
				professional_id: query.professional_id,
				can_filter_professional: 1,
			},
			meta: {
				period_start: query.from ?? '',
				period_end: query.to ?? '',
				period_kind: query.kind,
			},
		},
		query
	);

export const getAnalyticsWithOrds = async (
	token: string,
	query: AnalyticsQuery = {}
): Promise<AnalyticsData> => {
	if (!token) {
		throw new AnalyticsApiError('Token de acceso requerido.', 401);
	}

	const filters = normalizeAnalyticsQuery(query);
	const analyticsUrl = new URL(getAnalyticsUrl());
	analyticsUrl.searchParams.set('days', String(filters.days));
	if (filters.kind === 'custom' && filters.from && filters.to) {
		analyticsUrl.searchParams.set('from_date', filters.from);
		analyticsUrl.searchParams.set('to_date', filters.to);
	}
	if (filters.location_id) analyticsUrl.searchParams.set('location_id', String(filters.location_id));
	if (filters.professional_id) {
		analyticsUrl.searchParams.set('professional_id', String(filters.professional_id));
	}

	const response = await fetch(analyticsUrl.toString(), {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	let data: AnalyticsSuccessResponse | AnalyticsFailureResponse | null = null;
	try {
		data = await response.json();
	} catch {
		throw new AnalyticsApiError('No fue posible interpretar la respuesta de analíticas.', 502);
	}

	if (!response.ok || !data || typeof data !== 'object' || data.status !== 'success') {
		const failureData = (data ?? {}) as AnalyticsFailureResponse;
		throw new AnalyticsApiError(
			toText(failureData.message) || 'No fue posible cargar las analíticas.',
			response.status || 400,
			failureData.details
		);
	}

	return normalizeAnalyticsData((data as AnalyticsSuccessResponse).data, filters);
};
