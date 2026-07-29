import type { CobroItem, CobrosDatePreset, CobrosStatusFilter } from '../lib/cobros';
import { parseApiDateTime } from '../lib/booking-datetime';
import {
	bindFilterPopoverChrome,
	closeFilterPopoverSheet,
	positionFilterPopover,
	toggleFilterPopoverSheet,
} from '../lib/panel-filter-popover';
import { updateAppPaginationDom } from '../lib/pagination';

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

const isExpiredCobro = (item: CobroItem) => {
	const pay = String(item.payment_status || '').toUpperCase();
	const ui = String(item.ui_status || '').toUpperCase();
	return pay === 'EXPIRED' || ui === 'EXPIRED';
};

const statusLabel = (item: CobroItem) => {
	if (isExpiredCobro(item)) return 'Vencido';
	if (item.ui_status === 'approved') return 'Aprobado';
	if (item.ui_status === 'pending') return 'Pendiente de revisión';
	if (item.ui_status === 'refund_pending') return 'Reembolso pendiente';
	if (item.ui_status === 'refund_awaiting_alias') return 'Esperando alias';
	if (item.ui_status === 'refund_sent') return 'Reembolso enviado';
	if (item.ui_status === 'refund_waived') return 'Reembolso renunciado';
	const raw = String(item.ocr_status || item.payment_status || '').trim().toUpperCase();
	if (raw === 'EXPIRED') return 'Vencido';
	if (raw === 'CANCELLED' || raw === 'CANCELED') return 'Cancelado';
	if (raw === 'PENDING') return 'Pendiente';
	if (raw === 'PAID' || raw === 'PAID_TRANSFER') return 'Pagado';
	return String(item.ocr_status || item.payment_status || '—');
};

const statusChipClass = (item: CobroItem) => {
	if (isExpiredCobro(item)) return 'cobros-chip cobros-chip--expired';
	if (item.ui_status === 'approved') return 'cobros-chip cobros-chip--approved';
	if (item.ui_status === 'pending') return 'cobros-chip cobros-chip--pending';
	if (item.ui_status === 'refund_pending' || item.ui_status === 'refund_awaiting_alias') {
		return 'cobros-chip cobros-chip--refund';
	}
	if (item.ui_status === 'refund_sent') return 'cobros-chip cobros-chip--sent';
	if (item.ui_status === 'refund_waived') return 'cobros-chip cobros-chip--other';
	return 'cobros-chip cobros-chip--other';
};

const isoToDisplay = (iso: string) => {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
	if (!match) return '';
	return `${match[3]}/${match[2]}/${match[1]}`;
};

