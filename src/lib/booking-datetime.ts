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

/** Resumen legible: DD-MM-YYYY HH:mm */
export const formatHumanDateTime = (date: Date) =>
	`${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

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
