import { showFlashMessage } from '../lib/flash';
import { createIdempotencyKey } from '../lib/idempotency';
import {
	reconcileReceiptUpload,
	type ReceiptUploadPayload,
} from '../lib/public-receipt-reconcile';

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
	ocr_status?: string | null;
	receipt_rejected?: boolean;
	reject_reason?: string | null;
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

const SUBMIT_IDLE_LABEL = 'Confirmar y enviar comprobante';
const SUBMIT_CONFIRMED_LABEL = 'Confirmado';
const SUBMIT_SENT_LABEL = 'Comprobante enviado';
const SUBMIT_LOADING_LABEL = 'Enviando…';
const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
const RECEIPT_IMAGE_MIMES = new Set(['image/jpeg', 'image/png']);
const RECEIPT_PDF_MIMES = new Set(['application/pdf']);

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

const fieldText = (root: ParentNode, selector: string) => {
	const value = String(root.querySelector<HTMLElement>(selector)?.textContent || '').trim();
	return !value || value === '—' ? '' : value;
};

export const formatSipapTransferClipboard = (root: ParentNode) => {
	const parts: string[] = [];
	const bank = fieldText(root, '[data-sipap-bank]');
	const holder = fieldText(root, '[data-sipap-holder]');
	const document = fieldText(root, '[data-sipap-document]');
	const alias = fieldText(root, '[data-sipap-alias]');
	const reference =
		fieldText(root, '[data-sipap-reference]') ||
		String(root.querySelector<HTMLInputElement>('[data-sipap-reference-value]')?.value || '').trim();
	if (bank) parts.push(bank);
	if (holder) parts.push(holder);
	if (document) parts.push(`C.I. ${document}`);
	if (alias) parts.push(`Alias: ${alias}`);
	if (reference) parts.push(`Concepto: ${reference}`);
	return parts.join(' - ');
};

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

const isAbortError = (error: unknown) =>
	(error instanceof DOMException && error.name === 'AbortError') ||
	(error instanceof Error && error.name === 'AbortError');

const isHoldExpired = (root: ParentNode) =>
	Boolean(root.querySelector('[data-sipap-hold-banner].is-expired'));

const hasSelectedFile = (root: ParentNode) => {
	const input = root.querySelector<HTMLInputElement>('[data-sipap-upload-input]');
	return Boolean(input?.files?.[0]);
};

const previewUrls = new WeakMap<Element, string>();

const revokeReceiptPreviewUrl = (root: ParentNode) => {
	if (!(root instanceof Element)) return;
	const url = previewUrls.get(root);
	if (!url) return;
	URL.revokeObjectURL(url);
	previewUrls.delete(root);
};

const setHoldLive = (root: ParentNode, message: string) => {
	const live = root.querySelector<HTMLElement>('[data-sipap-hold-live]');
	if (live) live.textContent = message;
};

const setHoldVisibleState = (
	root: ParentNode,
	state: 'active' | 'expired' | 'unknown' | 'submitted'
) => {
	const banner = root.querySelector<HTMLElement>('[data-sipap-hold-banner]');
	const active = root.querySelector<HTMLElement>('[data-sipap-hold-active]');
	const expired = root.querySelector<HTMLElement>('[data-sipap-hold-expired]');
	const unknown = root.querySelector<HTMLElement>('[data-sipap-hold-unknown]');
	const submitted = root.querySelector<HTMLElement>('[data-sipap-hold-submitted]');
	banner?.classList.toggle('is-expired', state === 'expired');
	banner?.classList.toggle('is-submitted', state === 'submitted');
	if (banner) banner.dataset.sipapHoldState = state;
	active?.classList.toggle('hidden', state !== 'active');
	expired?.classList.toggle('hidden', state !== 'expired');
	unknown?.classList.toggle('hidden', state !== 'unknown');
	submitted?.classList.toggle('hidden', state !== 'submitted');
};

const isHoldFrozen = (root: ParentNode) => {
	const banner = root.querySelector<HTMLElement>('[data-sipap-hold-banner]');
	const submitBtn = root.querySelector<HTMLButtonElement>('[data-sipap-upload-submit]');
	return banner?.dataset.sipapHoldFrozen === '1' || submitBtn?.dataset.sipapSubmitted === '1';
};

