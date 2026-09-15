export interface DashboardDayCount {
	date: string;
	count: number;
}

export const DASHBOARD_DAY_WINDOW = 7;
export const DASHBOARD_UPCOMING_DAYS = 7;
export const DASHBOARD_CHART_MAX_DAYS = 30;
export const DASHBOARD_CHART_WINDOWS = [7, 15, 30] as const;
export const DASHBOARD_CHART_DEFAULT_DAYS = 7;
export type DashboardChartWindow = (typeof DASHBOARD_CHART_WINDOWS)[number];
export const DASHBOARD_APP_TZ = 'America/Asuncion';

const toNumber = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const toText = (value: unknown) => String(value ?? '').trim();
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const asuncionTodayIso = (now = new Date()) => {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: DASHBOARD_APP_TZ,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(now);
	const year = parts.find((part) => part.type === 'year')?.value || '1970';
	const month = parts.find((part) => part.type === 'month')?.value || '01';
	const day = parts.find((part) => part.type === 'day')?.value || '01';
	return `${year}-${month}-${day}`;
};

export type FillAppointmentsByDayOptions = {
	days?: number;
	direction?: 'back' | 'forward';
	now?: Date;
	startDate?: string;
	endDate?: string;
};

const toUtcIso = (utcMs: number) => {
	const next = new Date(utcMs);
	return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
};

const utcMsFromIso = (iso: string) => {
	const [year, month, day] = iso.split('-').map(Number);
	return Date.UTC(year, month - 1, day);
};

export const fillAppointmentsByDay = (
	value: unknown,
	options: FillAppointmentsByDayOptions | Date = {}
): DashboardDayCount[] => {
	const resolved = options instanceof Date ? { now: options } : options;
	const direction = resolved.direction ?? 'back';
	const now = resolved.now ?? new Date();
	const byDate = new Map<string, number>();
	if (Array.isArray(value)) {
		for (const item of value) {
			if (!item || typeof item !== 'object') continue;
			const source = item as Record<string, unknown>;
			const date = toText(source.date);
			if (!ISO_DATE_RE.test(date)) continue;
			byDate.set(date, Math.max(0, Math.floor(toNumber(source.count, 0))));
		}
	}

	const startDate = toText(resolved.startDate);
	const endDate = toText(resolved.endDate);
	if (ISO_DATE_RE.test(startDate) && ISO_DATE_RE.test(endDate) && startDate <= endDate) {
		const start = utcMsFromIso(startDate);
		const end = utcMsFromIso(endDate);
		const days = Math.min(90, Math.floor((end - start) / 86_400_000) + 1);
		return Array.from({ length: Math.max(1, days) }, (_, index) => {
			const iso = toUtcIso(start + index * 86_400_000);
			return {
				date: iso,
				count: byDate.get(iso) ?? 0,
			};
		});
	}

	const days = Math.max(1, Math.floor(resolved.days ?? DASHBOARD_CHART_MAX_DAYS));
	const [year, month, day] = asuncionTodayIso(now).split('-').map(Number);
	const start = Date.UTC(year, month - 1, day);

	return Array.from({ length: days }, (_, index) => {
		const offset = direction === 'forward' ? index : index - (days - 1);
		const iso = toUtcIso(start + offset * 86_400_000);
		return {
			date: iso,
			count: byDate.get(iso) ?? 0,
		};
	});
};

export const normalizeChartWindow = (value: unknown): DashboardChartWindow => {
	const parsed = Number(value);
	return DASHBOARD_CHART_WINDOWS.includes(parsed as DashboardChartWindow)
		? (parsed as DashboardChartWindow)
		: DASHBOARD_CHART_DEFAULT_DAYS;
};

export const sliceChartWindow = (
	series: DashboardDayCount[],
	days: unknown = DASHBOARD_CHART_DEFAULT_DAYS
): DashboardDayCount[] => {
	const window = normalizeChartWindow(days);
	if (series.length <= window) return series;
	return series.slice(-window);
};

export const chartWindowSubtitle = (days: number) => `Últimos ${days} días`;

