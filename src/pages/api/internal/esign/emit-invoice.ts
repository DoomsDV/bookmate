import type { APIRoute } from 'astro';

import {
	callEsignInternalCreditNoteOrds,
	callEsignInternalOrds,
	createEsignDocument,
	EsignApiError,
	isEsignConfigured,
	type CreateEsignDocumentPayload,
	type EsignDocumentResult,
	type EsignReceptor,
} from '../../../../lib/esign';

export const prerender = false;

// Webhook interno PL/SQL -> Astro: outbox FE/NCE (pr_dispatch_*_outbox) hace POST aquí.
// Body armado en Oracle (fn_build_einvoice_payload / fn_build_nce_payload).
interface EmitInvoiceWebhookBody {
	invoice_id?: number;
	credit_note_id?: number;
	emission_key?: string;
	tipo?: 'fe' | 'nce' | 'nde';
	invoice_type?: string;
	codigo?: string;
	cdcRef?: string;
	motivo?: number;
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

const stripInternalBillingJargon = (description: string): string =>
	description
		.replace(/\s*\(prorrateo\s+\d+\s+d[ií]as?(?:\(s\))?\)/gi, '')
		.replace(/\s*\(sin cobro;\s*entra en la renovaci[oó]n\)/gi, '')
		.replace(/\s*\(\s*1\s+mes\s*\)/gi, '')
		.replace(/\s*-\s*cr[eé]dito\s+[\d.]+(?:\s+Gs)?/gi, '')
		.replace(/\s{2,}/g, ' ')
		.trim();

const isModuleAddonInvoice = (body: EmitInvoiceWebhookBody): boolean => {
	const invoiceType = String(body.invoice_type || '').trim().toUpperCase();
	const codigo = String(body.codigo || '').trim().toUpperCase();
	return invoiceType === 'MODULE_ADDON' || codigo === 'HASEL-ADDON';
};

const fiscalItemCodigo = (tipo: string, body: EmitInvoiceWebhookBody): string => {
	if (tipo === 'nce' || tipo === 'nde') return 'HASEL-NCE';
	if (isModuleAddonInvoice(body)) return 'HASEL-ADDON';
	return 'HASEL-SUB';
};

const fiscalItemDescripcion = (body: EmitInvoiceWebhookBody): string => {
	const raw = String(body.descripcion || '').trim();
	if (isModuleAddonInvoice(body)) {
		return stripInternalBillingJargon(raw) || raw || 'Complemento Hasel';
	}
	return raw || 'Suscripción Hasel';
};

const normalizeReceptor = (receptor?: EsignReceptor) => {
	if (!receptor) return undefined;
	const normalized = { ...receptor };
	if (String(normalized.tipo || '').toLowerCase() === 'ruc') {
		normalized.tipoOperacion = normalized.tipoOperacion || 1;
		if (!normalized.tipoContribuyente) {
			const name = String(normalized.nombre || '').toUpperCase();
			normalized.tipoContribuyente = /(S\.?\s*R\.?\s*L\.?)|(S\.?\s*A\.?)|EAS|LTDA|CIA\.?|COOP|SOCIEDAD/.test(
				name
			)
				? 2
				: 1;
		}
	}
	return normalized;
};

const buildDocumentPayload = (body: EmitInvoiceWebhookBody): CreateEsignDocumentPayload => {
	const monto = Number(body.monto || 0);
	const receptor = normalizeReceptor(body.receptor);
	const tipo = String(body.tipo || 'fe').toLowerCase() as 'fe' | 'nce' | 'nde';
	const descripcion = fiscalItemDescripcion(body);
	const datosOperacion = {
		establecimiento: body.datos_operacion?.establecimiento || '001',
		punto_expedicion: body.datos_operacion?.punto_expedicion || '001',
	};

	const items = [
		{
			codigo: fiscalItemCodigo(tipo, body),
			descripcion,
			cantidad: 1,
			precioUnitario: monto,
			afectacionIVA: DEFAULT_AFECTACION_IVA,
			tasaIVA: DEFAULT_TASA_IVA,
			unidadMedida: 77,
			desUnidadMedida: 'UNI',
		},
	];

	if (tipo === 'nce' || tipo === 'nde') {
		const cdcRef = String(body.cdcRef || '').trim();
		if (!cdcRef) {
			throw new EsignApiError('NCE/NDE requiere cdcRef.', 400, 'MISSING_CDC_REF');
		}
		return {
			tipo,
			condicion: 'contado',
			datos_operacion: datosOperacion,
			receptor,
			moneda: String(body.moneda || 'PYG'),
			tipoTransaccion: body.tipoTransaccion || 2,
			desTipoTransaccion: body.desTipoTransaccion || 'Prestación de servicios',
			indPres: body.indPres || 2,
			desIndPres: body.desIndPres || 'Operación electrónica',
			cdcRef,
			motivo: Number(body.motivo || 2),
			items,
		};
	}

	const medioPago = Number(body.medioPago || 0);
	const desMedioPago = String(body.desMedioPago || '').trim();

	return {
		tipo: 'fe',
		condicion: body.condicion === 'credito' ? 'credito' : 'contado',
		datos_operacion: datosOperacion,
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
		items,
	};
};

const persistFeOrdsResult = async (
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

const persistNceOrdsResult = async (
	creditNoteId: number,
	result: EsignDocumentResult,
	mensaje?: string
) => {
	await callEsignInternalCreditNoteOrds(`/${creditNoteId}/nce`, {
		method: 'POST',
		body: {
			cdc: result.cdc,
			estado: result.estado,
			codRes: result.codRes,
			protAut: result.protAut,
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

	const tipo = String(body?.tipo || 'fe').toLowerCase();
	const isNce = tipo === 'nce' || tipo === 'nde';
	const invoiceId = Number(body.invoice_id || 0);
	const creditNoteId = Number(body.credit_note_id || 0);

	if (isNce) {
		if (!creditNoteId) {
			return Response.json({ status: 'error', message: 'Falta credit_note_id.' }, { status: 400 });
		}
	} else if (!invoiceId) {
		return Response.json({ status: 'error', message: 'Falta invoice_id.' }, { status: 400 });
	}

	const emissionKey =
		String(body.emission_key || request.headers.get('idempotency-key') || '').trim() ||
		(isNce ? `NCE-${invoiceId || creditNoteId}` : `INV-${invoiceId}`);

	if (!isEsignConfigured()) {
		return Response.json(
			{ status: 'error', message: 'Firmador no configurado; emisión omitida.' },
			{ status: 503 }
		);
	}

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
	const docLabel = isNce ? 'Nota de Crédito Electrónica' : 'Factura Electrónica';
	try {
		const documentPayload = buildDocumentPayload(body);
		emitted = await createEsignDocument(documentPayload, { idempotencyKey: emissionKey });

		try {
			if (isNce) {
				await persistNceOrdsResult(creditNoteId, emitted);
			} else {
				await persistFeOrdsResult(invoiceId, emitted);
			}
		} catch (ordsError) {
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
			error instanceof Error ? error.message : `Error desconocido emitiendo la ${docLabel}.`;

		if (emitted?.cdc) {
			try {
				if (isNce) {
					await persistNceOrdsResult(creditNoteId, emitted, message);
				} else {
					await persistFeOrdsResult(invoiceId, emitted, message);
				}
			} catch {
				/* best-effort */
			}
			return Response.json(
				{ status: 'success', data: emitted, warning: message.slice(0, 200) },
				{ status: 200 }
			);
		}

		try {
			if (isNce) {
				await callEsignInternalCreditNoteOrds(`/${creditNoteId}/nce`, {
					method: 'POST',
					body: {
						cdc: null,
						estado: 'ERROR',
						codRes: null,
						protAut: null,
						mensaje: message.slice(0, 400),
					},
				});
			} else {
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
			}
		} catch {
			// Si también falla el callback a ORDS, queda en PENDING y se ve en aox_api_log.
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
