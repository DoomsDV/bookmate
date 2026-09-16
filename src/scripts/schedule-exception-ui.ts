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

export const EXCEPTION_NOTE_HELP_TEXT =
	'Solo para auditoría o mensaje interno: ayuda a recordar el motivo de esta modificación. No la ven los clientes.';

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

export const resolveDayExceptionState = (params: {
	inheritsTemplate: boolean;
	exceptionType: ScheduleExceptionType | 'INHERIT' | null | undefined;
}): CalendarDayTone => {
	if (params.inheritsTemplate || !params.exceptionType || params.exceptionType === 'INHERIT') {
		return 'normal';
	}
	if (params.exceptionType === 'BLOCKED') return 'blocked';
	return 'override';
};

export const DAY_EXCEPTION_STATE_COPY: Record<
	CalendarDayTone,
	{ label: string; title: string; copy: string; icon: string }
> = {
	normal: {
		label: 'Usa plantilla',
		title: 'Este día usa la plantilla semanal',
		copy: 'No hay una excepción cargada. Los turnos salen del horario habitual.',
		icon: 'event_available',
	},
	blocked: {
		label: 'Bloqueado',
		title: 'Este día está bloqueado',
		copy: 'No hay turnos disponibles para atender citas.',
		icon: 'block',
	},
	override: {
		label: 'Horario especial',
		title: 'Este día tiene horario especial',
		copy: 'Las franjas de abajo reemplazan la plantilla semanal solo esta fecha.',
		icon: 'edit_calendar',
	},
};

export type LocationRangeGroup = {
	locationId: number;
	locationName: string;
	ranges: Array<{ start_time: string; end_time: string }>;
};

export const groupSlotsByLocation = (
	slots: Array<{ loc_id_location: string | number; start_time: string; end_time: string }>,
	locations: Array<{ id_location: number; name: string }>
): LocationRangeGroup[] => {
	const nameById = new Map(locations.map((location) => [location.id_location, String(location.name || '')]));
	const groups = new Map<number, LocationRangeGroup>();

	for (const slot of slots) {
		const locationId = Number(slot.loc_id_location || 0);
		const key = Number.isInteger(locationId) && locationId > 0 ? locationId : 0;
		let group = groups.get(key);
		if (!group) {
			group = {
				locationId: key,
				locationName: nameById.get(key) || 'Sucursal',
				ranges: [],
			};
			groups.set(key, group);
		}
		group.ranges.push({
			start_time: slot.start_time,
			end_time: slot.end_time,
		});
	}

	return [...groups.values()];
};
