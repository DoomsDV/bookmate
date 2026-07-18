import sharp, { type Sharp } from 'sharp';

export const PROFILE_MEDIA_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const PROFILE_MEDIA_MAX_STORED_BYTES = 5 * 1024 * 1024;
export const PROFILE_MEDIA_COMPRESSED_TARGET_MIN = 150 * 1024;
export const PROFILE_MEDIA_COMPRESSED_TARGET_MAX = 300 * 1024;
export const PROFILE_MEDIA_COMPRESSED_HARD_CAP = 1024 * 1024;

export type OptimizeProfileImageMode = 'gallery' | 'banner';

export interface OptimizedProfileImage {
	buffer: Buffer;
	mime: 'image/webp' | 'image/jpeg' | 'image/png';
	filename: string;
	bytes: number;
	compressed: boolean;
}

const ALLOWED_INPUT = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

const safeBaseName = (name: string) => {
	const base = String(name || 'image')
		.replace(/\.[^.]+$/, '')
		.replace(/[^\w.-]+/g, '_')
		.slice(0, 80);
	return base || 'image';
};

const encodeWebpUnder = async (pipeline: Sharp, maxBytes: number, startQuality = 82) => {
	let quality = startQuality;
	let best: Buffer | null = null;

	while (quality >= 40) {
		const buffer = await pipeline.clone().webp({ quality, effort: 4 }).toBuffer();
		best = buffer;
		if (buffer.byteLength <= maxBytes) return buffer;
		quality -= 8;
	}

	return best || (await pipeline.webp({ quality: 40, effort: 4 }).toBuffer());
};

export async function optimizeProfileImage(options: {
	input: Buffer;
	filename: string;
	mimeType: string;
	compress: boolean;
	mode: OptimizeProfileImageMode;
}): Promise<OptimizedProfileImage> {
	const mime = String(options.mimeType || '').toLowerCase();
	if (!ALLOWED_INPUT.has(mime)) {
		throw new Error('Formato no permitido. Usa JPG o PNG.');
	}

	if (options.input.byteLength > PROFILE_MEDIA_MAX_UPLOAD_BYTES) {
		throw new Error('La imagen supera el máximo de 5 MB.');
	}

	const baseName = safeBaseName(options.filename);
	let image = sharp(options.input, { failOn: 'none' }).rotate();

	if (options.compress) {
		if (options.mode === 'banner') {
			image = image.resize(1200, 600, { fit: 'cover', position: 'centre' });
		} else {
			image = image.resize({
				width: 1600,
				height: 1600,
				fit: 'inside',
				withoutEnlargement: true,
			});
		}

		let buffer = await encodeWebpUnder(image, PROFILE_MEDIA_COMPRESSED_TARGET_MAX, 80);
		if (buffer.byteLength > PROFILE_MEDIA_COMPRESSED_HARD_CAP) {
			buffer = await encodeWebpUnder(image, PROFILE_MEDIA_COMPRESSED_HARD_CAP, 60);
		}

		return {
			buffer,
			mime: 'image/webp',
			filename: `${baseName}.webp`,
			bytes: buffer.byteLength,
			compressed: true,
		};
	}

	// Mantener resolución: re-encode WebP alta calidad sin downscale forzado.
	const buffer = await encodeWebpUnder(image, PROFILE_MEDIA_MAX_STORED_BYTES, 92);
	if (buffer.byteLength > PROFILE_MEDIA_MAX_STORED_BYTES) {
		throw new Error('La imagen supera el máximo de 5 MB incluso sin comprimir fuerte.');
	}

	return {
		buffer,
		mime: 'image/webp',
		filename: `${baseName}.webp`,
		bytes: buffer.byteLength,
		compressed: false,
	};
}

export const bufferToBase64 = (buffer: Buffer) => buffer.toString('base64');
