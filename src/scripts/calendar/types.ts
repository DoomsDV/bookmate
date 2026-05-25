export type Option = { id: number; name: string };

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
};

export type AppointmentCreatePayload = Omit<AppointmentFormPayload, 'status'>;

export type ApiFieldError = {
	field: string;
	message: string;
};

export type CalendarMetaResponse = {
	professionals: Array<{ id_professional: number; display_name: string }>;
	locations: Array<{ id_location: number; name: string }>;
	services: Array<{ id_service: number; name: string }>;
	session: SessionData;
};
