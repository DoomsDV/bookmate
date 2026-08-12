import type { DriveStep } from 'driver.js';
import { runBookmateTour } from './product-tour';

const DIALOG_SELECTOR = '[data-org-closures-dialog]';
const INTRO_SELECTOR = '[data-org-closures-tour-intro]';
const ADD_BTN_SELECTOR = '[data-add-org-closure-btn]';
const LIST_SELECTOR = '[data-org-closures-list]';

function buildTourSteps(): DriveStep[] {
	const steps: DriveStep[] = [];

	if (document.querySelector(INTRO_SELECTOR)) {
		steps.push({
			element: INTRO_SELECTOR,
			popover: {
				title: 'Cierres generales',
				description:
					'Configurá feriados y cierres que aplican a todas las sucursales activas de la organización. No hace falta repetirlos en cada local.',
				side: 'bottom',
				align: 'start',
			},
		});
	}

	if (document.querySelector(ADD_BTN_SELECTOR)) {
		steps.push({
			element: ADD_BTN_SELECTOR,
			popover: {
				title: 'Nuevo cierre general',
				description:
					'Creá un cierre con nombre, fechas y si es día completo o solo un tramo horario. Se replica automáticamente en todas las sucursales activas.',
				side: 'bottom',
				align: 'start',
			},
		});
	}

	if (document.querySelector(LIST_SELECTOR)) {
		steps.push({
			element: LIST_SELECTOR,
			popover: {
				title: 'Cierres cargados',
				description:
					'Acá ves los cierres generales. Podés eliminar uno de todas las sucursales a la vez con el ícono de barrido, o quitarlo solo de una sucursal desde su ficha.',
				side: 'top',
				align: 'start',
			},
		});
	}

	return steps;
}

/** Guía repetible del panel de cierres generales (con el drawer abierto). */
export function showOrgClosuresTour() {
	const steps = buildTourSteps();
	if (steps.length === 0) return;

	runBookmateTour(steps, {
		force: true,
		storageKey: 'bookmate_org_closures_tour',
		persistCompletion: false,
		useTopLayerShell: true,
		hostSelector: DIALOG_SELECTOR,
		scrollIntoView: { rootSelector: '.closures-org-dialog__body' },
		stagePadding: 8,
	});
}
