import type { APIRoute } from 'astro';

import {
	getInvoiceKudeWithOrds,
	SubscriptionApiError,
} from '../../../../../../lib/subscription';
import { EsignApiError, getEsignKudeStatus } from '../../../../../../lib/esign';
import {
	buildInvoicePdfFilename,
	buildInvoicePdfHeaders,
	fetchKudePdfBytes,
	InvoicePdfError,
	parseEsignKudeLink,
	parseInvoiceIdParam,
} from '../../../../../../lib/subscription-invoice-pdf';

export const prerender = false;

// El link estable del firmador necesita la API key: se pide el link temporal
// (~15 min) del bucket privado y se baja el PDF de ahí.
const resolveKudePdfUrl = async (kudeUrl: string): Promise<string> => {
	const cdc = parseEsignKudeLink(kudeUrl);
	if (!cdc) return kudeUrl;
	const kude = await getEsignKudeStatus(cdc);
	if (kude.estado !== 'ready' || !kude.kudeUrl) {
		throw new InvoicePdfError('El PDF de la factura todavía se está generando.', 409, 'KUDE_PENDING');
	}
	return kude.kudeUrl;
};

const toErrorResponse = (error: unknown) => {
	if (error instanceof EsignApiError) {
		return Response.json(
			{ status: 'error', message: error.message, code: error.code },
			{ status: error.status }
		);
	}
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
		const pdfBytes = await fetchKudePdfBytes(await resolveKudePdfUrl(meta.kude_url));
		const filename = buildInvoicePdfFilename(meta.cdc, invoiceId);

		return new Response(Buffer.from(pdfBytes), {
			status: 200,
			headers: buildInvoicePdfHeaders(filename, pdfBytes.byteLength),
		});
	} catch (error) {
		return toErrorResponse(error);
	}
};
