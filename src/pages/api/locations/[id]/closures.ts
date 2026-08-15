import type { APIRoute } from 'astro';

import {
	LocationClosuresApiError,
	createLocationClosure,
	listLocationClosures,
	type CreateLocationClosurePayload,
} from '../../../../lib/location-closures';

const parseLocationId = (value: string | undefined) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

const requireToken = (token: string | undefined) => {
	if (!token) throw new LocationClosuresApiError('No hay sesión válida.', 401);
	return token;
};

const toErrorResponse = (error: unknown, fallback: string) => {
	const err =
		error instanceof LocationClosuresApiError
			? error
			: new LocationClosuresApiError(fallback, 500);
	return Response.json(
		{
			status: 'error',
			message: err.message,
			errors: err.fieldErrors,
		},
		{ status: err.status }
	);
};

const parsePayload = (body: any): CreateLocationClosurePayload => {
	const name = String(body?.name || '').trim();
	const startDate = String(body?.start_date || '').trim();
	const endDate = String(body?.end_date || '').trim();
	const isFullDayRaw = Number(body?.is_full_day);
	const isFullDay: 0 | 1 = isFullDayRaw === 0 ? 0 : 1;
	const applyAllRaw = Number(body?.apply_all_locations);
	const applyAll: 0 | 1 = applyAllRaw === 1 ? 1 : 0;
	const locationIds = Array.isArray(body?.location_ids)
		? body.location_ids.map((v: unknown) => Number(v)).filter((n: number) => Number.isInteger(n) && n > 0)
		: [];

	const payload: CreateLocationClosurePayload = {
		name,
		start_date: startDate,
		end_date: endDate,
		is_full_day: isFullDay,
		apply_all_locations: applyAll,
	};
	if (locationIds.length > 0) payload.location_ids = locationIds;

	const holidayId = Number(body?.id_holiday);
	if (Number.isInteger(holidayId) && holidayId > 0) payload.id_holiday = holidayId;

	if (isFullDay === 0) {
		const start = String(body?.start_time || '').trim();
		const end = String(body?.end_time || '').trim();
		payload.start_time = start || null;
		payload.end_time = end || null;
	}

	return payload;
};

export const GET: APIRoute = async ({ params, url, locals }) => {
	try {
		const token = requireToken(locals.token);
		const locationId = parseLocationId(params.id);
		if (!locationId) throw new LocationClosuresApiError('ID de sucursal inválido.', 400);

		const fromDate = url.searchParams.get('from_date') || undefined;
		const toDate = url.searchParams.get('to_date') || undefined;

		const data = await listLocationClosures(token, locationId, { fromDate, toDate });
		return Response.json({ status: 'success', data }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible listar los cierres.');
	}
};

export const POST: APIRoute = async ({ request, params, locals }) => {
	try {
		const token = requireToken(locals.token);
		const locationId = parseLocationId(params.id);
		if (!locationId) throw new LocationClosuresApiError('ID de sucursal inválido.', 400);

		const body = await request.json();
		const payload = parsePayload(body);

		const result = await createLocationClosure(token, locationId, payload);
		return Response.json({ status: 'success', ...result }, { status: 201 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible crear el cierre.');
	}
};
