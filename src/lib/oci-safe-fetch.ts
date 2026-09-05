export const OCI_OBJECT_HOST_RE = /^objectstorage\.[a-z0-9-]+\.oraclecloud\.com$/i;

export const OCI_FETCH_MAX_BYTES = 8 * 1024 * 1024;
export const OCI_FETCH_TIMEOUT_MS = 30_000;

export class OciSafeFetchError extends Error {
	status: number;
	code: string;

	constructor(message: string, status = 400, code = 'OCI_FETCH_DENIED') {
		super(message);
		this.name = 'OciSafeFetchError';
		this.status = status;
		this.code = code;
	}
}

export const assertSafeOciHttpsUrl = (raw: string): URL => {
	const trimmed = String(raw || '').trim();
	if (!trimmed) {
		throw new OciSafeFetchError('URL vacía.', 400, 'INVALID_URL');
	}

	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		throw new OciSafeFetchError('URL inválida.', 400, 'INVALID_URL');
	}

	if (parsed.protocol !== 'https:') {
		throw new OciSafeFetchError('Solo se permiten URLs HTTPS.', 400, 'INSECURE_URL');
	}
	if (parsed.username || parsed.password) {
		throw new OciSafeFetchError('La URL no puede incluir credenciales.', 400, 'INVALID_URL');
	}
	if (parsed.port && parsed.port !== '443') {
		throw new OciSafeFetchError('Puerto no permitido.', 400, 'INVALID_URL');
	}
	if (!OCI_OBJECT_HOST_RE.test(parsed.hostname)) {
		throw new OciSafeFetchError('Host no permitido.', 400, 'HOST_DENIED');
	}

	return parsed;
};

export const fetchOciObject = async (
	rawUrl: string,
	options?: {
		maxBytes?: number;
		timeoutMs?: number;
		accept?: string;
		fetchImpl?: typeof fetch;
	}
): Promise<Response> => {
	const url = assertSafeOciHttpsUrl(rawUrl);
	const maxBytes = options?.maxBytes ?? OCI_FETCH_MAX_BYTES;
	const timeoutMs = options?.timeoutMs ?? OCI_FETCH_TIMEOUT_MS;
	const fetchFn = options?.fetchImpl ?? fetch;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	let response: Response;
	try {
		response = await fetchFn(url, {
			method: 'GET',
			redirect: 'manual',
			signal: controller.signal,
			headers: options?.accept ? { Accept: options.accept } : undefined,
		});
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			throw new OciSafeFetchError(`Timeout al descargar (${timeoutMs}ms).`, 504, 'FETCH_TIMEOUT');
		}
		throw new OciSafeFetchError(
			error instanceof Error ? error.message : 'Error de red.',
			502,
			'FETCH_NETWORK'
		);
	} finally {
		clearTimeout(timer);
	}

	if (response.status >= 300 && response.status < 400) {
		throw new OciSafeFetchError('Redirects no permitidos.', 502, 'REDIRECT_DENIED');
	}
	if (!response.ok || !response.body) {
		throw new OciSafeFetchError(
			`No se pudo leer el objeto (HTTP ${response.status}).`,
			502,
			'FETCH_HTTP'
		);
	}

	const contentLength = Number(response.headers.get('content-length') || 0);
	if (contentLength > maxBytes) {
		throw new OciSafeFetchError(
			`El archivo es demasiado grande (${contentLength} > ${maxBytes} bytes).`,
			413,
			'TOO_LARGE'
		);
	}

	return response;
};

export const readOciBytesCapped = async (
	response: Response,
	maxBytes = OCI_FETCH_MAX_BYTES
): Promise<Uint8Array> => {
	const buffer = new Uint8Array(await response.arrayBuffer());
	if (buffer.byteLength > maxBytes) {
		throw new OciSafeFetchError(
			`El archivo es demasiado grande (${buffer.byteLength} > ${maxBytes} bytes).`,
			413,
			'TOO_LARGE'
		);
	}
	if (buffer.byteLength === 0) {
		throw new OciSafeFetchError('El archivo está vacío.', 502, 'EMPTY_BODY');
	}
	return buffer;
};
