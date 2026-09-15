export const SERIES_MIN_COUNT = 2;
export const SERIES_MAX_COUNT = 52;

export type SeriesFrequency = 'WEEKLY';

export type SeriesRecurrence = {
	frequency: SeriesFrequency;
	count?: number;
	until?: string;
};

export const WEEKDAY_LABELS_ES = [
	'domingo',
	'lunes',
	'martes',
	'miércoles',
	'jueves',
	'viernes',
	'sábado',
] as const;

const pad = (value: number) => String(value).padStart(2, '0');

export const toDateInputValue = (date: Date) =>
	`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const addWeeks = (date: Date, weeks: number) => {
	const next = new Date(date.getTime());
	next.setDate(next.getDate() + weeks * 7);
	return next;
};

export const parseSeriesUntilDate = (value: string): Date | null => {
	const match = String(value || '')
		.trim()
		.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(year, month - 1, day);
	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	) {
		return null;
	}
	return date;
};

const isOnOrBeforeUntil = (occurrence: Date, until: Date) => {
	const occDay = new Date(occurrence.getFullYear(), occurrence.getMonth(), occurrence.getDate());
	const untilDay = new Date(until.getFullYear(), until.getMonth(), until.getDate());
	return occDay.getTime() <= untilDay.getTime();
};

export const buildWeeklyOccurrences = (
	start: Date,
	recurrence: Pick<SeriesRecurrence, 'count' | 'until'>
): Date[] => {
	const until = recurrence.until ? parseSeriesUntilDate(recurrence.until) : null;
	const count = recurrence.count;
	if (!until && (count === undefined || count === null)) {
		return [];
	}
	if (count !== undefined && count !== null && (!Number.isInteger(count) || count < 1)) {
		return [];
	}

	const max = Math.min(count ?? SERIES_MAX_COUNT, SERIES_MAX_COUNT);
	const occurrences: Date[] = [];
	for (let index = 0; index < max; index += 1) {
		const next = addWeeks(start, index);
		if (until && !isOnOrBeforeUntil(next, until)) break;
		occurrences.push(next);
	}
	return occurrences;
};

export const formatSeriesPreview = (start: Date, occurrences: Date[]) => {
	if (occurrences.length === 0) {
		return 'Indicá cuántas citas o hasta qué fecha.';
	}
	const weekday = WEEKDAY_LABELS_ES[start.getDay()] ?? 'ese día';
	const hour = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
	if (occurrences.length === 1) {
		return `Con estos datos solo entra 1 cita los ${weekday} a las ${hour}. Ampliá el recuento o la fecha de fin.`;
	}
	return `Se crearán ${occurrences.length} citas los ${weekday} a las ${hour}.`;
};

export const formatSeriesDateShort = (date: Date) => {
	const weekday = WEEKDAY_LABELS_ES[date.getDay()] ?? '';
	return `${weekday.slice(0, 3)} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
};

export const formatSeriesConflictDate = (iso: string) => {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return `${formatSeriesDateShort(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
