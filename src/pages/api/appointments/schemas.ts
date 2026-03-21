import { z } from 'zod';

import {
	AppointmentsApiError,
	type AppointmentCreatePayload,
	type AppointmentUpdatePayload,
} from '../../../lib/appointments';

const appointmentStatusSchema = z.enum(['PENDIENTE', 'CONFIRMADO', 'COMPLETADO', 'CANCELADO']);

const isoDateTimeSchema = z.string().trim().datetime({ offset: true });

const baseAppointmentSchema = z.object({
	loc_id_location: z.coerce.number().int().positive('Sucursal requerida.'),
	pro_id_professional: z.coerce.number().int().positive('Profesional requerido.'),
	ser_id_service: z.coerce.number().int().positive('Servicio requerido.'),
	customer_name: z.string().trim().min(1, 'El nombre del cliente es obligatorio.').max(100),
	customer_phone: z.string().trim().max(20).optional(),
	start_time: isoDateTimeSchema,
	end_time: isoDateTimeSchema,
});

const appointmentCreateSchema = baseAppointmentSchema.superRefine((payload, ctx) => {
	const start = new Date(payload.start_time);
	const end = new Date(payload.end_time);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['end_time'],
			message: 'La fecha/hora de inicio debe ser menor que la de fin.',
		});
	}
});

const appointmentUpdateSchema = baseAppointmentSchema
	.extend({
		status: appointmentStatusSchema,
	})
	.superRefine((payload, ctx) => {
		const start = new Date(payload.start_time);
		const end = new Date(payload.end_time);
		if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['end_time'],
				message: 'La fecha/hora de inicio debe ser menor que la de fin.',
			});
		}
	});

const toFieldErrors = (error: z.ZodError) =>
	error.issues.map((issue) => ({
		field:
			issue.path.length > 0
				? issue.path
						.map((part) => String(part))
						.join('.')
						.trim()
				: 'payload',
		message: issue.message,
	}));

const toValidationError = (error: z.ZodError) =>
	new AppointmentsApiError('Payload de cita invalido.', 400, error.flatten(), toFieldErrors(error));

export const parseCreateAppointmentPayload = (source: unknown): AppointmentCreatePayload => {
	const parsed = appointmentCreateSchema.safeParse(source);
	if (!parsed.success) {
		throw toValidationError(parsed.error);
	}
	return {
		...parsed.data,
		customer_phone: parsed.data.customer_phone || '',
	};
};

export const parseUpdateAppointmentPayload = (source: unknown): AppointmentUpdatePayload => {
	const parsed = appointmentUpdateSchema.safeParse(source);
	if (!parsed.success) {
		throw toValidationError(parsed.error);
	}
	return {
		...parsed.data,
		customer_phone: parsed.data.customer_phone || '',
	};
};