export const formatIsoDateLabel = (iso: string) => {
	if (!ISO_DATE_RE.test(iso)) return iso;
	const [year, month, day] = iso.split('-').map(Number);
	return new Intl.DateTimeFormat('es-PY', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC',
	}).format(new Date(Date.UTC(year, month - 1, day)));
};

export const analyticsPeriodSubtitle = (from: string, to: string, kind: 'preset' | 'custom', days: number) => {
	if (kind === 'custom' && ISO_DATE_RE.test(from) && ISO_DATE_RE.test(to)) {
		if (from === to) return formatIsoDateLabel(from);
		return `${formatIsoDateLabel(from)} – ${formatIsoDateLabel(to)}`;
	}
	return chartWindowSubtitle(days);
};

const Y_STEP_CANDIDATES = [1, 2, 5, 10, 20, 25, 50, 100];

export const chartYTicks = (maxCount: number): number[] => {
	const max = Math.max(0, Math.floor(maxCount));
	if (max <= 0) return [1, 0];
	if (max <= 4) {
		return Array.from({ length: max + 1 }, (_, index) => max - index);
	}

	let step = 1;
	for (const candidate of Y_STEP_CANDIDATES) {
		const top = Math.ceil(max / candidate) * candidate;
		const tickCount = top / candidate + 1;
		if (tickCount <= 6) {
			step = candidate;
			break;
		}
	}

	const top = Math.ceil(max / step) * step;
	const ticks: number[] = [];
	for (let value = top; value >= 0; value -= step) ticks.push(value);
	return ticks;
};

export const chartYCeiling = (maxCount: number) => chartYTicks(maxCount)[0] ?? 1;

export const isChartDayTick = (index: number, total: number, isToday = false) => {
	if (total <= 7) return true;
	if (isToday || index === 0 || index === total - 1) return true;
	const step = total >= 60 ? 10 : total >= 30 ? 5 : 3;
	return index % step === 0;
};

const WEEKDAY_LABELS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'] as const;
const WEEKDAY_NAMES = [
	'domingo',
	'lunes',
	'martes',
	'miércoles',
	'jueves',
	'viernes',
	'sábado',
] as const;

export type DashboardChartDay = {
	label: string;
	weekdayName: string;
	dayNumber: number;
	iso: string;
	isToday: boolean;
	hasAppointments: boolean;
	appointmentCount: number;
	barPct: number;
	showTick: boolean;
};

export const chartBarTip = (day: DashboardChartDay) => {
	const countLabel = day.appointmentCount === 1 ? '1 cita' : `${day.appointmentCount} citas`;
	if (day.isToday) return { title: 'Hoy', countLabel };
	const month = new Intl.DateTimeFormat('es-PY', { month: 'short', timeZone: 'UTC' })
		.format(new Date(`${day.iso}T12:00:00Z`))
		.replace('.', '');
	return {
		title: `${day.weekdayName} ${day.dayNumber} ${month}`,
		countLabel,
	};
};

export const toDashboardChartDays = (
	series: DashboardDayCount[],
	todayIso: string
): DashboardChartDay[] => {
	const rawMax = Math.max(0, ...series.map((item) => item.count));
	const ceiling = chartYCeiling(rawMax);
	const empty = series.every((item) => item.count === 0);
	const total = series.length;

	return series.map((item, index) => {
		const [year, month, dayNumber] = item.date.split('-').map(Number);
		const weekday = new Date(Date.UTC(year, month - 1, dayNumber)).getUTCDay();
		const isToday = item.date === todayIso;
		return {
			label: WEEKDAY_LABELS[weekday] ?? '',
			weekdayName: WEEKDAY_NAMES[weekday] ?? '',
			dayNumber,
			iso: item.date,
			isToday,
			hasAppointments: item.count > 0,
			appointmentCount: item.count,
			barPct: empty || ceiling <= 0 ? 0 : (item.count / ceiling) * 100,
			showTick: isChartDayTick(index, total, isToday),
		};
	});
};
