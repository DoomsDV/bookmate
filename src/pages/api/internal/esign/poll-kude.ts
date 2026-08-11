import type { APIRoute } from 'astro';

import { callEsignInternalOrds, getEsignKudeStatus, isEsignConfigured } from '../../../../lib/esign';

export const prerender = false;

interface PendingKudeItem {
	invoice_id: number;
	cdc: string;
}

// Vercel Cron Job (ver vercel.json, cada 1 minuto): resuelve los KuDE (PDF)
// pendientes de las facturas electronicas ya aprobadas por SIFEN, y dispara
// el email con el adjunto vía callback a ORDS una vez que estan listos.
// Seguridad: Vercel firma las invocaciones de cron con
// "Authorization: Bearer $CRON_SECRET" (ver vercel.com/docs/cron-jobs/manage-cron-jobs).
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
		return Response.json({ status: 'success', message: 'Firmador no configurado; nada que hacer.', data: { checked: 0, sent: 0 } });
	}

	let pending: PendingKudeItem[] = [];
	try {
		pending = await callEsignInternalOrds<PendingKudeItem[]>('/pending-kude', { method: 'GET' });
	} catch (error) {
		return Response.json(
			{ status: 'error', message: error instanceof Error ? error.message : 'No fue posible listar pendientes.' },
			{ status: 502 }
		);
	}

	let sent = 0;
	const errors: Array<{ invoice_id: number; message: string }> = [];

	for (const item of pending || []) {
		try {
			const kude = await getEsignKudeStatus(item.cdc);
			if (kude.estado === 'ready' && kude.kudeUrl) {
				await callEsignInternalOrds(`/${item.invoice_id}/einvoice-kude`, {
					method: 'POST',
					body: { kudeUrl: kude.kudeUrl },
				});
				sent += 1;
			}
			// estado === 'pending': se reintenta en la proxima corrida del cron (1 min).
		} catch (error) {
			errors.push({
				invoice_id: item.invoice_id,
				message: error instanceof Error ? error.message : 'Error desconocido.',
			});
		}
	}

	return Response.json({
		status: 'success',
		data: { checked: pending?.length || 0, sent, errors },
	});
};
