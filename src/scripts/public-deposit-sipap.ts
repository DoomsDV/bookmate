import { prepareReceiptUploadFile } from '../lib/pdf-receipt-to-image';
import { createIdempotencyKey } from '../lib/idempotency';

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
	FLEXIBLE: 'Reembolso total cancelando hasta 24 hs antes del turno.',
	MODERATE:
		'Reembolso del 50% cancelando hasta 24 hs antes. Las cancelaciones posteriores no tienen devolución.',
	STRICT: 'Las cancelaciones no tienen reembolso de la seña en ningún caso.',
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

	let current: SipapHoldResponse = payload;
	// API Astro/ORDS puede anidar el hold en data (a veces dos niveles).
	for (let depth = 0; depth < 4; depth += 1) {
		const nested = current.data;
		if (!nested || typeof nested !== 'object') break;
		current = { ...current, ...nested };
		if (String(current.payment_reference || '').trim()) break;
	}

	return current;
};

export const fillSipapDepositPanel = (
	root: ParentNode,
	hold: SipapHoldResponse,
	fallbackSettings?: PublicDepositSettings | null,
	context?: {
		serviceName?: string | null;
		professionalName?: string | null;
		depositAmount?: number | null;
	}
) => {
	const amountFromHold = Number(hold.deposit_amount || 0);
	const amountFromContext = Number(context?.depositAmount || 0);
	const amount =
		Number.isFinite(amountFromHold) && amountFromHold > 0
			? amountFromHold
			: Number.isFinite(amountFromContext) && amountFromContext > 0
				? amountFromContext
				: 0;
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
		amount > 0
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

	const serviceName = String(context?.serviceName || '').trim();
	const professionalName = String(context?.professionalName || '').trim();
	const forLabel = serviceName
		? professionalName
			? `Seña por: ${serviceName} con ${professionalName}`
			: `Seña por: ${serviceName}`
		: 'Seña por: —';
	setText('[data-sipap-for]', forLabel);

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
	startSipapHoldCountdown(root, hold.payment_expires_at);
};

const countdownTimers = new WeakMap<Element, number>();

const formatCountdown = (remainingMs: number) => {
	const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const stopSipapHoldCountdown = (root: ParentNode) => {
	if (!(root instanceof Element)) return;
	const previous = countdownTimers.get(root);
	if (previous) {
		window.clearInterval(previous);
		countdownTimers.delete(root);
	}
};

export const startSipapHoldCountdown = (
	root: ParentNode,
	expiresAt?: string | null,
	fallbackMinutes = 10
) => {
	const countdownEl = root.querySelector<HTMLElement>('[data-sipap-countdown]');
	if (!countdownEl || !(root instanceof Element)) return;

	stopSipapHoldCountdown(root);

	const parsed = expiresAt ? Date.parse(String(expiresAt)) : Number.NaN;
	const expiresMs = Number.isFinite(parsed)
		? parsed
		: Date.now() + Math.max(1, fallbackMinutes) * 60 * 1000;

	const tick = () => {
		const remaining = expiresMs - Date.now();
		countdownEl.textContent = formatCountdown(remaining);
		if (remaining <= 0) {
			stopSipapHoldCountdown(root);
			countdownEl.textContent = '00:00';
		}
	};

	tick();
	countdownTimers.set(root, window.setInterval(tick, 1000));
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

	// Idempotency-Key: se reutiliza mientras el reintento sea sobre el MISMO archivo (retry
	// por fallo de red); si el usuario elige otro archivo se genera una key nueva.
	let idemKey: string | null = null;
	let idemFileSignature: string | null = null;

	const upload = async () => {
		const token = String(tokenInput.value || '').trim();
		const file = fileInput.files?.[0];
		if (!token) {
			setSipapReceiptStatus(root, { message: 'Falta el token de la reserva.' }, 'error');
			options?.onError?.('Falta el token de la reserva.');
			return;
		}
		if (!file) {
			setSipapReceiptStatus(root, { message: 'Elegí el comprobante (imagen o PDF).' }, 'error');
			options?.onError?.('Elegí el comprobante (imagen o PDF).');
			return;
		}
		const fileName = String(file.name || '').toLowerCase();
		const isImage = file.type.startsWith('image/');
		const isPdf = file.type === 'application/pdf' || fileName.endsWith('.pdf');
		if (!isImage && !isPdf) {
			setSipapReceiptStatus(
				root,
				{ message: 'Formato no válido. Subí una imagen (JPG/PNG) o un PDF.' },
				'error'
			);
			options?.onError?.('Formato no válido. Subí una imagen (JPG/PNG) o un PDF.');
			return;
		}
		if (file.size > 8 * 1024 * 1024) {
			setSipapReceiptStatus(root, { message: 'El archivo supera 8 MB.' }, 'error');
			options?.onError?.('El archivo supera 8 MB.');
			return;
		}

		const fileSignature = `${file.name}|${file.size}|${file.lastModified}`;
		if (!idemKey || idemFileSignature !== fileSignature) {
			idemKey = createIdempotencyKey();
			idemFileSignature = fileSignature;
		}

		setSipapReceiptStatus(root, null, 'uploading');
		try {
			// PDF → JPEG silencioso para OCR; si falla el render, se sube el PDF (MANUAL_REVIEW).
			const uploadFile = await prepareReceiptUploadFile(file);
			const uploadIsPdf =
				uploadFile.type === 'application/pdf' ||
				String(uploadFile.name || '')
					.toLowerCase()
					.endsWith('.pdf');
			const file_base64 = await fileToBase64(uploadFile);
			const resolvedMime =
				uploadFile.type || (uploadIsPdf ? 'application/pdf' : 'image/jpeg');
			const resolvedName =
				uploadFile.name || (uploadIsPdf ? 'comprobante.pdf' : 'comprobante.jpg');
			const response = await fetch(
				`/api/public/reservations/${encodeURIComponent(token)}/receipt`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Accept: 'application/json',
						'Idempotency-Key': idemKey,
					},
					body: JSON.stringify({
						file_base64,
						filename: resolvedName,
						mime_type: resolvedMime,
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
			idemKey = null;
			idemFileSignature = null;
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
					const icon = button.querySelector<HTMLElement>('[data-sipap-copy-icon]');
					const label = button.querySelector<HTMLElement>('[data-sipap-copy-label]');
					if (icon || label) {
						const prevIcon = icon?.textContent || 'content_copy';
						const prevLabel = label?.textContent || '';
						if (icon) icon.textContent = 'check';
						if (label) label.textContent = 'Copiado';
						button.classList.add('is-copied');
						window.setTimeout(() => {
							if (icon) icon.textContent = prevIcon;
							if (label) label.textContent = prevLabel;
							button.classList.remove('is-copied');
						}, 1600);
						return;
					}
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
