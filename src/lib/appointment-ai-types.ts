export type AppointmentAiConfidence = 'high' | 'medium' | 'low';

export interface AppointmentAiCandidate {
	entity_id: number;
	label: string;
	score: number;
	distance?: number;
	source_text?: string;
	entity_type?: string;
}

export interface AppointmentAiDraftCandidates {
	customer?: AppointmentAiCandidate[];
	professional?: AppointmentAiCandidate[];
	location?: AppointmentAiCandidate[];
	service?: AppointmentAiCandidate[];
}

export interface AppointmentAiDraft {
	customer_name?: string | null;
	customer_phone?: string | null;
	id_customer?: number | null;
	pro_id_professional?: number | null;
	loc_id_location?: number | null;
	ser_id_service?: number | null;
	start_time?: string | null;
	end_time?: string | null;
	confidence?: AppointmentAiConfidence;
	missing_fields?: string[];
	interpretation?: string | null;
	candidates?: AppointmentAiDraftCandidates;
}

export interface AppointmentVoiceDraftResult {
	transcript: string;
	draft: AppointmentAiDraft;
}

export const APPOINTMENT_AI_DRAFT_STORAGE_KEY = 'hasel:appointment-ai-draft';

export interface StoredAppointmentAiDraft {
	draft: AppointmentAiDraft;
	transcript: string;
	ts: number;
	/** Cuando true, el borrador se aplica al modal de cita ya abierto (sin pantalla de resumen). */
	inlineFill?: boolean;
}
