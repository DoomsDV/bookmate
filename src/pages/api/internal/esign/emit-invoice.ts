import type { APIRoute } from 'astro';

import {
	callEsignInternalOrds,
	createEsignDocument,
	EsignApiError,
	isEsignConfigured,
	type CreateEsignDocumentPayload,
	type EsignReceptor,
} from '../../../../lib/esign';

export const prerender = false;

// Webhook interno PL/SQL -> Astro: PKG_AOX_SUBSCRIPTION_BILLING_API.pr_notificar_emision_fe
// hace un POST aquí justo despues de que una org_subscription_invoice pasa a PAID.
// Body esperado (armado en Oracle):
//   { invoice_id, datos_operacion: {establecimiento, punto_expedicion},
//     receptor: {tipo, documento, nombre, dv?, tipoContribuyente?}, moneda, descripcion, monto }
interface EmitInvoiceWebhookBody {
	invoice_id: number;
	datos_operacion?: { establecimiento?: string; punto_expedicion?: string };
	receptor?: EsignReceptor;
	moneda?: string;
	descripcion?: string;
	monto?: number;
}

const requireServiceToken = (request: Request) => {
	const expected = String(import.meta.env.ESIGN_CALLBACK_SERVICE_TOKEN || '').trim();
	const received = request.headers.get('x-service-token') || '';
	if (!expected || received !== expected) {
		throw new EsignApiError('Token de servicio inválido.', 401, 'INVALID_SERVICE_TOKEN');
	}
};

// IVA por defecto para la suscripción SaaS de Hasel: gravado 10% para no bloquear
// las pruebas en ambiente test. PENDIENTE confirmar con el negocio el tratamiento
// fiscal real (gravado/exento/exonerado) antes de emitir en producción real.
const DEFAULT_AFECTACION_IVA = 1;
const DEFAULT_TASA_IVA = 10;

const buildDocumentPayload = (body: EmitInvoiceWebhookBody): CreateEsignDocumentPayload => {
	const monto = Number(body.monto || 0);
	const descripcion = String(body.descripcion || 'Suscripción Hasel').trim() || 'Suscripción Hasel';

	return {
		tipo: 'fe',
		condicion: 'contado',
		datos_operacion: {
			establecimiento: body.datos_operacion?.establecimiento || '001',
			punto_expedicion: body.datos_operacion?.punto_expedicion || '001',
		},
		receptor: body.receptor,
		moneda: String(body.moneda || 'PYG'),
		items: [
			{
				descripcion,
				cantidad: 1,
				precioUnitario: monto,
				afectacionIVA: DEFAULT_AFECTACION_IVA,
				tasaIVA: DEFAULT_TASA_IVA,
			},
		],
	};
};

export const POST: APIRoute = async ({ request }) => {
	let body: EmitInvoiceWebhookBody;
	try {
		requireServiceToken(request);
		body = (await request.json()) as EmitInvoiceWebhookBody;
	} catch (error) {
		const status = error instanceof EsignApiError ? error.status : 400;
		return Response.json(
			{ status: 'error', message: error instanceof Error ? error.message : 'Payload inválido.' },
			{ status }
		);
	}

	const invoiceId = Number(body?.invoice_id || 0);
	if (!invoiceId) {
		return Response.json({ status: 'error', message: 'Falta invoice_id.' }, { status: 400 });
	}

	if (!isEsignConfigured()) {
		// ESIGN_API_KEY vacía (ej. producción sin key real todavía): no romper el
		// webhook, simplemente no emitimos. Oracle lo dejó en einvoice_status=PENDING;
		// se puede reprocesar manualmente el día que se configure la key.
		return Response.json({ status: 'success', message: 'Firmador no configurado; se omite emisión.' }, { status: 200 });
	}

	try {
		const documentPayload = buildDocumentPayload(body);
		const result = await createEsignDocument(documentPayload);

		await callEsignInternalOrds(`/${invoiceId}/einvoice`, {
			method: 'POST',
			body: {
				cdc: result.cdc,
				estado: result.estado,
				codRes: result.codRes,
				protAut: result.protAut,
				ambiente: result.ambiente,
			},
		});

		return Response.json({ status: 'success', data: result }, { status: 200 });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Error desconocido emitiendo la Factura Electrónica.';

		// Best-effort: avisamos a ORDS que la emision fallo para que no quede
		// colgada en PENDING para siempre (pr_save_einvoice_result marca FAILED
		// cuando estado != APROBADO).
		try {
			await callEsignInternalOrds(`/${invoiceId}/einvoice`, {
				method: 'POST',
				body: { cdc: null, estado: 'ERROR', codRes: null, protAut: null, mensaje: message.slice(0, 400) },
			});
		} catch {
			// Si tambien falla el callback a ORDS, queda en PENDING y se ve en aox_api_log.
		}

		const status = error instanceof EsignApiError ? error.status : 502;
		return Response.json({ status: 'error', message }, { status });
	}
};
