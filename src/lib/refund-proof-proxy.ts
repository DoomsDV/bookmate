export const proxyRefundProof = async (url: string, mimeType: string) => {
	const safeUrl = String(url || '').trim();
	if (!safeUrl) {
		return Response.json({ status: 'error', message: 'Prueba no disponible.' }, { status: 404 });
	}

	const upstream = await fetch(safeUrl, { method: 'GET' });
	if (!upstream.ok || !upstream.body) {
		return Response.json(
			{ status: 'error', message: 'No fue posible leer la prueba.' },
			{ status: 502 }
		);
	}

	return new Response(upstream.body, {
		status: 200,
		headers: {
			'Content-Type': mimeType || upstream.headers.get('content-type') || 'application/octet-stream',
			'Cache-Control': 'private, no-store',
			'X-Content-Type-Options': 'nosniff',
		},
	});
};
