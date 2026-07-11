export type RefundPolicyCode = 'FLEXIBLE' | 'MODERATE' | 'STRICT';

export interface SipapBankDetails {
	bank_name?: string | null;
	account_holder?: string | null;
	document_id?: string | null;
	bank_alias?: string | null;
}

export interface PublicDepositSettings {
	deposits_enabled?: 0 | 1 | boolean;
	refund_policy?: RefundPolicyCode | string | null;
	refund_policy_label?: string | null;
	refund_policy_summary?: string | null;
	sipap?: SipapBankDetails | null;
}

export interface SipapHoldResponse {
	appointment_id?: number;
	payment_status?: string;
	deposit_amount?: number;
	payment_expires_at?: string;
	payment_reference?: string;
	public_manage_token?: string;
	provider?: string;
	sipap?: SipapBankDetails;
	refund_policy?: string;
	refund_policy_label?: string;
	refund_policy_summary?: string;
	message?: string;
	data?: SipapHoldResponse;
}

export interface SipapReceiptUploadResult {
	message?: string;
	ocr_status?: string;
	payment_status?: string;
	receipt_url?: string;
}

export const POLICY_LABELS: Record<RefundPolicyCode, string> = {
	FLEXIBLE: 'Flexible',
	MODERATE: 'Moderada',
	STRICT: 'Estricta (no reembolsable)',
};

export const POLICY_SUMMARIES: Record<RefundPolicyCode, string> = {
	FLEXIBLE: 'Reembolso del 100% de la seña si cancelás con más de 24 hs de anticipación.',
	MODERATE:
		'Reembolso del 50% si cancelás con más de 24 hs. Cancelaciones de último momento no tienen devolución.',
	STRICT:
		'La seña no se devuelve si cancelás vos. Solo se reintegra si el comercio cancela el turno.',
};

export const normalizePolicyCode = (value: unknown): RefundPolicyCode | null => {
	const code = String(value || '')
		.trim()
		.toUpperCase();
	if (code === 'FLEXIBLE' || code === 'MODERATE' || code === 'STRICT') return code;
	return null;
};

export const isDepositsEnabled = (settings?: PublicDepositSettings | null) =>
	settings?.deposits_enabled === true || Number(settings?.deposits_enabled) === 1;

export const unwrapSipapHold = (payload: SipapHoldResponse | null | undefined): SipapHoldResponse => {
	if (!payload || typeof payload !== 'object') return {};
	if (payload.data && typeof payload.data === 'object') {
		return { ...payload, ...payload.data };
	}
	return payload;
};

export const fillSipapDepositPanel = (
	root: ParentNode,
	hold: SipapHoldResponse,
	fallbackSettings?: PublicDepositSettings | null
) => {
	const amount = Number(hold.deposit_amount || 0);
	const reference = String(hold.payment_reference || '').trim();
	const sipap = hold.sipap || fallbackSettings?.sipap || {};
	const policyCode =
		normalizePolicyCode(hold.refund_policy) ||
		normalizePolicyCode(fallbackSettings?.refund_policy);
	const policyLabel =
		String(hold.refund_policy_label || fallbackSettings?.refund_policy_label || '').trim() ||
		(policyCode ? POLICY_LABELS[policyCode] : '');
	const policySummary =
		String(hold.refund_policy_summary || fallbackSettings?.refund_policy_summary || '').trim() ||
		(policyCode ? POLICY_SUMMARIES[policyCode] : '');

	const setText = (selector: string, value: string) => {
		const el = root.querySelector<HTMLElement>(selector);
		if (el) el.textContent = value || '—';
	};

	setText(
		'[data-sipap-amount]',
		Number.isFinite(amount) && amount > 0
			? new Intl.NumberFormat('es-PY', {
					style: 'currency',
					currency: 'PYG',
					maximumFractionDigits: 0,
				}).format(amount)
			: '—'
	);
	setText('[data-sipap-reference]', reference || '—');
	setText('[data-sipap-bank]', String(sipap.bank_name || '').trim());
	setText('[data-sipap-holder]', String(sipap.account_holder || '').trim());
	setText('[data-sipap-document]', String(sipap.document_id || '').trim());
	setText('[data-sipap-alias]', String(sipap.bank_alias || '').trim());
	setText('[data-sipap-policy-label]', policyLabel);
	setText('[data-sipap-policy-summary]', policySummary);

	const refInput = root.querySelector<HTMLInputElement>('[data-sipap-reference-value]');
	if (refInput) refInput.value = reference;

	const tokenInput = root.querySelector<HTMLInputElement>('[data-sipap-manage-token]');
	const token = String(hold.public_manage_token || '').trim();
	if (tokenInput) tokenInput.value = token;

	const uploadBlock = root.querySelector<HTMLElement>('[data-sipap-upload]');
	if (uploadBlock) {
		uploadBlock.classList.toggle('hidden', !token);
	}

	setSipapReceiptStatus(root, null);
};

