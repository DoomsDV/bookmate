/**
 * Comprime la foto de agenda en el cliente: un JPEG acotado para OCR y preview.
 * Si el canvas falla, el caller recibe el original. El tope de 12 MB lo aplica el overlay.
 */

const MAX_LONG_SIDE_PX = 2000;
const MAX_SOURCE_SIDE_PX = 8192;
const MAX_SOURCE_PIXELS = 16_000_000;
const SKIP_MAX_BYTES = 1.5 * 1024 * 1024;
const TARGET_MAX_BYTES = 2 * 1024 * 1024;
const JPEG_QUALITY = 0.85;
const JPEG_QUALITY_STEP = 0.8;
const HEADER_BYTES = 256 * 1024;

export type PrepareAgendaScanOptions = {
	signal?: AbortSignal;
};

type ImageSize = {
	width: number;
	height: number;
};

type DecodedSource = ImageBitmap | HTMLImageElement;

const throwIfAborted = (signal?: AbortSignal) => {
	if (!signal?.aborted) return;
	if (signal.reason instanceof DOMException && signal.reason.name === 'AbortError') {
		throw signal.reason;
	}
	throw new DOMException('Aborted', 'AbortError');
};

const isAbortError = (error: unknown) =>
	(error instanceof DOMException && error.name === 'AbortError') ||
	(error instanceof Error && error.name === 'AbortError');

const isJpegFile = (file: File) => {
	const type = String(file.type || '').toLowerCase();
	const name = String(file.name || '').toLowerCase();
	return type === 'image/jpeg' || type === 'image/jpg' || name.endsWith('.jpg') || name.endsWith('.jpeg');
};

