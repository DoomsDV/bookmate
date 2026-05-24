import type { APIRoute } from 'astro';
import { z } from 'zod';

import { ROLES } from '../../../config/roles';
import {
	SchedulesApiError,
	getProfessionalScheduleWithOrds,
	type ScheduleUpdatePayload,
	updateProfessionalScheduleWithOrds,
} from '../../../lib/schedules';
import { parseTokenClaims } from '../../../lib/token-claims';
import {
	parseRequestBody,
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
} from '../../../utils/api-helpers';

const parseProfessionalId = (value: string | undefined) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

const createSchedulesError = (message: string, status = 400) => new SchedulesApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createSchedulesError, 'No hay sesion valida para procesar horarios.');

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	return toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is SchedulesApiError => value instanceof SchedulesApiError,
		createError: createSchedulesError,
	});
};

const toMinutes = (timeValue: string) => {
	const [hours, minutes] = timeValue.split(':').map((part) => Number(part));
	return hours * 60 + minutes;
};

const scheduleItemSchema = z.object({
	loc_id_location: z.coerce.number().int().positive(),
	day_of_week: z.coerce.number().int().min(1).max(7),
	start_time: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora de inicio invalida.'),
	end_time: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora de fin invalida.'),
});

const scheduleUpdateSchema = z
	.object({
		schedules: z.array(scheduleItemSchema),
	})
	.superRefine((payload, ctx) => {
		const intervalsByDay = new Map<number, Array<{ index: number; start: number; end: number }>>();

		payload.schedules.forEach((slot, index) => {
			const start = toMinutes(slot.start_time);
			const end = toMinutes(slot.end_time);
			if (start >= end) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['schedules', index, 'end_time'],
					message: 'La hora de fin debe ser mayor que la hora de inicio.',
				});
				return;
			}

			const intervals = intervalsByDay.get(slot.day_of_week) ?? [];
			intervals.push({ index, start, end });
			intervalsByDay.set(slot.day_of_week, intervals);
		});

		for (const intervals of intervalsByDay.values()) {
			const ordered = intervals.slice().sort((a, b) => a.start - b.start);
			for (let index = 1; index < ordered.length; index += 1) {
				if (ordered[index].start >= ordered[index - 1].end) continue;
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['schedules', ordered[index].index, 'start_time'],
					message: 'El turno se solapa con otro horario del mismo dia.',
				});
			}
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
				: 'schedules',
		message: issue.message,
	}));

const parseBody = async (request: Request) => {
	return parseRequestBody(request, (formData) => {
		const schedulesRaw = formData.get('schedules');
		if (typeof schedulesRaw !== 'string') return { schedules: [] };
		try {
			return JSON.parse(schedulesRaw);
		} catch {
			throw new SchedulesApiError('JSON invalido para horarios.', 400);
		}
	});
};

const parseUpdatePayload = (body: unknown): ScheduleUpdatePayload => {
	const parsed = scheduleUpdateSchema.safeParse(body);
	if (!parsed.success) {
		throw new SchedulesApiError(
			'Payload de horarios invalido.',
			400,
			parsed.error.flatten(),
			toFieldErrors(parsed.error)
		);
	}
	return parsed.data;
};

export const GET: APIRoute = async ({ params, locals }) => {
	try {
		const token = requireToken(locals.token);
		const professionalId = parseProfessionalId(params.id);

		if (!professionalId) {
			throw new SchedulesApiError('ID de profesional invalido.', 400);
		}

		const schedule = await getProfessionalScheduleWithOrds(token, professionalId);
		return Response.json(
			{
				status: 'success',
				data: schedule,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener los horarios del profesional.');
	}
};

export const PUT: APIRoute = async ({ request, params, locals }) => {
	try {
		const token = requireToken(locals.token);
		const claims = parseTokenClaims(token);
		const professionalId = parseProfessionalId(params.id);

		if (!professionalId) {
			throw new SchedulesApiError('ID de profesional invalido.', 400);
		}
		if (claims.role_id !== ROLES.ADMIN && claims.role_id !== ROLES.RECEPCIONISTA) {
			throw new SchedulesApiError('No tienes permisos para modificar horarios.', 403);
		}

		const body = await parseBody(request);
		const payload = parseUpdatePayload(body);
		const updated = await updateProfessionalScheduleWithOrds(token, professionalId, payload);

		return Response.json(
			{
				status: 'success',
				message: updated.message,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible guardar los horarios del profesional.');
	}
};
