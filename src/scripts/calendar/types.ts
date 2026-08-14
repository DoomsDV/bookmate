export type Option = { id: number; name: string };

export type ProfessionalOption = Option & { services: number[] };

export type CustomerOption = {
	id_customer: number;
	full_name: string;
	phone_number: string;
};

export type SessionData = { role_id: number; user_id: number; professional_id: number };

export type AppointmentStatus = 'PENDIENTE' | 'CONFIRMADO' | 'COMPLETADO' | 'CANCELADO';

export type AttendanceStatus =
	| 'NOT_REQUESTED'
	| 'SENT'
	| 'CONFIRMED'
	| 'DECLINED'
	| 'EXPIRED';

export type ScheduleMisalignedReason =
	| 'DAY_BLOCKED'
	| 'TIME_OUTSIDE_SCHEDULE'
	| 'WRONG_LOCATION';

export type AppointmentAttachment = {
	id_attachment: number;
	file_name: string;
	mime_type: string;
	size_bytes: number;
	url: string;
	created_at?: string;
};

export type SessionNotes = {
	consultation_reason?: string | null;
	procedure_notes?: string | null;
	recommendations?: string | null;
};

export type AppointmentHistory = SessionNotes & {
	notes?: string | null;
	attachments: AppointmentAttachment[];
};

export type AppointmentDetail = {
	id_appointment: number;
	id_customer: number;
	loc_id_location: number;
	location_name?: string;
	pro_id_professional: number;
	professional_name?: string;
	ser_id_service: number;
	service_name?: string;
	customer_name: string;
	customer_phone: string;
	status: AppointmentStatus;
	attendance_status: AttendanceStatus;
	attendance_confirmed: boolean;
	attendance_reply_at?: string;
	start_time: string;
	end_time: string;
	schedule_misaligned?: boolean;
	schedule_misaligned_reason?: ScheduleMisalignedReason | null;
	schedule_exception_approved?: boolean;
	history_enabled?: boolean;
	history?: AppointmentHistory;
	payment_status?: string | null;
	deposit_amount?: number | null;
	refund_status?: string | null;
	refund_amount?: number | null;
};

export type AppointmentFormPayload = {
	id_customer?: number;
	loc_id_location: number;
	pro_id_professional: number;
	ser_id_service: number;
	customer_name: string;
	customer_phone: string;
	start_time: string;
	end_time: string;
	status: AppointmentStatus;
	session_notes?: SessionNotes | string;
	acknowledge_schedule_misalignment?: boolean;
	notify_customer?: boolean;
};

export type AppointmentCreatePayload = Omit<AppointmentFormPayload, 'status'>;

export type ApiFieldError = {
	field: string;
	message: string;
};

export type CalendarMetaResponse = {
	professionals: Array<{ id_professional: number; display_name: string; services?: number[] }>;
	locations: Array<{ id_location: number; name: string }>;
	services: Array<{ id_service: number; name: string }>;
	session: SessionData;
};
