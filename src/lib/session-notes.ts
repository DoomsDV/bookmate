export type SessionNoteFieldKey = 'consultation_reason' | 'procedure_notes' | 'recommendations';

export interface SessionNotes {
	consultation_reason?: string | null;
	procedure_notes?: string | null;
	recommendations?: string | null;
}

export interface SessionNotesHistory extends SessionNotes {
	notes?: string | null;
}

export const SESSION_NOTE_FIELDS: ReadonlyArray<{
	key: SessionNoteFieldKey;
	label: string;
	placeholder: string;
	maxLength: number;
}> = [
	{
		key: 'consultation_reason',
		label: 'Motivo de la reserva',
		placeholder: '¿Por qué vino el cliente o qué solicitó?',
		maxLength: 3500,
	},
	{
		key: 'procedure_notes',
		label: 'Procedimiento / Trabajo realizado',
		placeholder: 'Detalle de lo realizado durante la sesión.',
		maxLength: 4000,
	},
	{
		key: 'recommendations',
		label: 'Recomendaciones / Próximos pasos',
		placeholder: 'Indicaciones para el cliente o pendientes para la próxima reserva.',
		maxLength: 3500,
	},
];

const trimOrNull = (value: unknown) => {
	const text = String(value ?? '').trim();
	return text.length > 0 ? text : null;
};

export const normalizeSessionNotes = (value: unknown): SessionNotes => {
	if (!value || typeof value !== 'object') {
		return {
			consultation_reason: null,
			procedure_notes: null,
			recommendations: null,
		};
	}

	const source = value as Record<string, unknown>;
	return {
		consultation_reason: trimOrNull(source.consultation_reason),
		procedure_notes: trimOrNull(source.procedure_notes),
		recommendations: trimOrNull(source.recommendations),
	};
};

export const normalizeSessionNotesHistory = (value: unknown): SessionNotesHistory => {
	if (!value || typeof value !== 'object') {
		return {
			consultation_reason: null,
			procedure_notes: null,
			recommendations: null,
			notes: null,
		};
	}

	const source = value as Record<string, unknown>;
	const notes = trimOrNull(source.notes);
	const structured = normalizeSessionNotes(value);

	if (!structured.procedure_notes && notes) {
		structured.procedure_notes = notes;
	}

	return {
		...structured,
		notes,
	};
};

export const hasAnySessionNote = (notes: SessionNotes | SessionNotesHistory | null | undefined) =>
	Boolean(
		trimOrNull(notes?.consultation_reason) ||
			trimOrNull(notes?.procedure_notes) ||
			trimOrNull(notes?.recommendations) ||
			trimOrNull((notes as SessionNotesHistory | undefined)?.notes)
	);

export const buildSessionNotesPayload = (notes: SessionNotes): SessionNotes | undefined => {
	const payload = {
		consultation_reason: trimOrNull(notes.consultation_reason),
		procedure_notes: trimOrNull(notes.procedure_notes),
		recommendations: trimOrNull(notes.recommendations),
	};

	return hasAnySessionNote(payload) ? payload : undefined;
};
