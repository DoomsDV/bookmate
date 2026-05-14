import type { APIRoute } from 'astro';

import {
	PublicBookingApiError,
	validatePublicCustomerWithOrds,
	type PublicValidateCustomerPayload,
} from '../../../lib/public-booking';
import {
	parseRequestBody,
	publicBookingErrorResponse,
	toPositiveInt,
} from '../../../lib/public-api-handlers';

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
		return publicBookingErrorResponse(error, 'No fue posible validar el cliente.');
	}
};
