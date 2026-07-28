/**
 * Rasteriza la 1ª página de un PDF a JPEG para reutilizar el OCR de imagen.
 * Conversión silenciosa: si falla, el caller sube el PDF original (MANUAL_REVIEW).
 */

import * as pdfjs from 'pdfjs-dist';

const TARGET_WIDTH_PX = 1800;
const JPEG_QUALITY = 0.88;

let workerReady = false;

const ensurePdfWorker = () => {
	if (workerReady) return;
	pdfjs.GlobalWorkerOptions.workerSrc = new URL(
		'pdfjs-dist/build/pdf.worker.min.mjs',
		import.meta.url
	).toString();
	workerReady = true;
};

const isPdfFile = (file: File) => {
	const name = String(file.name || '').toLowerCase();
	return file.type === 'application/pdf' || name.endsWith('.pdf');
};

const canvasToJpegFile = (
	canvas: HTMLCanvasElement,
	baseName: string
): Promise<File | null> =>
	new Promise((resolve) => {
		canvas.toBlob(
			(blob) => {
				if (!blob || blob.size <= 0) {
					resolve(null);
					return;
				}
				const safe = String(baseName || 'comprobante')
					.replace(/\.[^.]+$/, '')
					.replace(/[^\w.-]+/g, '_')
					.slice(0, 80);
				resolve(
					new File([blob], `${safe || 'comprobante'}.jpg`, {
						type: 'image/jpeg',
						lastModified: Date.now(),
					})
				);
			},
			'image/jpeg',
			JPEG_QUALITY
		);
	});

/**
 * Si el archivo es PDF, intenta devolver un JPEG de la 1ª página.
 * Si no es PDF o falla el render, devuelve el archivo original.
 */
export const prepareReceiptUploadFile = async (file: File): Promise<File> => {
	if (!isPdfFile(file)) return file;
	if (typeof document === 'undefined') return file;

	try {
		ensurePdfWorker();
		const data = new Uint8Array(await file.arrayBuffer());
		const loadingTask = pdfjs.getDocument({ data, disableFontFace: false });
		const pdf = await loadingTask.promise;
		const page = await pdf.getPage(1);
		const baseViewport = page.getViewport({ scale: 1 });
		const scale = Math.min(
			Math.max(TARGET_WIDTH_PX / Math.max(baseViewport.width, 1), 1.5),
			3
		);
		const viewport = page.getViewport({ scale });

		const canvas = document.createElement('canvas');
		canvas.width = Math.ceil(viewport.width);
		canvas.height = Math.ceil(viewport.height);
		const ctx = canvas.getContext('2d', { alpha: false });
		if (!ctx) {
			await pdf.destroy();
			return file;
		}
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		await page.render({
			canvasContext: ctx,
			viewport,
		}).promise;

		const jpeg = await canvasToJpegFile(canvas, file.name);
		await pdf.destroy();
		canvas.width = 0;
		canvas.height = 0;
		return jpeg || file;
	} catch {
		return file;
	}
};
