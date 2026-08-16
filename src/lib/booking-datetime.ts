/**
 * Contrato de fechas alineado con PKG_AOX_PUBLIC_BOOKING_API y APPOINTMENT:
 * - target_date / fechas de calendario: YYYY-MM-DD
 * - slots disponibles: HH:mm (Oracle HH24:MI)
 * - start_time / end_time en JSON: YYYY-MM-DDTHH:mm:ss (Oracle toma los primeros 19 caracteres como hora local)
 */

const API_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const API_TIME_RE = /^(\d{2}):(\d{2})$/;
const API_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/;

const pad2 = (value: number) => String(value).padStart(2, '0');

/** Inicio del día en hora local (00:00:00.000). */
export const toDateStart = (date: Date) =>
	new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Hoy a medianoche, hora local. */
export const getTodayStart = () => toDateStart(new Date());

/** YYYY-MM-DD para query target_date y campos de calendario. */
export const formatApiDate = (date: Date) =>
	`${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/** HH:mm para comparar con slots de la API. */
export const formatApiTime = (date: Date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

/** Etiqueta de hora en columna del calendario: "10" + "A.M." (valor interno sigue en 24h). */
export const formatHourLabelAmPm = (hour24: number): { hour: string; meridiem: string } => {
	if (!Number.isInteger(hour24) || hour24 < 0 || hour24 > 23) {
		return { hour: '', meridiem: '' };
	}
	return {
		hour: String(hour24 % 12 || 12),
		meridiem: hour24 < 12 ? 'A.M.' : 'P.M.',
	};
};

/**
 * YYYY-MM-DDTHH:mm:ss — formato enviado a Oracle (SUBSTR 1..19 tras reemplazar T por espacio).
 * Sin offset: el backend ignora la zona y usa la hora literal.
 */
export const formatApiDateTime = (date: Date) =>
	`${formatApiDate(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;

/** Parsea YYYY-MM-DD como fecha local (solo día). */
export const parseApiDate = (value: string): Date | null => {
	const match = API_DATE_RE.exec(String(value || '').trim());
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
	return new Date(year, month - 1, day);
};

/**
 * Parsea start_time/end_time de la API como hora local de pared (sin interpretar UTC).
 * Acepta YYYY-MM-DDTHH:mm:ss y variantes con espacio u offset (se ignoran caracteres tras los segundos).
 */
export const parseApiDateTime = (value: string): Date | null => {
	const normalized = String(value || '').trim().replace(' ', 'T');
	const match = API_DATETIME_RE.exec(normalized);
	if (!match) return null;

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const hours = Number(match[4]);
	const minutes = Number(match[5]);
	const seconds = match[6] ? Number(match[6]) : 0;

	if (
		!year ||
		month < 1 ||
		month > 12 ||
		day < 1 ||
		day > 31 ||
		hours > 23 ||
		minutes > 59 ||
		seconds > 59
	) {
		return null;
	}

	return new Date(year, month - 1, day, hours, minutes, seconds, 0);
};

export const formatLongDateFromApiDate = (ymd: string) => {
	const parsed = parseApiDate(ymd);
	if (!parsed) return '';
	return new Intl.DateTimeFormat('es-PY', {
		weekday: 'long',
		day: '2-digit',
		month: 'long',
		year: 'numeric',
	}).format(parsed);
};

/** Fecha corta con día de semana abreviado: "Mié, 22 de Julio". */
export const formatShortDateFromApiDate = (ymd: string) => {
	const parsed = parseApiDate(ymd);
	if (!parsed) return '';
	const cap = (value: string) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value);
	const weekday = new Intl.DateTimeFormat('es-PY', { weekday: 'short' })
		.format(parsed)
		.replace(/\.$/, '');
	const month = new Intl.DateTimeFormat('es-PY', { month: 'long' }).format(parsed);
	return `${cap(weekday)}, ${parsed.getDate()} de ${cap(month)}`;
};

/** Resumen legible: DD-MM-YYYY HH:mm */
export const formatHumanDateTime = (date: Date) =>
	`${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

const capitalizeLabel = (value: string) =>
	value ? value.charAt(0).toUpperCase() + value.slice(1) : value;

/** Fecha compacta para ticket: "19 Ago. 2026". */
export const formatTicketDate = (date: Date) => {
	const month = new Intl.DateTimeFormat('es-PY', { month: 'short' })
		.format(date)
		.replace(/\.$/, '');
	const capMonth = month ? month.charAt(0).toUpperCase() + month.slice(1) : month;
	return `${date.getDate()} ${capMonth}. ${date.getFullYear()}`;
};

/** Fecha amigable: "Miércoles 29 de julio". */
export const formatFriendlyDate = (date: Date) => {
	const weekday = new Intl.DateTimeFormat('es-PY', { weekday: 'long' }).format(date);
	const month = new Intl.DateTimeFormat('es-PY', { month: 'long' }).format(date);
	return `${capitalizeLabel(weekday)} ${date.getDate()} de ${month}`;
};

/** Hora amigable: "11:00". */
export const formatFriendlyTime = (date: Date) =>
	`${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

/** Fecha/hora amigable: "Miércoles 29 de julio, 11:00 hs." */
export const formatFriendlyDateTime = (date: Date) =>
	`${formatFriendlyDate(date)}, ${formatFriendlyTime(date)} hs.`;

export type ReservationStatusVariant = 'confirmed' | 'pending' | 'cancelled' | 'past';

export const formatReservationStatusLabel = (
	status: string,
	options?: { isPast?: boolean }
): { label: string; variant: ReservationStatusVariant } => {
	const normalized = String(status || '').trim().toUpperCase();
	if (options?.isPast && normalized !== 'CANCELADO' && normalized !== 'AUSENTE') {
		return { label: 'Finalizada', variant: 'past' };
	}
	if (normalized === 'CANCELADO' || normalized === 'AUSENTE') {
		return { label: 'Cancelado', variant: 'cancelled' };
	}
	if (normalized === 'PENDIENTE') {
		return { label: 'Pendiente', variant: 'pending' };
	}
	if (normalized === 'COMPLETADO') {
		return { label: 'Completado', variant: 'past' };
	}
	if (normalized === 'CONFIRMADO') {
		return { label: 'Confirmado', variant: 'confirmed' };
	}
	return { label: capitalizeLabel(normalized.toLowerCase()) || '—', variant: 'confirmed' };
};

export const isApiDateOnOrAfter = (date: Date, reference: Date) =>
	toDateStart(date).getTime() >= toDateStart(reference).getTime();

/** Fecha inicial seleccionable: día de la cita si no pasó, si no hoy. */
export const resolveInitialSelectableDate = (appointmentStart: Date, today = getTodayStart()) =>
	isApiDateOnOrAfter(appointmentStart, today) ? toDateStart(appointmentStart) : today;

export const timeSlotToMinutes = (value: string) => {
	const match = API_TIME_RE.exec(String(value || '').trim());
	if (!match) return Number.NaN;
	return Number(match[1]) * 60 + Number(match[2]);
};

export const isValidApiTimeSlot = (value: string) => API_TIME_RE.test(String(value || '').trim());

export const sortTimeSlotsChronologically = (slots: string[]) =>
	[...new Set(slots.map((slot) => slot.trim()).filter(isValidApiTimeSlot))].sort(
		(a, b) => timeSlotToMinutes(a) - timeSlotToMinutes(b)
	);

export const buildApiAppointmentTimes = (
	dateYmd: string,
	timeHm: string,
	durationMinutes: number
): { start_time: string; end_time: string } | null => {
	if (!parseApiDate(dateYmd) || !isValidApiTimeSlot(timeHm)) return null;

	const start = parseApiDateTime(`${dateYmd}T${timeHm}:00`);
	if (!start) return null;

	const end = new Date(start.getTime() + durationMinutes * 60_000);
	return {
		start_time: formatApiDateTime(start),
		end_time: formatApiDateTime(end),
	};
};

type ReservationTimeInput = {
	start_time: string;
	end_time?: string;
	duration_minutes?: number;
};

export const getReservationEndTime = (reservation: ReservationTimeInput): Date | null => {
	const endFromApi = parseApiDateTime(String(reservation.end_time || '').trim());
	if (endFromApi) return endFromApi;

	const start = parseApiDateTime(reservation.start_time);
	if (!start) return null;

	const durationMinutes = Number(reservation.duration_minutes);
	const duration =
		Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 30;

	return new Date(start.getTime() + duration * 60_000);
};

export const isReservationPast = (
	reservation: ReservationTimeInput,
	reference = new Date()
): boolean => {
	const end = getReservationEndTime(reservation);
	if (!end) return false;
	return end.getTime() <= reference.getTime();
};
