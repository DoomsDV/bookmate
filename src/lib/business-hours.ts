export type BusinessHoursInterval = {
	start: string;
	end: string;
};

export type BusinessHoursDay = {
	day: number;
	closed: boolean;
	intervals: BusinessHoursInterval[];
};

export type BusinessHours = {
	days: BusinessHoursDay[];
};

export type BusinessHoursLiveStatus = 'open' | 'closed';

export type BusinessHoursDisplayRow = {
	label: string;
	/** Turnos formateados (vacío si cerrado). */
	slots: string[];
	/** Texto plano (p. ej. a11y / keys). */
	value: string;
	closed: boolean;
	isToday: boolean;
	liveStatus: BusinessHoursLiveStatus | null;
};

/** Zona horaria por defecto del producto (Paraguay). */
export const BUSINESS_HOURS_TIME_ZONE = 'America/Asuncion';

export const BUSINESS_HOURS_DAY_LABELS = [
	'Lunes',
	'Martes',
	'Miércoles',
	'Jueves',
	'Viernes',
	'Sábado',
	'Domingo',
] as const;

export const BUSINESS_HOURS_DAY_SHORT = [
	'Lun',
	'Mar',
	'Mié',
	'Jue',
	'Vie',
	'Sáb',
	'Dom',
] as const;

export const BUSINESS_HOURS_MAX_INTERVALS = 3;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const cloneDay = (day: BusinessHoursDay): BusinessHoursDay => ({
	day: day.day,
	closed: day.closed,
	intervals: day.intervals.map((interval) => ({ ...interval })),
});

export const emptyBusinessHours = (): BusinessHours => ({
	days: Array.from({ length: 7 }, (_, index) => ({
		day: index + 1,
		closed: true,
		intervals: [] as BusinessHoursInterval[],
	})),
});

export const defaultOpenInterval = (): BusinessHoursInterval => ({
	start: '09:00',
	end: '18:00',
});

const normalizeTime = (value: unknown): string => {
	const raw = String(value || '').trim();
	if (!TIME_RE.test(raw)) return '';
	return raw;
};

const timeToMinutes = (value: string): number => {
	const [hh, mm] = value.split(':').map(Number);
	return hh * 60 + mm;
};

const intervalsOverlap = (a: BusinessHoursInterval, b: BusinessHoursInterval) => {
	const aStart = timeToMinutes(a.start);
	const aEnd = timeToMinutes(a.end);
	const bStart = timeToMinutes(b.start);
	const bEnd = timeToMinutes(b.end);
	return aStart < bEnd && bStart < aEnd;
};

export const normalizeBusinessHours = (input: unknown): BusinessHours => {
	const base = emptyBusinessHours();
	if (!input || typeof input !== 'object') return base;
	const source = input as Record<string, unknown>;
	const daysRaw = Array.isArray(source.days) ? source.days : [];

	for (const item of daysRaw) {
		if (!item || typeof item !== 'object') continue;
		const row = item as Record<string, unknown>;
		const dayNum = Number(row.day);
		if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 7) continue;
		const closed = row.closed === true || row.closed === 1 || row.closed === 'true';
		const intervalsRaw = Array.isArray(row.intervals) ? row.intervals : [];
		const intervals: BusinessHoursInterval[] = [];
		for (const interval of intervalsRaw) {
			if (!interval || typeof interval !== 'object') continue;
			const iv = interval as Record<string, unknown>;
			const start = normalizeTime(iv.start);
			const end = normalizeTime(iv.end);
			if (!start || !end) continue;
			intervals.push({ start, end });
			if (intervals.length >= BUSINESS_HOURS_MAX_INTERVALS) break;
		}
		base.days[dayNum - 1] = {
			day: dayNum,
			closed,
			intervals: closed ? [] : intervals,
		};
	}

	return base;
};

export const parseBusinessHours = (value: unknown): BusinessHours => {
	if (!value) return emptyBusinessHours();
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return emptyBusinessHours();
		try {
			return normalizeBusinessHours(JSON.parse(trimmed));
		} catch {
			return emptyBusinessHours();
		}
	}
	return normalizeBusinessHours(value);
};

export const serializeBusinessHours = (hours: BusinessHours): string =>
	JSON.stringify(normalizeBusinessHours(hours));

export const hasOpenBusinessHours = (hours: BusinessHours): boolean =>
	hours.days.some((day) => !day.closed && day.intervals.length > 0);

export const validateBusinessHours = (
	hours: BusinessHours
): { ok: true } | { ok: false; message: string } => {
	const normalized = normalizeBusinessHours(hours);
	for (const day of normalized.days) {
		const label = BUSINESS_HOURS_DAY_LABELS[day.day - 1] || `Día ${day.day}`;
		if (day.closed) continue;
		if (!day.intervals.length) {
			return { ok: false, message: `${label}: agregá al menos un horario o marcá como cerrado.` };
		}
		if (day.intervals.length > BUSINESS_HOURS_MAX_INTERVALS) {
			return {
				ok: false,
				message: `${label}: máximo ${BUSINESS_HOURS_MAX_INTERVALS} turnos por día.`,
			};
		}
		for (const interval of day.intervals) {
			if (!TIME_RE.test(interval.start) || !TIME_RE.test(interval.end)) {
				return { ok: false, message: `${label}: usá horas válidas (HH:mm).` };
			}
			if (timeToMinutes(interval.start) >= timeToMinutes(interval.end)) {
				return { ok: false, message: `${label}: la hora de inicio debe ser menor que la de fin.` };
			}
		}
		for (let i = 0; i < day.intervals.length; i += 1) {
			for (let j = i + 1; j < day.intervals.length; j += 1) {
				if (intervalsOverlap(day.intervals[i], day.intervals[j])) {
					return { ok: false, message: `${label}: los turnos no pueden solaparse.` };
				}
			}
		}
	}
	return { ok: true };
};

