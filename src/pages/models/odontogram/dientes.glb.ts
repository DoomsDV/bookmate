import type { APIRoute } from 'astro';

const DEFAULT_GLB_URL =
	'https://objectstorage.sa-saopaulo-1.oraclecloud.com/n/gr7djv0kcgrr/b/bucket-hasel-aoxdev/o/odontograma%2Fboca.glb';

export const prerender = false;

export const GET: APIRoute = async () => {
	const fromEnv = String(import.meta.env.PUBLIC_ODONTOGRAM_GLB_URL || '').trim();
	const url =
		/^https?:\/\//i.test(fromEnv) &&
		!fromEnv.includes('/models/odontogram/') &&
		!fromEnv.includes('dientes.glb')
			? fromEnv
			: DEFAULT_GLB_URL;

	try {
		const upstream = await fetch(url);
		if (!upstream.ok || !upstream.body) {
			return new Response('No se pudo obtener el modelo 3D.', { status: 502 });
		}

		return new Response(upstream.body, {
			status: 200,
			headers: {
				'Content-Type': 'model/gltf-binary',
				'Cache-Control': 'public, max-age=86400',
			},
		});
	} catch {
		return new Response('No se pudo obtener el modelo 3D.', { status: 502 });
	}
};
