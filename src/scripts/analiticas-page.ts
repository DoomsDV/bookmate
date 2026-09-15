import { bindAppointmentsVolumeChart } from './appointments-volume-chart';

const MAX_CUSTOM_DAYS = 90;

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

const initializeAnaliticasPage = () => {
	const form = document.querySelector<HTMLFormElement>('[data-analytics-filters]');
	if (form) submitOnChange(form);
	bindAppointmentsVolumeChart();
};

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initializeAnaliticasPage, { once: true });
} else {
	initializeAnaliticasPage();
}
