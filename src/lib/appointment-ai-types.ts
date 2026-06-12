export type AppointmentAiConfidence = 'high' | 'medium' | 'low';

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
}
