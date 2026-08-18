export interface ReceiptUploadPayload {
	file_base64: string;
	filename: string;
	mime_type: string;
}

export interface ReceiptUploadResult {
	message?: string;
	ocr_status?: string;
	payment_status?: string;
	receipt_url?: string;
}

const CONFIRMED_PAYMENT_STATUSES = new Set(['PAID_TRANSFER', 'PAID', 'PAID_CASH', 'EXEMPT']);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const isDepositConfirmed = (reservation: {
	payment_status?: string | null;
	status?: string;
}) => {
	const pay = String(reservation.payment_status || '').trim().toUpperCase();
	const st = String(reservation.status || '').trim().toUpperCase();
	return CONFIRMED_PAYMENT_STATUSES.has(pay) || st === 'CONFIRMADO';
};

const parseReceiptUploadSuccess = (data: Record<string, unknown>): ReceiptUploadResult => ({
	message: String(data.message || '').trim(),
	...(data.data && typeof data.data === 'object'
		? (data.data as ReceiptUploadResult)
		: {}),
});

export const postReceiptUpload = async (
	token: string,
	idemKey: string,
	payload: ReceiptUploadPayload,
	signal?: AbortSignal
): Promise<
	| { ok: true; result: ReceiptUploadResult }
	| { ok: false; status: number; message: string }
> => {
	const response = await fetch(`/api/public/reservations/${encodeURIComponent(token)}/receipt`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			'Idempotency-Key': idemKey,
		},
		body: JSON.stringify(payload),
		signal,
	});
	const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
	if (response.ok && data.status === 'success') {
		return { ok: true, result: parseReceiptUploadSuccess(data) };
	}
	return {
		ok: false,
		status: response.status,
		message: String(data.message || 'No fue posible subir el comprobante.'),
	};
};

export const fetchReservationStatus = async (
	token: string,
	signal?: AbortSignal
): Promise<{ payment_status?: string | null; status?: string } | null> => {
	const response = await fetch(`/api/public/reservations/${encodeURIComponent(token)}`, {
		method: 'GET',
		headers: { Accept: 'application/json' },
		signal,
	});
	const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
	if (!response.ok || data.status !== 'success' || !data.data || typeof data.data !== 'object') {
		return null;
	}
	return data.data as { payment_status?: string | null; status?: string };
};

/**
 * Tras un POST fallido (timeout/500), reintenta idempotencia y consulta estado de la reserva.
 */
export const reconcileReceiptUpload = async (
	token: string,
	idemKey: string,
	payload: ReceiptUploadPayload,
	options?: { signal?: AbortSignal; onVerifying?: () => void }
): Promise<ReceiptUploadResult | null> => {
	options?.onVerifying?.();

	const retry = await postReceiptUpload(token, idemKey, payload, options?.signal);
	if (retry.ok) {
		return retry.result;
	}

	const pollDelaysMs = [1000, 2000, 3000];
	for (const delayMs of pollDelaysMs) {
		await sleep(delayMs);
		if (options?.signal?.aborted) return null;

		const reservation = await fetchReservationStatus(token, options?.signal);
		if (reservation && isDepositConfirmed(reservation)) {
			return {
				message: 'Pago verificado. Tu turno quedó confirmado.',
				ocr_status: 'MATCH',
				payment_status: String(reservation.payment_status || 'PAID_TRANSFER'),
			};
		}
	}

	return null;
};