const freezeHoldCountdown = (root: ParentNode) => {
	const banner = root.querySelector<HTMLElement>('[data-sipap-hold-banner]');
	if (banner) banner.dataset.sipapHoldFrozen = '1';
	setHoldVisibleState(root, 'submitted');
	stopSipapHoldCountdown(root);
};

const lockReceiptDropzone = (root: ParentNode, locked: boolean) => {
	const dropzone = root.querySelector<HTMLElement>('[data-sipap-dropzone]');
	const fileInput = root.querySelector<HTMLInputElement>('[data-sipap-upload-input]');
	const clearBtn = root.querySelector<HTMLButtonElement>('[data-sipap-preview-clear]');
	dropzone?.classList.toggle('is-locked', locked);
	dropzone?.setAttribute('aria-disabled', locked ? 'true' : 'false');
	if (fileInput) fileInput.disabled = locked;
	if (clearBtn) clearBtn.disabled = locked;
};

const setSubmitLabel = (submitBtn: HTMLButtonElement, label: string) => {
	const labelEl = submitBtn.querySelector<HTMLElement>('[data-sipap-submit-label]');
	if (labelEl) {
		labelEl.textContent = label;
		return;
	}
	submitBtn.textContent = label;
};

const setSubmitLoading = (submitBtn: HTMLButtonElement, loading: boolean) => {
	submitBtn.classList.toggle('is-loading', loading);
	submitBtn.setAttribute('aria-busy', loading ? 'true' : 'false');
	if (loading) {
		setSubmitLabel(submitBtn, SUBMIT_LOADING_LABEL);
	}
};

const lockSubmitAfterSend = (
	root: ParentNode,
	label: string = SUBMIT_SENT_LABEL
) => {
	const submitBtn = root.querySelector<HTMLButtonElement>('[data-sipap-upload-submit]');
	if (!submitBtn) return;
	setSubmitLoading(submitBtn, false);
	submitBtn.disabled = true;
	submitBtn.dataset.sipapSubmitted = '1';
	setSubmitLabel(submitBtn, label);
	lockReceiptDropzone(root, true);
};

const syncSubmitEnabled = (root: ParentNode, confirmed = false) => {
	const submitBtn = root.querySelector<HTMLButtonElement>('[data-sipap-upload-submit]');
	if (!submitBtn) return;
	if (submitBtn.dataset.sipapSubmitted === '1' || confirmed) {
		lockSubmitAfterSend(root, confirmed ? SUBMIT_CONFIRMED_LABEL : SUBMIT_SENT_LABEL);
		return;
	}
	if (isHoldFrozen(root)) {
		submitBtn.disabled = true;
		lockReceiptDropzone(root, true);
		return;
	}
	setSubmitLoading(submitBtn, false);
	setSubmitLabel(submitBtn, SUBMIT_IDLE_LABEL);
	const locked = isHoldExpired(root);
	submitBtn.disabled = locked || !hasSelectedFile(root);
	lockReceiptDropzone(root, locked);
};

export const resetSipapReceiptPreview = (root: ParentNode) => {
	revokeReceiptPreviewUrl(root);
	const fileInput = root.querySelector<HTMLInputElement>('[data-sipap-upload-input]');
	const dropzone = root.querySelector<HTMLElement>('[data-sipap-dropzone]');
	const empty = root.querySelector<HTMLElement>('[data-sipap-dropzone-empty]');
	const preview = root.querySelector<HTMLElement>('[data-sipap-dropzone-preview]');
	const image = root.querySelector<HTMLImageElement>('[data-sipap-preview-image]');
	const pdf = root.querySelector<HTMLElement>('[data-sipap-preview-pdf]');
	const name = root.querySelector<HTMLElement>('[data-sipap-preview-name]');
	if (fileInput) fileInput.value = '';
	dropzone?.classList.remove('has-preview', 'is-dragging');
	dropzone?.parentElement?.classList.remove('has-preview');
	empty?.classList.remove('hidden');
	preview?.classList.add('hidden');
	root.querySelector<HTMLElement>('[data-sipap-preview-clear]')?.classList.add('hidden');
	image?.classList.add('hidden');
	if (image) image.removeAttribute('src');
	pdf?.classList.add('hidden');
	if (name) name.textContent = '';
};

