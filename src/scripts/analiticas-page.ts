import { bindAppointmentsVolumeChart } from './appointments-volume-chart';

const submitOnChange = (form: HTMLFormElement) => {
	form.querySelectorAll<HTMLSelectElement>('select[data-analytics-filter]').forEach((select) => {
		select.addEventListener('change', () => {
			form.requestSubmit();
		});
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
