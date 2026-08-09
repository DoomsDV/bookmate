import type { APIRoute } from 'astro';

import {
	PublicBookingApiError,
	uploadPublicReceiptWithOrds,
} from '../../../../../lib/public-booking';
import {
	parseRequestBody,
	publicBookingErrorResponse,
} from '../../../../../lib/public-api-handlers';
import { readIdempotencyKeyHeader } from '../../../../../lib/idempotency';

const parseToken = (value: string | undefined) => String(value || '').trim();

// Hardening (auditoría ORDS R1/R4): debe coincidir con RECEIPT_MAX_BYTES en PL/SQL
// (PKG_AOX_PUBLIC_BOOKING_API.pr_upload_public_receipt). El límite real y autoritativo
// vive en PL/SQL; esto solo evita reenviar/parsear payloads enormes en el BFF.
const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
const MAX_RECEIPT_CONTENT_LENGTH = Math.ceil((MAX_RECEIPT_BYTES * 4) / 3) + 4096;

const assertContentLengthWithinLimit = (request: Request) => {
	const contentLength = Number(request.headers.get('content-length') || 0);
	if (contentLength > 0 && contentLength > MAX_RECEIPT_CONTENT_LENGTH) {
		throw new PublicBookingApiError(
			`El comprobante supera el tamaño máximo permitido (${Math.floor(MAX_RECEIPT_BYTES / 1024 / 1024)} MB).`,
			413
		);
	}
};

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
		assertContentLengthWithinLimit(request);
		const body = await parseRequestBody(request);
		const payload = parseReceiptPayload(body);
		const idempotencyKey = readIdempotencyKeyHeader(request);
		const result = await uploadPublicReceiptWithOrds(token, payload, idempotencyKey);

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
