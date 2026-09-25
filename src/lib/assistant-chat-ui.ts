export interface AssistantChatQuickAction {
	label: string;
	message: string;
	icon: string;
	/** Acción local: se resuelve sin pasar por el agente (p. ej. el resumen del día que ya arma ORDS). */
	action?: 'daily-summary';
}

export type AssistantClarificationOption = {
	id: string;
	label: string;
	value: string;
};

export const ASSISTANT_SUGGESTED_QUESTIONS: AssistantChatQuickAction[] = [
	{
		label: 'Resumen del día',
		message: 'Resumen del día',
		icon: 'auto_awesome',
		action: 'daily-summary',
	},
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

const DAILY_SUMMARY_SECTIONS = [
	{ type: 'panorama', title: 'Panorama' },
	{ type: 'contexto', title: 'Contexto' },
	{ type: 'sugerencia', title: 'Sugerencia' },
] as const;

/** El historial que se manda al agente acepta hasta 4000 caracteres por mensaje. */
const DAILY_SUMMARY_MAX_LENGTH = 3800;

/**
 * Arma el mensaje de Numa con la respuesta de /api/dashboard/ai-summary
 * (ai_summary_sections: panorama y sugerencia con `text`, contexto con `items`).
 */
export const formatDailySummaryMessage = (value: unknown): string => {
	const data = asRecord(value);
	if (!data) return '';
	const sections = Array.isArray(data.ai_summary_sections)
		? data.ai_summary_sections.map(asRecord).filter((section): section is Record<string, unknown> => section !== null)
		: [];
	const blocks: string[] = [];
	for (const { type, title } of DAILY_SUMMARY_SECTIONS) {
		const section = sections.find((item) => asText(item.type).toLowerCase() === type);
		if (!section) continue;
		const items = Array.isArray(section.items) ? section.items.map(asText).filter(Boolean) : [];
		const text = asText(section.text);
		if (items.length) blocks.push(`**${title}**\n${items.map((item) => `- ${item}`).join('\n')}`);
		else if (text) blocks.push(`**${title}**\n${text}`);
	}
	const message = blocks.length
		? blocks.join('\n\n')
		: asText(data.ai_summary) || asText(data.ai_summary_short);
	return message.length > DAILY_SUMMARY_MAX_LENGTH
		? `${message.slice(0, DAILY_SUMMARY_MAX_LENGTH - 1).trimEnd()}…`
		: message;
};
