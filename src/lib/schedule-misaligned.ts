export type ScheduleMisalignedReason =
	| 'DAY_BLOCKED'
	| 'TIME_OUTSIDE_SCHEDULE'
	| 'WRONG_LOCATION';

const REASON_SET = new Set<string>(['DAY_BLOCKED', 'TIME_OUTSIDE_SCHEDULE', 'WRONG_LOCATION']);

export const normalizeScheduleMisalignedReason = (
	value: unknown
): ScheduleMisalignedReason | null => {
	const code = String(value || '')
		.trim()
		.toUpperCase();
	return REASON_SET.has(code) ? (code as ScheduleMisalignedReason) : null;
};

export const isScheduleMisalignedFlag = (value: unknown) =>
	value === true ||
	value === 1 ||
	String(value || '').trim().toLowerCase() === 'true';

type MisalignedMessageContext = {
	locationName?: string;
};

export const getScheduleMisalignedTitle = (reason: ScheduleMisalignedReason | null) => {
	switch (reason) {
		case 'DAY_BLOCKED':
			return 'Día bloqueado en la agenda';
		case 'WRONG_LOCATION':
			return 'Sucursal no disponible ese día';
		case 'TIME_OUTSIDE_SCHEDULE':
			return 'Horario fuera de los turnos actuales';
		default:
			return 'Cita fuera de la agenda actual';
	}
};

export const getScheduleMisalignedMessage = (
	reason: ScheduleMisalignedReason | null,
	context: MisalignedMessageContext = {}
) => {
	const locationLabel = String(context.locationName || '').trim() || 'la sucursal de la cita';

	switch (reason) {
		case 'DAY_BLOCKED':
			return 'Este día está marcado como bloqueado en excepciones de horario. La cita sigue activa, pero ya no coincide con la agenda. Reprograma la cita o quita el bloqueo del día en Horarios → Excepciones.';
		case 'WRONG_LOCATION':
			return `La hora de la cita no está disponible en ${locationLabel} según la plantilla o la excepción de ese día, aunque el profesional sí tiene turnos en otra sucursal. Cambia sucursal, fecha u hora, o ajusta la excepción.`;
		case 'TIME_OUTSIDE_SCHEDULE':
			return 'La hora de la cita no cae en ningún turno configurado para ese día (plantilla semanal o excepción con horario especial). Reprograma la cita o actualiza los horarios.';
		default:
			return 'Esta cita no coincide con el horario o la sucursal actuales del profesional. Reprograma manualmente y avisa al cliente si cambias fecha u hora.';
	}
};

export const getScheduleMisalignedListSuffix = (reason: ScheduleMisalignedReason | null) => {
	switch (reason) {
		case 'DAY_BLOCKED':
			return '· día bloqueado';
		case 'WRONG_LOCATION':
			return '· sucursal no disponible';
		case 'TIME_OUTSIDE_SCHEDULE':
			return '· fuera de turnos';
		default:
			return '· fuera de agenda';
	}
};

export const getScheduleMisalignedBannerTitle = (count: number) => {
	const safeCount = Math.max(0, Math.floor(count));
	const label = safeCount === 1 ? 'cita' : 'citas';
	return `${safeCount} ${label} con conflicto de horario`;
};

export const getScheduleMisalignedBannerCaption = (count: number) => {
	if (Math.max(0, Math.floor(count)) === 1) {
		return 'No coincide con la disponibilidad actual de la agenda:';
	}
	return 'No coinciden con la disponibilidad actual de la agenda:';
};

export const getScheduleMisalignedBannerReasonLabel = (reason: ScheduleMisalignedReason | null) => {
	switch (reason) {
		case 'DAY_BLOCKED':
			return 'Día bloqueado';
		case 'WRONG_LOCATION':
			return 'Sucursal no disponible';
		case 'TIME_OUTSIDE_SCHEDULE':
			return 'Fuera de turno';
		default:
			return 'Fuera de agenda';
	}
};

export const getScheduleMisalignedBannerAction = (count: number) => {
	if (Math.max(0, Math.floor(count)) === 1) {
		return 'Buscá la alerta ⚠ en el calendario para reprogramarla.';
	}
	return 'Buscá las alertas ⚠ en el calendario para reprogramarlas.';
};