const daySignature = (day: BusinessHoursDay): string => {
	if (day.closed || !day.intervals.length) return 'closed';
	return day.intervals
		.map((interval) => `${interval.start}-${interval.end}`)
		.sort()
		.join('|');
};

const formatSlot = (interval: BusinessHoursInterval): string =>
	`${interval.start}–${interval.end}`;

const WEEKDAY_SHORT_TO_DAY: Record<string, number> = {
	Mon: 1,
	Tue: 2,
	Wed: 3,
	Thu: 4,
	Fri: 5,
	Sat: 6,
	Sun: 7,
};

/** Día 1–7 (Lun–Dom) y minutos desde medianoche en la zona dada. */
export const getLocalDayAndMinutes = (
	now: Date = new Date(),
	timeZone: string = BUSINESS_HOURS_TIME_ZONE
): { day: number; minutes: number } => {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		weekday: 'short',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	}).formatToParts(now);

	const weekday = parts.find((part) => part.type === 'weekday')?.value || '';
	const hourRaw = parts.find((part) => part.type === 'hour')?.value || '0';
	const minuteRaw = parts.find((part) => part.type === 'minute')?.value || '0';
	const day = WEEKDAY_SHORT_TO_DAY[weekday] || 1;
	// Some environments emit "24" for midnight with hour12:false
	let hour = Number(hourRaw);
	if (hour === 24) hour = 0;
	const minute = Number(minuteRaw);
	return {
		day,
		minutes: hour * 60 + minute,
	};
};

export const isOpenAt = (
	hours: BusinessHours,
	now: Date = new Date(),
	timeZone: string = BUSINESS_HOURS_TIME_ZONE
): boolean => {
	const normalized = normalizeBusinessHours(hours);
	const { day, minutes } = getLocalDayAndMinutes(now, timeZone);
	const today = normalized.days[day - 1];
	if (!today || today.closed || !today.intervals.length) return false;
	return today.intervals.some((interval) => {
		const start = timeToMinutes(interval.start);
		const end = timeToMinutes(interval.end);
		return minutes >= start && minutes < end;
	});
};

/** Filas para Overview: agrupa días consecutivos con el mismo horario. */
export const formatBusinessHoursForDisplay = (
	hours: BusinessHours,
	options?: { now?: Date; timeZone?: string }
): BusinessHoursDisplayRow[] => {
	const normalized = normalizeBusinessHours(hours);
	if (!hasOpenBusinessHours(normalized)) return [];

	const timeZone = options?.timeZone || BUSINESS_HOURS_TIME_ZONE;
	const now = options?.now || new Date();
	const { day: todayDay } = getLocalDayAndMinutes(now, timeZone);
	const openNow = isOpenAt(normalized, now, timeZone);

	const rows: BusinessHoursDisplayRow[] = [];
	let index = 0;
	while (index < normalized.days.length) {
		const current = normalized.days[index];
		const signature = daySignature(current);
		let end = index;
		while (
			end + 1 < normalized.days.length &&
			daySignature(normalized.days[end + 1]) === signature
		) {
			end += 1;
		}

		const isToday = todayDay >= index + 1 && todayDay <= end + 1;
		const startLabel = BUSINESS_HOURS_DAY_SHORT[index];
		const endLabel = BUSINESS_HOURS_DAY_SHORT[end];
		const label =
			isToday && index === end
				? 'Hoy'
				: index === end
					? startLabel
					: `${startLabel}–${endLabel}`;
		const closed = current.closed || !current.intervals.length;
		const slots = closed ? [] : current.intervals.map(formatSlot);
		rows.push({
			label,
			slots,
			closed,
			isToday,
			liveStatus: isToday ? (openNow ? 'open' : 'closed') : null,
			value: closed ? 'Cerrado' : slots.join(' | '),
		});
		index = end + 1;
	}
	return rows;
};

export const copyMondayToWeekdays = (hours: BusinessHours): BusinessHours => {
	const next = normalizeBusinessHours(hours);
	const monday = cloneDay(next.days[0]);
	for (let day = 1; day <= 5; day += 1) {
		next.days[day - 1] = { ...cloneDay(monday), day };
	}
	return next;
};

export const applyDayToAll = (hours: BusinessHours, sourceDay = 1): BusinessHours => {
	const next = normalizeBusinessHours(hours);
	const source = cloneDay(next.days[Math.max(1, Math.min(7, sourceDay)) - 1]);
	for (let day = 1; day <= 7; day += 1) {
		next.days[day - 1] = { ...cloneDay(source), day };
	}
	return next;
};
