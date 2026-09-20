export interface AssistantChatQuickAction {
	label: string;
	message: string;
	icon: string;
}

export type AssistantClarificationOption = {
	id: string;
	label: string;
	value: string;
};

export const ASSISTANT_SUGGESTED_QUESTIONS: AssistantChatQuickAction[] = [
	{
		label: 'Agenda de hoy',
		message: '¿Qué citas tengo hoy en la agenda?',
		icon: 'today',
	},
	{
		label: 'Resumen del mes',
		message: '¿Cómo viene el negocio este mes?',
		icon: 'insights',
	},
	{
		label: 'Top profesionales',
		message: '¿Quién es el profesional con más reservas en los últimos 30 días?',
		icon: 'groups',
	},
	{
		label: 'Por confirmar',
		message: '¿Cuántas citas quedan por confirmar?',
		icon: 'hourglass_top',
	},
];

const asText = (value: unknown) => String(value ?? '').trim();

const asRecord = (value: unknown): Record<string, unknown> | null =>
	value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;

export const parseClarificationOptions = (value: unknown): AssistantClarificationOption[] => {
	const root = asRecord(value);
	const rawOptions = Array.isArray(root?.options) ? root.options : Array.isArray(value) ? value : [];
	const options: AssistantClarificationOption[] = [];
	const seen = new Set<string>();
	for (const raw of rawOptions) {
		const option = asRecord(raw);
		const id = asText(option?.id);
		const label = asText(option?.label).slice(0, 60);
		const message = asText(option?.value).slice(0, 200);
		if (!id || !label || !message || seen.has(id)) continue;
		seen.add(id);
		options.push({ id, label, value: message });
		if (options.length === 5) break;
	}
	return options.length >= 2 ? options : [];
};
