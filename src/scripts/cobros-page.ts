import type { CobroItem, CobrosDatePreset, CobrosStatusFilter } from '../lib/cobros';
import { parseApiDateTime } from '../lib/booking-datetime';
import { createIdempotencyKey } from '../lib/idempotency';
import { bindReceiptDropzone } from '../lib/receipt-dropzone';
import { classifyReceiptFile, fileToBase64, receiptFileSignature } from '../lib/receipt-file';
import {
	bindFilterPopoverChrome,
	closeFilterPopoverSheet,
	positionFilterPopover,
	toggleFilterPopoverSheet,
} from '../lib/panel-filter-popover';
import { isoToDisplay } from '../lib/date-input';
import { bindFileViewer } from '../lib/file-viewer';
import { openPanelModal } from '../lib/panel-scroll-lock';
import { updateAppPaginationDom } from '../lib/pagination';
import { showFlashMessage } from '../lib/flash';
import {
	cobrosDisputeChipLabel,
	cobrosDisputeNote,
	isDisputeStaffUploadOpen,
	normalizeDisputeStatus,
} from '../lib/refund-dispute-status';

type CobrosManagerElement = HTMLElement & {
	__cobrosBound?: boolean;
	__cobrosReload?: () => void;
};

const APP_TZ = 'America/Asuncion';

const formatMoney = (amount: number, currency = 'PYG') =>
	new Intl.NumberFormat('es-PY', {
		style: 'currency',
		currency,
		maximumFractionDigits: 0,
	}).format(Number(amount) || 0);

const formatDateTimeParts = (d: Date, timeZone?: string) =>
	new Intl.DateTimeFormat('es-PY', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		...(timeZone ? { timeZone } : {}),
	}).format(d);

type CobrosSortBy = 'date' | 'price';

