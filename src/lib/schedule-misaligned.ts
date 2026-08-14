export type ScheduleMisalignedReason =
	| 'LOCATION_CLOSED'
	| 'DAY_BLOCKED'
	| 'TIME_OUTSIDE_SCHEDULE'
	| 'WRONG_LOCATION';

const REASON_SET = new Set<string>([
	'LOCATION_CLOSED',
	'DAY_BLOCKED',
	'TIME_OUTSIDE_SCHEDULE',
	'WRONG_LOCATION',
]);

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
	professionalName?: string;
	timeLabel?: string;
};

const displayName = (value: unknown, fallback: string) => {
	const label = String(value || '').trim();
	return label || fallback;
};

const displayLocation = (value: unknown) => displayName(value, 'esa sucursal');
const displayProfessional = (value: unknown) => displayName(value, 'El profesional');

export const getScheduleMisalignedTitle = (reason: ScheduleMisalignedReason | null) => {
	switch (reason) {
		case 'LOCATION_CLOSED':
			return 'Sucursal cerrada ese día';
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
		case 'LOCATION_CLOSED':
			return `${locationLabel[0].toUpperCase() + locationLabel.slice(1)} tiene un cierre general vigente para ese día (feriado o mantenimiento). La cita sigue activa pero ya no puede atenderse. Reprogramá la cita o quitá el cierre en Sucursales → Días festivos y cierres.`;
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
		case 'LOCATION_CLOSED':
			return '· sucursal cerrada';
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
		case 'LOCATION_CLOSED':
			return 'Sucursal cerrada';
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

export const getScheduleMisalignedListExplanation = (
	reason: ScheduleMisalignedReason | null,
	context: MisalignedMessageContext = {}
) => {
	const location = displayLocation(context.locationName);
	const professional = displayProfessional(context.professionalName);
	const professionalIsNamed = Boolean(String(context.professionalName || '').trim());
	const professionalSubject = professionalIsNamed ? professional : 'El profesional';
	const timeText = String(context.timeLabel || '').trim();
	const timePhrase = timeText ? ` a las ${timeText}` : ' a esa hora';

	switch (reason) {
		case 'LOCATION_CLOSED':
			return String(context.locationName || '').trim()
				? `La sucursal ${location} está cerrada${timePhrase} (feriado, mantenimiento u otro cierre). No se puede atender ahí.`
				: `La sucursal está cerrada${timePhrase} (feriado, mantenimiento u otro cierre). No se puede atender ahí.`;
		case 'DAY_BLOCKED':
			return `${professionalSubject} tiene ese día bloqueado en su agenda: no atiende citas ese día.`;
		case 'WRONG_LOCATION':
			return String(context.locationName || '').trim()
				? `${professionalSubject} sí tiene turno${timePhrase}, pero no en ${location}. Ese horario está asignado a otra sucursal.`
				: `${professionalSubject} sí tiene turno${timePhrase}, pero en otra sucursal.`;
		case 'TIME_OUTSIDE_SCHEDULE':
			return `${professionalSubject} no tiene turnos${timePhrase} ese día. Esa franja no está en su plantilla semanal ni en una excepción.`;
		default:
			return `${professionalSubject} no puede atender esta cita con el horario o la sucursal actuales.`;
	}
};

export const getScheduleMisalignedBannerAction = (count: number) => {
	if (Math.max(0, Math.floor(count)) === 1) {
		return 'Buscá la alerta ⚠ en el calendario para reprogramarla.';
	}
	return 'Buscá las alertas ⚠ en el calendario para reprogramarlas.';
};

export const getScheduleMisalignedConfirmTitle = (reason: ScheduleMisalignedReason | null) => {
	switch (reason) {
		case 'LOCATION_CLOSED':
			return 'Sucursal cerrada ese día';
		case 'DAY_BLOCKED':
			return 'Día bloqueado para el profesional';
		case 'WRONG_LOCATION':
			return 'Sucursal fuera de su agenda';
		case 'TIME_OUTSIDE_SCHEDULE':
			return 'Horario fuera de sus turnos';
		default:
			return 'Cita fuera de la agenda del profesional';
	}
};

const CONFIRM_ASK = '¿Querés guardar este turno como una excepción?';

export const SCHEDULE_MISALIGNED_CONFIRM_ACTION = 'Aprobar excepción';

export const getScheduleMisalignedConfirmMessage = (
	reason: ScheduleMisalignedReason | null,
	context: MisalignedMessageContext = {}
) => {
	const locationLabel = String(context.locationName || '').trim() || 'esa sucursal';

	switch (reason) {
		case 'LOCATION_CLOSED':
			return `${locationLabel[0].toUpperCase() + locationLabel.slice(1)} está cerrada ese día. ${CONFIRM_ASK}`;
		case 'DAY_BLOCKED':
			return `El profesional no atiende ese día. ${CONFIRM_ASK}`;
		case 'WRONG_LOCATION':
			return `El profesional no atiende en ${locationLabel} en ese horario. ${CONFIRM_ASK}`;
		case 'TIME_OUTSIDE_SCHEDULE':
			return `El horario seleccionado está fuera de la disponibilidad habitual. ${CONFIRM_ASK}`;
		default:
			return `El horario seleccionado está fuera de la disponibilidad habitual. ${CONFIRM_ASK}`;
	}
};

export const SCHEDULE_MISALIGNED_ERROR_CODE = 'SCHEDULE_MISALIGNED';

export const isScheduleMisalignedConflictError = (error: unknown) => {
	if (!error || typeof error !== 'object') return false;
	const source = error as {
		status?: number;
		code?: string;
		scheduleMisalignedReason?: string | null;
	};
	return (
		source.status === 409 &&
		String(source.code || '').trim().toUpperCase() === SCHEDULE_MISALIGNED_ERROR_CODE
	);
};
