/**
 * Comprime fotos del historial en el cliente para no chocar el tope de ~4.5 MB
 * de Vercel. PDF y archivos que no se puedan decodificar se dejan como están
 * (el cliente los manda directo a ORDS si el JSON supera el tope del BFF).
 */

const MAX_LONG_SIDE_PX = 2400;
const TARGET_MAX_BYTES = Math.floor(2.8 * 1024 * 1024);
const SKIP_MAX_BYTES = Math.floor(2.5 * 1024 * 1024);
const JPEG_QUALITY = 0.85;
const JPEG_QUALITY_STEP = 0.72;

export type PreparedAppointmentAttachment = {
	file: File;
	filename: string;
	mimeType: string;
};

type ImageSize = {
	width: number;
	height: number;
};

const asPrepared = (file: File): PreparedAppointmentAttachment => ({
	file,
	filename: file.name || 'archivo',
	mimeType: file.type || 'application/octet-stream',
});

const isPdfFile = (file: File) => {
	const type = String(file.type || '').toLowerCase();
	const name = String(file.name || '').toLowerCase();
	return type === 'application/pdf' || name.endsWith('.pdf');
};

const isRasterImage = (file: File) => {
	const type = String(file.type || '').toLowerCase();
	const name = String(file.name || '').toLowerCase();
	return (
		type.startsWith('image/') ||
		/\.(jpe?g|png|heic|heif|avif|webp)$/.test(name)
	);
};

const fitMaxSide = (width: number, height: number, maxSide: number): ImageSize => {
	const long = Math.max(width, height);
	if (long <= maxSide) return { width, height };
	const scale = maxSide / long;
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
};

const jpegFileName = (originalName: string) => {
	const safe = String(originalName || 'adjunto')
		.replace(/\.[^.]+$/, '')
		.replace(/[^\w.-]+/g, '_')
		.slice(0, 80);
	return `${safe || 'adjunto'}.jpg`;
};

const canvasToJpeg = (canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> =>
	new Promise((resolve) => {
		canvas.toBlob((blob) => resolve(blob && blob.size > 0 ? blob : null), 'image/jpeg', quality);
	});

const decodeSource = async (file: File): Promise<ImageBitmap | HTMLImageElement> => {
	if (typeof createImageBitmap === 'function') {
		try {
			return await createImageBitmap(file, {
				imageOrientation: 'from-image',
				resizeQuality: 'high',
			});
		} catch {
			// HEIC u otros formatos que el motor no decodifica: caer al <img>.
		}
	}

	const url = URL.createObjectURL(file);
	try {
		const image = new Image();
		image.decoding = 'async';
		image.src = url;
		await image.decode();
		return image;
	} finally {
		URL.revokeObjectURL(url);
	}
};

const closeSource = (source: ImageBitmap | HTMLImageElement) => {
	if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
		source.close();
	}
};

const sourceSize = (source: ImageBitmap | HTMLImageElement): ImageSize => {
	if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
		return { width: source.width, height: source.height };
	}
	const image = source as HTMLImageElement;
	return {
		width: image.naturalWidth || image.width,
		height: image.naturalHeight || image.height,
	};
};

export const prepareAppointmentAttachmentFile = async (
	file: File
): Promise<PreparedAppointmentAttachment> => {
	if (typeof document === 'undefined' || isPdfFile(file) || !isRasterImage(file)) {
		return asPrepared(file);
	}

	if (file.size <= SKIP_MAX_BYTES && !/\.(heic|heif)$/i.test(file.name || '')) {
		return asPrepared(file);
	}

	try {
		const source = await decodeSource(file);
		try {
			const decoded = sourceSize(source);
			if (decoded.width <= 0 || decoded.height <= 0) return asPrepared(file);

			const output = fitMaxSide(decoded.width, decoded.height, MAX_LONG_SIDE_PX);
			const canvas = document.createElement('canvas');
			canvas.width = output.width;
			canvas.height = output.height;
			const ctx = canvas.getContext('2d', { alpha: false });
			if (!ctx) return asPrepared(file);

			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, output.width, output.height);
			ctx.imageSmoothingEnabled = true;
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(source, 0, 0, output.width, output.height);

			let blob = await canvasToJpeg(canvas, JPEG_QUALITY);
			if (blob && blob.size > TARGET_MAX_BYTES) {
				const smaller = await canvasToJpeg(canvas, JPEG_QUALITY_STEP);
				if (smaller) blob = smaller;
			}

			canvas.width = 0;
			canvas.height = 0;
			if (!blob || blob.size >= file.size) return asPrepared(file);

			const next = new File([blob], jpegFileName(file.name), {
				type: 'image/jpeg',
				lastModified: Date.now(),
			});
			return {
				file: next,
				filename: next.name,
				mimeType: 'image/jpeg',
			};
		} finally {
			closeSource(source);
		}
	} catch {
		return asPrepared(file);
	}
};
