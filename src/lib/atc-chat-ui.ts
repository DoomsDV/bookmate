export interface AtcChatQuickAction {
	label: string;
	message: string;
	icon: string;
}

export const ATC_CHAT_SUGGESTED_QUESTIONS: AtcChatQuickAction[] = [
	{
		label: '¿Qué hay de nuevo?',
		message: '¿Cuáles son las novedades y últimas actualizaciones de Hasel?',
		icon: 'new_releases',
	},
	{
		label: '¿Cómo uso el dashboard?',
		message: '¿Cómo uso el dashboard de Hasel?',
		icon: 'dashboard',
	},
	{
		label: '¿Cómo funcionan los cobros?',
		message: '¿Cómo funcionan los cobros y señas en Hasel?',
		icon: 'payments',
	},
	{
		label: '¿Cómo configuro mi perfil público?',
		message: '¿Cómo configuro mi perfil público y enlace de reserva?',
		icon: 'public',
	},
	{
		label: '¿Cómo gestiono citas?',
		message: '¿Cómo creo, edito o cancelo citas en el calendario?',
		icon: 'event',
	},
];
