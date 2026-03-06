import type { APIRoute } from 'astro';

import {
	SchedulesApiError,
	getProfessionalScheduleWithOrds,
	type ScheduleUpdatePayload,
	updateProfessionalScheduleWithOrds,
} from '../../../lib/schedules';

const parseProfessionalId = (value: string | undefined) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new SchedulesApiError('No hay sesion valida para procesar horarios.', 401);
	}
	return token;
};

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const schedulesError =
		error instanceof SchedulesApiError ? error : new SchedulesApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: schedulesError.message,
			details: schedulesError.details,
			errors: schedulesError.fieldErrors,
		},
		{ status: schedulesError.status }
	);
};

const normalizeTime = (value: unknown) => String(value || '').trim();

const parseBody = async (request: Request) => {
	const contentType = request.headers.get('content-type') || '';
	if (contentType.includes('application/json')) {
		return request.json();
	}

	const formData = await request.formData();
	const schedulesRaw = formData.get('schedules');
	if (typeof schedulesRaw !== 'string') return { schedules: [] };

	try {
		return JSON.parse(schedulesRaw);
	} catch {
		throw new SchedulesApiError('JSON invalido para horarios.', 400);
	}
};

const parseUpdatePayload = (body: any): ScheduleUpdatePayload => {
	if (!body || typeof body !== 'object' || !Array.isArray(body.schedules)) {
		throw new SchedulesApiError('Debe enviar un arreglo "schedules".', 400);
	}

	const schedules = body.schedules.map((item: any, index: number) => {
		if (!item || typeof item !== 'object') {
			throw new SchedulesApiError(`El item #${index + 1} de schedules no es valido.`, 400);
		}

		const locId = Number(item.loc_id_location);
		const dayOfWeek = Number(item.day_of_week);
		const startTime = normalizeTime(item.start_time);
		const endTime = normalizeTime(item.end_time);

		if (!Number.isInteger(locId) || locId <= 0) {
			throw new SchedulesApiError(`La sucursal del item #${index + 1} es invalida.`, 400);
		}
		if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
			throw new SchedulesApiError(`El dia de semana del item #${index + 1} es invalido.`, 400);
		}
		if (!startTime || !endTime) {
			throw new SchedulesApiError(
				`Las horas de inicio y fin del item #${index + 1} son obligatorias.`,
				400
			);
		}

		return {
			loc_id_location: locId,
			day_of_week: dayOfWeek,
			start_time: startTime,
			end_time: endTime,
		};
	});

	return { schedules };
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
		const professionalId = parseProfessionalId(params.id);

		if (!professionalId) {
			throw new SchedulesApiError('ID de profesional invalido.', 400);
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
