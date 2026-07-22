import type { APIRoute } from 'astro';

import {
	ServicesApiError,
	createServiceWithOrds,
	listServices,
	type CreateServicePayload,
} from '../../lib/services';
import {
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
	toPositiveInt,
} from '../../utils/api-helpers';

const createServicesError = (message: string, status = 400) =>
	new ServicesApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createServicesError, 'No hay sesion valida para consultar servicios.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is ServicesApiError => value instanceof ServicesApiError,
		createError: createServicesError,
	});

export const GET: APIRoute = async ({ locals, url }) => {
	try {
		const token = requireToken(locals.token);
		const page = toPositiveInt(url.searchParams.get('page'), 1);
		const limit = toPositiveInt(url.searchParams.get('limit'), 9);
		const searchQuery = String(
			url.searchParams.get('search') || url.searchParams.get('q') || ''
		).trim();
		const rawIsActive = String(url.searchParams.get('is_active') || '').trim();
		const isActive =
			rawIsActive === '0' || rawIsActive === '1' ? Number(rawIsActive) : null;

		const result = await listServices(token, {
			page,
			limit,
			search: searchQuery || undefined,
			isActive,
		});

		return Response.json(
			{
				status: 'success',
				data: result.data,
				meta: result.meta,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener el listado de servicios.');
	}
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
		requires_deposit: formData.get('requires_deposit'),
		deposit_type: formData.get('deposit_type'),
		deposit_value: formData.get('deposit_value'),
	};
};

export const POST: APIRoute = async ({ request, locals }) => {
	try {
		const token = locals.token;

		if (!token) {
			throw new ServicesApiError('No hay sesion valida para crear servicios.', 401);
		}

		const body = await parseBody(request);
		const name = String(body?.name || '').trim();
		const duration = Number(body?.duration_minutes);
		const priceRaw = String(body?.price ?? '').trim();
		const isActiveRaw = String(body?.is_active ?? '').trim();
		const isActiveNumber = Number(isActiveRaw);

		const payload: CreateServicePayload = {
			name,
			duration_minutes: Number.isFinite(duration) ? duration : 0,
			is_active:
				isActiveRaw === ''
					? 1
					: (Number.isFinite(isActiveNumber) ? isActiveNumber : 1) as 0 | 1,
		};

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

		if (Object.prototype.hasOwnProperty.call(body ?? {}, 'hide_public_price')) {
			const hide = Number(String(body?.hide_public_price ?? '').trim());
			if (hide === 1) payload.hide_public_price = 1;
			else if (hide === 0) payload.hide_public_price = 0;
		}

		if (Object.prototype.hasOwnProperty.call(body ?? {}, 'hidden_public_price_label')) {
			const label = String(body?.hidden_public_price_label ?? '').trim();
			payload.hidden_public_price_label = label || null;
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

		const imageBase64 = String(body?.image_base64 ?? '').trim();
		if (imageBase64) {
			payload.image_base64 = imageBase64;
			payload.image_name = String(body?.image_name ?? 'portada.jpg').trim() || 'portada.jpg';
			payload.image_mime = String(body?.image_mime ?? 'image/jpeg').trim() || 'image/jpeg';
		}

		const clearRaw = body?.clear_image;
		if (clearRaw === true || clearRaw === 1 || clearRaw === '1' || clearRaw === 'true') {
			payload.clear_image = 1;
		}

		const created = await createServiceWithOrds(token, payload);

		return Response.json(
			{
				status: 'success',
				message: created.message,
				id_service: created.id_service,
			},
			{ status: 201 }
		);
	} catch (error) {
		const serviceError =
			error instanceof ServicesApiError
				? error
				: new ServicesApiError('No fue posible crear el servicio.', 500);

		return Response.json(
			{
				status: 'error',
				message: serviceError.message,
				details: serviceError.details,
				errors: serviceError.fieldErrors,
			},
			{ status: serviceError.status }
		);
	}
};