const showReceiptPreview = (root: ParentNode, file: File, kind: 'image' | 'pdf') => {
	revokeReceiptPreviewUrl(root);
	const dropzone = root.querySelector<HTMLElement>('[data-sipap-dropzone]');
	const empty = root.querySelector<HTMLElement>('[data-sipap-dropzone-empty]');
	const preview = root.querySelector<HTMLElement>('[data-sipap-dropzone-preview]');
	const image = root.querySelector<HTMLImageElement>('[data-sipap-preview-image]');
	const pdf = root.querySelector<HTMLElement>('[data-sipap-preview-pdf]');
	const name = root.querySelector<HTMLElement>('[data-sipap-preview-name]');
	dropzone?.classList.add('has-preview');
	dropzone?.parentElement?.classList.add('has-preview');
	empty?.classList.add('hidden');
	preview?.classList.remove('hidden');
	root.querySelector<HTMLElement>('[data-sipap-preview-clear]')?.classList.remove('hidden');
	if (kind === 'image' && image && root instanceof Element) {
		const url = URL.createObjectURL(file);
		previewUrls.set(root, url);
		image.src = url;
		image.classList.remove('hidden');
		pdf?.classList.add('hidden');
		return;
	}
	image?.classList.add('hidden');
	if (image) image.removeAttribute('src');
	pdf?.classList.remove('hidden');
	if (name) name.textContent = file.name || 'comprobante.pdf';
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
		const text = value || '—';
		root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
			el.textContent = text;
		});
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

	const uploadSection = root.querySelector<HTMLElement>('[data-sipap-upload-section]');
	if (uploadSection) {
		uploadSection.classList.toggle('hidden', !token);
	}

	resetSipapReceiptPreview(root);

	const ocrStatus = String(hold.ocr_status || '').toUpperCase();
	const hasRejection =
		hold.receipt_rejected === true ||
		Number(hold.receipt_rejected) === 1 ||
		String(hold.receipt_rejected || '').trim().toLowerCase() === 'true' ||
		(hold.receipt_rejected == null && Boolean(String(hold.reject_reason || '').trim()));
	setSipapRejectAlert(root, hasRejection);
	const banner = root.querySelector<HTMLElement>('[data-sipap-hold-banner]');
	const submitBtn = root.querySelector<HTMLButtonElement>('[data-sipap-upload-submit]');
	const alreadyFrozen =
		banner?.dataset.sipapHoldFrozen === '1' || submitBtn?.dataset.sipapSubmitted === '1';

	if (ocrStatus === 'MATCH') {
		setSipapRejectAlert(root, false);
		freezeHoldCountdown(root);
		banner?.classList.add('hidden');
		lockSubmitAfterSend(root, SUBMIT_CONFIRMED_LABEL);
		return;
	}

	if (hasRejection) {
		if (banner) delete banner.dataset.sipapHoldFrozen;
		if (submitBtn) delete submitBtn.dataset.sipapSubmitted;
		setSipapReceiptStatus(root, null);
		startSipapHoldCountdown(root, hold.payment_expires_at);
		return;
	}

	// Comprobante ya enviado (hold persistido, banner frozen o botón locked): no reiniciar
	// el countdown. El rechazo (arriba) es el único caso que lo reanuda.
	if ((ocrStatus && ocrStatus !== 'MATCH') || alreadyFrozen) {
		freezeHoldCountdown(root);
		lockSubmitAfterSend(root, SUBMIT_SENT_LABEL);
		return;
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

const setSipapRejectAlert = (root: ParentNode, show: boolean) => {
	const alert = root.querySelector<HTMLElement>('[data-sipap-reject-alert]');
	if (!alert) return;
	alert.classList.toggle('hidden', !show);
	alert.toggleAttribute('hidden', !show);
};

const expireSipapHoldUi = (root: ParentNode) => {
	if (isHoldFrozen(root)) return;
	setHoldVisibleState(root, 'expired');
	setHoldLive(root, 'Se venció el tiempo para adjuntar el comprobante.');
	const countdownEl = root.querySelector<HTMLElement>('[data-sipap-countdown]');
	if (countdownEl) countdownEl.textContent = '00:00';
	syncSubmitEnabled(root);
};

export const startSipapHoldCountdown = (root: ParentNode, expiresAt?: string | null) => {
	const countdownEl = root.querySelector<HTMLElement>('[data-sipap-countdown]');
	const banner = root.querySelector<HTMLElement>('[data-sipap-hold-banner]');
	if (!countdownEl || !(root instanceof Element)) return;
	if (isHoldFrozen(root)) return;

	stopSipapHoldCountdown(root);
	setHoldLive(root, '');

	const parsed = expiresAt ? Date.parse(String(expiresAt)) : Number.NaN;
	if (!Number.isFinite(parsed)) {
		if (banner) delete banner.dataset.sipapExpiresAt;
		setHoldVisibleState(root, 'unknown');
		syncSubmitEnabled(root);
		return;
	}

	if (banner) banner.dataset.sipapExpiresAt = String(expiresAt);

	let warnedTwoMinutes = false;
	const tick = () => {
		const liveBanner = root.querySelector<HTMLElement>('[data-sipap-hold-banner]');
		if (isHoldFrozen(root) || liveBanner?.dataset.sipapHoldState === 'submitted') {
			stopSipapHoldCountdown(root);
			return;
		}
		const remaining = parsed - Date.now();
		countdownEl.textContent = formatCountdown(remaining);
		if (remaining <= 0) {
			stopSipapHoldCountdown(root);
			expireSipapHoldUi(root);
			return;
		}
		setHoldVisibleState(root, 'active');
		if (!warnedTwoMinutes && remaining <= 2 * 60 * 1000) {
			warnedTwoMinutes = true;
			setHoldLive(root, 'Quedan menos de 2 minutos para adjuntar el comprobante.');
		}
	};

	tick();
	if (parsed - Date.now() > 0) {
		countdownTimers.set(root, window.setInterval(tick, 1000));
	}
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
		statusEl.textContent = '';
		statusEl.dataset.state = 'idle';
		freezeHoldCountdown(root);
		if (submitBtn) {
			submitBtn.disabled = true;
			setSubmitLoading(submitBtn, true);
		}
		lockReceiptDropzone(root, true);
		return;
	}

	if (phase === 'error') {
		statusEl.textContent = result?.message || 'No fue posible subir el comprobante.';
		statusEl.dataset.state = 'error';
		// Tras uploading el freeze es durable: timeout/red no reanudan el MM:SS
		// (el servidor puede haber guardado el comprobante). Solo reanudar si el
		// error fue de validación local antes de enviar.
		if (isHoldFrozen(root)) {
			setHoldVisibleState(root, 'submitted');
			stopSipapHoldCountdown(root);
			lockSubmitAfterSend(root, SUBMIT_SENT_LABEL);
			return;
		}
		syncSubmitEnabled(root);
		return;
	}

	if (!result) {
		statusEl.textContent = '';
		statusEl.dataset.state = 'idle';
		syncSubmitEnabled(root);
		return;
	}

	const ocr = String(result.ocr_status || '').toUpperCase();
	let text = result.message || 'Comprobante recibido.';
	if (ocr === 'MATCH') {
		text = result.message || 'Pago verificado. Tu turno quedó confirmado.';
	} else if (ocr === 'MISMATCH' || ocr === 'MANUAL_REVIEW' || ocr === 'FAILED') {
		text = result.message || 'Comprobante recibido. El comercio lo revisará.';
	}

	statusEl.textContent = '';
	statusEl.dataset.state = 'idle';
	showFlashMessage({
		type: 'success',
		message: text,
		autoHideMs: 5000,
	});

	freezeHoldCountdown(root);
	const banner = root.querySelector<HTMLElement>('[data-sipap-hold-banner]');
	if (ocr === 'MATCH') {
		banner?.classList.add('hidden');
		lockSubmitAfterSend(root, SUBMIT_CONFIRMED_LABEL);
		if (fileInput) fileInput.disabled = true;
		return;
	}
	banner?.classList.remove('hidden');
	lockSubmitAfterSend(root, SUBMIT_SENT_LABEL);
	if (fileInput) fileInput.disabled = true;
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

const assignReceiptFile = (root: ParentNode, fileInput: HTMLInputElement, file: File) => {
	const kind = classifyReceiptFile(file);
	if (!kind) {
		setSipapReceiptStatus(
			root,
			{ message: 'Formato no válido. Subí una imagen (JPG/PNG) o un PDF.' },
			'error'
		);
		return false;
	}
	if (file.size > MAX_RECEIPT_BYTES) {
		setSipapReceiptStatus(root, { message: 'El archivo supera 8 MB.' }, 'error');
		return false;
	}
	const transfer = new DataTransfer();
	transfer.items.add(file);
	fileInput.files = transfer.files;
	showReceiptPreview(root, file, kind);
	setSipapReceiptStatus(root, null);
	return true;
};

export const bindSipapReceiptUpload = (
	root: ParentNode,
	options?: {
		signal?: AbortSignal;
		onResult?: (result: SipapReceiptUploadResult) => void;
		onError?: (message: string) => void;
	}
) => {
	const form = root.querySelector<HTMLElement>('[data-sipap-upload]');
	const dropzone = root.querySelector<HTMLElement>('[data-sipap-dropzone]');
	const submitBtn = root.querySelector<HTMLButtonElement>('[data-sipap-upload-submit]');
	const fileInput = root.querySelector<HTMLInputElement>('[data-sipap-upload-input]');
	const tokenInput = root.querySelector<HTMLInputElement>('[data-sipap-manage-token]');
	const clearBtn = root.querySelector<HTMLButtonElement>('[data-sipap-preview-clear]');

	if (!form || !submitBtn || !fileInput || !tokenInput) return;

	// Idempotency-Key: se reutiliza mientras el reintento sea sobre el MISMO archivo (retry
	// por fallo de red); si el usuario elige otro archivo se genera una key nueva.
	let idemKey: string | null = null;
	let idemFileSignature: string | null = null;
	let isUploading = false;
	let hasSubmitted = submitBtn.dataset.sipapSubmitted === '1';

	const applyUploadSuccess = (result: SipapReceiptUploadResult) => {
		idemKey = null;
		idemFileSignature = null;
		hasSubmitted = true;
		setSipapRejectAlert(root, false);
		setSipapReceiptStatus(root, result, 'done');
		options?.onResult?.(result);
	};

	const tryReconcileUpload = async (
		token: string,
		key: string,
		payload: ReceiptUploadPayload
	): Promise<boolean> => {
		const reconciled = await reconcileReceiptUpload(token, key, payload, {
			signal: options?.signal,
			onVerifying: () =>
				setSipapReceiptStatus(
					root,
					{ message: 'Verificando comprobante…' },
					'uploading'
				),
		});
		if (!reconciled) return false;
		applyUploadSuccess(reconciled);
		return true;
	};

	const upload = async () => {
		if (isUploading || hasSubmitted || isHoldExpired(root) || submitBtn.disabled) return;
		isUploading = true;
		submitBtn.disabled = true;
		setSubmitLoading(submitBtn, true);
		try {
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
			const kind = classifyReceiptFile(file);
			if (!kind) {
				setSipapReceiptStatus(
					root,
					{ message: 'Formato no válido. Subí una imagen (JPG/PNG) o un PDF.' },
					'error'
				);
				options?.onError?.('Formato no válido. Subí una imagen (JPG/PNG) o un PDF.');
				return;
			}
			if (file.size > MAX_RECEIPT_BYTES) {
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
			let uploadFile = file;
			if (kind === 'pdf') {
				const { prepareReceiptUploadFile } = await import('../lib/pdf-receipt-to-image');
				uploadFile = await prepareReceiptUploadFile(file);
			}
			const uploadIsPdf =
				uploadFile.type === 'application/pdf' ||
				String(uploadFile.name || '')
					.toLowerCase()
					.endsWith('.pdf');
			const file_base64 = await fileToBase64(uploadFile);
			const resolvedMime = uploadFile.type || (uploadIsPdf ? 'application/pdf' : 'image/jpeg');
			const resolvedName = uploadFile.name || (uploadIsPdf ? 'comprobante.pdf' : 'comprobante.jpg');
			const payload: ReceiptUploadPayload = {
				file_base64,
				filename: resolvedName,
				mime_type: resolvedMime,
			};

			let response: Response;
			try {
				response = await fetch(
					`/api/public/reservations/${encodeURIComponent(token)}/receipt`,
					{
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							Accept: 'application/json',
							'Idempotency-Key': idemKey,
						},
						body: JSON.stringify(payload),
						signal: options?.signal,
					}
				);
			} catch (fetchError) {
				if (isAbortError(fetchError)) return;
				if (await tryReconcileUpload(token, idemKey, payload)) return;
				const message =
					fetchError instanceof Error
						? fetchError.message
						: 'No fue posible subir el comprobante.';
				setSipapReceiptStatus(root, { message }, 'error');
				options?.onError?.(message);
				return;
			}

			const data = await response.json().catch(() => ({}));
			if (!response.ok || data.status !== 'success') {
				if (await tryReconcileUpload(token, idemKey, payload)) return;
				const message = String(data.message || 'No fue posible subir el comprobante.');
				setSipapReceiptStatus(root, { message }, 'error');
				options?.onError?.(message);
				return;
			}
			applyUploadSuccess({
				message: String(data.message || '').trim(),
				...(data.data && typeof data.data === 'object' ? data.data : {}),
			});
		} catch (error) {
			if (isAbortError(error)) return;
			const message =
				error instanceof Error ? error.message : 'No fue posible subir el comprobante.';
			setSipapReceiptStatus(root, { message }, 'error');
			options?.onError?.(message);
		} finally {
			isUploading = false;
			if (hasSubmitted) {
				submitBtn.disabled = true;
				setSubmitLoading(submitBtn, false);
			}
		}
	};

	const onFileChange = () => {
		if (isHoldExpired(root) || fileInput.disabled) return;
		const file = fileInput.files?.[0];
		if (!file) {
			resetSipapReceiptPreview(root);
			setSipapReceiptStatus(root, null);
			return;
		}
		if (!assignReceiptFile(root, fileInput, file)) {
			resetSipapReceiptPreview(root);
			syncSubmitEnabled(root);
		}
	};

	fileInput.addEventListener('change', onFileChange, { signal: options?.signal });

	clearBtn?.addEventListener(
		'click',
		(event) => {
			event.preventDefault();
			event.stopPropagation();
			if (clearBtn.disabled || isHoldExpired(root)) return;
			resetSipapReceiptPreview(root);
			setSipapReceiptStatus(root, null);
		},
		{ signal: options?.signal }
	);

	if (dropzone) {
		const setDragging = (dragging: boolean) => {
			dropzone.classList.toggle('is-dragging', dragging);
		};
		dropzone.addEventListener(
			'dragenter',
			(event) => {
				event.preventDefault();
				if (dropzone.classList.contains('is-locked')) return;
				setDragging(true);
			},
			{ signal: options?.signal }
		);
		dropzone.addEventListener(
			'dragover',
			(event) => {
				event.preventDefault();
				if (dropzone.classList.contains('is-locked')) return;
				setDragging(true);
			},
			{ signal: options?.signal }
		);
		dropzone.addEventListener(
			'dragleave',
			(event) => {
				const related = event.relatedTarget;
				if (related instanceof Node && dropzone.contains(related)) return;
				setDragging(false);
			},
			{ signal: options?.signal }
		);
		dropzone.addEventListener(
			'drop',
			(event) => {
				event.preventDefault();
				setDragging(false);
				if (dropzone.classList.contains('is-locked') || isHoldExpired(root)) return;
				const file = event.dataTransfer?.files?.[0];
				if (!file) return;
				if (!assignReceiptFile(root, fileInput, file)) {
					resetSipapReceiptPreview(root);
					syncSubmitEnabled(root);
				}
			},
			{ signal: options?.signal }
		);
		dropzone.addEventListener(
			'click',
			(event) => {
				if (dropzone.classList.contains('is-locked') || fileInput.disabled) {
					event.preventDefault();
				}
			},
			{ signal: options?.signal }
		);
	}

	submitBtn.addEventListener(
		'click',
		(event) => {
			event.preventDefault();
			if (isUploading || hasSubmitted || submitBtn.disabled || submitBtn.dataset.sipapSubmitted === '1') {
				return;
			}
			void upload();
		},
		{ signal: options?.signal }
	);

	options?.signal?.addEventListener('abort', () => {
		revokeReceiptPreviewUrl(root);
	});
};

const writeClipboardText = async (text: string) => {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		try {
			const area = document.createElement('textarea');
			area.value = text;
			area.setAttribute('readonly', '');
			area.style.position = 'fixed';
			area.style.left = '-9999px';
			document.body.appendChild(area);
			area.select();
			const ok = document.execCommand('copy');
			area.remove();
			return ok;
		} catch {
			return false;
		}
	}
};

