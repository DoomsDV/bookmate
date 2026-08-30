import type { APIRoute } from 'astro';

import { getPublicRefundProofMetaWithOrds, PublicBookingApiError } from '../../../../../lib/public-booking';
import { publicBookingErrorResponse } from '../../../../../lib/public-api-handlers';
import { proxyRefundProof } from '../../../../../lib/refund-proof-proxy';

export const GET: APIRoute = async ({ params }) => {
	try {
		const token = String(params.token || '').trim();
		if (!token) throw new PublicBookingApiError('Token de reserva requerido.', 400);

		const meta = await getPublicRefundProofMetaWithOrds(token);
		return proxyRefundProof(meta.url, meta.mime_type);
	} catch (error) {
		return publicBookingErrorResponse(error, 'No fue posible mostrar la prueba.');
	}
};
