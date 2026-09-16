import { bindAppointmentsVolumeChart } from './appointments-volume-chart';

const MAX_CUSTOM_DAYS = 90;
const FILTER_SHEET_MQ = '(max-width: 719px)';

const inclusiveDays = (from: string, to: string) => {
	const start = Date.parse(`${from}T00:00:00Z`);
	const end = Date.parse(`${to}T00:00:00Z`);
	if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
	return Math.floor((end - start) / 86_400_000) + 1;
};

const submitOnChange = (form: HTMLFormElement) => {
	form.querySelectorAll<HTMLSelectElement>('select[data-analytics-filter]').forEach((select) => {
		select.addEventListener('change', () => {
			form.requestSubmit();
		});
	});

	const fromInput = form.querySelector<HTMLInputElement>('input[name="from"]');
	const toInput = form.querySelector<HTMLInputElement>('input[name="to"]');
	const hint = form.querySelector<HTMLElement>('[data-analytics-date-error]');

	const applyCustomDates = () => {
		if (!fromInput || !toInput) return;
		const from = fromInput.value;
		const to = toInput.value;
		if (!from || !to) return;
		const start = from <= to ? from : to;
		const end = from <= to ? to : from;
		const days = inclusiveDays(start, end);
		if (days < 1 || days > MAX_CUSTOM_DAYS) {
			hint?.removeAttribute('hidden');
			return;
		}
		hint?.setAttribute('hidden', '');
		if (from > to) {
			fromInput.value = to;
			toInput.value = from;
		}
		form.requestSubmit();
	};

	form.querySelectorAll<HTMLInputElement>('input[data-analytics-date]').forEach((input) => {
		input.addEventListener('change', applyCustomDates);
	});
};

const bindAnalyticsFilterSheet = (form: HTMLFormElement) => {
	const toggle = form.querySelector<HTMLButtonElement>('[data-analytics-filters-open]');
	const sheet = form.querySelector<HTMLElement>('[data-analytics-filters-sheet]');
	const panel = form.querySelector<HTMLElement>('[data-analytics-filters-panel]');
	if (!toggle || !sheet) return;

	const isMobileSheet = () => window.matchMedia(FILTER_SHEET_MQ).matches;

	const setOpen = (open: boolean) => {
		const next = open && isMobileSheet();
		sheet.classList.toggle('is-open', next);
		toggle.setAttribute('aria-expanded', next ? 'true' : 'false');
		document.body.classList.toggle('analiticas-filters-open', next);
		if (panel) {
			if (next) {
				panel.setAttribute('role', 'dialog');
				panel.setAttribute('aria-modal', 'true');
			} else {
				panel.removeAttribute('role');
				panel.removeAttribute('aria-modal');
			}
		}
	};

	const close = () => setOpen(false);

	toggle.addEventListener('click', () => {
		if (!isMobileSheet()) return;
		setOpen(!sheet.classList.contains('is-open'));
	});

	form.querySelectorAll<HTMLElement>('[data-analytics-filters-close]').forEach((node) => {
		node.addEventListener('click', close);
	});

	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && sheet.classList.contains('is-open')) {
			event.preventDefault();
			close();
		}
	});

	window.matchMedia(FILTER_SHEET_MQ).addEventListener('change', (event) => {
		if (!event.matches) close();
	});
};

const initializeAnaliticasPage = () => {
	const form = document.querySelector<HTMLFormElement>('[data-analytics-filters]');
	if (form) {
		submitOnChange(form);
		bindAnalyticsFilterSheet(form);
	}
	bindAppointmentsVolumeChart();
};

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initializeAnaliticasPage, { once: true });
} else {
	initializeAnaliticasPage();
}