export const setSipapReceiptStatus = (
	root: ParentNode,
	result: SipapReceiptUploadResult | null,
	phase?: 'idle' | 'uploading' | 'done' | 'error'
) => {
	const statusEl = root.querySelector<HTMLElement>('[data-sipap-upload-status]');
	const submitBtn = root.querySelector<HTMLButtonElement>('[data-sipap-upload-submit]');
	const fileInput = root.querySelector<HTMLInputElement>('[data-sipap-upload-input]');

	if (!statusEl) return;

	if (phase === 'uploading') {
		statusEl.textContent = 'Leyendo comprobante…';
		statusEl.dataset.state = 'loading';
		if (submitBtn) submitBtn.disabled = true;
		if (fileInput) fileInput.disabled = true;
		return;
	}

	if (phase === 'error') {
		statusEl.textContent = result?.message || 'No fue posible subir el comprobante.';
		statusEl.dataset.state = 'error';
		if (submitBtn) submitBtn.disabled = false;
		if (fileInput) fileInput.disabled = false;
		return;
	}

	if (!result) {
		statusEl.textContent = '';
		statusEl.dataset.state = 'idle';
		if (submitBtn) submitBtn.disabled = false;
		if (fileInput) fileInput.disabled = false;
		return;
	}

	const ocr = String(result.ocr_status || '').toUpperCase();
	let text = result.message || 'Comprobante recibido.';
	if (ocr === 'MATCH') {
		text = result.message || 'Pago verificado. Tu turno quedó confirmado.';
	} else if (ocr === 'MISMATCH' || ocr === 'MANUAL_REVIEW' || ocr === 'FAILED') {
		text = result.message || 'Comprobante recibido. El comercio lo revisará.';
	}

	statusEl.textContent = text;
	statusEl.dataset.state = ocr === 'MATCH' ? 'success' : 'review';
	if (submitBtn) {
		submitBtn.disabled = ocr === 'MATCH';
		if (ocr === 'MATCH') submitBtn.textContent = 'Confirmado';
	}
	if (fileInput) fileInput.disabled = ocr === 'MATCH';
};

const fileToBase64 = (file: File) =>
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

export const bindSipapReceiptUpload = (
	root: ParentNode,
	options?: {
		signal?: AbortSignal;
		onResult?: (result: SipapReceiptUploadResult) => void;
		onError?: (message: string) => void;
	}
) => {
	const form = root.querySelector<HTMLElement>('[data-sipap-upload]');
	const submitBtn = root.querySelector<HTMLButtonElement>('[data-sipap-upload-submit]');
	const fileInput = root.querySelector<HTMLInputElement>('[data-sipap-upload-input]');
	const tokenInput = root.querySelector<HTMLInputElement>('[data-sipap-manage-token]');

	if (!form || !submitBtn || !fileInput || !tokenInput) return;

	const upload = async () => {
		const token = String(tokenInput.value || '').trim();
		const file = fileInput.files?.[0];
		if (!token) {
			setSipapReceiptStatus(root, { message: 'Falta el token de la reserva.' }, 'error');
			options?.onError?.('Falta el token de la reserva.');
			return;
		}
		if (!file) {
			setSipapReceiptStatus(root, { message: 'Elegí una foto del comprobante.' }, 'error');
			options?.onError?.('Elegí una foto del comprobante.');
			return;
		}
		if (file.size > 8 * 1024 * 1024) {
			setSipapReceiptStatus(root, { message: 'El archivo supera 8 MB.' }, 'error');
			options?.onError?.('El archivo supera 8 MB.');
			return;
		}

		setSipapReceiptStatus(root, null, 'uploading');
		try {
			const file_base64 = await fileToBase64(file);
			const response = await fetch(
				`/api/public/reservations/${encodeURIComponent(token)}/receipt`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
					body: JSON.stringify({
						file_base64,
						filename: file.name || 'comprobante.jpg',
						mime_type: file.type || 'image/jpeg',
					}),
					signal: options?.signal,
				}
			);
			const data = await response.json().catch(() => ({}));
			if (!response.ok || data.status !== 'success') {
				const message = String(data.message || 'No fue posible subir el comprobante.');
				setSipapReceiptStatus(root, { message }, 'error');
				options?.onError?.(message);
				return;
			}
			const result: SipapReceiptUploadResult = {
				message: String(data.message || '').trim(),
				...(data.data && typeof data.data === 'object' ? data.data : {}),
			};
			setSipapReceiptStatus(root, result, 'done');
			options?.onResult?.(result);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'No fue posible subir el comprobante.';
			setSipapReceiptStatus(root, { message }, 'error');
			options?.onError?.(message);
		}
	};

	submitBtn.addEventListener(
		'click',
		(event) => {
			event.preventDefault();
			void upload();
		},
		{ signal: options?.signal }
	);
};

export const bindSipapCopyButtons = (root: ParentNode, signal?: AbortSignal) => {
	root.querySelectorAll<HTMLButtonElement>('[data-sipap-copy]').forEach((button) => {
		button.addEventListener(
			'click',
			async () => {
				const target = String(button.dataset.sipapCopy || '').trim();
				const source =
					target === 'reference'
						? root.querySelector<HTMLElement>('[data-sipap-reference]')
						: root.querySelector<HTMLElement>(`[data-sipap-${target}]`);
				const text = String(source?.textContent || '').trim();
				if (!text || text === '—') return;
				try {
					await navigator.clipboard.writeText(text);
					const prev = button.textContent;
					button.textContent = 'Copiado';
					window.setTimeout(() => {
						button.textContent = prev;
					}, 1600);
				} catch {
					/* ignore */
				}
			},
			{ signal }
		);
	});
};
