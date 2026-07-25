export interface AiChatQuickAction {
	label: string;
	message: string;
	icon: string;
}

export const AI_CHAT_SUGGESTED_QUESTIONS: AiChatQuickAction[] = [
	{
		label: '¿Qué citas tengo hoy?',
		message: 'Mostrame mis citas de hoy.',
		icon: 'today',
	},
	{
		label: '¿Qué turnos tengo esta semana?',
		message: 'Listame mis próximas citas de los próximos 7 días desde hoy.',
		icon: 'date_range',
	},
	{
		label: '¿Cómo está mi agenda?',
		message: 'Dame un resumen del estado de mi agenda y próximos turnos.',
		icon: 'auto_graph',
	},
];

export const AI_CHAT_QUICK_ACTIONS: AiChatQuickAction[] = [
	{
		label: 'Buscar horarios',
		message: 'Quiero buscar disponibilidad para crear una cita.',
		icon: 'event_available',
	},
	{
		label: 'Crear cita',
		message: 'Quiero crear una cita nueva.',
		icon: 'add_circle',
	},
	{
		label: 'Cancelar cita',
		message: 'Necesito cancelar una cita.',
		icon: 'event_busy',
	},
];
