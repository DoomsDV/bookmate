import type { APIRoute } from 'astro';

import {
	callEsignInternalOrds,
	createEsignDocument,
	EsignApiError,
	isEsignConfigured,
	type CreateEsignDocumentPayload,
	type EsignDocumentResult,
	type EsignReceptor,
} from '../../../../lib/esign';

export const prerender = false;

// Webhook interno PL/SQL -> Astro: outbox FE (pr_dispatch_einvoice_outbox) hace POST aquí
// despues de confirmar PAID. Body armado en Oracle (fn_build_einvoice_payload).
interface EmitInvoiceWebhookBody {
	invoice_id: number;
	emission_key?: string;
	datos_operacion?: { establecimiento?: string; punto_expedicion?: string };
	receptor?: EsignReceptor;
	moneda?: string;
	descripcion?: string;
	monto?: number;
	tipoTransaccion?: number;
	desTipoTransaccion?: string;
	indPres?: number;
	desIndPres?: string;
	condicion?: 'contado' | 'credito';
	medioPago?: number;
	desMedioPago?: string;
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
	const receptor = body.receptor ? { ...body.receptor } : undefined;

	// RUC contribuyente: operación B2B (iTiOpe=1). No forzar jurídica si Oracle ya envió el tipo.
	if (receptor && String(receptor.tipo || '').toLowerCase() === 'ruc') {
		receptor.tipoOperacion = receptor.tipoOperacion || 1;
		if (!receptor.tipoContribuyente) {
			const name = String(receptor.nombre || '').toUpperCase();
			receptor.tipoContribuyente = /(S\.?\s*R\.?\s*L\.?)|(S\.?\s*A\.?)|EAS|LTDA|CIA\.?|COOP|SOCIEDAD/.test(
				name
			)
				? 2
				: 1;
		}
	}

	const medioPago = Number(body.medioPago || 0);
	const desMedioPago = String(body.desMedioPago || '').trim();

	return {
		tipo: 'fe',
		condicion: body.condicion === 'credito' ? 'credito' : 'contado',
		datos_operacion: {
			establecimiento: body.datos_operacion?.establecimiento || '001',
			punto_expedicion: body.datos_operacion?.punto_expedicion || '001',
		},
		receptor,
		moneda: String(body.moneda || 'PYG'),
		tipoTransaccion: body.tipoTransaccion || 2,
		desTipoTransaccion: body.desTipoTransaccion || 'Prestación de servicios',
		indPres: body.indPres || 3,
		desIndPres:
			body.desIndPres || 'Operación electrónica (venta a distancia, internet, etc.)',
		...(medioPago > 0
			? { medioPago, desMedioPago: desMedioPago || undefined }
			: {}),
		items: [
			{
				codigo: 'HASEL-SUB',
				descripcion,
				cantidad: 1,
				precioUnitario: monto,
				afectacionIVA: DEFAULT_AFECTACION_IVA,
				tasaIVA: DEFAULT_TASA_IVA,
				unidadMedida: 77,
				desUnidadMedida: 'UNI',
			},
		],
	};
};

const persistOrdsResult = async (
	invoiceId: number,
	result: EsignDocumentResult,
	mensaje?: string
) => {
	await callEsignInternalOrds(`/${invoiceId}/einvoice`, {
		method: 'POST',
		body: {
			cdc: result.cdc,
			estado: result.estado,
			codRes: result.codRes,
			protAut: result.protAut,
			ambiente: result.ambiente,
			...(mensaje ? { mensaje: mensaje.slice(0, 400) } : {}),
		},
	});
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

	const emissionKey =
		String(body.emission_key || request.headers.get('idempotency-key') || '').trim() ||
		`INV-${invoiceId}`;

	if (!isEsignConfigured()) {
		// NO devolver 200: cerraría la outbox sin CDC. Oracle reintenta con 503.
		return Response.json(
			{ status: 'error', message: 'Firmador no configurado; emisión omitida.' },
			{ status: 503 }
		);
	}

	// Guardrail: solo sk_test_ / api-staging en este camino de suscripciones.
	const apiKey = String(import.meta.env.ESIGN_API_KEY || '').trim();
	const apiBase = String(import.meta.env.ESIGN_API_BASE_URL || 'https://api-staging.etick.uno');
	if (apiKey.startsWith('sk_prod_')) {
		return Response.json(
			{ status: 'error', message: 'Emisión de suscripción bloqueada: se requiere sk_test_.' },
			{ status: 403 }
		);
	}
	if (!/api-staging\.etick\.uno/i.test(apiBase) && !/localhost|127\.0\.0\.1/i.test(apiBase)) {
		return Response.json(
			{ status: 'error', message: 'Emisión de suscripción solo permitida contra api-staging.' },
			{ status: 403 }
		);
	}

	let emitted: EsignDocumentResult | null = null;
	try {
		const documentPayload = buildDocumentPayload(body);
		emitted = await createEsignDocument(documentPayload, { idempotencyKey: emissionKey });

		try {
			await persistOrdsResult(invoiceId, emitted);
		} catch (ordsError) {
			// SIFEN ya emitió: NO reportar ERROR (borraria/evitaría CDC). Devolver CDC
			// para que Oracle reconcilie; el cron/callback puede reintentar ORDS.
			const ordsMsg =
				ordsError instanceof Error ? ordsError.message : 'Callback ORDS falló tras emisión.';
			return Response.json(
				{
					status: 'success',
					data: emitted,
					warning: `CDC emitido; persistencia ORDS pendiente: ${ordsMsg.slice(0, 200)}`,
				},
				{ status: 200 }
			);
		}

		return Response.json({ status: 'success', data: emitted }, { status: 200 });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Error desconocido emitiendo la Factura Electrónica.';

		// Si ya hay CDC emitido en este request, reconciliar — nunca ERROR que lo borre.
		if (emitted?.cdc) {
			try {
				await persistOrdsResult(invoiceId, emitted, message);
			} catch {
				/* best-effort */
			}
			return Response.json(
				{ status: 'success', data: emitted, warning: message.slice(0, 200) },
				{ status: 200 }
			);
		}

		try {
			await callEsignInternalOrds(`/${invoiceId}/einvoice`, {
				method: 'POST',
				body: {
					cdc: null,
					estado: 'ERROR',
					codRes: null,
					protAut: null,
					mensaje: message.slice(0, 400),
				},
			});
		} catch {
			// Si tambien falla el callback a ORDS, queda en PENDING y se ve en aox_api_log.
		}

		const status = error instanceof EsignApiError ? error.status : 502;
		return Response.json(
			{
				status: 'error',
				message,
				...(error instanceof EsignApiError && error.code ? { code: error.code } : {}),
			},
			{ status }
		);
	}
};