const isLikelyIos = () => {
	if (typeof navigator === 'undefined') return false;
	const ua = navigator.userAgent;
	if (/iP(hone|ad|od)/.test(ua)) return true;
	return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
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

const isHugeSize = (size: ImageSize | null) => {
	if (!size) return false;
	return (
		size.width * size.height > MAX_SOURCE_PIXELS ||
		Math.max(size.width, size.height) > MAX_SOURCE_SIDE_PX
	);
};

const jpegFileName = (originalName: string) => {
	const safe = String(originalName || 'agenda')
		.replace(/\.[^.]+$/, '')
		.replace(/[^\w.-]+/g, '_')
		.slice(0, 80);
	return `${safe || 'agenda'}.jpg`;
};

const u16 = (bytes: Uint8Array, offset: number, littleEndian = false) => {
	if (offset + 1 >= bytes.length) return 0;
	return littleEndian
		? bytes[offset] | (bytes[offset + 1] << 8)
		: (bytes[offset] << 8) | bytes[offset + 1];
};

const u32 = (bytes: Uint8Array, offset: number, littleEndian = false) => {
	if (offset + 3 >= bytes.length) return 0;
	return littleEndian
		? bytes[offset] +
				bytes[offset + 1] * 256 +
				bytes[offset + 2] * 65536 +
				bytes[offset + 3] * 16777216
		: bytes[offset] * 16777216 +
				bytes[offset + 1] * 65536 +
				bytes[offset + 2] * 256 +
				bytes[offset + 3];
};

const parseExifOrientation = (bytes: Uint8Array, start: number): number | null => {
	if (start + 12 > bytes.length) return null;
	if (
		bytes[start] !== 0x45 ||
		bytes[start + 1] !== 0x78 ||
		bytes[start + 2] !== 0x69 ||
		bytes[start + 3] !== 0x66
	) {
		return null;
	}
	const tiff = start + 6;
	const littleEndian = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
	const bigEndian = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;
	if (!littleEndian && !bigEndian) return null;
	if (u16(bytes, tiff + 2, littleEndian) !== 42) return null;
	const dir = tiff + u32(bytes, tiff + 4, littleEndian);
	if (dir + 2 > bytes.length) return null;
	const count = u16(bytes, dir, littleEndian);
	for (let i = 0; i < count; i += 1) {
		const entry = dir + 2 + i * 12;
		if (entry + 12 > bytes.length) break;
		if (u16(bytes, entry, littleEndian) !== 0x0112) continue;
		const type = u16(bytes, entry + 2, littleEndian);
		const value = type === 3 ? u16(bytes, entry + 8, littleEndian) : u32(bytes, entry + 8, littleEndian);
		if (value >= 1 && value <= 8) return value;
	}
	return null;
};

const parseJpegSize = (bytes: Uint8Array): ImageSize | null => {
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
	let offset = 2;
	let orientation = 1;
	while (offset + 8 < bytes.length) {
		if (bytes[offset] !== 0xff) {
			offset += 1;
			continue;
		}
		const marker = bytes[offset + 1];
		if (marker === 0xd8) {
			offset += 2;
			continue;
		}
		if (marker === 0xd9 || marker === 0xda) break;
		if (marker >= 0xd0 && marker <= 0xd7) {
			offset += 2;
			continue;
		}
		const size = u16(bytes, offset + 2);
		if (size < 2) break;
		if (marker === 0xe1) {
			const parsed = parseExifOrientation(bytes, offset + 4);
			if (parsed) orientation = parsed;
		}
		const isSof =
			(marker >= 0xc0 && marker <= 0xc3) ||
			(marker >= 0xc5 && marker <= 0xc7) ||
			(marker >= 0xc9 && marker <= 0xcb) ||
			(marker >= 0xcd && marker <= 0xcf);
		if (isSof) {
			const height = u16(bytes, offset + 5);
			const width = u16(bytes, offset + 7);
			if (width > 0 && height > 0) {
				return orientation >= 5 && orientation <= 8
					? { width: height, height: width }
					: { width, height };
			}
		}
		offset += 2 + size;
	}
	return null;
};

const parsePngSize = (bytes: Uint8Array): ImageSize | null => {
	if (
		bytes.length < 24 ||
		bytes[0] !== 0x89 ||
		bytes[1] !== 0x50 ||
		bytes[2] !== 0x4e ||
		bytes[3] !== 0x47
	) {
		return null;
	}
	const width = u32(bytes, 16);
	const height = u32(bytes, 20);
	if (width <= 0 || height <= 0) return null;
	return { width, height };
};

const parseWebpSize = (bytes: Uint8Array): ImageSize | null => {
	if (bytes.length < 30) return null;
	const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
	const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
	if (riff !== 'RIFF' || webp !== 'WEBP') return null;
	const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
	if (chunk === 'VP8X') {
		const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
		const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
		return width > 0 && height > 0 ? { width, height } : null;
	}
	if (chunk === 'VP8 ') {
		const width = u16(bytes, 26, true) & 0x3fff;
		const height = u16(bytes, 28, true) & 0x3fff;
		return width > 0 && height > 0 ? { width, height } : null;
	}
	if (chunk === 'VP8L' && bytes.length >= 25) {
		const bits = u32(bytes, 21, true);
		return {
			width: (bits & 0x3fff) + 1,
			height: ((bits >> 14) & 0x3fff) + 1,
		};
	}
	return null;
};

const readImageSize = async (file: File): Promise<ImageSize | null> => {
	const slice = file.slice(0, Math.min(file.size, HEADER_BYTES));
	const bytes = new Uint8Array(await slice.arrayBuffer());
	return parseJpegSize(bytes) || parsePngSize(bytes) || parseWebpSize(bytes);
};

const closeSource = (source: DecodedSource) => {
	if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
		source.close();
		return;
	}
	if (source instanceof HTMLImageElement) {
		source.removeAttribute('src');
	}
};

const decodeWithImage = async (file: File, signal?: AbortSignal): Promise<HTMLImageElement> => {
	throwIfAborted(signal);
	const url = URL.createObjectURL(file);
	try {
		const image = new Image();
		image.decoding = 'async';
		image.src = url;
		await image.decode();
		throwIfAborted(signal);
		return image;
	} finally {
		URL.revokeObjectURL(url);
	}
};

const decodeWithBitmap = async (
	file: File,
	target: ImageSize | null,
	signal?: AbortSignal
): Promise<ImageBitmap> => {
	throwIfAborted(signal);
	const options: ImageBitmapOptions = {
		imageOrientation: 'from-image',
		resizeQuality: 'high',
	};
	if (target) {
		options.resizeWidth = target.width;
		options.resizeHeight = target.height;
	}
	const bitmap = await createImageBitmap(file, options);
	throwIfAborted(signal);
	return bitmap;
};

