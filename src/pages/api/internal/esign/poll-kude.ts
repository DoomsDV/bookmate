import type { APIRoute } from 'astro';

import {
	callEsignInternalOrds,
	getEsignDocumentXml,
	getEsignKudeStatus,
	isEsignConfigured,
	EsignApiError,
} from '../../../../lib/esign';

export const prerender = false;

interface PendingArtifactItem {
	invoice_id: number;
	cdc: string;
}

// Vercel Cron Job (ver vercel.json): reconciliación de artefactos fiscales
// (KuDE PDF + XML firmado) para facturas SIFEN ya aprobadas. Cuando ambos
// están listos, POST al callback ORDS; Oracle dispara el email atómico.
// Seguridad: "Authorization: Bearer $CRON_SECRET".
const assertCronRequest = (request: Request) => {
	const cronSecret = String(import.meta.env.CRON_SECRET || '').trim();
	const authHeader = request.headers.get('authorization') || '';
	if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
		return false;
	}
	return true;
};

export const GET: APIRoute = async ({ request }) => {
	if (!assertCronRequest(request)) {
		return Response.json({ status: 'error', message: 'No autorizado.' }, { status: 401 });
	}

	if (!isEsignConfigured()) {
		return Response.json({
			status: 'success',
			message: 'Firmador no configurado; nada que hacer.',
			data: { checked: 0, sent: 0, artifactsSaved: 0 },
		});
	}

	let pending: PendingArtifactItem[] = [];
	try {
		pending = await callEsignInternalOrds<PendingArtifactItem[]>('/pending-kude', { method: 'GET' });
	} catch (error) {
		return Response.json(
			{ status: 'error', message: error instanceof Error ? error.message : 'No fue posible listar pendientes.' },
			{ status: 502 }
		);
	}

	/** Confirmaciones ORDS de artefactos persistidos (no cuenta KuDE pending). */
	let artifactsSaved = 0;
	const errors: Array<{ invoice_id: number; message: string; code?: string }> = [];

	for (const item of pending || []) {
		try {
			const kude = await getEsignKudeStatus(item.cdc);
			if (kude.estado !== 'ready' || !kude.kudeUrl) {
				// KuDE aún pending: reintento en la próxima corrida del cron.
				continue;
			}

			const xml = await getEsignDocumentXml(item.cdc);

			await callEsignInternalOrds(`/${item.invoice_id}/einvoice-artifacts`, {
				method: 'POST',
				body: {
					cdc: item.cdc,
					kudeUrl: kude.kudeUrl,
					xml: xml.text,
					xmlSha256: xml.sha256,
					xmlSize: xml.size,
					xmlMime: xml.mime.startsWith('application/xml')
						? xml.mime
						: 'application/xml; charset=UTF-8',
				},
			});
			artifactsSaved += 1;
		} catch (error) {
			errors.push({
				invoice_id: item.invoice_id,
				message: error instanceof Error ? error.message : 'Error desconocido.',
				code: error instanceof EsignApiError ? error.code : undefined,
			});
		}
	}

	return Response.json({
		status: 'success',
		data: {
			checked: pending?.length || 0,
			/** Alias histórico: solo incrementa tras callback ORDS exitoso de artefactos. */
			sent: artifactsSaved,
			artifactsSaved,
			errors,
		},
	});
};
