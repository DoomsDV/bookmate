import type { APIRoute } from 'astro';
import { z } from 'zod';

import { ROLES } from '../../../../../config/roles';
import {
	SchedulesApiError,
	ScheduleExceptionConflictError,
	deleteScheduleExceptionWithOrds,
	getScheduleExceptionWithOrds,
	type ScheduleExceptionUpsertPayload,
	upsertScheduleExceptionWithOrds,
} from '../../../../../lib/schedules';
import {
	parseRequestBody,
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
} from '../../../../../utils/api-helpers';

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const createSchedulesError = (message: string, status = 400) => new SchedulesApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createSchedulesError, 'No hay sesion valida para procesar excepciones.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is SchedulesApiError => value instanceof SchedulesApiError,
		createError: createSchedulesError,
	});

const parseProfessionalId = (value: string | undefined) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

const formatDateKey = (date: Date) => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
};

const isPastDateKey = (dateKey: string) => dateKey < formatDateKey(new Date());

const assertCanManageSchedules = (roleId: number) => {
	if (roleId !== ROLES.ADMIN && roleId !== ROLES.RECEPCIONISTA) {
		throw new SchedulesApiError('No tienes permisos para gestionar excepciones.', 403);
	}
};

const assertWritableDate = (dateKey: string) => {
	if (!DATE_KEY_REGEX.test(dateKey)) {
		throw new SchedulesApiError('Fecha invalida. Use YYYY-MM-DD.', 400);
	}
	if (isPastDateKey(dateKey)) {
		throw new SchedulesApiError('No se pueden modificar excepciones en fechas pasadas.', 400);
	}
};

const toMinutes = (timeValue: string) => {
	const [hours, minutes] = timeValue.split(':').map((part) => Number(part));
	return hours * 60 + minutes;
};

const exceptionSlotSchema = z.object({
	loc_id_location: z.coerce.number().int().positive(),
	start_time: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora de inicio invalida.'),
	end_time: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora de fin invalida.'),
});

const exceptionUpsertSchema = z
	.object({
		exception_type: z.enum(['BLOCKED', 'OVERRIDE']),
		note: z.string().trim().max(500).optional().nullable(),
		slots: z.array(exceptionSlotSchema).default([]),
		acknowledge_existing_appointments: z.boolean().optional(),
	})
	.superRefine((payload, ctx) => {
		if (payload.exception_type === 'BLOCKED') return;

		const intervals: Array<{ index: number; start: number; end: number }> = [];
		payload.slots.forEach((slot, index) => {
			const start = toMinutes(slot.start_time);
			const end = toMinutes(slot.end_time);
			if (start >= end) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['slots', index, 'end_time'],
					message: 'La hora de fin debe ser mayor que la hora de inicio.',
				});
				return;
			}
			intervals.push({ index, start, end });
		});

		const ordered = intervals.slice().sort((a, b) => a.start - b.start);
		for (let index = 1; index < ordered.length; index += 1) {
			if (ordered[index].start >= ordered[index - 1].end) continue;
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['slots', ordered[index].index, 'start_time'],
				message: 'Hay turnos solapados en la excepcion.',
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
				: 'exception',
		message: issue.message,
	}));

const parseBody = async (request: Request) => {
	return parseRequestBody(request, (formData) => {
		const raw = formData.get('payload');
		if (typeof raw !== 'string') return {};
		try {
			return JSON.parse(raw);
		} catch {
			throw new SchedulesApiError('JSON invalido para la excepcion.', 400);
		}
	});
};

export const GET: APIRoute = async ({ params, locals }) => {
	try {
		const token = requireToken(locals.token);
		const professionalId = parseProfessionalId(params.id);
		const exceptionDate = String(params.date || '').trim();

		if (!professionalId) {
			throw new SchedulesApiError('ID de profesional invalido.', 400);
		}
		if (!DATE_KEY_REGEX.test(exceptionDate)) {
			throw new SchedulesApiError('Fecha invalida. Use YYYY-MM-DD.', 400);
		}

		const detail = await getScheduleExceptionWithOrds(token, professionalId, exceptionDate);
		return Response.json(
			{
				status: 'success',
				data: detail,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener el detalle de la excepcion.');
	}
};

export const PUT: APIRoute = async ({ request, params, locals }) => {
	try {
		const token = requireToken(locals.token);
		const roleId = Number(locals.roleId ?? 0);
		assertCanManageSchedules(roleId);

		const professionalId = parseProfessionalId(params.id);
		const exceptionDate = String(params.date || '').trim();

		if (!professionalId) {
			throw new SchedulesApiError('ID de profesional invalido.', 400);
		}
		assertWritableDate(exceptionDate);

		const body = await parseBody(request);
		const parsed = exceptionUpsertSchema.safeParse(body);
		if (!parsed.success) {
			throw new SchedulesApiError(
				'Payload de excepcion invalido.',
				400,
				parsed.error.flatten(),
				toFieldErrors(parsed.error)
			);
		}

		const payload: ScheduleExceptionUpsertPayload = {
			exception_type: parsed.data.exception_type,
			note: parsed.data.note ?? null,
			slots: parsed.data.slots,
			acknowledge_existing_appointments: parsed.data.acknowledge_existing_appointments,
		};

		const updated = await upsertScheduleExceptionWithOrds(
			token,
			professionalId,
			exceptionDate,
			payload
		);

		return Response.json(
			{
				status: 'success',
				message: updated.message,
			},
			{ status: 200 }
		);
	} catch (error) {
		if (error instanceof ScheduleExceptionConflictError) {
			return Response.json(
				{
					status: 'error',
					code: error.code,
					message: error.message,
					appointment_count: error.appointmentCount,
				},
				{ status: 409 }
			);
		}
		return toErrorResponse(error, 'No fue posible guardar la excepcion.');
	}
};

export const DELETE: APIRoute = async ({ params, locals }) => {
	try {
		const token = requireToken(locals.token);
		const roleId = Number(locals.roleId ?? 0);
		assertCanManageSchedules(roleId);

		const professionalId = parseProfessionalId(params.id);
		const exceptionDate = String(params.date || '').trim();

		if (!professionalId) {
			throw new SchedulesApiError('ID de profesional invalido.', 400);
		}
		assertWritableDate(exceptionDate);

		const deleted = await deleteScheduleExceptionWithOrds(token, professionalId, exceptionDate);
		return Response.json(
			{
				status: 'success',
				message: deleted.message,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible eliminar la excepcion.');
	}
};
