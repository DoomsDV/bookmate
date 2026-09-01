/**
 * Helpers puros para la descarga autenticada del KuDE (PDF fiscal).
 * Separados del endpoint Astro para poder probar autorización y headers.
 */

export const KUDE_PDF_MAX_BYTES = 8 * 1024 * 1024;
export const KUDE_PDF_TIMEOUT_MS = 30_000;

export class InvoicePdfError extends Error {
	status: number;
	code: string;

	constructor(message: string, status = 400, code = 'INVOICE_PDF_ERROR') {
		super(message);
		this.name = 'InvoicePdfError';
		this.status = status;
		this.code = code;
	}
}

export const parseInvoiceIdParam = (raw: string | undefined): number => {
	const id = Number(String(raw || '').trim());
	if (!Number.isFinite(id) || id <= 0 || !Number.isInteger(id)) {
		throw new InvoicePdfError('invoice_id inválido.', 400, 'INVALID_INVOICE_ID');
	}
	return id;
};

export const buildInvoicePdfFilename = (cdc: string | null | undefined, invoiceId: number): string => {
	const cleanCdc = String(cdc || '')
		.trim()
		.replace(/[^a-zA-Z0-9_-]/g, '');
	if (cleanCdc) return `factura-${cleanCdc}.pdf`;
	return `factura-${invoiceId}.pdf`;
};

export const buildInvoicePdfHeaders = (filename: string, byteLength: number): HeadersInit => ({
	'Content-Type': 'application/pdf',
	'Content-Length': String(byteLength),
	'Content-Disposition': `attachment; filename="${filename}"`,
	'Cache-Control': 'no-store',
});

export const assertPdfBytes = (bytes: Uint8Array, maxBytes = KUDE_PDF_MAX_BYTES): void => {
	if (!bytes || bytes.byteLength === 0) {
		throw new InvoicePdfError('El PDF de la factura está vacío.', 502, 'EMPTY_PDF');
	}
	if (bytes.byteLength > maxBytes) {
		throw new InvoicePdfError(
			`El PDF es demasiado grande (${bytes.byteLength} > ${maxBytes} bytes).`,
			413,
			'PDF_TOO_LARGE'
		);
	}
	// %PDF
	if (bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) {
		throw new InvoicePdfError('La respuesta no es un PDF válido.', 502, 'INVALID_PDF');
	}
};

export const fetchKudePdfBytes = async (
	kudeUrl: string,
	options?: { maxBytes?: number; timeoutMs?: number; fetchImpl?: typeof fetch }
): Promise<Uint8Array> => {
	const url = String(kudeUrl || '').trim();
	if (!url || !/^https?:\/\//i.test(url)) {
		throw new InvoicePdfError('URL de KuDE inválida.', 502, 'INVALID_KUDE_URL');
	}

	const maxBytes = options?.maxBytes ?? KUDE_PDF_MAX_BYTES;
	const timeoutMs = options?.timeoutMs ?? KUDE_PDF_TIMEOUT_MS;
	const fetchFn = options?.fetchImpl ?? fetch;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	let response: Response;
	try {
		response = await fetchFn(url, {
			method: 'GET',
			headers: { Accept: 'application/pdf,*/*' },
			signal: controller.signal,
			redirect: 'follow',
		});
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			throw new InvoicePdfError(`Timeout al descargar el PDF (${timeoutMs}ms).`, 504, 'PDF_TIMEOUT');
		}
		throw new InvoicePdfError(
			error instanceof Error ? error.message : 'Error de red al descargar el PDF.',
			502,
			'PDF_NETWORK'
		);
	} finally {
		clearTimeout(timer);
	}

	if (!response.ok) {
		throw new InvoicePdfError(
			`No se pudo descargar el KuDE (HTTP ${response.status}).`,
			502,
			'PDF_HTTP'
		);
	}

	const contentLength = Number(response.headers.get('content-length') || 0);
	if (contentLength > maxBytes) {
		throw new InvoicePdfError(
			`El PDF es demasiado grande (${contentLength} > ${maxBytes} bytes).`,
			413,
			'PDF_TOO_LARGE'
		);
	}

	const buffer = new Uint8Array(await response.arrayBuffer());
	assertPdfBytes(buffer, maxBytes);
	return buffer;
};
