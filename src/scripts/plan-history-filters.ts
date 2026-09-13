import { isoToDisplay } from '../lib/date-input';
import { isTimestampInRange, resolveDateRange, type PanelDatePreset } from '../lib/date-range';
import {
	bindFilterPopoverChrome,
	closeFilterPopoverSheet,
	positionFilterPopover,
	toggleFilterPopoverSheet,
} from '../lib/panel-filter-popover';

export type PlanHistoryStatusFilter = 'all' | 'paid' | 'pending' | 'failed' | 'void';

const STATUS_TO_INVOICE: Record<Exclude<PlanHistoryStatusFilter, 'all'>, string> = {
	paid: 'PAID',
	pending: 'PENDING',
	failed: 'FAILED',
	void: 'VOID',
};

const DATE_FACE_EMPTY = 'dd/mm/aaaa';

export const initPlanHistoryFilters = (root: HTMLElement) => {
	const panel = root.querySelector<HTMLElement>('[data-plan-panel="history"]');
	if (!panel || panel.dataset.historyBound === '1') return;
	panel.dataset.historyBound = '1';

	const rows = () => panel.querySelectorAll<HTMLElement>('[data-plan-history-row]');

	const tableWrap = panel.querySelector<HTMLElement>('[data-plan-history-table-wrap]');
	const cardsEl = panel.querySelector<HTMLElement>('[data-plan-history-cards]');
	const emptyEl = panel.querySelector<HTMLElement>('[data-plan-history-empty]');
	const emptyTitle = panel.querySelector<HTMLElement>('[data-plan-history-empty-title]');
	const emptyCopy = panel.querySelector<HTMLElement>('[data-plan-history-empty-copy]');
	const datePresetEl = panel.querySelector<HTMLSelectElement>('[data-plan-history-date-preset]');
	const customDatesEl = panel.querySelector<HTMLElement>('[data-plan-history-custom-dates]');
	const dateFromEl = panel.querySelector<HTMLInputElement>('[data-plan-history-date-from]');
	const dateToEl = panel.querySelector<HTMLInputElement>('[data-plan-history-date-to]');
	const dateErrorEl = panel.querySelector<HTMLElement>('[data-plan-history-date-error]');
	const periodFilterBtn = panel.querySelector<HTMLButtonElement>('[data-plan-history-open-period]');
	const periodFilterBadge = panel.querySelector<HTMLElement>('[data-plan-history-period-badge]');
	const periodSheet = panel.querySelector<HTMLDialogElement>('[data-plan-history-period-sheet]');
	const statusSelect = panel.querySelector<HTMLSelectElement>('[data-plan-history-status-select]');

	const totalInvoices = panel.querySelectorAll(
		'[data-plan-history-table-wrap] [data-plan-history-row]'
	).length;
	let statusFilter: PlanHistoryStatusFilter = 'all';
	let datePreset: PanelDatePreset = 'none';

	const setDateError = (message: string) => {
		if (!dateErrorEl) return;
		if (!message) {
			dateErrorEl.classList.add('hidden');
			dateErrorEl.textContent = '';
			return;
		}
		dateErrorEl.textContent = message;
		dateErrorEl.classList.remove('hidden');
	};

	const markDateInvalid = (input: HTMLInputElement | null, invalid: boolean) => {
		input?.closest('[data-plan-history-date]')?.classList.toggle('is-invalid', invalid);
	};

	const syncDateFace = (input: HTMLInputElement | null) => {
		if (!input) return;
		const wrap = input.closest('[data-plan-history-date]');
		const display = wrap?.querySelector<HTMLElement>('[data-plan-history-date-display]');
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
		input.style.opacity = '0.01';
		if (tryShowDatePicker(input)) return;
		input.click();
	};

	const bindNativeDateFace = (input: HTMLInputElement | null) => {
		if (!input) return;
		const wrap = input.closest<HTMLElement>('[data-plan-history-date]');
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
		wrap?.addEventListener('pointerdown', (event) => {
			if (event.button !== 0) return;
			activate(event);
		});
		wrap?.addEventListener('click', activate);
		sync();
	};

	const syncStatusOptions = () => {
		if (statusSelect && statusSelect.value !== statusFilter) {
			statusSelect.value = statusFilter;
		}
	};

	const applyFilters = () => {
		const range = resolveDateRange(
			datePreset,
			dateFromEl?.value || undefined,
			dateToEl?.value || undefined
		);
		const expectedStatus = statusFilter === 'all' ? null : STATUS_TO_INVOICE[statusFilter];

		let visible = 0;
		rows().forEach((row) => {
			const rowStatus = (row.dataset.invoiceStatus || '').toUpperCase();
			const rowTs = row.dataset.invoiceTs || '';
			const statusOk = !expectedStatus || rowStatus === expectedStatus;
			const dateOk = isTimestampInRange(rowTs, range);
			const show = statusOk && dateOk;
			row.classList.toggle('hidden', !show);
			if (show) visible += 1;
		});

		const isEmpty = visible === 0;
		emptyEl?.classList.toggle('hidden', !isEmpty);
		tableWrap?.classList.toggle('is-empty', isEmpty);
		cardsEl?.classList.toggle('hidden', isEmpty);

		if (emptyTitle && emptyCopy) {
			if (totalInvoices === 0) {
				emptyTitle.textContent = 'No hay pagos';
				emptyCopy.textContent = 'Todavía no hay pagos registrados.';
			} else {
				emptyTitle.textContent = 'No hay pagos';
				emptyCopy.textContent = 'No hay movimientos para el filtro seleccionado.';
			}
		}
	};

	const updatePeriodFilterUi = () => {
		const active = datePreset !== 'none' || statusFilter !== 'all';
		periodFilterBadge?.classList.toggle('hidden', !active);
		periodFilterBtn?.classList.toggle('is-active', active);
		periodFilterBtn?.setAttribute('aria-pressed', active ? 'true' : 'false');

		periodSheet?.querySelectorAll<HTMLButtonElement>('[data-plan-history-period-option]').forEach((btn) => {
			const selectedOpt = btn.dataset.planHistoryPeriodOption === datePreset;
			btn.classList.toggle('is-selected', selectedOpt);
			btn.setAttribute('aria-selected', selectedOpt ? 'true' : 'false');
		});
		customDatesEl?.classList.toggle('hidden', datePreset !== 'custom');
		if (datePreset === 'custom') {
			syncDateFace(dateFromEl);
			syncDateFace(dateToEl);
		}
		if (
			periodSheet?.open &&
			periodSheet.classList.contains('is-desktop-popover') &&
			periodFilterBtn
		) {
			positionFilterPopover(periodSheet, periodFilterBtn, 22);
		}
	};

	const closePeriodSheet = () => {
		closeFilterPopoverSheet(periodSheet, periodFilterBtn);
	};

	const openPeriodSheet = (event?: Event) => {
		event?.preventDefault();
		event?.stopPropagation();
		if (!periodSheet || !periodFilterBtn) return;
		if (datePresetEl) datePresetEl.value = datePreset;
		setDateError('');
		updatePeriodFilterUi();
		toggleFilterPopoverSheet(periodSheet, periodFilterBtn, 22);
	};

	const applyPeriodOption = (next: PanelDatePreset) => {
		datePreset = next;
		if (datePresetEl) datePresetEl.value = next;
		updatePeriodFilterUi();
		if (next !== 'custom') {
			closePeriodSheet();
			applyFilters();
		}
	};

	const applyStatusOption = (next: PlanHistoryStatusFilter) => {
		statusFilter = next;
		syncStatusOptions();
		updatePeriodFilterUi();
		applyFilters();
	};

	periodFilterBtn?.addEventListener('click', openPeriodSheet);
	statusSelect?.addEventListener('change', () => {
		applyStatusOption((statusSelect.value || 'all') as PlanHistoryStatusFilter);
	});
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

		if (target === periodSheet) {
			closePeriodSheet();
			return;
		}
		if (target.closest('[data-plan-history-close-period]')) {
			closePeriodSheet();
			return;
		}

		const option = target.closest<HTMLButtonElement>('[data-plan-history-period-option]');
		if (option) {
			applyPeriodOption(
				(option.dataset.planHistoryPeriodOption || 'none') as PanelDatePreset
			);
			return;
		}

		if (target.closest('[data-plan-history-apply-period]')) {
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
				setDateError('');
				closePeriodSheet();
				applyFilters();
			}
		}
	});

	if (datePresetEl) datePresetEl.value = datePreset;
	syncStatusOptions();
	updatePeriodFilterUi();
	applyFilters();
};
