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

export const parseIsoToLocalInput = (value: string) => {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return formatDateTimeLocal(date);
};

export const toIsoWithOffset = (value: string) => {
	const date = new Date(value);
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

export const cleanFlashUrl = () => {
	const currentUrl = new URL(window.location.href);
	if (!currentUrl.searchParams.has('flash_message')) return;
	currentUrl.searchParams.delete('flash_message');
	currentUrl.searchParams.delete('flash_type');
	window.history.replaceState({}, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
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
		title: 'No fue posible completar la accion',
		message,
		confirmText: 'Aceptar',
	});
};
