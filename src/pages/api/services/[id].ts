import type { APIRoute } from 'astro';

import {
	ServicesApiError,
	deleteServiceWithOrds,
	getServiceByIdWithOrds,
	updateServiceWithOrds,
	type CreateServicePayload,
} from '../../../lib/services';

const parseServiceId = (value: string | undefined) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

const parseBody = async (request: Request) => {
	const contentType = request.headers.get('content-type') || '';

	if (contentType.includes('application/json')) {
		return request.json();
	}

	const formData = await request.formData();
	return {
		name: formData.get('name'),
		duration_minutes: formData.get('duration_minutes'),
		price: formData.get('price'),
		is_active: formData.get('is_active'),
	};
};

const parseUpdatePayload = (body: any): CreateServicePayload => {
	const name = String(body?.name || '').trim();
	const duration = Number(body?.duration_minutes);
	const priceRaw = String(body?.price ?? '').trim();
	const isActiveRaw = String(body?.is_active ?? '').trim();
	const isActiveNumber = Number(isActiveRaw);

	const payload: CreateServicePayload = {
		name,
		duration_minutes: Number.isFinite(duration) ? duration : 0,
	};

	if (isActiveRaw !== '' && Number.isFinite(isActiveNumber)) {
		payload.is_active = isActiveNumber as 0 | 1;
	}

	if (priceRaw) {
		const price = Number(priceRaw);
		if (Number.isFinite(price)) {
			payload.price = price;
		}
	}

	if (Object.prototype.hasOwnProperty.call(body ?? {}, 'requires_deposit')) {
		const requires = Number(String(body?.requires_deposit ?? '').trim());
		if (requires === 1) payload.requires_deposit = 1;
		else if (requires === 0) payload.requires_deposit = 0;
	}

	const depositType = String(body?.deposit_type ?? '').trim().toUpperCase();
	if (depositType === 'PERCENT' || depositType === 'FIXED') {
		payload.deposit_type = depositType as 'PERCENT' | 'FIXED';
	}

	const depositValueRaw = String(body?.deposit_value ?? '').trim();
	if (depositValueRaw !== '') {
		const depositValue = Number(depositValueRaw);
		if (Number.isFinite(depositValue)) payload.deposit_value = depositValue;
	}

	return payload;
};

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const serviceError =
		error instanceof ServicesApiError ? error : new ServicesApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: serviceError.message,
			details: serviceError.details,
			errors: serviceError.fieldErrors,
		},
		{ status: serviceError.status }
	);
};

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new ServicesApiError('No hay sesion valida para procesar servicios.', 401);
	}
	return token;
};

export const GET: APIRoute = async ({ params, locals }) => {
	try {
		const token = requireToken(locals.token);
		const serviceId = parseServiceId(params.id);

		if (!serviceId) {
			throw new ServicesApiError('ID de servicio invalido.', 400);
		}

		const service = await getServiceByIdWithOrds(token, serviceId);

		return Response.json(
			{
				status: 'success',
				data: service,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener el servicio.');
	}
};

export const PUT: APIRoute = async ({ request, params, locals }) => {
	try {
		const token = requireToken(locals.token);
		const serviceId = parseServiceId(params.id);

		if (!serviceId) {
			throw new ServicesApiError('ID de servicio invalido.', 400);
		}

		const body = await parseBody(request);
		const payload = parseUpdatePayload(body);
		const updated = await updateServiceWithOrds(token, serviceId, payload);

		return Response.json(
			{
				status: 'success',
				message: updated.message,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible actualizar el servicio.');
	}
};

export const DELETE: APIRoute = async ({ params, locals }) => {
	try {
		const token = requireToken(locals.token);
		const serviceId = parseServiceId(params.id);

		if (!serviceId) {
			throw new ServicesApiError('ID de servicio invalido.', 400);
		}

		const deleted = await deleteServiceWithOrds(token, serviceId);

		return Response.json(
			{
				status: 'success',
				message: deleted.message,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible eliminar el servicio.');
	}
};