const decodeSource = async (
	file: File,
	headerSize: ImageSize | null,
	signal?: AbortSignal
): Promise<DecodedSource> => {
	const huge = isHugeSize(headerSize);
	const target =
		headerSize &&
		(headerSize.width > MAX_LONG_SIDE_PX || headerSize.height > MAX_LONG_SIDE_PX)
			? fitMaxSide(headerSize.width, headerSize.height, MAX_LONG_SIDE_PX)
			: null;
	const preferImage = isLikelyIos() && !huge;
	const canBitmap = typeof createImageBitmap === 'function';

	if (huge && !canBitmap) {
		throw new Error('La imagen es demasiado grande.');
	}

	if (preferImage) {
		return decodeWithImage(file, signal);
	}

	if (canBitmap) {
		try {
			return await decodeWithBitmap(file, target, signal);
		} catch (error) {
			if (isAbortError(error)) throw error;
			if (huge) throw new Error('La imagen es demasiado grande.');
			return decodeWithImage(file, signal);
		}
	}

	return decodeWithImage(file, signal);
};

const sourceSize = (source: DecodedSource): ImageSize => {
	if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
		return { width: source.width, height: source.height };
	}
	const image = source as HTMLImageElement;
	return {
		width: image.naturalWidth || image.width,
		height: image.naturalHeight || image.height,
	};
};

const canvasToJpeg = (canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> =>
	new Promise((resolve) => {
		canvas.toBlob((blob) => resolve(blob && blob.size > 0 ? blob : null), 'image/jpeg', quality);
	});

const encodeJpegFile = async (
	source: DecodedSource,
	output: ImageSize,
	baseName: string
): Promise<File | null> => {
	const canvas = document.createElement('canvas');
	canvas.width = output.width;
	canvas.height = output.height;
	const ctx = canvas.getContext('2d', { alpha: false });
	if (!ctx) {
		canvas.width = 0;
		canvas.height = 0;
		return null;
	}
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
	if (!blob) return null;

	return new File([blob], jpegFileName(baseName), {
		type: 'image/jpeg',
		lastModified: Date.now(),
	});
};

/**
 * Devuelve un JPEG listo para FormData y preview. Si no se puede optimizar, el original.
 */
export const prepareAgendaScanImage = async (
	file: File,
	options: PrepareAgendaScanOptions = {}
): Promise<File> => {
	const { signal } = options;
	throwIfAborted(signal);
	if (typeof document === 'undefined') return file;

	try {
		const headerSize = await readImageSize(file);
		throwIfAborted(signal);

		if (
			isJpegFile(file) &&
			file.size <= SKIP_MAX_BYTES &&
			headerSize &&
			Math.max(headerSize.width, headerSize.height) <= MAX_LONG_SIDE_PX
		) {
			return file;
		}

		const source = await decodeSource(file, headerSize, signal);
		try {
			throwIfAborted(signal);
			const decoded = sourceSize(source);
			if (decoded.width <= 0 || decoded.height <= 0) return file;

			const headerAlreadyLarge =
				!!headerSize && Math.max(headerSize.width, headerSize.height) > MAX_LONG_SIDE_PX;
			if (
				!headerAlreadyLarge &&
				isJpegFile(file) &&
				file.size <= SKIP_MAX_BYTES &&
				Math.max(decoded.width, decoded.height) <= MAX_LONG_SIDE_PX
			) {
				return file;
			}

			if (isHugeSize(decoded) && !(typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap)) {
				throw new Error('La imagen es demasiado grande.');
			}

			const output = fitMaxSide(decoded.width, decoded.height, MAX_LONG_SIDE_PX);
			const jpeg = await encodeJpegFile(source, output, file.name);
			throwIfAborted(signal);
			return jpeg || file;
		} finally {
			closeSource(source);
		}
	} catch (error) {
		if (isAbortError(error)) throw error;
		if (error instanceof Error && error.message === 'La imagen es demasiado grande.') {
			throw error;
		}
		return file;
	}
};