/** start_time = hora de pared; created_at (…Z) = instante → Asunción. */
const formatDateTime = (value?: string | null) => {
	if (!value) return '—';
	const trimmed = String(value).trim();
	const hasOffset = /([zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed);
	if (hasOffset) {
		const instant = new Date(trimmed);
		if (Number.isNaN(instant.getTime())) return '—';
		return formatDateTimeParts(instant, APP_TZ);
	}
	const wall = parseApiDateTime(trimmed);
	if (!wall) return '—';
	return formatDateTimeParts(wall);
};

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const isExpiredCobro = (item: CobroItem) => {
	const pay = String(item.payment_status || '').toUpperCase();
	const ui = String(item.ui_status || '').toUpperCase();
	return pay === 'EXPIRED' || ui === 'EXPIRED';
};

const isRefundItem = (item: CobroItem) =>
	item.ui_status === 'refund_pending' ||
	item.ui_status === 'refund_awaiting_alias' ||
	item.ui_status === 'refund_sent' ||
	item.ui_status === 'refund_dispute' ||
	item.ui_status === 'refund_waived' ||
	Boolean(String(item.refund_dispute_status || '').trim());

const isDisputeOpen = (item: CobroItem) => {
	const status = String(item.refund_dispute_status || '').trim();
	if (status) return isDisputeStaffUploadOpen(status);
	return item.ui_status === 'refund_dispute';
};

const displayAmount = (item: CobroItem) =>
	isRefundItem(item) && item.refund_amount != null ? item.refund_amount : item.amount;

const openActionLabel = (item: CobroItem) => {
	if (isDisputeOpen(item)) return 'Responder disputa';
	if (
		item.ui_status === 'refund_pending' ||
		item.ui_status === 'refund_awaiting_alias' ||
		item.ui_status === 'refund_sent' ||
		item.ui_status === 'refund_waived'
	) {
		return 'Ver reembolso';
	}
	if (item.ui_status === 'pending') return 'Validar comprobante';
	return 'Ver detalle';
};

const statusLabel = (item: CobroItem) => {
	if (isExpiredCobro(item)) return 'Vencido';
	const disputeChip = cobrosDisputeChipLabel(item.refund_dispute_status || '');
	if (disputeChip) return disputeChip;
	if (item.ui_status === 'approved') return 'Aprobado';
	if (item.ui_status === 'rejected') return 'Rechazado';
	if (item.ui_status === 'pending') return 'Pendiente de revisión';
	if (item.ui_status === 'refund_pending') return 'Reembolso pendiente';
	if (item.ui_status === 'refund_awaiting_alias') return 'Esperando alias';
	if (item.ui_status === 'refund_sent') return 'Reembolso enviado';
	if (item.ui_status === 'refund_dispute') return 'En disputa';
	if (item.ui_status === 'refund_waived') return 'Reembolso renunciado';
	const raw = String(item.ocr_status || item.payment_status || '').trim().toUpperCase();
	if (raw === 'EXPIRED') return 'Vencido';
	if (raw === 'CANCELLED' || raw === 'CANCELED') return 'Cancelado';
	if (raw === 'PAID' || raw === 'PAID_TRANSFER') return 'Pagado';
	// NEW-C: seña con hold activo pero sin comprobante subido. Antes caía en el fallback
	// genérico "Pendiente", indistinguible del chip real de "Pendiente de revisión".
	if (raw === 'PENDING') return 'Esperando comprobante';
	return String(item.ocr_status || item.payment_status || '—');
};

const statusChipClass = (item: CobroItem) => {
	if (isExpiredCobro(item)) return 'cobros-chip cobros-chip--expired';
	if (item.ui_status === 'approved') return 'cobros-chip cobros-chip--approved';
	if (item.ui_status === 'rejected') return 'cobros-chip cobros-chip--rejected';
	if (item.ui_status === 'pending') return 'cobros-chip cobros-chip--pending';
	if (
		item.ui_status === 'refund_dispute' ||
		isDisputeStaffUploadOpen(item.refund_dispute_status) ||
		Boolean(cobrosDisputeChipLabel(item.refund_dispute_status || ''))
	) {
		return 'cobros-chip cobros-chip--dispute';
	}
	if (item.ui_status === 'refund_pending' || item.ui_status === 'refund_awaiting_alias') {
		return 'cobros-chip cobros-chip--refund';
	}
	if (item.ui_status === 'refund_sent') return 'cobros-chip cobros-chip--sent';
	if (item.ui_status === 'refund_waived') return 'cobros-chip cobros-chip--other';
	return 'cobros-chip cobros-chip--other';
};

let onSubscriptionRefresh: (() => void) | null = null;
let subscriptionListenerBound = false;
let onCobrosFocusRequest: ((appointmentId: number) => void) | null = null;
let cobrosFocusListenerBound = false;

export const initCobrosPage = () => {
	const root = document.querySelector<CobrosManagerElement>('cobros-manager');
	if (!root) return;

	// ClientRouter: el script del módulo no siempre re-ejecuta; reusar reload si ya está vivo.
	if (root.__cobrosBound) {
		root.__cobrosReload?.();
		return;
	}
	root.__cobrosBound = true;

	const errorEl = root.querySelector<HTMLElement>('[data-cobros-error]');
	const loadingEl = root.querySelector<HTMLElement>('[data-cobros-loading]');
	const emptyEl = root.querySelector<HTMLElement>('[data-cobros-empty]');
	const summaryEl = root.querySelector<HTMLElement>('[data-cobros-summary]');
	const resultsEl = root.querySelector<HTMLElement>('[data-cobros-results]');
	const tableWrap = root.querySelector<HTMLElement>('[data-cobros-table-wrap]');
	const tableBody = root.querySelector<HTMLElement>('[data-cobros-table-body]');
	const cardsEl = root.querySelector<HTMLElement>('[data-cobros-cards]');
	const datePresetEl = root.querySelector<HTMLSelectElement>('[data-cobros-date-preset]');
	const customDatesEl = root.querySelector<HTMLElement>('[data-cobros-custom-dates]');
	const dateFromEl = root.querySelector<HTMLInputElement>('[data-cobros-date-from]');
	const dateToEl = root.querySelector<HTMLInputElement>('[data-cobros-date-to]');
	const dateErrorEl = root.querySelector<HTMLElement>('[data-cobros-date-error]');
	const periodFilterBtn = root.querySelector<HTMLButtonElement>('[data-open-period-filter]');
	const periodFilterBadge = root.querySelector<HTMLElement>('[data-period-filter-badge]');
	const periodSheet = root.querySelector<HTMLDialogElement>('[data-cobros-period-sheet]');
	const modal = root.querySelector<HTMLDialogElement>('[data-cobros-modal]');
	const fileViewer = bindFileViewer(root);
	let disputeProofBusy = false;
	let disputeIdemKey: string | null = null;
	let disputeIdemSig: string | null = null;
	const disputeDropzone = modal
		? bindReceiptDropzone(modal, {
				dropzone: '[data-cobros-dispute-dropzone]',
				input: '[data-cobros-dispute-file]',
				empty: '[data-cobros-dropzone-empty]',
				preview: '[data-cobros-dropzone-preview]',
				previewImage: '[data-cobros-preview-image]',
				previewPdf: '[data-cobros-preview-pdf]',
				previewName: '[data-cobros-preview-name]',
				clear: '[data-cobros-preview-clear]',
				isLocked: () => disputeProofBusy,
				onChange: (file) => {
					if (!file) {
						disputeIdemKey = null;
						disputeIdemSig = null;
						return;
					}
					const statusEl = modal.querySelector<HTMLElement>('[data-cobros-modal-status]');
					if (statusEl && !disputeProofBusy) statusEl.textContent = '';
				},
				onInvalid: (message) => {
					const statusEl = modal.querySelector<HTMLElement>('[data-cobros-modal-status]');
					if (statusEl) statusEl.textContent = message;
				},
			})
		: null;
	const featureSection = root.querySelector<HTMLElement>('[data-requires-feature="DEPOSIT_COLLECTION"]');
	const lockedSection = root.querySelector<HTMLElement>('[data-cobros-feature-locked]');
	const paginationEl = root.querySelector<HTMLElement>('[data-cobros-pagination]');
	const prevPageBtn = root.querySelector<HTMLButtonElement>('[data-cobros-prev]');
	const nextPageBtn = root.querySelector<HTMLButtonElement>('[data-cobros-next]');

	const PAGE_SIZE = 9;
	const STATUS_FILTERS: CobrosStatusFilter[] = ['all', 'pending', 'approved', 'refunded', 'expired'];
	const urlParams = new URLSearchParams(window.location.search);
	const statusFromUrl = String(urlParams.get('status') || '').trim().toLowerCase();
	let statusFilter: CobrosStatusFilter = STATUS_FILTERS.includes(statusFromUrl as CobrosStatusFilter)
		? (statusFromUrl as CobrosStatusFilter)
		: 'all';
	let datePreset: CobrosDatePreset = 'all';
	const appointmentFromUrl = Number(urlParams.get('appointment') || 0);
	let pendingAppointmentId =
		Number.isInteger(appointmentFromUrl) && appointmentFromUrl > 0 ? appointmentFromUrl : 0;
	let focusAppointmentId = 0;
	let pendingFocusItem: CobroItem | null = null;
	let focusHighlightTimer: number | null = null;
	let items: CobroItem[] = [];
	let selected: CobroItem | null = null;
	let busy = false;
	let loading = false;
	let loadRequestId = 0;
	let page = 1;
	let totalRecords = 0;
	let sortBy: CobrosSortBy = 'date';
	let sortDir: 'asc' | 'desc' = 'desc';

	const setError = (message: string) => {
		if (!errorEl) return;
		if (!message) {
			errorEl.classList.add('hidden');
			errorEl.textContent = '';
			return;
		}
		errorEl.textContent = message;
		errorEl.classList.remove('hidden');
	};

	const setLoading = (on: boolean) => {
		loading = on;
		loadingEl?.classList.toggle('hidden', !on);
		resultsEl?.classList.toggle('hidden', on);
		if (on) {
			tableBody?.replaceChildren();
			cardsEl?.replaceChildren();
			emptyEl?.classList.add('hidden');
		}
		if (periodFilterBtn) periodFilterBtn.disabled = on;
	};

	const closePeriodSheet = () => {
		closeFilterPopoverSheet(periodSheet, periodFilterBtn);
	};

	const DATE_FACE_EMPTY = 'dd/mm/aaaa';

	const setDateError = (message: string) => {
		if (!dateErrorEl) return;
		if (!message) {
			dateErrorEl.textContent = '';
			dateErrorEl.classList.add('hidden');
			return;
		}
		dateErrorEl.textContent = message;
		dateErrorEl.classList.remove('hidden');
	};

	const markDateInvalid = (input: HTMLInputElement | null, invalid: boolean) => {
		input?.closest('[data-cobros-date]')?.classList.toggle('is-invalid', invalid);
	};

	const syncDateFace = (input: HTMLInputElement | null) => {
		if (!input) return;
		const wrap = input.closest('[data-cobros-date]');
		const display = wrap?.querySelector<HTMLElement>('[data-cobros-date-display]');
		if (!display) return;
		const formatted = isoToDisplay(input.value);
		display.textContent = formatted || DATE_FACE_EMPTY;
		display.classList.toggle('is-empty', !formatted);
		wrap?.classList.remove('is-invalid');
	};

	const tryShowDatePicker = (input: HTMLInputElement) => {
		if (typeof input.showPicker !== 'function') return false;
		try {
			input.showPicker();
			return true;
		} catch {
			return false;
		}
	};

	const openNativeDatePicker = (input: HTMLInputElement) => {
		if (input.disabled || input.readOnly) return;
		input.focus({ preventScroll: true });
		if (tryShowDatePicker(input)) return;

		/* Chromium trata opacity:0 como no visible y rechaza showPicker.
		   En type=date el picker se cierra si volvemos a 0; dejar 0.01. */
		input.style.opacity = '0.01';
		if (tryShowDatePicker(input)) return;
		input.click();
	};

	const bindNativeDateFace = (input: HTMLInputElement | null) => {
		if (!input) return;
		const wrap = input.closest<HTMLElement>('[data-cobros-date]');
		const sync = () => {
			syncDateFace(input);
			setDateError('');
		};
		const activate = (event: Event) => {
			event.preventDefault();
			event.stopPropagation();
			openNativeDatePicker(input);
		};
		input.style.opacity = '0.01';
		input.addEventListener('input', sync);
		input.addEventListener('change', sync);
		input.addEventListener('keydown', (event) => {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			event.preventDefault();
			openNativeDatePicker(input);
		});
		/* pointerdown: mismo gesto que crear cita, antes de que el label robe el click. */
		wrap?.addEventListener('pointerdown', (event) => {
			if (event.button !== 0) return;
			activate(event);
		});
		wrap?.addEventListener('click', activate);
		sync();
	};

	const updatePeriodFilterUi = () => {
		const mobileFilters =
			typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
		const periodActive = datePreset !== 'all';
		const active = periodActive || (mobileFilters && statusFilter !== 'all');
		periodFilterBadge?.classList.toggle('hidden', !active);
		periodFilterBtn?.classList.toggle('is-active', active);
		periodFilterBtn?.classList.toggle('is-disabled', false);
		periodFilterBtn?.setAttribute('aria-pressed', active ? 'true' : 'false');
		if (periodFilterBtn) {
			periodFilterBtn.disabled = loading;
			periodFilterBtn.title = 'Filtrar por periodo';
		}

		periodSheet?.querySelectorAll<HTMLButtonElement>('[data-period-option]').forEach((btn) => {
			const selectedOpt = btn.dataset.periodOption === datePreset;
			btn.classList.toggle('is-selected', selectedOpt);
			btn.setAttribute('aria-selected', selectedOpt ? 'true' : 'false');
		});
		customDatesEl?.classList.toggle('hidden', datePreset !== 'custom');
		if (datePreset === 'custom') {
			syncDateFace(dateFromEl);
			syncDateFace(dateToEl);
		}
		// Tras mostrar fechas custom el popover crece: re-anclar al botón.
		if (
			periodSheet?.open &&
			periodSheet.classList.contains('is-desktop-popover') &&
			periodFilterBtn
		) {
			positionFilterPopover(periodSheet, periodFilterBtn, 22);
		}
	};

	const openPeriodSheet = (event?: Event) => {
		event?.preventDefault();
		event?.stopPropagation();
		if (loading || !periodSheet || !periodFilterBtn) return;
		if (datePresetEl) datePresetEl.value = datePreset;
		setDateError('');
		updatePeriodFilterUi();
		toggleFilterPopoverSheet(periodSheet, periodFilterBtn, 22);
	};

	const applyPeriodOption = (next: CobrosDatePreset) => {
		datePreset = next;
		if (datePresetEl) datePresetEl.value = next;
		updatePeriodFilterUi();
		if (next !== 'custom') {
			closePeriodSheet();
			page = 1;
			void load();
		}
	};

	const applyFeatureGate = () => {
		const hasFeature =
			typeof window !== 'undefined' &&
			window.HaselSubscription?.hasFeature?.('DEPOSIT_COLLECTION');
		if (hasFeature === false) {
			featureSection?.classList.add('hidden');
			lockedSection?.classList.remove('hidden');
			return false;
		}
		lockedSection?.classList.add('hidden');
		featureSection?.classList.remove('hidden');
		return true;
	};

	const statusSelect = root.querySelector<HTMLSelectElement>('[data-cobros-status-select]');

	const syncTabs = () => {
		root.querySelectorAll<HTMLButtonElement>('[data-cobros-tab]').forEach((btn) => {
			btn.classList.toggle('is-active', btn.dataset.cobrosTab === statusFilter);
		});
		if (statusSelect && statusSelect.value !== statusFilter) {
			statusSelect.value = statusFilter;
		}
	};

	const syncSortUi = () => {
		root.querySelectorAll<HTMLButtonElement>('[data-cobros-sort-by]').forEach((btn) => {
			const active = btn.dataset.cobrosSortBy === sortBy;
			btn.classList.toggle('is-selected', active);
			btn.setAttribute('aria-selected', active ? 'true' : 'false');
		});
		root.querySelectorAll<HTMLButtonElement>('[data-cobros-sort-dir]').forEach((btn) => {
			const active = btn.dataset.cobrosSortDir === sortDir;
			btn.classList.toggle('is-selected', active);
			btn.setAttribute('aria-selected', active ? 'true' : 'false');
		});
		root.querySelectorAll<HTMLElement>('[data-sort-dir-label-date]').forEach((el) => {
			el.classList.toggle('hidden', sortBy !== 'date');
		});
		root.querySelectorAll<HTMLElement>('[data-sort-dir-label-price]').forEach((el) => {
			el.classList.toggle('hidden', sortBy !== 'price');
		});
		root.querySelectorAll<HTMLButtonElement>('[data-cobros-sort-field]').forEach((btn) => {
			const field: CobrosSortBy = btn.dataset.cobrosSortField === 'price' ? 'price' : 'date';
			const dir = btn.dataset.cobrosSort === 'asc' ? 'asc' : 'desc';
			const active = sortBy === field && sortDir === dir;
			btn.classList.toggle('is-active', active);
			btn.setAttribute('aria-pressed', active ? 'true' : 'false');
		});
	};

	const applySort = (nextBy: CobrosSortBy, nextDir: 'asc' | 'desc') => {
		if (nextBy !== 'date' && nextBy !== 'price') return;
		if (nextDir !== 'asc' && nextDir !== 'desc') return;
		if (nextBy === sortBy && nextDir === sortDir) return;
		sortBy = nextBy;
		sortDir = nextDir;
		page = 1;
		syncSortUi();
		void load();
	};

	const applyStatusOption = (next: CobrosStatusFilter) => {
		statusFilter = next;
		datePreset = 'all';
		if (datePresetEl) datePresetEl.value = 'all';
		page = 1;
		closePeriodSheet();
		syncTabs();
		updatePeriodFilterUi();
		void load();
	};

	const setRejectMode = (on: boolean) => {
		if (!modal) return;
		const rejectWrap = modal.querySelector<HTMLElement>('[data-cobros-reject-wrap]');
		const defaultActions = modal.querySelector<HTMLElement>('[data-cobros-actions-default]');
		const rejectActions = modal.querySelector<HTMLElement>('[data-cobros-actions-reject]');
		rejectWrap?.classList.toggle('is-open', on);
		defaultActions?.classList.toggle('hidden', on);
		rejectActions?.classList.toggle('hidden', !on);
		if (on) {
			window.setTimeout(
				() => modal.querySelector<HTMLInputElement>('[data-cobros-reject-reason]')?.focus(),
				180,
			);
		}
	};

	const receiptFileName = (
		url: string,
		customerName?: string | null,
		kind: 'pdf' | 'image' = 'pdf'
	) => {
		try {
			const path = new URL(url).pathname;
			const base = decodeURIComponent(path.split('/').pop() || '');
			if (base && /\.[a-z0-9]+$/i.test(base)) return base;
		} catch {
			/* ignore */
		}
		const safe = String(customerName || 'comprobante')
			.trim()
			.replace(/[^\w\-]+/g, '_')
			.replace(/_+/g, '_')
			.slice(0, 40);
		const ext = kind === 'image' ? 'jpg' : 'pdf';
		return `${safe || 'comprobante'}.${ext}`;
	};

	let waiveConfirmReady = false;

	const resetWaiveUi = () => {
		waiveConfirmReady = false;
		const wrap = modal?.querySelector<HTMLElement>('[data-cobros-waive-wrap]');
		const btn = modal?.querySelector<HTMLButtonElement>('[data-cobros-waive]');
		const input = modal?.querySelector<HTMLInputElement>('[data-cobros-waive-reason]');
		wrap?.classList.add('hidden');
		if (btn) btn.textContent = 'Omitir reembolso';
		if (input) input.value = '';
	};

	const syncDisputeLead = (item: CobroItem) => {
		const disputeStatus = String(item.refund_dispute_status || '').trim().toUpperCase();
		const hasProof = Number(item.refund_dispute_has_proof || 0) === 1;
		const canUpload = isDisputeOpen(item);
		const showLead = Boolean(disputeStatus) || canUpload || hasProof;

		modal?.querySelector<HTMLElement>('[data-cobros-dispute-lead]')?.classList.toggle('hidden', !showLead);
		modal
			?.querySelector<HTMLElement>('[data-cobros-dispute-proof]')
			?.classList.toggle('hidden', !canUpload);
		modal
			?.querySelector<HTMLElement>('[data-cobros-dispute-actions]')
			?.classList.toggle('hidden', !canUpload);

		const deadline = modal?.querySelector<HTMLElement>('[data-cobros-dispute-deadline]');
		const dueEl = modal?.querySelector<HTMLElement>('[data-cobros-dispute-due]');
		const dueRaw = String(item.refund_dispute_due_at || '').trim();
		if (deadline && dueEl && canUpload && dueRaw) {
			const dueDate = new Date(dueRaw);
			const overdue = !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < Date.now();
			dueEl.textContent = overdue
				? `Venció el ${formatDateTime(dueRaw)}`
				: `Vence el ${formatDateTime(dueRaw)}`;
			deadline.classList.toggle('is-overdue', overdue);
			deadline.classList.remove('hidden');
		} else {
			deadline?.classList.add('hidden');
			deadline?.classList.remove('is-overdue');
			if (dueEl) dueEl.textContent = '—';
		}

		const opsDeadline = modal?.querySelector<HTMLElement>('[data-cobros-ops-deadline]');
		const opsDueEl = modal?.querySelector<HTMLElement>('[data-cobros-ops-due]');
		const opsDueRaw = String(item.refund_dispute_ops_due_at || '').trim();
		const showOpsDue = normalizeDisputeStatus(disputeStatus) === 'UNDER_REVIEW' && Boolean(opsDueRaw);
		if (opsDeadline && opsDueEl && showOpsDue) {
			const opsDate = new Date(opsDueRaw);
			const opsOverdue = !Number.isNaN(opsDate.getTime()) && opsDate.getTime() < Date.now();
			opsDueEl.textContent = opsOverdue
				? `Venció el ${formatDateTime(opsDueRaw)}`
				: `Vence el ${formatDateTime(opsDueRaw)}`;
			opsDeadline.classList.toggle('is-overdue', opsOverdue);
			opsDeadline.classList.remove('hidden');
		} else {
			opsDeadline?.classList.add('hidden');
			opsDeadline?.classList.remove('is-overdue');
			if (opsDueEl) opsDueEl.textContent = '—';
		}

		const claimNote = modal?.querySelector<HTMLElement>('[data-cobros-claim-note]');
		if (claimNote) {
			if (canUpload && normalizeDisputeStatus(disputeStatus) === 'OPENED') {
				claimNote.textContent = cobrosDisputeNote('OPENED');
				claimNote.classList.remove('hidden');
			} else {
				const note = cobrosDisputeNote(disputeStatus);
				claimNote.textContent = note;
				claimNote.classList.toggle('hidden', !note);
			}
		}

		const proofRow = modal?.querySelector<HTMLElement>('[data-cobros-refund-proof-row]');
		const proofEmpty = modal?.querySelector<HTMLElement>('[data-cobros-refund-proof-empty]');
		const proofOpenBtn = modal?.querySelector<HTMLButtonElement>('[data-cobros-refund-proof-open]');
		const proofNameEl = modal?.querySelector<HTMLElement>('[data-cobros-refund-proof-name]');
		if (hasProof) {
			proofRow?.classList.remove('hidden');
			proofEmpty?.classList.add('hidden');
			if (proofNameEl) {
				proofNameEl.textContent = receiptFileName(
					`reembolso-${item.id_transaction}`,
					item.customer_name,
					'image'
				);
			}
			if (proofOpenBtn) {
				proofOpenBtn.onclick = () =>
					openViewer(
						`/api/cobros/${item.id_transaction}/refund-proof`,
						false,
						'Prueba de reembolso'
					);
			}
		} else {
			proofRow?.classList.add('hidden');
			proofEmpty?.classList.toggle('hidden', canUpload || !showLead);
			if (proofOpenBtn) proofOpenBtn.onclick = null;
		}

		if (!canUpload) disputeDropzone?.reset();
	};

	const syncModalFooter = () => {
		if (!modal) return;
		const footer = modal.querySelector<HTMLElement>('[data-cobros-modal-footer]');
		if (!footer) return;

		const isEffectivelyHidden = (el: HTMLElement | null) => {
			if (!el) return true;
			return el.hidden || el.classList.contains('hidden') || el.classList.contains('is-empty');
		};

		const hasVisibleButton = Array.from(footer.querySelectorAll('button')).some((btn) => {
			if (isEffectivelyHidden(btn)) return false;
			let node: HTMLElement | null = btn.parentElement;
			while (node && node !== footer) {
				if (isEffectivelyHidden(node)) return false;
				node = node.parentElement;
			}
			return true;
		});

		const statusEl = modal.querySelector<HTMLElement>('[data-cobros-modal-status]');
		const empty = !hasVisibleButton && !statusEl?.textContent?.trim();
		footer.classList.toggle('is-empty', empty);
		footer.classList.toggle('hidden', empty);
		footer.hidden = empty;
	};

	const openModal = (item: CobroItem) => {
		selected = item;
		if (!modal) return;

		const setText = (sel: string, value: string) => {
			const el = modal.querySelector<HTMLElement>(sel);
			if (el) el.textContent = value;
		};

		const isRefund = isRefundItem(item);
		const disputeOpen = isDisputeOpen(item);
		const panel = modal.querySelector<HTMLElement>('[data-cobros-modal-panel]');
		panel?.classList.toggle('is-refund-mode', isRefund);
		panel?.classList.toggle('is-dispute-mode', disputeOpen);

		setText(
			'[data-cobros-amount-label]',
			isRefund ? 'Monto a reembolsar' : 'Monto de seña'
		);

		const refundPanel = modal.querySelector<HTMLElement>('[data-cobros-refund-block]');
		if (refundPanel) {
			refundPanel.classList.remove(
				'is-status-sent',
				'is-status-pending',
				'is-status-waived',
				'is-status-dispute'
			);
			if (disputeOpen) {
				refundPanel.classList.add('is-status-dispute');
			} else if (item.ui_status === 'refund_sent') {
				refundPanel.classList.add('is-status-sent');
			} else if (
				item.ui_status === 'refund_pending' ||
				item.ui_status === 'refund_awaiting_alias'
			) {
				refundPanel.classList.add('is-status-pending');
			} else if (item.ui_status === 'refund_waived') {
				refundPanel.classList.add('is-status-waived');
			}
		}

		setText(
			'[data-cobros-modal-title]',
			disputeOpen ? 'Disputa de reembolso' : isRefund ? 'Detalle de reembolso' : 'Validar comprobante'
		);
		setText('[data-cobros-modal-subtitle]', formatDateTime(item.start_time || item.created_at));
		setText('[data-cobros-modal-customer]', item.customer_name || '—');
		setText('[data-cobros-modal-service]', item.service_name || '—');
		setText('[data-cobros-modal-professional]', item.professional_name || '—');
		setText('[data-cobros-modal-location]', item.location_name || '—');
		setText(
			'[data-cobros-modal-amount]',
			formatMoney(displayAmount(item), item.currency)
		);
		setText('[data-cobros-modal-reference]', item.payment_reference || '—');
		setText('[data-cobros-modal-refund-alias]', item.refund_alias || '—');
		setText('[data-cobros-modal-refund-status]', statusLabel(item));

		const ocrBlock = modal.querySelector<HTMLElement>('[data-cobros-ocr-block]');
		const ocrAmount = Number(item.ocr_amount ?? NaN);
		const ocrReference = String(item.ocr_reference || '').trim();
		const ocrConfidence = Number(item.ocr_confidence ?? NaN);
		const hasOcr =
			Number.isFinite(ocrAmount) || Boolean(ocrReference) || Number.isFinite(ocrConfidence);
		if (ocrBlock) {
			ocrBlock.classList.toggle('hidden', !hasOcr);
			setText(
				'[data-cobros-modal-ocr-amount]',
				Number.isFinite(ocrAmount) ? formatMoney(ocrAmount, item.currency) : '—'
			);
			setText('[data-cobros-modal-ocr-reference]', ocrReference || '—');
			setText(
				'[data-cobros-modal-ocr-confidence]',
				Number.isFinite(ocrConfidence)
					? `${Math.round(ocrConfidence <= 1 ? ocrConfidence * 100 : ocrConfidence)}%`
					: '—'
			);
		}

		const receiptRow = modal.querySelector<HTMLElement>('[data-cobros-receipt-row]');
		const receiptIcon = modal.querySelector<HTMLElement>('[data-cobros-receipt-icon]');
		const receiptNameEl = modal.querySelector<HTMLElement>('[data-cobros-receipt-name]');
		const receiptOpenBtn = modal.querySelector<HTMLButtonElement>('[data-cobros-receipt-open]');
		const noImg = modal.querySelector<HTMLElement>('[data-cobros-modal-no-image]');
		const receiptUrl = String(item.receipt_url || '').trim();
		const isPdf = /\.pdf($|\?)/i.test(receiptUrl) || /application\/pdf/i.test(receiptUrl);
		const receiptName = receiptFileName(
			receiptUrl,
			item.customer_name,
			isPdf ? 'pdf' : 'image'
		);

		receiptRow?.classList.add('hidden');
		noImg?.classList.add('hidden');

		if (receiptUrl) {
			receiptRow?.classList.remove('hidden');
			if (receiptIcon) {
				receiptIcon.textContent = isPdf ? 'picture_as_pdf' : 'image';
			}
			if (receiptNameEl) receiptNameEl.textContent = receiptName;
			if (receiptOpenBtn) {
				receiptOpenBtn.onclick = () =>
					openViewer(receiptUrl, isPdf, 'Comprobante de seña');
			}
		} else {
			noImg?.classList.remove('hidden');
			if (receiptOpenBtn) receiptOpenBtn.onclick = null;
		}

		const canReview = item.ui_status === 'pending';
		const canMarkSent = item.ui_status === 'refund_pending';
		const canWaive =
			item.ui_status === 'refund_pending' || item.ui_status === 'refund_awaiting_alias';
		modal.querySelector<HTMLElement>('[data-cobros-modal-actions]')?.classList.toggle('hidden', !canReview);
		modal.querySelector<HTMLElement>('[data-cobros-refund-block]')?.classList.toggle('hidden', !isRefund);
		modal
			.querySelector<HTMLElement>('[data-cobros-refund-actions]')
			?.classList.toggle('hidden', !(canMarkSent || canWaive));
		modal
			.querySelector<HTMLElement>('[data-cobros-mark-refund-sent]')
			?.classList.toggle('hidden', !canMarkSent);
		modal.querySelector<HTMLButtonElement>('[data-cobros-waive]')?.classList.toggle('hidden', !canWaive);
		resetWaiveUi();
		syncDisputeLead(item);
		disputeDropzone?.reset();
		disputeIdemKey = null;
		disputeIdemSig = null;
		const reasonInput = modal.querySelector<HTMLInputElement>('[data-cobros-reject-reason]');
		if (reasonInput) reasonInput.value = item.reject_reason || '';
		setText('[data-cobros-modal-status]', '');
		setRejectMode(false);
		setApproveBusy(false);
		setRefundSentBusy(false);
		setDisputeUploadBusy(false);
		syncModalFooter();

		modal.classList.remove('is-closing');
		if (modal.open) {
			modal.classList.add('is-settled');
			return;
		}
		modal.classList.remove('is-settled');
		openPanelModal(modal);
		scheduleModalSettle();
	};

	let closeTimer: number | null = null;
	let settleTimer: number | null = null;
	let settleOpenHandler: ((event: AnimationEvent) => void) | null = null;

	const clearModalSettle = () => {
		if (settleTimer !== null) {
			window.clearTimeout(settleTimer);
			settleTimer = null;
		}
		if (settleOpenHandler && modal) {
			modal.removeEventListener('animationend', settleOpenHandler);
			settleOpenHandler = null;
		}
	};

	const settleModal = () => {
		modal?.classList.add('is-settled');
		clearModalSettle();
	};

	const scheduleModalSettle = () => {
		if (!modal) return;
		clearModalSettle();
		settleOpenHandler = (event: AnimationEvent) => {
			if (event.target !== modal) return;
			settleModal();
		};
		modal.addEventListener('animationend', settleOpenHandler);
		settleTimer = window.setTimeout(settleModal, 220);
	};

	const closeModal = () => {
		fileViewer?.close();
		disputeDropzone?.reset();
		disputeIdemKey = null;
		disputeIdemSig = null;
		if (!modal?.open) {
			selected = null;
			return;
		}
		setRejectMode(false);
		resetWaiveUi();
		clearModalSettle();
		modal.classList.remove('is-settled');
		modal.classList.add('is-closing');
		if (closeTimer !== null) window.clearTimeout(closeTimer);
		closeTimer = window.setTimeout(() => {
			modal?.classList.remove('is-closing');
			modal?.close();
			selected = null;
			closeTimer = null;
		}, 140);
	};

	const openViewer = (url: string, isPdf: boolean, name: string) => {
		fileViewer?.open({
			url,
			name: name || 'Comprobante',
			mimeType: isPdf ? 'application/pdf' : 'image/jpeg',
		});
	};

	const totalPages = () => Math.max(1, Math.ceil(Math.max(totalRecords, 0) / PAGE_SIZE));

	const updatePagination = () => {
		const pages = totalPages();
		const hasItems = totalRecords > 0;
		paginationEl?.classList.toggle('hidden', loading || !hasItems);
		if (paginationEl) {
			updateAppPaginationDom(paginationEl, {
				currentPage: page,
				totalPages: pages,
				totalRecords,
				recordLabel: 'cobros',
				summarySelector: '[data-cobros-page-label]',
				pagesSelector: '[data-cobros-pagination-pages]',
				prevSelector: '[data-cobros-prev]',
				nextSelector: '[data-cobros-next]',
				pageDataAttr: 'data-cobros-page',
			});
		}
		prevPageBtn?.classList.toggle('is-disabled', page <= 1 || loading);
		prevPageBtn?.toggleAttribute('disabled', page <= 1 || loading);
		nextPageBtn?.classList.toggle('is-disabled', page >= pages || loading);
		nextPageBtn?.toggleAttribute('disabled', page >= pages || loading);
	};

	const render = () => {
		if (summaryEl) {
			summaryEl.textContent = `(${totalRecords})`;
		}

		const empty = items.length === 0;
		emptyEl?.classList.toggle('hidden', !empty);
		tableWrap?.classList.toggle('is-empty', empty);
		cardsEl?.classList.toggle('hidden', empty);
		resultsEl?.classList.remove('hidden');
		loadingEl?.classList.add('hidden');
		updatePagination();

		if (!tableBody || !cardsEl) return;
		tableBody.replaceChildren();
		cardsEl.replaceChildren();

		for (const item of items) {
			const tr = document.createElement('tr');
			tr.className = 'border-b border-(--shell-border)/70';
			tr.dataset.cobrosAppointment = String(item.id_appointment || '');
			tr.innerHTML = `
				<td class="px-4 py-3 whitespace-nowrap">${formatDateTime(item.start_time || item.created_at)}</td>
				<td class="px-4 py-3 font-semibold">${escapeHtml(item.customer_name || '—')}</td>
				<td class="px-4 py-3">${escapeHtml(item.service_name || '—')}</td>
				<td class="px-4 py-3 font-bold">${formatMoney(displayAmount(item), item.currency)}</td>
				<td class="px-4 py-3"><span class="${statusChipClass(item)}">${statusLabel(item)}</span></td>
				<td class="px-4 py-3 text-right">
					<button
						type="button"
						class="cobros-view-btn cursor-pointer"
						title="${openActionLabel(item)}"
						aria-label="${openActionLabel(item)}"
						data-cobros-open="${item.id_transaction}"
					>
						<span class="material-symbols-rounded" aria-hidden="true">visibility</span>
					</button>
				</td>
			`;
			tableBody.appendChild(tr);

			const card = document.createElement('article');
			card.className = 'cobros-card';
			card.dataset.cobrosAppointment = String(item.id_appointment || '');
			const ctaLabel = openActionLabel(item);
			card.innerHTML = `
				<div class="cobros-card__inner">
					<header class="cobros-card__head">
						<div class="cobros-card__who">
							<p class="cobros-card__name">${escapeHtml(item.customer_name || '—')}</p>
							<p class="cobros-card__service">${escapeHtml(item.service_name || '—')}</p>
						</div>
						<span class="${statusChipClass(item)}">${statusLabel(item)}</span>
					</header>
					<p class="cobros-card__amount">${formatMoney(displayAmount(item), item.currency)}</p>
					<p class="cobros-card__when">${formatDateTime(item.start_time || item.created_at)}</p>
					<button type="button" class="cobros-card__cta" data-cobros-open="${item.id_transaction}">
						<span class="cobros-card__cta-label">${ctaLabel}</span>
						<span class="cobros-card__cta-icon" aria-hidden="true">
							<span class="material-symbols-rounded">arrow_forward</span>
						</span>
					</button>
				</div>
			`;
			cardsEl.appendChild(card);
		}
	};

	const stripAppointmentQuery = () => {
		const url = new URL(window.location.href);
		if (!url.searchParams.has('appointment')) return;
		url.searchParams.delete('appointment');
		const query = url.searchParams.toString();
		window.history.replaceState({}, '', `${url.pathname}${query ? `?${query}` : ''}${url.hash}`);
	};

	const clearFocusHighlight = () => {
		root.querySelectorAll('[data-cobros-focus]').forEach((el) => {
			el.removeAttribute('data-cobros-focus');
		});
	};

	const applyFocusHighlight = (appointmentId: number) => {
		if (focusHighlightTimer !== null) {
			window.clearTimeout(focusHighlightTimer);
			focusHighlightTimer = null;
		}
		clearFocusHighlight();
		if (!appointmentId) return;

		const targets = root.querySelectorAll(`[data-cobros-appointment="${appointmentId}"]`);
		targets.forEach((el) => {
			el.setAttribute('data-cobros-focus', '');
		});

		const prefersDesktop = window.matchMedia('(min-width: 768px)').matches;
		const scrollTarget = prefersDesktop
			? tableBody?.querySelector<HTMLElement>(`[data-cobros-appointment="${appointmentId}"]`)
			: cardsEl?.querySelector<HTMLElement>(`[data-cobros-appointment="${appointmentId}"]`);
		(scrollTarget ?? targets[0] as HTMLElement | undefined)?.scrollIntoView({
			block: 'center',
			behavior: 'smooth',
		});

		focusHighlightTimer = window.setTimeout(() => {
			clearFocusHighlight();
			focusHighlightTimer = null;
		}, 2400);
	};

	const applyPendingCobrosFocus = () => {
		const appointmentId = focusAppointmentId;
		const focusItem = pendingFocusItem;
		focusAppointmentId = 0;
		pendingFocusItem = null;
		if (appointmentId > 0) applyFocusHighlight(appointmentId);
		if (focusItem) openModal(focusItem);
		stripAppointmentQuery();
	};

	const fetchCobros = async (params: URLSearchParams) => {
		const response = await fetch(`/api/cobros?${params.toString()}`, {
			headers: { Accept: 'application/json' },
		});
		const payload = await response.json().catch(() => ({}));
		if (!response.ok || payload.status !== 'success') {
			throw new Error(String(payload.message || 'No fue posible cargar los cobros.'));
		}
		const list = Array.isArray(payload.data) ? (payload.data as CobroItem[]) : [];
		const meta = payload.meta && typeof payload.meta === 'object' ? payload.meta : {};
		return { items: list, meta };
	};

	const load = async () => {
		if (!applyFeatureGate()) {
			setLoading(false);
			items = [];
			totalRecords = 0;
			page = 1;
			render();
			return;
		}
		const requestId = ++loadRequestId;
		setError('');
		setLoading(true);
		updatePagination();
		try {
			const lookupId = pendingAppointmentId;
			if (!lookupId) {
				focusAppointmentId = 0;
				pendingFocusItem = null;
			}
			const params = new URLSearchParams({
				status: statusFilter,
				date_preset: datePreset,
				page: String(page),
				limit: String(PAGE_SIZE),
				sort_dir: sortDir,
				sort_by: sortBy,
			});
			if (datePreset === 'custom') {
				if (dateFromEl?.value) params.set('date_from', dateFromEl.value);
				if (dateToEl?.value) params.set('date_to', dateToEl.value);
			}

			const lookupParams = lookupId
				? new URLSearchParams({
						status: 'all',
						date_preset: 'all',
						page: '1',
						limit: '5',
						sort_dir: 'desc',
						sort_by: 'date',
						appointment_id: String(lookupId),
					})
				: null;

			const listPromise = fetchCobros(params);
			const lookupPromise = lookupParams ? fetchCobros(lookupParams) : null;
			const listResult = await listPromise;
			if (requestId !== loadRequestId) return;

			items = listResult.items;
			totalRecords = Number(listResult.meta.total ?? items.length) || 0;
			page = Number(listResult.meta.page ?? page) || page;
			const pages = totalPages();
			if (items.length === 0 && page > 1 && totalRecords > 0) {
				page = Math.min(page - 1, pages);
				void load();
				return;
			}
			if (page > pages) {
				page = pages;
				if (pages >= 1 && totalRecords > 0) {
					void load();
					return;
				}
			}
			if (lookupPromise) {
				const lookupResult = await lookupPromise;
				if (requestId !== loadRequestId) return;
				const match =
					lookupResult.items.find((item) => item.id_appointment === lookupId) ||
					lookupResult.items[0] ||
					null;
				pendingAppointmentId = 0;
				focusAppointmentId = match?.id_appointment || lookupId;
				pendingFocusItem = match;
			}
		} catch (error) {
			if (requestId !== loadRequestId) return;
			items = [];
			totalRecords = 0;
			setError(error instanceof Error ? error.message : 'No fue posible cargar los cobros.');
		} finally {
			if (requestId !== loadRequestId) return;
			setLoading(false);
			render();
			if (focusAppointmentId || pendingFocusItem) {
				applyPendingCobrosFocus();
			}
		}
	};

	root.__cobrosReload = () => {
		void load();
	};

	const setApproveBusy = (on: boolean) => {
		const btn = modal?.querySelector<HTMLButtonElement>('[data-cobros-approve]');
		const icon = btn?.querySelector<HTMLElement>('[data-cobros-approve-icon]');
		const rejectBtn = modal?.querySelector<HTMLButtonElement>('[data-cobros-reject]');
		const closeBtn = modal?.querySelector<HTMLButtonElement>('[data-cobros-modal-close]');
		if (!btn) return;
		btn.classList.toggle('is-busy', on);
		btn.disabled = on;
		btn.setAttribute('aria-busy', on ? 'true' : 'false');
		if (icon) {
			icon.textContent = on ? 'progress_activity' : 'check';
			icon.classList.toggle('animate-spin', on);
		}
		if (rejectBtn) rejectBtn.disabled = on;
		if (closeBtn) closeBtn.disabled = on;
	};

	const setDisputeUploadBusy = (on: boolean) => {
		disputeProofBusy = on;
		const btn = modal?.querySelector<HTMLButtonElement>('[data-cobros-dispute-upload]');
		const icon = btn?.querySelector<HTMLElement>('[data-cobros-dispute-upload-icon]');
		const label = btn?.querySelector<HTMLElement>('[data-cobros-dispute-upload-label]');
		const closeBtn = modal?.querySelector<HTMLButtonElement>('[data-cobros-modal-close]');
		btn?.classList.toggle('is-busy', on);
		if (btn) {
			btn.disabled = on;
			btn.setAttribute('aria-busy', on ? 'true' : 'false');
		}
		if (icon) {
			icon.textContent = on ? 'progress_activity' : 'upload';
			icon.classList.toggle('animate-spin', on);
		}
		if (label) label.textContent = on ? 'Leyendo comprobante…' : 'Enviar prueba';
		if (closeBtn) closeBtn.disabled = on;
		disputeDropzone?.setLocked(on);
	};

	const setRefundSentBusy = (on: boolean) => {
		const btn = modal?.querySelector<HTMLButtonElement>('[data-cobros-mark-refund-sent]');
		const icon = btn?.querySelector<HTMLElement>('[data-cobros-refund-sent-icon]');
		const waiveBtn = modal?.querySelector<HTMLButtonElement>('[data-cobros-waive]');
		const closeBtn = modal?.querySelector<HTMLButtonElement>('[data-cobros-modal-close]');
		if (!btn) return;
		btn.classList.toggle('is-busy', on);
		btn.disabled = on;
		btn.setAttribute('aria-busy', on ? 'true' : 'false');
		if (icon) {
			icon.textContent = on ? 'progress_activity' : 'check';
			icon.classList.toggle('animate-spin', on);
		}
		if (waiveBtn) waiveBtn.disabled = on;
		if (closeBtn) closeBtn.disabled = on;
	};

	const approve = async () => {
		if (!selected || busy) return;
		busy = true;
		setApproveBusy(true);
		const statusEl = modal?.querySelector<HTMLElement>('[data-cobros-modal-status]');
		if (statusEl) statusEl.textContent = '';
		try {
			const response = await fetch(`/api/cobros/${selected.id_transaction}/approve`, {
				method: 'POST',
				headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
				body: '{}',
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok || payload.status !== 'success') {
				throw new Error(String(payload.message || 'No fue posible aprobar.'));
			}
			closeModal();
			showFlashMessage({
				type: 'success',
				message: String(payload.message || '').trim() || 'Comprobante aprobado.',
				autoHideMs: 4000,
			});
			await load();
			document.dispatchEvent(new CustomEvent('hasel:cobros-changed'));
		} catch (error) {
			setApproveBusy(false);
			showFlashMessage({
				type: 'error',
				message: error instanceof Error ? error.message : 'No fue posible aprobar.',
				autoHideMs: 5000,
			});
		} finally {
			busy = false;
		}
	};

	const reject = async () => {
		if (!selected || busy) return;
		busy = true;
		const statusEl = modal?.querySelector<HTMLElement>('[data-cobros-modal-status]');
		const reason =
			modal?.querySelector<HTMLInputElement>('[data-cobros-reject-reason]')?.value.trim() ||
			'';
		if (statusEl) statusEl.textContent = 'Rechazando…';
		try {
			const response = await fetch(`/api/cobros/${selected.id_transaction}/reject`, {
				method: 'POST',
				headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
				body: JSON.stringify({ reason: reason || null }),
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok || payload.status !== 'success') {
				throw new Error(String(payload.message || 'No fue posible rechazar.'));
			}
			closeModal();
			await load();
			document.dispatchEvent(new CustomEvent('hasel:cobros-changed'));
		} catch (error) {
			if (statusEl) {
				statusEl.textContent =
					error instanceof Error ? error.message : 'No fue posible rechazar.';
			}
		} finally {
			busy = false;
		}
	};

	const classifyOcrOutcome = (payload: Record<string, unknown>) => {
		const data =
			payload.data && typeof payload.data === 'object'
				? (payload.data as Record<string, unknown>)
				: {};
		const ocr = String(data.ocr_status || '').trim().toUpperCase();
		// MATCH es el mismo OCR de señas; el upload ya fue 200. Queda en revisión
		// (el OCR no acredita la transferencia). Vacío: ORDS guardó sin clasificar.
		if (!ocr || ocr === 'ACCEPTED' || ocr === 'MANUAL_REVIEW' || ocr === 'MATCH') {
			return 'review' as const;
		}
		return 'retryable_error' as const;
	};

	const uploadDisputeProof = async () => {
		if (!selected || busy) return;
		const file = disputeDropzone?.getFile();
		const statusEl = modal?.querySelector<HTMLElement>('[data-cobros-modal-status]');
		if (!file) {
			if (statusEl) statusEl.textContent = 'Elegí una foto o PDF del comprobante de reembolso.';
			return;
		}
		const kind = classifyReceiptFile(file);
		if (!kind) {
			if (statusEl) statusEl.textContent = 'Formato no válido. Subí una imagen (JPG/PNG) o un PDF.';
			return;
		}
		busy = true;
		setDisputeUploadBusy(true);
		if (statusEl) statusEl.textContent = 'Subiendo y leyendo el comprobante…';
		try {
			const signature = receiptFileSignature(file);
			if (!disputeIdemKey || disputeIdemSig !== signature) {
				disputeIdemKey = createIdempotencyKey();
				disputeIdemSig = signature;
			}
			let uploadFile = file;
			if (kind === 'pdf') {
				const { prepareReceiptUploadFile } = await import('../lib/pdf-receipt-to-image');
				uploadFile = await prepareReceiptUploadFile(file);
			}
			const uploadIsPdf =
				uploadFile.type === 'application/pdf' ||
				String(uploadFile.name || '').toLowerCase().endsWith('.pdf');
			const fileBase64 = await fileToBase64(uploadFile);
			const response = await fetch(`/api/cobros/${selected.id_transaction}/refund-proof`, {
				method: 'POST',
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
					'Idempotency-Key': disputeIdemKey,
				},
				body: JSON.stringify({
					file_base64: fileBase64,
					filename: uploadFile.name || (uploadIsPdf ? 'reembolso.pdf' : 'reembolso.jpg'),
					mime_type: uploadFile.type || (uploadIsPdf ? 'application/pdf' : 'image/jpeg'),
				}),
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok || payload.status !== 'success') {
				disputeIdemKey = null;
				disputeIdemSig = null;
				throw new Error(String(payload.message || 'No fue posible subir la prueba.'));
			}
			const outcome = classifyOcrOutcome(payload);
			const nextStatus = String(
				(payload.data as Record<string, unknown> | undefined)?.dispute_status || 'UNDER_REVIEW'
			);
			const message =
				String(payload.message || '').trim() ||
				(outcome === 'review'
					? 'Comprobante recibido. Queda en revisión; esto no acredita que el dinero se haya enviado.'
					: 'No se pudo validar el comprobante.');
			if (outcome === 'review') {
				selected = {
					...selected,
					refund_dispute_has_proof: 1,
					refund_dispute_status: String(nextStatus || 'UNDER_REVIEW'),
					ui_status: 'refund_dispute',
				};
				closeModal();
				showFlashMessage({ type: 'success', message, autoHideMs: 5000 });
				await load();
				document.dispatchEvent(new CustomEvent('hasel:cobros-changed'));
				return;
			}
			selected = {
				...selected,
				refund_dispute_has_proof: 1,
				refund_dispute_status: selected.refund_dispute_status,
			};
			syncDisputeLead(selected);
			disputeDropzone?.reset();
			disputeIdemKey = null;
			disputeIdemSig = null;
			if (statusEl) statusEl.textContent = message;
			showFlashMessage({
				type: 'error',
				message,
				autoHideMs: 5000,
			});
			document.dispatchEvent(new CustomEvent('hasel:cobros-changed'));
		} catch (error) {
			if (statusEl) {
				statusEl.textContent =
					error instanceof Error ? error.message : 'No fue posible subir la prueba.';
			}
		} finally {
			busy = false;
			setDisputeUploadBusy(false);
		}
	};

	const markRefundSent = async () => {
		if (!selected || busy) return;
		busy = true;
		setRefundSentBusy(true);
		const statusEl = modal?.querySelector<HTMLElement>('[data-cobros-modal-status]');
		if (statusEl) statusEl.textContent = '';
		try {
			const response = await fetch(`/api/cobros/${selected.id_transaction}/mark-refund-sent`, {
				method: 'POST',
				headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
				body: '{}',
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok || payload.status !== 'success') {
				throw new Error(String(payload.message || 'No fue posible marcar el reembolso.'));
			}
			closeModal();
			showFlashMessage({
				type: 'success',
				message: String(payload.message || '').trim() || 'Reembolso marcado como enviado.',
				autoHideMs: 4000,
			});
			await load();
			document.dispatchEvent(new CustomEvent('hasel:cobros-changed'));
		} catch (error) {
			setRefundSentBusy(false);
			showFlashMessage({
				type: 'error',
				message: error instanceof Error ? error.message : 'No fue posible marcar el reembolso.',
				autoHideMs: 5000,
			});
		} finally {
			busy = false;
		}
	};

	const waiveRefund = async () => {
		if (!selected || busy) return;
		const reasonInput = modal?.querySelector<HTMLInputElement>('[data-cobros-waive-reason]');
		const reason = String(reasonInput?.value || '').trim();
		if (reason.length < 5) {
			const statusEl = modal?.querySelector<HTMLElement>('[data-cobros-modal-status]');
			if (statusEl) statusEl.textContent = 'Indica un motivo de al menos 5 caracteres.';
			return;
		}
		busy = true;
		const statusEl = modal?.querySelector<HTMLElement>('[data-cobros-modal-status]');
		if (statusEl) statusEl.textContent = 'Omitiendo el reembolso…';
		try {
			const response = await fetch(`/api/cobros/${selected.id_transaction}/waive-refund`, {
				method: 'POST',
				headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
				body: JSON.stringify({ reason }),
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok || payload.status !== 'success') {
				throw new Error(String(payload.message || 'No fue posible omitir el reembolso.'));
			}
			closeModal();
			await load();
			document.dispatchEvent(new CustomEvent('hasel:cobros-changed'));
		} catch (error) {
			if (statusEl) {
				statusEl.textContent =
					error instanceof Error ? error.message : 'No fue posible omitir el reembolso.';
			}
		} finally {
			busy = false;
		}
	};

	root.querySelectorAll<HTMLButtonElement>('[data-cobros-tab]').forEach((btn) => {
		btn.addEventListener('click', () => {
			applyStatusOption((btn.dataset.cobrosTab || 'all') as CobrosStatusFilter);
		});
	});

	root.querySelectorAll<HTMLButtonElement>('[data-cobros-sort-field]').forEach((btn) => {
		btn.addEventListener('click', () => {
			const field: CobrosSortBy = btn.dataset.cobrosSortField === 'price' ? 'price' : 'date';
			const dir = btn.dataset.cobrosSort === 'asc' ? 'asc' : 'desc';
			applySort(field, dir);
		});
	});

	root.querySelectorAll<HTMLButtonElement>('[data-cobros-sort-by]').forEach((btn) => {
		btn.addEventListener('click', () => {
			applySort(btn.dataset.cobrosSortBy === 'price' ? 'price' : 'date', sortDir);
		});
	});

	root.querySelectorAll<HTMLButtonElement>('[data-cobros-sort-dir]').forEach((btn) => {
		btn.addEventListener('click', () => {
			applySort(sortBy, btn.dataset.cobrosSortDir === 'asc' ? 'asc' : 'desc');
		});
	});

	statusSelect?.addEventListener('change', () => {
		applyStatusOption((statusSelect.value || 'all') as CobrosStatusFilter);
	});

	prevPageBtn?.addEventListener('click', () => {
		if (page <= 1 || loading) return;
		page -= 1;
		void load();
	});
	nextPageBtn?.addEventListener('click', () => {
		if (page >= totalPages() || loading) return;
		page += 1;
		void load();
	});

	paginationEl?.addEventListener('click', (event) => {
		const target = event.target;
		if (!(target instanceof Element) || loading) return;
		const pageBtn = target.closest<HTMLButtonElement>('[data-cobros-page]');
		if (!pageBtn) return;
		const nextPage = Number(pageBtn.getAttribute('data-cobros-page') || '1');
		if (!Number.isInteger(nextPage) || nextPage <= 0 || nextPage === page) return;
		page = nextPage;
		void load();
	});

	periodFilterBtn?.addEventListener('click', openPeriodSheet);
	if (periodSheet) {
		bindFilterPopoverChrome({
			sheet: periodSheet,
			getTrigger: () => periodFilterBtn,
			widthRem: 22,
			ignoreOutside: () => {
				const active = document.activeElement;
				return (
					active instanceof HTMLInputElement &&
					active.type === 'date' &&
					periodSheet.contains(active)
				);
			},
		});
	}
	bindNativeDateFace(dateFromEl);
	bindNativeDateFace(dateToEl);

	periodSheet?.addEventListener('click', (event) => {
		const target = event.target;
		if (!(target instanceof Element) || !periodSheet) return;

		const dateWrap = target.closest<HTMLElement>('[data-cobros-date]');
		if (dateWrap) {
			const dateInput = dateWrap.querySelector<HTMLInputElement>('input[type="date"]');
			if (dateInput) {
				event.preventDefault();
				event.stopPropagation();
				openNativeDatePicker(dateInput);
				return;
			}
		}

		// Backdrop del bottom sheet (modal): cerrar al tocar fuera del panel.
		if (target === periodSheet) {
			closePeriodSheet();
			return;
		}
		if (target.closest('[data-close-period-filter]')) {
			closePeriodSheet();
			return;
		}

		const option = target.closest<HTMLButtonElement>('[data-period-option]');
		if (option) {
			applyPeriodOption((option.dataset.periodOption || 'all') as CobrosDatePreset);
			return;
		}

		if (target.closest('[data-apply-period-filter]')) {
			if (datePreset === 'custom') {
				const from = dateFromEl?.value || '';
				const to = dateToEl?.value || '';
				if (!from || !to) {
					setDateError('Completá desde y hasta para aplicar el periodo.');
					markDateInvalid(dateFromEl, !from);
					markDateInvalid(dateToEl, !to);
					return;
				}
				if (from > to) {
					setDateError('La fecha desde no puede ser posterior a hasta.');
					markDateInvalid(dateFromEl, true);
					markDateInvalid(dateToEl, true);
					return;
				}
			}
			setDateError('');
			closePeriodSheet();
			page = 1;
			void load();
		}
	});

	root.addEventListener('click', (event) => {
		const target = event.target as HTMLElement | null;
		const openBtn = target?.closest<HTMLElement>('[data-cobros-open]');
		if (openBtn) {
			const id = Number(openBtn.dataset.cobrosOpen || 0);
			const item = items.find((x) => x.id_transaction === id);
			if (item) openModal(item);
		}
	});

	modal?.querySelector('[data-cobros-modal-close]')?.addEventListener('click', () => {
		if (busy) return;
		closeModal();
	});
	modal?.querySelector('[data-cobros-approve]')?.addEventListener('click', () => void approve());
	modal?.querySelector('[data-cobros-reject]')?.addEventListener('click', () => setRejectMode(true));
	modal
		?.querySelector('[data-cobros-reject-cancel]')
		?.addEventListener('click', () => setRejectMode(false));
	modal
		?.querySelector('[data-cobros-reject-confirm]')
		?.addEventListener('click', () => void reject());
	modal
		?.querySelector('[data-cobros-mark-refund-sent]')
		?.addEventListener('click', () => void markRefundSent());
	modal
		?.querySelector('[data-cobros-dispute-upload]')
		?.addEventListener('click', () => void uploadDisputeProof());
	modal?.querySelector('[data-cobros-waive]')?.addEventListener('click', () => {
		if (!waiveConfirmReady) {
			waiveConfirmReady = true;
			modal?.querySelector<HTMLElement>('[data-cobros-waive-wrap]')?.classList.remove('hidden');
			const btn = modal?.querySelector<HTMLButtonElement>('[data-cobros-waive]');
			if (btn) btn.textContent = 'Confirmar omisión';
			modal?.querySelector<HTMLInputElement>('[data-cobros-waive-reason]')?.focus();
			return;
		}
		void waiveRefund();
	});
	modal?.addEventListener('click', (event) => {
		if (busy) return;
		if (event.target === modal) closeModal();
	});
	modal?.addEventListener('cancel', (event) => {
		event.preventDefault();
		if (busy) return;
		closeModal();
	});

	if (datePresetEl) datePresetEl.value = datePreset;
	syncTabs();
	syncSortUi();
	updatePeriodFilterUi();
	applyFeatureGate();
	void load();

	onSubscriptionRefresh = () => {
		const ok = applyFeatureGate();
		if (ok) void load();
	};

	onCobrosFocusRequest = (appointmentId) => {
		pendingAppointmentId = appointmentId;
		void load();
	};

	if (!subscriptionListenerBound) {
		subscriptionListenerBound = true;
		document.addEventListener('hasel:subscription', () => {
			onSubscriptionRefresh?.();
		});
	}

	if (!cobrosFocusListenerBound) {
		cobrosFocusListenerBound = true;
		document.addEventListener('hasel:focus-cobro', (event) => {
			const id = Number((event as CustomEvent<{ appointmentId?: number }>).detail?.appointmentId || 0);
			if (!Number.isInteger(id) || id <= 0) return;
			onCobrosFocusRequest?.(id);
		});
	}
};

if (!customElements.get('cobros-manager')) {
	customElements.define('cobros-manager', class extends HTMLElement {});
}
