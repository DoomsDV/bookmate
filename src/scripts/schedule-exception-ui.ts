import type { ScheduleExceptionType } from '../lib/schedules';

export type ExceptionSummaryMap = Map<
	string,
	{
		exception_type: ScheduleExceptionType;
		is_past: boolean;
	}
>;

export type ExceptionSlotDraft = {
	uid: string;
	loc_id_location: string;
	start_time: string;
	end_time: string;
};

export const formatDateKey = (date: Date): string => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
};

export const parseDateKey = (dateKey: string): Date => {
	const [year, month, day] = dateKey.split('-').map((part) => Number(part));
	return new Date(year, month - 1, day);
};

export const isPastDateKey = (dateKey: string): boolean => dateKey < formatDateKey(new Date());

export const getIsoDayOfWeek = (date: Date): number => {
	const day = date.getDay();
	return day === 0 ? 7 : day;
};

export const getMonthRangeKeys = (cursor: Date): { from: string; to: string } => {
	const year = cursor.getFullYear();
	const month = cursor.getMonth();
	const from = formatDateKey(new Date(year, month, 1));
	const to = formatDateKey(new Date(year, month + 1, 0));
	return { from, to };
};

export const formatMonthLabel = (cursor: Date): string =>
	new Intl.DateTimeFormat('es-PY', { month: 'long', year: 'numeric' }).format(cursor);

export const buildExceptionSummaryMap = (
	items: Array<{ exception_date: string; exception_type: ScheduleExceptionType; is_past: boolean }>
): ExceptionSummaryMap => {
	const map: ExceptionSummaryMap = new Map();
	for (const item of items) {
		map.set(item.exception_date, {
			exception_type: item.exception_type,
			is_past: item.is_past,
		});
	}
	return map;
};

export type CalendarDayTone = 'normal' | 'blocked' | 'override';

export const resolveCalendarDayTone = (
	dateKey: string,
	summaryMap: ExceptionSummaryMap
): CalendarDayTone => {
	const summary = summaryMap.get(dateKey);
	if (summary?.exception_type === 'BLOCKED') return 'blocked';
	if (summary?.exception_type === 'OVERRIDE') return 'override';
	return 'normal';
};
