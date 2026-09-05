import type { APIRoute } from 'astro';

import {
	getInvoiceKudeWithOrds,
	SubscriptionApiError,
} from '../../../../../../lib/subscription';
import {
	buildInvoicePdfFilename,
	buildInvoicePdfHeaders,
	fetchKudePdfBytes,
	InvoicePdfError,
	parseInvoiceIdParam,
} from '../../../../../../lib/subscription-invoice-pdf';

export const prerender = false;

const toErrorResponse = (error: unknown) => {
	if (error instanceof InvoicePdfError) {
		return Response.json(
			{ status: 'error', message: error.message, code: error.code },
			{ status: error.status }
		);
	}
	if (error instanceof SubscriptionApiError) {
		return Response.json(
			{ status: 'error', message: error.message, details: error.details },
			{ status: error.status }
		);
	}
	return Response.json(
		{
			status: 'error',
			message: error instanceof Error ? error.message : 'No fue posible descargar la factura.',
		},
		{ status: 500 }
	);
};

export const GET: APIRoute = async ({ locals, params }) => {
	try {
		const token = locals.token;
		if (!token) {
			throw new SubscriptionApiError('No hay sesión válida.', 401);
		}

		const invoiceId = parseInvoiceIdParam(params.id);
		const meta = await getInvoiceKudeWithOrds(token, invoiceId);
		const pdfBytes = await fetchKudePdfBytes(meta.kude_url);
		const filename = buildInvoicePdfFilename(meta.cdc, invoiceId);

		return new Response(Buffer.from(pdfBytes), {
			status: 200,
			headers: buildInvoicePdfHeaders(filename, pdfBytes.byteLength),
		});
	} catch (error) {
		return toErrorResponse(error);
	}
};
