import { fetchOciObject, OciSafeFetchError } from './oci-safe-fetch.ts';

export const proxyRefundProof = async (url: string, mimeType: string) => {
	const safeUrl = String(url || '').trim();
	if (!safeUrl) {
		return Response.json({ status: 'error', message: 'Prueba no disponible.' }, { status: 404 });
	}

	try {
		const upstream = await fetchOciObject(safeUrl);
		return new Response(upstream.body, {
			status: 200,
			headers: {
				'Content-Type': mimeType || upstream.headers.get('content-type') || 'application/octet-stream',
				'Cache-Control': 'private, no-store',
				'X-Content-Type-Options': 'nosniff',
			},
		});
	} catch (error) {
		const err =
			error instanceof OciSafeFetchError
				? error
				: new OciSafeFetchError('No fue posible leer la prueba.', 502, 'FETCH_HTTP');
		return Response.json({ status: 'error', message: err.message }, { status: err.status });
	}
};
