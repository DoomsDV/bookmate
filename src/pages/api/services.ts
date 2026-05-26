import type { APIRoute } from 'astro';

import { ServicesApiError, createServiceWithOrds, type CreateServicePayload } from '../../lib/services';

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

		const depositType = String(body?.deposit_type ?? '').trim().toUpperCase();
		if (depositType === 'PERCENT' || depositType === 'FIXED') {
			payload.deposit_type = depositType as 'PERCENT' | 'FIXED';
		}

		const depositValueRaw = String(body?.deposit_value ?? '').trim();
		if (depositValueRaw !== '') {
			const depositValue = Number(depositValueRaw);
			if (Number.isFinite(depositValue)) payload.deposit_value = depositValue;
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
