import type { DriveStep } from 'driver.js';
import { runBookmateTour } from './product-tour';

const OVERRIDE_OPTION_SELECTOR = '[data-exc-type-option="OVERRIDE"]';
const BLOCKED_OPTION_SELECTOR = '[data-exc-type-option="BLOCKED"]';
const USE_TEMPLATE_SELECTOR = '[data-exc-use-template]';

function buildTourSteps(): DriveStep[] {
	const steps: DriveStep[] = [];

	if (document.querySelector(OVERRIDE_OPTION_SELECTOR)) {
		steps.push({
			element: OVERRIDE_OPTION_SELECTOR,
			popover: {
				title: 'Horario especial',
				description:
					'Reemplaza la plantilla semanal solo este día: define sucursal y franjas distintas a las habituales. Los clientes solo podrán reservar en los turnos que agregues aquí.',
				side: 'bottom',
				align: 'start',
			},
		});
	}

	if (document.querySelector(BLOCKED_OPTION_SELECTOR)) {
		steps.push({
			element: BLOCKED_OPTION_SELECTOR,
			popover: {
				title: 'Bloquear día completo',
				description:
					'Cierra el día sin turnos disponibles (vacaciones, feriado, cierre puntual). No se podrán agendar citas nuevas; si ya hay citas ese día, el sistema te pedirá confirmación al guardar.',
				side: 'bottom',
				align: 'start',
			},
		});
	}

	if (document.querySelector(USE_TEMPLATE_SELECTOR)) {
		steps.push({
			element: USE_TEMPLATE_SELECTOR,
			popover: {
				title: 'Usar plantilla',
				description:
					'Elimina la excepción de este día y vuelve al horario semanal habitual. Úsalo si ya no necesitas un horario especial ni bloquear el día.',
				side: 'top',
				align: 'start',
			},
		});
	}

	return steps;
}

/** Guía repetible sobre los tipos de excepción (solo con el modal abierto en modo edición). */
export function showScheduleExceptionModalTour() {
	const steps = buildTourSteps();
	if (steps.length === 0) return;

	runBookmateTour(steps, {
		force: true,
		storageKey: 'bookmate_schedule_exception_modal_tour',
		persistCompletion: false,
	});
}
