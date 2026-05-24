export type AttendanceStatus =
	| 'NOT_REQUESTED'
	| 'SENT'
	| 'CONFIRMED'
	| 'DECLINED'
	| 'EXPIRED';

export const normalizeAttendanceStatus = (value: unknown): AttendanceStatus => {
	const normalized = String(value || '')
		.trim()
		.toUpperCase();
	if (
		normalized === 'NOT_REQUESTED' ||
		normalized === 'SENT' ||
		normalized === 'CONFIRMED' ||
		normalized === 'DECLINED' ||
		normalized === 'EXPIRED'
	) {
		return normalized;
	}
	return 'NOT_REQUESTED';
};

export const normalizeAttendanceConfirmed = (
	value: unknown,
	attendanceStatus: AttendanceStatus
) => {
	if (typeof value === 'boolean') return value;
	if (value === 1 || value === '1' || String(value).toLowerCase() === 'true') return true;
	return attendanceStatus === 'CONFIRMED';
};

export const normalizeAttendanceReplyAt = (value: unknown) => {
	const normalized = String(value || '').trim();
	return normalized || undefined;
};

export const isAttendanceReconfirmed = (value: unknown) => {
	if (!value || typeof value !== 'object') return false;
	const source = value as Record<string, unknown>;
	const attendanceStatus = normalizeAttendanceStatus(source.attendance_status);
	return normalizeAttendanceConfirmed(source.attendance_confirmed, attendanceStatus);
};

export const getAttendanceStatusFromValue = (value: unknown): AttendanceStatus => {
	if (!value || typeof value !== 'object') return 'NOT_REQUESTED';
	return normalizeAttendanceStatus((value as Record<string, unknown>).attendance_status);
};

/** Muestra reloj: aún no reconfirmó (incluye antes de enviar el recordatorio). */
export const isAttendanceAwaitingReconfirmation = (value: unknown) => {
	const status = getAttendanceStatusFromValue(value);
	return status === 'NOT_REQUESTED' || status === 'SENT' || status === 'EXPIRED';
};

export const isAttendanceDeclined = (value: unknown) => {
	return getAttendanceStatusFromValue(value) === 'DECLINED';
};