const displayToIso = (display: string) => {
	const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(display || '').trim());
	if (!match) return '';
	const day = Number(match[1]);
	const month = Number(match[2]);
	const year = Number(match[3]);
	if (month < 1 || month > 12 || day < 1 || day > 31) return '';
	const date = new Date(year, month - 1, day);
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
		return '';
	}
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const maskDateDisplay = (raw: string) => {
	const digits = String(raw || '')
		.replace(/\D/g, '')
		.slice(0, 8);
	if (digits.length <= 2) return digits;
	if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
	return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

let onSubscriptionRefresh: (() => void) | null = null;
let subscriptionListenerBound = false;

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
	const dateFromTextEl = root.querySelector<HTMLInputElement>('[data-cobros-date-from-text]');
	const dateToTextEl = root.querySelector<HTMLInputElement>('[data-cobros-date-to-text]');
	const dateFromPickBtn = root.querySelector<HTMLButtonElement>('[data-cobros-date-from-pick]');
	const dateToPickBtn = root.querySelector<HTMLButtonElement>('[data-cobros-date-to-pick]');
	const dateErrorEl = root.querySelector<HTMLElement>('[data-cobros-date-error]');
	const datePicker = root.querySelector<HTMLDialogElement>('[data-cobros-date-picker]');
	const datePickerLabel = root.querySelector<HTMLElement>('[data-cobros-dp-label]');
	const datePickerMonth = root.querySelector<HTMLSelectElement>('[data-cobros-dp-month]');
	const datePickerYear = root.querySelector<HTMLSelectElement>('[data-cobros-dp-year]');
	const datePickerDays = root.querySelector<HTMLElement>('[data-cobros-dp-days]');
	const datePickerPrev = root.querySelector<HTMLButtonElement>('[data-cobros-dp-prev]');
	const datePickerNext = root.querySelector<HTMLButtonElement>('[data-cobros-dp-next]');
	const datePickerClose = root.querySelector<HTMLButtonElement>('[data-cobros-dp-close]');
	const datePickerToday = root.querySelector<HTMLButtonElement>('[data-cobros-dp-today]');
	const datePickerApply = root.querySelector<HTMLButtonElement>('[data-cobros-dp-apply]');
	const periodFilterBtn = root.querySelector<HTMLButtonElement>('[data-open-period-filter]');
	const periodFilterBadge = root.querySelector<HTMLElement>('[data-period-filter-badge]');
	const periodSheet = root.querySelector<HTMLDialogElement>('[data-cobros-period-sheet]');
	const modal = root.querySelector<HTMLDialogElement>('[data-cobros-modal]');
	const viewer = root.querySelector<HTMLDialogElement>('[data-cobros-viewer]');
	const viewerImg = viewer?.querySelector<HTMLImageElement>('[data-cobros-viewer-img]') ?? null;
	const viewerFrame = viewer?.querySelector<HTMLIFrameElement>('[data-cobros-viewer-frame]') ?? null;
	const viewerName = viewer?.querySelector<HTMLElement>('[data-cobros-viewer-name]') ?? null;
	const viewerOpen = viewer?.querySelector<HTMLAnchorElement>('[data-cobros-viewer-open]') ?? null;
	const featureSection = root.querySelector<HTMLElement>('[data-requires-feature="DEPOSIT_COLLECTION"]');
	const lockedSection = root.querySelector<HTMLElement>('[data-cobros-feature-locked]');
	const paginationEl = root.querySelector<HTMLElement>('[data-cobros-pagination]');
	const prevPageBtn = root.querySelector<HTMLButtonElement>('[data-cobros-prev]');
	const nextPageBtn = root.querySelector<HTMLButtonElement>('[data-cobros-next]');

	const PAGE_SIZE = 9;
	let statusFilter: CobrosStatusFilter = 'all';
	let datePreset: CobrosDatePreset = 'this_month';
	let items: CobroItem[] = [];
	let selected: CobroItem | null = null;
	let busy = false;
	let loading = false;
	let loadRequestId = 0;
	let page = 1;
	let totalRecords = 0;
	let activeDateField: 'from' | 'to' | null = null;
	let pickerViewDate = new Date();
	let pickerDraftDate = new Date();

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

	const syncTextFromNative = () => {
		if (dateFromTextEl) dateFromTextEl.value = isoToDisplay(dateFromEl?.value || '');
		if (dateToTextEl) dateToTextEl.value = isoToDisplay(dateToEl?.value || '');
		dateFromTextEl?.classList.remove('is-invalid');
		dateToTextEl?.classList.remove('is-invalid');
		setDateError('');
	};

	const syncNativeFromText = (which: 'from' | 'to' | 'both' = 'both') => {
		const syncOne = (
			textEl: HTMLInputElement | null,
			nativeEl: HTMLInputElement | null,
			required: boolean
		) => {
			if (!textEl || !nativeEl) return true;
			const raw = textEl.value.trim();
			if (!raw) {
				nativeEl.value = '';
				textEl.classList.toggle('is-invalid', required);
				return !required;
			}
			const iso = displayToIso(raw);
			if (!iso) {
				textEl.classList.add('is-invalid');
				return false;
			}
			nativeEl.value = iso;
			textEl.value = isoToDisplay(iso);
			textEl.classList.remove('is-invalid');
			return true;
		};

		const fromOk =
			which === 'to' ? true : syncOne(dateFromTextEl, dateFromEl, datePreset === 'custom');
		const toOk =
			which === 'from' ? true : syncOne(dateToTextEl, dateToEl, datePreset === 'custom');
		return fromOk && toOk;
	};

	const parseIsoDate = (iso: string) => {
		const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
		if (!match) return null;
		const year = Number(match[1]);
		const month = Number(match[2]);
		const day = Number(match[3]);
		const date = new Date(year, month - 1, day);
		if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
			return null;
		}
		return date;
	};

	const toIsoDate = (date: Date) =>
		`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

	const ensurePickerMonthOptions = () => {
		if (!datePickerMonth || datePickerMonth.options.length > 0) return;
		const monthFormatter = new Intl.DateTimeFormat('es-PY', { month: 'long' });
		for (let month = 0; month < 12; month += 1) {
			const option = document.createElement('option');
			option.value = String(month);
			const monthName = monthFormatter.format(new Date(2020, month, 1));
			option.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
			datePickerMonth.appendChild(option);
		}
	};

	const renderPickerYearOptions = () => {
		if (!datePickerYear) return;
		const viewYear = pickerViewDate.getFullYear();
		const minYear = viewYear - 12;
		const maxYear = viewYear + 12;
		const firstYear = Number(datePickerYear.options[0]?.value ?? Number.NaN);
		const lastYear = Number(
			datePickerYear.options[datePickerYear.options.length - 1]?.value ?? Number.NaN
		);
		if (
			datePickerYear.options.length === 0 ||
			firstYear !== minYear ||
			lastYear !== maxYear
		) {
			datePickerYear.replaceChildren();
			for (let year = minYear; year <= maxYear; year += 1) {
				const option = document.createElement('option');
				option.value = String(year);
				option.textContent = String(year);
				datePickerYear.appendChild(option);
			}
		}
		datePickerYear.value = String(viewYear);
	};

	const renderDatePickerDays = () => {
		if (!datePickerDays) return;
		datePickerDays.replaceChildren();

		const viewYear = pickerViewDate.getFullYear();
		const viewMonth = pickerViewDate.getMonth();
		const firstDay = new Date(viewYear, viewMonth, 1);
		const firstWeekdayMondayBased = (firstDay.getDay() + 6) % 7;
		const gridStart = new Date(viewYear, viewMonth, 1 - firstWeekdayMondayBased);
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		for (let index = 0; index < 42; index += 1) {
			const date = new Date(
				gridStart.getFullYear(),
				gridStart.getMonth(),
				gridStart.getDate() + index
			);
			const inCurrentMonth = date.getMonth() === viewMonth;
			const isSelected =
				date.getFullYear() === pickerDraftDate.getFullYear() &&
				date.getMonth() === pickerDraftDate.getMonth() &&
				date.getDate() === pickerDraftDate.getDate();
			const isToday = date.getTime() === today.getTime();

			const button = document.createElement('button');
			button.type = 'button';
			button.textContent = String(date.getDate());
			button.className = [
				'dtp-day',
				!inCurrentMonth ? 'dtp-day--out' : '',
				isToday ? 'dtp-day--today' : '',
				isSelected ? 'dtp-day--selected' : '',
			]
				.filter(Boolean)
				.join(' ');
			button.addEventListener('click', () => {
				pickerDraftDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
				renderDatePicker();
				applyDatePicker();
			});
			datePickerDays.appendChild(button);
		}
	};

	const renderDatePicker = () => {
		ensurePickerMonthOptions();
		if (datePickerMonth) datePickerMonth.value = String(pickerViewDate.getMonth());
		renderPickerYearOptions();
		renderDatePickerDays();
	};

	let datePickerAnchor: HTMLElement | null = null;

	const positionDatePicker = () => {
		if (!datePicker?.open) return;
		const anchor = datePickerAnchor;
		if (!anchor) return;
		const card = datePicker.querySelector<HTMLElement>('.dtp-card');
		const rect = anchor.getBoundingClientRect();
		const gap = 6;
		const cardW = card?.offsetWidth || datePicker.offsetWidth || 320;
		const cardH = card?.offsetHeight || datePicker.offsetHeight || 380;
		let left = rect.left;
		left = Math.max(8, Math.min(left, window.innerWidth - cardW - 8));
		let top = rect.bottom + gap;
		if (top + cardH > window.innerHeight - 8) {
			const above = rect.top - gap - cardH;
			top = above >= 8 ? above : Math.max(8, window.innerHeight - cardH - 8);
		}
		datePicker.style.left = `${Math.round(left)}px`;
		datePicker.style.top = `${Math.round(top)}px`;
	};

	const closeDatePicker = () => {
		if (datePicker?.open) datePicker.close();
		activeDateField = null;
		datePickerAnchor = null;
	};

	const openDatePicker = (field: 'from' | 'to', anchor?: HTMLElement | null) => {
		if (!datePicker) return;
		activeDateField = field;
		datePickerAnchor = anchor ?? (field === 'from' ? dateFromPickBtn : dateToPickBtn);
		const source = field === 'from' ? dateFromEl : dateToEl;
		const parsed = parseIsoDate(source?.value || '') || new Date();
		parsed.setHours(0, 0, 0, 0);
		pickerDraftDate = parsed;
		pickerViewDate = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
		if (datePickerLabel) {
			datePickerLabel.textContent =
				field === 'from' ? 'Seleccionando desde' : 'Seleccionando hasta';
		}
		renderDatePicker();
		if (!datePicker.open) datePicker.show();
		positionDatePicker();
		requestAnimationFrame(positionDatePicker);
	};

	const applyDatePicker = () => {
		if (!activeDateField) return;
		const iso = toIsoDate(pickerDraftDate);
		const display = isoToDisplay(iso);
		if (activeDateField === 'from') {
			if (dateFromEl) dateFromEl.value = iso;
			if (dateFromTextEl) {
				dateFromTextEl.value = display;
				dateFromTextEl.classList.remove('is-invalid');
			}
		} else {
			if (dateToEl) dateToEl.value = iso;
			if (dateToTextEl) {
				dateToTextEl.value = display;
				dateToTextEl.classList.remove('is-invalid');
			}
		}
		setDateError('');
		closeDatePicker();
	};

	const caretAfterDigits = (formatted: string, digitCount: number) => {
		if (digitCount <= 0) return 0;
		let seen = 0;
		for (let i = 0; i < formatted.length; i += 1) {
			if (/\d/.test(formatted[i]!)) {
				seen += 1;
				if (seen >= digitCount) return i + 1;
			}
		}
		return formatted.length;
	};

	const bindDateTextInput = (
		textEl: HTMLInputElement | null,
		nativeEl: HTMLInputElement | null
	) => {
		textEl?.addEventListener('input', () => {
			const selection = textEl.selectionStart ?? textEl.value.length;
			const digitsBeforeCaret = textEl.value.slice(0, selection).replace(/\D/g, '').length;
			const next = maskDateDisplay(textEl.value);
			textEl.value = next;
			const nextCaret = caretAfterDigits(next, digitsBeforeCaret);
			textEl.setSelectionRange(nextCaret, nextCaret);
			textEl.classList.remove('is-invalid');
			setDateError('');
			if (next.length === 10) {
				const iso = displayToIso(next);
				if (iso && nativeEl) nativeEl.value = iso;
			} else if (nativeEl && next.length < 10) {
				// Evita valores nativos a medias mientras se edita el mes/día.
				nativeEl.value = '';
			}
		});
		textEl?.addEventListener('blur', () => {
			if (!textEl.value.trim()) {
				if (nativeEl) nativeEl.value = '';
				return;
			}
			const iso = displayToIso(textEl.value);
			if (!iso) {
				textEl.classList.add('is-invalid');
				return;
			}
			if (nativeEl) nativeEl.value = iso;
			textEl.value = isoToDisplay(iso);
			textEl.classList.remove('is-invalid');
		});
		nativeEl?.addEventListener('change', () => {
			if (textEl) textEl.value = isoToDisplay(nativeEl.value || '');
			textEl?.classList.remove('is-invalid');
			setDateError('');
		});
	};

	const updatePeriodFilterUi = () => {
		const mobileFilters =
			typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
		const active = datePreset !== 'this_month' || (mobileFilters && statusFilter !== 'all');
		periodFilterBadge?.classList.toggle('hidden', !active);
		periodFilterBtn?.classList.toggle('is-active', active);
		periodFilterBtn?.setAttribute('aria-pressed', active ? 'true' : 'false');

		periodSheet?.querySelectorAll<HTMLButtonElement>('[data-period-option]').forEach((btn) => {
			const selectedOpt = btn.dataset.periodOption === datePreset;
			btn.classList.toggle('is-selected', selectedOpt);
			btn.setAttribute('aria-selected', selectedOpt ? 'true' : 'false');
		});
		customDatesEl?.classList.toggle('hidden', datePreset !== 'custom');
		if (datePreset !== 'custom' && datePicker?.open) datePicker.close();
		if (datePreset === 'custom') syncTextFromNative();
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
		if (datePicker?.open) datePicker.close();
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

	const applyStatusOption = (next: CobrosStatusFilter) => {
		statusFilter = next;
		page = 1;
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

	const openModal = (item: CobroItem) => {
		selected = item;
		if (!modal) return;

		const setText = (sel: string, value: string) => {
			const el = modal.querySelector<HTMLElement>(sel);
			if (el) el.textContent = value;
		};

		const isRefund =
			item.ui_status === 'refund_pending' ||
			item.ui_status === 'refund_awaiting_alias' ||
			item.ui_status === 'refund_sent' ||
			item.ui_status === 'refund_waived';

		setText(
			'[data-cobros-modal-title]',
			isRefund ? 'Detalle de reembolso' : 'Validar comprobante'
		);
		setText('[data-cobros-modal-subtitle]', formatDateTime(item.start_time || item.created_at));
		setText('[data-cobros-modal-customer]', item.customer_name || '—');
		setText('[data-cobros-modal-service]', item.service_name || '—');
		setText('[data-cobros-modal-professional]', item.professional_name || '—');
		setText('[data-cobros-modal-location]', item.location_name || '—');
		setText(
			'[data-cobros-modal-amount]',
			formatMoney(
				item.refund_amount != null && isRefund ? item.refund_amount : item.amount,
				item.currency
			)
		);
		setText('[data-cobros-modal-reference]', item.payment_reference || '—');
		setText('[data-cobros-modal-refund-alias]', item.refund_alias || '—');
		setText('[data-cobros-modal-refund-status]', statusLabel(item));

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
		receiptRow?.classList.remove('flex');
		noImg?.classList.add('hidden');

		if (receiptUrl) {
			receiptRow?.classList.remove('hidden');
			receiptRow?.classList.add('flex');
			if (receiptIcon) {
				receiptIcon.textContent = isPdf ? 'picture_as_pdf' : 'image';
			}
			if (receiptNameEl) receiptNameEl.textContent = receiptName;
			if (receiptOpenBtn) {
				receiptOpenBtn.onclick = () => openViewer(receiptUrl, isPdf, receiptName);
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
			.querySelector<HTMLElement>('[data-cobros-mark-refund-sent]')
			?.classList.toggle('hidden', !canMarkSent);
		modal.querySelector<HTMLElement>('[data-cobros-waive-wrap]')?.classList.toggle('hidden', !canWaive);

		const claimNote = modal.querySelector<HTMLElement>('[data-cobros-claim-note]');
		if (claimNote) {
			if (item.refund_claim_open) {
				claimNote.textContent = 'Hay un reclamo OPEN por SLA / cliente (cuenta como strike).';
				claimNote.classList.remove('hidden');
			} else if (item.refund_sla_breached) {
				claimNote.textContent = 'SLA de 48h hábiles vencido — el cliente puede reclamar.';
				claimNote.classList.remove('hidden');
			} else {
				claimNote.textContent = '';
				claimNote.classList.add('hidden');
			}
		}
		const reasonInput = modal.querySelector<HTMLInputElement>('[data-cobros-reject-reason]');
		if (reasonInput) reasonInput.value = item.reject_reason || '';
		setText('[data-cobros-modal-status]', '');
		setRejectMode(false);

		modal.classList.remove('is-closing');
		if (!modal.open) modal.showModal();
	};

	let closeTimer: number | null = null;

	const closeModal = () => {
		if (!modal?.open) {
			selected = null;
			return;
		}
		setRejectMode(false);
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
		if (!viewer || !url) return;
		if (viewerName) viewerName.textContent = name || 'Comprobante';
		if (viewerOpen) viewerOpen.href = url;
		if (viewerImg) {
			viewerImg.classList.toggle('hidden', isPdf);
			if (isPdf) {
				viewerImg.removeAttribute('src');
			} else {
				viewerImg.src = url;
			}
		}
		if (viewerFrame) {
			viewerFrame.classList.toggle('hidden', !isPdf);
			viewerFrame.src = isPdf ? url : 'about:blank';
		}
		if (!viewer.open) viewer.showModal();
	};

	const closeViewer = () => {
		if (!viewer?.open) return;
		viewer.close();
		if (viewerFrame) viewerFrame.src = 'about:blank';
		if (viewerImg) viewerImg.removeAttribute('src');
	};

	viewer?.querySelector('[data-cobros-viewer-close]')?.addEventListener('click', closeViewer);
	viewer?.addEventListener('click', (event) => {
		if (event.target === viewer) closeViewer();
	});
	viewer?.addEventListener('cancel', (event) => {
		event.preventDefault();
		closeViewer();
	});

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
			tr.innerHTML = `
				<td class="px-4 py-3 whitespace-nowrap">${formatDateTime(item.start_time || item.created_at)}</td>
				<td class="px-4 py-3 font-semibold">${item.customer_name || '—'}</td>
				<td class="px-4 py-3">${item.service_name || '—'}</td>
				<td class="px-4 py-3 font-bold">${formatMoney(item.amount, item.currency)}</td>
				<td class="px-4 py-3"><span class="${statusChipClass(item)}">${statusLabel(item)}</span></td>
				<td class="px-4 py-3 text-right">
					<button
						type="button"
						class="cobros-view-btn cursor-pointer"
						title="Ver comprobante"
						aria-label="Ver comprobante"
						data-cobros-open="${item.id_transaction}"
					>
						<span class="material-symbols-rounded" aria-hidden="true">visibility</span>
					</button>
				</td>
			`;
			tableBody.appendChild(tr);

			const card = document.createElement('article');
			card.className =
				'grid gap-3.5 rounded-2xl border border-(--shell-border) bg-(--surface-bright) p-4 shadow-sm';
			const ctaLabel =
				item.ui_status === 'refund_pending' ||
				item.ui_status === 'refund_awaiting_alias' ||
				item.ui_status === 'refund_sent'
					? 'Ver reembolso'
					: item.ui_status === 'pending'
						? 'Validar comprobante'
						: 'Ver detalle';
			card.innerHTML = `
				<div class="flex items-start justify-between gap-3">
					<div class="grid min-w-0 gap-0.5">
						<span class="text-[0.7rem] font-semibold uppercase tracking-wide text-(--on-surface-variant)">Cliente</span>
						<p class="m-0 truncate text-[1.02rem] font-semibold text-(--on-surface)">${item.customer_name || '—'}</p>
					</div>
					<span class="${statusChipClass(item)}">${statusLabel(item)}</span>
				</div>
				<div class="grid grid-cols-2 gap-x-4 gap-y-3">
					<div class="grid min-w-0 gap-0.5">
						<span class="text-[0.7rem] font-semibold uppercase tracking-wide text-(--on-surface-variant)">Monto</span>
						<p class="m-0 text-[1.08rem] font-semibold tabular-nums text-(--on-surface)">${formatMoney(item.amount, item.currency)}</p>
					</div>
					<div class="grid min-w-0 gap-0.5">
						<span class="text-[0.7rem] font-semibold uppercase tracking-wide text-(--on-surface-variant)">Servicio</span>
						<p class="m-0 truncate text-[0.95rem] font-semibold text-(--on-surface)">${item.service_name || '—'}</p>
					</div>
					<div class="col-span-2 grid min-w-0 gap-0.5">
						<span class="text-[0.7rem] font-semibold uppercase tracking-wide text-(--on-surface-variant)">Fecha</span>
						<p class="m-0 text-[0.92rem] font-medium text-(--on-surface)">${formatDateTime(item.start_time || item.created_at)}</p>
					</div>
				</div>
				<button type="button" class="inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-(--primary) px-5 text-base font-semibold text-(--on-primary)" data-cobros-open="${item.id_transaction}">
					${ctaLabel}
				</button>
			`;
			cardsEl.appendChild(card);
		}
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
			const params = new URLSearchParams({
				status: statusFilter,
				date_preset: datePreset,
				page: String(page),
				limit: String(PAGE_SIZE),
			});
			if (datePreset === 'custom') {
				if (dateFromEl?.value) params.set('date_from', dateFromEl.value);
				if (dateToEl?.value) params.set('date_to', dateToEl.value);
			}

			const response = await fetch(`/api/cobros?${params.toString()}`, {
				headers: { Accept: 'application/json' },
			});
			const payload = await response.json().catch(() => ({}));
			if (requestId !== loadRequestId) return;
			if (!response.ok || payload.status !== 'success') {
				throw new Error(String(payload.message || 'No fue posible cargar los cobros.'));
			}
			items = Array.isArray(payload.data) ? payload.data : [];
			const meta = payload.meta && typeof payload.meta === 'object' ? payload.meta : {};
			totalRecords = Number(meta.total ?? items.length) || 0;
			page = Number(meta.page ?? page) || page;
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
		} catch (error) {
			if (requestId !== loadRequestId) return;
			items = [];
			totalRecords = 0;
			setError(error instanceof Error ? error.message : 'No fue posible cargar los cobros.');
		} finally {
			if (requestId !== loadRequestId) return;
			setLoading(false);
			render();
		}
	};

	root.__cobrosReload = () => {
		void load();
	};

	const approve = async () => {
		if (!selected || busy) return;
		busy = true;
		const statusEl = modal?.querySelector<HTMLElement>('[data-cobros-modal-status]');
		if (statusEl) statusEl.textContent = 'Aprobando…';
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
			await load();
			document.dispatchEvent(new CustomEvent('hasel:cobros-changed'));
		} catch (error) {
			if (statusEl) {
				statusEl.textContent =
					error instanceof Error ? error.message : 'No fue posible aprobar.';
			}
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

	const markRefundSent = async () => {
		if (!selected || busy) return;
		busy = true;
		const statusEl = modal?.querySelector<HTMLElement>('[data-cobros-modal-status]');
		if (statusEl) statusEl.textContent = 'Marcando como enviado…';
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
			await load();
			document.dispatchEvent(new CustomEvent('hasel:cobros-changed'));
		} catch (error) {
			if (statusEl) {
				statusEl.textContent =
					error instanceof Error ? error.message : 'No fue posible marcar el reembolso.';
			}
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
		if (statusEl) statusEl.textContent = 'Guardando waiver…';
		try {
			const response = await fetch(`/api/cobros/${selected.id_transaction}/waive-refund`, {
				method: 'POST',
				headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
				body: JSON.stringify({ reason }),
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok || payload.status !== 'success') {
				throw new Error(String(payload.message || 'No fue posible renunciar al reembolso.'));
			}
			closeModal();
			await load();
			document.dispatchEvent(new CustomEvent('hasel:cobros-changed'));
		} catch (error) {
			if (statusEl) {
				statusEl.textContent =
					error instanceof Error ? error.message : 'No fue posible renunciar al reembolso.';
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
		});
	}
	bindDateTextInput(dateFromTextEl, dateFromEl);
	bindDateTextInput(dateToTextEl, dateToEl);
	dateFromPickBtn?.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		openDatePicker('from', dateFromPickBtn);
	});
	dateToPickBtn?.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		openDatePicker('to', dateToPickBtn);
	});

	datePickerPrev?.addEventListener('click', () => {
		pickerViewDate = new Date(pickerViewDate.getFullYear(), pickerViewDate.getMonth() - 1, 1);
		renderDatePicker();
	});
	datePickerNext?.addEventListener('click', () => {
		pickerViewDate = new Date(pickerViewDate.getFullYear(), pickerViewDate.getMonth() + 1, 1);
		renderDatePicker();
	});
	datePickerMonth?.addEventListener('change', () => {
		pickerViewDate = new Date(
			pickerViewDate.getFullYear(),
			Number(datePickerMonth.value),
			1
		);
		renderDatePicker();
	});
	datePickerYear?.addEventListener('change', () => {
		pickerViewDate = new Date(Number(datePickerYear.value), pickerViewDate.getMonth(), 1);
		renderDatePicker();
	});
	datePickerClose?.addEventListener('click', closeDatePicker);
	datePickerToday?.addEventListener('click', () => {
		const now = new Date();
		now.setHours(0, 0, 0, 0);
		pickerDraftDate = now;
		pickerViewDate = new Date(now.getFullYear(), now.getMonth(), 1);
		renderDatePicker();
	});
	datePickerApply?.addEventListener('click', applyDatePicker);

	// Click-away: cerrar el calendario si se clickea fuera de él (sin cerrar el filtro).
	document.addEventListener(
		'pointerdown',
		(event) => {
			if (!datePicker?.open) return;
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (datePicker.contains(target)) return;
			if (dateFromPickBtn?.contains(target) || dateToPickBtn?.contains(target)) return;
			closeDatePicker();
		},
		true
	);
	// Esc: cerrar solo el calendario primero (no el filtro).
	document.addEventListener(
		'keydown',
		(event) => {
			if (event.key !== 'Escape' || !datePicker?.open) return;
			event.preventDefault();
			event.stopPropagation();
			closeDatePicker();
		},
		true
	);
	window.addEventListener('resize', positionDatePicker);
	window.addEventListener('scroll', positionDatePicker, true);
	periodSheet?.addEventListener('close', closeDatePicker);

	periodSheet?.addEventListener('click', (event) => {
		const target = event.target;
		if (!(target instanceof Element) || !periodSheet) return;

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
			applyPeriodOption((option.dataset.periodOption || 'this_month') as CobrosDatePreset);
			return;
		}

		if (target.closest('[data-apply-period-filter]')) {
			if (datePreset === 'custom') {
				const ok = syncNativeFromText('both');
				if (!ok) {
					setDateError('Usá el formato dd/mm/aaaa en ambas fechas.');
					return;
				}
				const from = dateFromEl?.value || '';
				const to = dateToEl?.value || '';
				if (!from || !to) {
					setDateError('Completá desde y hasta para aplicar el periodo.');
					dateFromTextEl?.classList.toggle('is-invalid', !from);
					dateToTextEl?.classList.toggle('is-invalid', !to);
					return;
				}
				if (from > to) {
					setDateError('La fecha desde no puede ser posterior a hasta.');
					dateFromTextEl?.classList.add('is-invalid');
					dateToTextEl?.classList.add('is-invalid');
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

	modal?.querySelector('[data-cobros-modal-close]')?.addEventListener('click', closeModal);
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
	modal?.querySelector('[data-cobros-waive]')?.addEventListener('click', () => void waiveRefund());
	modal?.addEventListener('click', (event) => {
		if (event.target === modal) closeModal();
	});
	modal?.addEventListener('cancel', (event) => {
		event.preventDefault();
		closeModal();
	});

	// Default tab: todos
	statusFilter = 'all';
	if (datePresetEl) datePresetEl.value = datePreset;
	syncTabs();
	updatePeriodFilterUi();
	applyFeatureGate();
	void load();

	onSubscriptionRefresh = () => {
		const ok = applyFeatureGate();
		if (ok) void load();
	};

	if (!subscriptionListenerBound) {
		subscriptionListenerBound = true;
		document.addEventListener('hasel:subscription', () => {
			onSubscriptionRefresh?.();
		});
	}
};

if (!customElements.get('cobros-manager')) {
	customElements.define('cobros-manager', class extends HTMLElement {});
}
