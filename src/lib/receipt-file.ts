export const RECEIPT_MAX_BYTES = 8 * 1024 * 1024;
export const RECEIPT_ACCEPT = 'image/jpeg,image/png,.jpg,.jpeg,.png,application/pdf,.pdf';

const RECEIPT_IMAGE_MIMES = new Set(['image/jpeg', 'image/png']);
const RECEIPT_PDF_MIMES = new Set(['application/pdf']);

export const classifyReceiptFile = (file: File): 'image' | 'pdf' | null => {
	const name = String(file.name || '').toLowerCase();
	const type = String(file.type || '').toLowerCase();
	if (
		type === 'image/svg+xml' ||
		type === 'text/html' ||
		name.endsWith('.svg') ||
		name.endsWith('.html') ||
		name.endsWith('.htm')
	) {
		return null;
	}
	if (RECEIPT_PDF_MIMES.has(type) || name.endsWith('.pdf')) return 'pdf';
	if (
		RECEIPT_IMAGE_MIMES.has(type) ||
		name.endsWith('.jpg') ||
		name.endsWith('.jpeg') ||
		name.endsWith('.png')
	) {
		return 'image';
	}
	return null;
};

export const fileToBase64 = (file: File) =>
	new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = String(reader.result || '');
			const comma = result.indexOf(',');
			resolve(comma >= 0 ? result.slice(comma + 1) : result);
		};
		reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
		reader.readAsDataURL(file);
	});

export const receiptFileSignature = (file: File) =>
	`${file.name}|${file.size}|${file.lastModified}`;
