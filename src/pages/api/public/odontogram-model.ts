import type { APIRoute } from 'astro';

const DEFAULT_GLB_URL =
	'https://objectstorage.sa-saopaulo-1.oraclecloud.com/n/gr7djv0kcgrr/b/bucket-hasel-aoxdev/o/odontograma%2Fdientes.glb';

const isRemoteGlbUrl = (value: string) =>
	/^https?:\/\//i.test(value) &&
	!value.includes('/models/odontogram/') &&
	!value.includes('/api/public/odontogram-model');

const isGlbBuffer = (buffer: ArrayBuffer) => {
	if (buffer.byteLength < 12) return false;
	return new TextDecoder().decode(new Uint8Array(buffer, 0, 4)) === 'glTF';
};

export const prerender = false;

export const GET: APIRoute = async () => {
	const fromEnv = String(import.meta.env.PUBLIC_ODONTOGRAM_GLB_URL || '').trim();
	const url = isRemoteGlbUrl(fromEnv) ? fromEnv : DEFAULT_GLB_URL;

	try {
		const upstream = await fetch(url);
		if (!upstream.ok) {
			return new Response('No se pudo obtener el modelo 3D.', { status: 502 });
		}

		const buffer = await upstream.arrayBuffer();
		if (!isGlbBuffer(buffer)) {
			return new Response('El origen no devolvió un modelo GLB.', { status: 502 });
		}

		return new Response(buffer, {
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
