import type { DriveStep } from 'driver.js';
import { runBookmateTour } from './product-tour';

const STORAGE_KEY = 'bookmate_schedule_tabs_tour_v3';
const PROFESSIONAL_FIELD_SELECTOR = '[data-schedule-professional-field]';
const TEMPLATE_TAB_SELECTOR = '[data-schedule-tab="template"]';
const EXCEPTIONS_TAB_SELECTOR = '[data-schedule-tab="exceptions"]';

export function hasSeenScheduleExceptionsTour() {
	return localStorage.getItem(STORAGE_KEY) === '1';
}

function buildTourSteps(): DriveStep[] {
	const steps: DriveStep[] = [];

	if (document.querySelector(PROFESSIONAL_FIELD_SELECTOR)) {
		steps.push({
			element: PROFESSIONAL_FIELD_SELECTOR,
			popover: {
				title: 'Profesional',
				description:
					'Elige a qué profesional le configurarás los horarios. La plantilla semanal y las excepciones del calendario se guardan por persona: cambia aquí para ver o editar la agenda de cada uno antes de guardar.',
				side: 'bottom',
				align: 'start',
			},
		});
	}

	steps.push(
		{
			element: TEMPLATE_TAB_SELECTOR,
			popover: {
				title: 'Plantilla semanal',
				description:
					'Este horario abre los turnos que se pueden reservar online. Configura turnos por día, sucursal y franja. El horario de Perfil público solo se muestra en la página: no genera reservas. Los cambios se guardan con «Guardar horarios».',
				side: 'bottom',
				align: 'center',
			},
		},
		{
			element: EXCEPTIONS_TAB_SELECTOR,
			popover: {
				title: 'Excepciones del calendario',
				description:
					'Define cambios puntuales por fecha que reemplazan la plantilla solo ese día: bloquear días (vacaciones o feriados) o asignar un horario especial. Abre esta pestaña y haz clic en un día del calendario para configurarlo.',
				side: 'bottom',
				align: 'center',
			},
		}
	);

	return steps;
}

export function showScheduleExceptionsTour(options?: { force?: boolean }) {
	const steps = buildTourSteps();
	runBookmateTour(steps, { force: options?.force, storageKey: STORAGE_KEY });
}

/** Muestra el tour la primera vez que el usuario entra a Horarios (si hay pestañas visibles). */
export function maybeShowScheduleExceptionsTour() {
	if (hasSeenScheduleExceptionsTour()) return;
	if (!document.querySelector(TEMPLATE_TAB_SELECTOR)) return;
	if (!document.querySelector(EXCEPTIONS_TAB_SELECTOR)) return;

	window.setTimeout(() => {
		showScheduleExceptionsTour();
	}, 450);
}
