import type { APIRoute } from 'astro';

import {
	PublicBookingApiError,
	uploadPublicReceiptWithOrds,
} from '../../../../../lib/public-booking';
import {
	parseRequestBody,
	publicBookingErrorResponse,
} from '../../../../../lib/public-api-handlers';

const parseToken = (value: string | undefined) => String(value || '').trim();

const parseReceiptPayload = (source: any) => {
	const fileBase64 = String(source?.file_base64 || '').trim();
	const filename = String(source?.filename || 'comprobante.jpg').trim() || 'comprobante.jpg';
	const mimeType = String(source?.mime_type || 'image/jpeg').trim() || 'image/jpeg';

	if (!fileBase64) {
		throw new PublicBookingApiError('Debes enviar el comprobante.', 400);
	}

	return {
		file_base64: fileBase64,
		filename,
		mime_type: mimeType,
	};
};

export const POST: APIRoute = async ({ request, params }) => {
	try {
		const token = parseToken(params.token);
		const body = await parseRequestBody(request);
		const payload = parseReceiptPayload(body);
		const result = await uploadPublicReceiptWithOrds(token, payload);

		return Response.json(
			{
				status: 'success',
				message: result.message,
				data: result,
			},
			{ status: 200 }
		);
	} catch (error) {
		return publicBookingErrorResponse(error, 'No fue posible subir el comprobante.');
	}
};
