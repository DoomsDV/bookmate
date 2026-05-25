import type { ApiFieldError } from './types';

export const toInt = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) ? parsed : fallback;
};

export const toPositiveInt = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const formatDateTimeLocal = (date: Date) => {
	const pad = (value: number) => String(value).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const formatDateTimeDisplay = (date: Date) => {
	const pad = (value: number) => String(value).padStart(2, '0');
	return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const normalizeDateTimeInput = (value: string) => {
	return String(value || '')
		.replace(/\//g, '-')
		.replace(/\s+/g, ' ')
		.trimStart();
};

export const normalizeDateTimeDisplay = (value: string) => normalizeDateTimeInput(value);

const buildLocalDateTime = (
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number
) => {
	if (
		!Number.isInteger(day) ||
		!Number.isInteger(month) ||
		!Number.isInteger(year) ||
		!Number.isInteger(hour) ||
		!Number.isInteger(minute)
	) {
		return null;
	}
	if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
		return null;
	}

	const date = new Date(year, month - 1, day, hour, minute, 0, 0);
	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day ||
		date.getHours() !== hour ||
		date.getMinutes() !== minute
	) {
		return null;
	}

	return date;
};

export const parseLocalDateTime = (value: string) => {
	const normalized = normalizeDateTimeInput(value).trim();
	if (!normalized) return null;

	const isoLocalMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::\d{2})?$/);
	if (isoLocalMatch) {
		const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw] = isoLocalMatch;
		return buildLocalDateTime(
			Number(yearRaw),
			Number(monthRaw),
			Number(dayRaw),
			Number(hourRaw),
			Number(minuteRaw)
		);
	}

	const displayMatch = normalized.match(/^(\d{2})-(\d{2})-(\d{4})\s(\d{2}):(\d{2})$/);
	if (!displayMatch) return null;

	const [, dayRaw, monthRaw, yearRaw, hourRaw, minuteRaw] = displayMatch;
	return buildLocalDateTime(
		Number(yearRaw),
		Number(monthRaw),
		Number(dayRaw),
		Number(hourRaw),
		Number(minuteRaw)
	);
};

export const parseDisplayDateTime = (value: string) => {
	const normalized = normalizeDateTimeInput(value).trim();
	const match = normalized.match(/^(\d{2})-(\d{2})-(\d{4})\s(\d{2}):(\d{2})$/);
	if (!match) return null;

	const [, dayRaw, monthRaw, yearRaw, hourRaw, minuteRaw] = match;
	const day = Number(dayRaw);
	const month = Number(monthRaw);
	const year = Number(yearRaw);
	const hour = Number(hourRaw);
	const minute = Number(minuteRaw);

	return buildLocalDateTime(year, month, day, hour, minute);
};

export const parseIsoToLocalInput = (value: string) => {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return formatDateTimeLocal(date);
};

export const parseIsoToDisplayInput = (value: string) => {
	return parseIsoToLocalInput(value);
};

export const toIsoWithOffset = (value: string | Date) => {
	let date: Date;
	if (value instanceof Date) {
		date = value;
	} else {
		const localDate = parseLocalDateTime(value);
		date = localDate || new Date(value);
	}

	if (Number.isNaN(date.getTime())) return '';

	const pad = (num: number) => String(num).padStart(2, '0');
	const year = date.getFullYear();
	const month = pad(date.getMonth() + 1);
	const day = pad(date.getDate());
	const hour = pad(date.getHours());
	const minute = pad(date.getMinutes());
	const offsetMinutes = -date.getTimezoneOffset();
	const sign = offsetMinutes >= 0 ? '+' : '-';
	const absOffset = Math.abs(offsetMinutes);
	const tzHour = pad(Math.floor(absOffset / 60));
	const tzMinute = pad(absOffset % 60);

	return `${year}-${month}-${day}T${hour}:${minute}:00${sign}${tzHour}:${tzMinute}`;
};

export class ApiClientError extends Error {
	status: number;
	fieldErrors: ApiFieldError[];

	constructor(message: string, status = 400, fieldErrors: ApiFieldError[] = []) {
		super(message);
		this.name = 'ApiClientError';
		this.status = status;
		this.fieldErrors = fieldErrors;
	}
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	Boolean(value) && typeof value === 'object';

export const parseApiFieldErrors = (value: unknown): ApiFieldError[] => {
	if (!Array.isArray(value)) return [];

	return value.flatMap((item) => {
		if (!isObject(item)) return [];
		const field = String(item.field || '').trim();
		const message = String(item.message || '').trim();
		if (!field || !message) return [];
		return [{ field, message }];
	});
};

export const readApiError = (data: unknown, fallbackMessage: string) => {
	if (isObject(data)) {
		const message = String(data.message || '').trim();
		if (message) return message;

		if (Array.isArray(data.errors)) {
			const messages = data.errors
				.filter((item) => isObject(item))
				.map((item) => String(item.message || '').trim())
				.filter((message) => message.length > 0);
			if (messages.length > 0) return messages.join(' | ');
		}
	}

	return fallbackMessage;
};

export const isAppointmentStatus = (
	value: string
): value is 'PENDIENTE' | 'CONFIRMADO' | 'COMPLETADO' | 'CANCELADO' => {
	return ['PENDIENTE', 'CONFIRMADO', 'COMPLETADO', 'CANCELADO'].includes(value);
};

export {
	isAttendanceAwaitingReconfirmation,
	isAttendanceDeclined,
	isAttendanceReconfirmed,
	normalizeAttendanceStatus,
	type AttendanceStatus,
} from '../../lib/attendance';

export const formatAttendanceReplyAt = (value?: string) => {
	const normalized = String(value || '').trim();
	if (!normalized) return null;

	const date = new Date(normalized);
	if (Number.isNaN(date.getTime())) return null;
	return formatDateTimeDisplay(date);
};

export const showSuccessAlert = async (message: string) => {
	if (!window.BookmateAlert?.alert) return;
	await window.BookmateAlert.alert({
		type: 'success',
		title: 'Operacion exitosa',
		message,
		confirmText: 'Aceptar',
	});
};

export const showErrorAlert = async (message: string) => {
	if (!window.BookmateAlert?.alert) return;
	await window.BookmateAlert.alert({
		type: 'error',
		title: 'No fue posible completar la acción',
		message,
		confirmText: 'Aceptar',
	});
};
