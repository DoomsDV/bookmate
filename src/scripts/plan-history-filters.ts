import {
	bindDateTextInput,
	displayToIso,
	isoToDisplay,
	parseIsoDate,
	toIsoDate,
} from '../lib/date-input';
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

export const initPlanHistoryFilters = (root: HTMLElement) => {
	const panel = root.querySelector<HTMLElement>('[data-plan-panel="history"]');
	if (!panel || panel.dataset.historyBound === '1') return;
	panel.dataset.historyBound = '1';

	const rows = () =>
		panel.querySelectorAll<HTMLElement>('[data-plan-history-row]');

	const tableWrap = panel.querySelector<HTMLElement>('[data-plan-history-table-wrap]');
	const cardsEl = panel.querySelector<HTMLElement>('[data-plan-history-cards]');
	const emptyEl = panel.querySelector<HTMLElement>('[data-plan-history-empty]');
	const emptyTitle = panel.querySelector<HTMLElement>('[data-plan-history-empty-title]');
	const emptyCopy = panel.querySelector<HTMLElement>('[data-plan-history-empty-copy]');
	const datePresetEl = panel.querySelector<HTMLSelectElement>('[data-plan-history-date-preset]');
	const customDatesEl = panel.querySelector<HTMLElement>('[data-plan-history-custom-dates]');
	const dateFromEl = panel.querySelector<HTMLInputElement>('[data-plan-history-date-from]');
	const dateToEl = panel.querySelector<HTMLInputElement>('[data-plan-history-date-to]');
	const dateFromTextEl = panel.querySelector<HTMLInputElement>('[data-plan-history-date-from-text]');
	const dateToTextEl = panel.querySelector<HTMLInputElement>('[data-plan-history-date-to-text]');
	const dateFromPickBtn = panel.querySelector<HTMLButtonElement>('[data-plan-history-date-from-pick]');
	const dateToPickBtn = panel.querySelector<HTMLButtonElement>('[data-plan-history-date-to-pick]');
	const dateErrorEl = panel.querySelector<HTMLElement>('[data-plan-history-date-error]');
	const datePicker = panel.querySelector<HTMLDialogElement>('[data-plan-history-date-picker]');
	const datePickerLabel = panel.querySelector<HTMLElement>('[data-plan-history-dp-label]');
	const datePickerMonth = panel.querySelector<HTMLSelectElement>('[data-plan-history-dp-month]');
	const datePickerYear = panel.querySelector<HTMLSelectElement>('[data-plan-history-dp-year]');
	const datePickerDays = panel.querySelector<HTMLElement>('[data-plan-history-dp-days]');
	const datePickerPrev = panel.querySelector<HTMLButtonElement>('[data-plan-history-dp-prev]');
	const datePickerNext = panel.querySelector<HTMLButtonElement>('[data-plan-history-dp-next]');
	const datePickerClose = panel.querySelector<HTMLButtonElement>('[data-plan-history-dp-close]');
	const datePickerToday = panel.querySelector<HTMLButtonElement>('[data-plan-history-dp-today]');
	const datePickerApply = panel.querySelector<HTMLButtonElement>('[data-plan-history-dp-apply]');
	const periodFilterBtn = panel.querySelector<HTMLButtonElement>('[data-plan-history-open-period]');
	const periodFilterBadge = panel.querySelector<HTMLElement>('[data-plan-history-period-badge]');
	const periodSheet = panel.querySelector<HTMLDialogElement>('[data-plan-history-period-sheet]');
	const statusSelect = panel.querySelector<HTMLSelectElement>('[data-plan-history-status-select]');

	const totalInvoices = panel.querySelectorAll(
		'[data-plan-history-table-wrap] [data-plan-history-row]'
	).length;
	let statusFilter: PlanHistoryStatusFilter = 'all';
	let datePreset: PanelDatePreset = 'none';
	let activeDateField: 'from' | 'to' | null = null;
	let pickerViewDate = new Date();
	let pickerDraftDate = new Date();
	let datePickerAnchor: HTMLElement | null = null;

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

	const syncTabs = () => {
		panel.querySelectorAll<HTMLButtonElement>('[data-plan-history-tab]').forEach((btn) => {
			const active = (btn.dataset.planHistoryTab || 'all') === statusFilter;
			btn.classList.toggle('is-active', active);
			btn.setAttribute('aria-selected', active ? 'true' : 'false');
		});
		if (statusSelect && statusSelect.value !== statusFilter) {
			statusSelect.value = statusFilter;
		}
	};

	const syncTextFromNative = () => {
		if (dateFromTextEl) dateFromTextEl.value = isoToDisplay(dateFromEl?.value || '');
		if (dateToTextEl) dateToTextEl.value = isoToDisplay(dateToEl?.value || '');
		dateFromTextEl?.classList.remove('is-invalid');
		dateToTextEl?.classList.remove('is-invalid');
	};

	const syncNativeFromText = (which: 'from' | 'to' | 'both') => {
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

	const applyFilters = () => {
		const range = resolveDateRange(
			datePreset,
			dateFromEl?.value || undefined,
			dateToEl?.value || undefined
		);
		const expectedStatus =
			statusFilter === 'all' ? null : STATUS_TO_INVOICE[statusFilter];

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
		const mobileFilters =
			typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
		const active = datePreset !== 'none' || (mobileFilters && statusFilter !== 'all');
		periodFilterBadge?.classList.toggle('hidden', !active);
		periodFilterBtn?.classList.toggle('is-active', active);
		periodFilterBtn?.setAttribute('aria-pressed', active ? 'true' : 'false');

		periodSheet?.querySelectorAll<HTMLButtonElement>('[data-plan-history-period-option]').forEach((btn) => {
			const selectedOpt = btn.dataset.planHistoryPeriodOption === datePreset;
			btn.classList.toggle('is-selected', selectedOpt);
			btn.setAttribute('aria-selected', selectedOpt ? 'true' : 'false');
		});
		customDatesEl?.classList.toggle('hidden', datePreset !== 'custom');
		if (datePreset !== 'custom' && datePicker?.open) datePicker.close();
		if (datePreset === 'custom') syncTextFromNative();
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
		if (datePicker?.open) datePicker.close();
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
		syncTabs();
		updatePeriodFilterUi();
		applyFilters();
	};

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

	panel.querySelectorAll<HTMLButtonElement>('[data-plan-history-tab]').forEach((btn) => {
		btn.addEventListener('click', () => {
			applyStatusOption((btn.dataset.planHistoryTab || 'all') as PlanHistoryStatusFilter);
		});
	});

	statusSelect?.addEventListener('change', () => {
		applyStatusOption((statusSelect.value || 'all') as PlanHistoryStatusFilter);
	});

	periodFilterBtn?.addEventListener('click', openPeriodSheet);
	if (periodSheet) {
		bindFilterPopoverChrome({
			sheet: periodSheet,
			getTrigger: () => periodFilterBtn,
			widthRem: 22,
		});
	}

	const dateInputOptions = { onError: setDateError };
	bindDateTextInput(dateFromTextEl, dateFromEl, dateInputOptions);
	bindDateTextInput(dateToTextEl, dateToEl, dateInputOptions);

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
					return;
				}
				setDateError('');
				closePeriodSheet();
				applyFilters();
			}
		}
	});

	if (datePresetEl) datePresetEl.value = datePreset;
	syncTabs();
	updatePeriodFilterUi();
	applyFilters();
};