const copyTimers = new WeakMap<HTMLButtonElement, number>();

const flashCopied = (button: HTMLButtonElement, root: ParentNode) => {
	const previous = copyTimers.get(button);
	if (previous) window.clearTimeout(previous);
	const icon = button.querySelector<HTMLElement>('[data-sipap-copy-icon]');
	const label = button.querySelector<HTMLElement>('[data-sipap-copy-label]');
	const keepLabel = button.hasAttribute('data-sipap-copy-keep-label');
	if (!button.dataset.sipapCopyIdleIcon && icon) {
		button.dataset.sipapCopyIdleIcon = icon.textContent || 'content_copy';
	}
	if (!button.dataset.sipapCopyIdleLabel && !keepLabel) {
		button.dataset.sipapCopyIdleLabel = label?.textContent || button.textContent || '';
	}
	if (!button.dataset.sipapCopyIdleAria) {
		button.dataset.sipapCopyIdleAria = button.getAttribute('aria-label') || '';
	}
	if (icon) icon.textContent = 'check';
	if (!keepLabel) {
		if (label) label.textContent = 'Copiado';
		if (!icon && !label) button.textContent = 'Copiado';
	}
	if (button.dataset.sipapCopyIdleAria) button.setAttribute('aria-label', 'Copiado');
	button.classList.add('is-copied');
	setCopyStatus(root, 'Copiado', 'idle');
	copyTimers.set(
		button,
		window.setTimeout(() => {
			if (icon) icon.textContent = button.dataset.sipapCopyIdleIcon || 'content_copy';
			if (!keepLabel) {
				if (label) label.textContent = button.dataset.sipapCopyIdleLabel || '';
				if (!icon && !label) button.textContent = button.dataset.sipapCopyIdleLabel || '';
			}
			if (button.dataset.sipapCopyIdleAria) {
				button.setAttribute('aria-label', button.dataset.sipapCopyIdleAria);
			}
			button.classList.remove('is-copied');
			setCopyStatus(root, '', 'idle');
			copyTimers.delete(button);
		}, 1600)
	);
};

const setCopyStatus = (root: ParentNode, message: string, state: 'idle' | 'error' = 'idle') => {
	const status = root.querySelector<HTMLElement>('[data-sipap-copy-status]');
	if (!status) return;
	status.textContent = message;
	status.dataset.state = state;
};

export const bindSipapCopyButtons = (root: ParentNode, signal?: AbortSignal) => {
	root.querySelectorAll<HTMLButtonElement>('[data-sipap-copy]').forEach((button) => {
		button.addEventListener(
			'click',
			async () => {
				const target = String(button.dataset.sipapCopy || '').trim();
				const text =
					target === 'all'
						? formatSipapTransferClipboard(root)
						: target === 'reference'
							? fieldText(root, '[data-sipap-reference]') ||
								String(
									root.querySelector<HTMLInputElement>('[data-sipap-reference-value]')?.value ||
										''
								).trim()
							: fieldText(root, `[data-sipap-${target}]`);
				if (!text) return;
				const ok = await writeClipboardText(text);
				if (!ok) {
					setCopyStatus(root, 'No se pudo copiar. Seleccioná el texto e intentá de nuevo.', 'error');
					return;
				}
				flashCopied(button, root);
			},
			{ signal }
		);
	});
};
