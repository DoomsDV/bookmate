import type { APIRoute } from 'astro';

import {
	PublicBookingApiError,
	validatePublicCustomerWithOrds,
	type PublicValidateCustomerPayload,
} from '../../../lib/public-booking';

const toSafeApiStatus = (value: number) => {
	if (value === 555) return 502;
	return Number.isInteger(value) && value >= 400 && value <= 599 ? value : 500;
};

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const bookingError =
		error instanceof PublicBookingApiError
			? error
			: new PublicBookingApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: bookingError.message,
			details: bookingError.details,
		},
		{ status: toSafeApiStatus(bookingError.status) }
	);
};

const toPositiveInt = (value: unknown) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

const parseRequestBody = async (request: Request) => {
	const contentType = request.headers.get('content-type') || '';
	if (contentType.includes('application/json')) {
		return request.json();
	}

	const formData = await request.formData();
	return {
		org_id_organization: formData.get('org_id_organization'),
		customer_phone: formData.get('customer_phone'),
	};
};

const parsePayload = (source: any): PublicValidateCustomerPayload => {
	const payload: PublicValidateCustomerPayload = {
		org_id_organization: toPositiveInt(source?.org_id_organization),
		customer_phone: String(source?.customer_phone || '').trim(),
	};

	if (!payload.org_id_organization || !payload.customer_phone) {
		throw new PublicBookingApiError(
			'org_id_organization y customer_phone son obligatorios.',
			400
		);
	}

	return payload;
};

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await parseRequestBody(request);
		const payload = parsePayload(body);
		const result = await validatePublicCustomerWithOrds(payload);

		return Response.json(
			{
				status: 'success',
				exists: result.exists,
				message: result.message,
				data: result.customer
					? {
							id_customer: result.customer.id_customer,
							full_name: result.customer.full_name,
						}
					: null,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible validar el cliente.');
	}
};
