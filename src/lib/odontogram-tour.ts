import type { DriveStep } from 'driver.js';
import { runBookmateTour, type BookmateTourRunOptions } from './product-tour';

const PROFILE_MODAL_SELECTOR = '[data-customer-profile-modal]';
const VIEWPORT_SELECTOR = '[data-customer-odontogram-viewport]';
const CAM_SELECTOR = '[data-customer-odontogram-cam]';
const TOOLBAR_SELECTOR = '[data-customer-odontogram-toolbar]';
const EVENTS_SELECTOR = '.customer-odontogram-events';

const TOUR_OPTIONS: Pick<
	BookmateTourRunOptions,
	'force' | 'persistCompletion' | 'useTopLayerShell' | 'hostSelector' | 'stagePadding'
> = {
	force: true,
	persistCompletion: false,
	useTopLayerShell: true,
	hostSelector: PROFILE_MODAL_SELECTOR,
	stagePadding: 10,
};

function buildOdontogramTourSteps(): DriveStep[] {
	const steps: DriveStep[] = [];

	if (document.querySelector(VIEWPORT_SELECTOR)) {
		steps.push({
			element: VIEWPORT_SELECTOR,
			popover: {
				title: 'Visor 3D',
				description:
					'Arrastrá para rotar el modelo y pellizcá o usá la rueda para acercar. Tocá una pieza para registrar un hallazgo o ver su historial.',
				side: 'bottom',
				align: 'center',
			},
		});
	}

	if (document.querySelector(CAM_SELECTOR)) {
		steps.push({
			element: CAM_SELECTOR,
			popover: {
				title: 'Controles de cámara',
				description:
					'Restablecé la vista frontal, bloqueá la rotación, activá la vista fantasma o enfocá solo el maxilar superior o inferior.',
				side: 'left',
				align: 'start',
			},
		});
	}

	if (document.querySelector(TOOLBAR_SELECTOR)) {
		steps.push({
			element: TOOLBAR_SELECTOR,
			popover: {
				title: 'Comandos rápidos',
				description:
					'Elegí Caries, Restauración, Extracción o Corona y después tocá la pieza. También podés tocar primero el diente y completar el hallazgo en el recuadro.',
				side: 'top',
				align: 'start',
			},
		});
	}

	if (document.querySelector(EVENTS_SELECTOR)) {
		steps.push({
			element: EVENTS_SELECTOR,
			popover: {
				title: 'Evolución de tratamientos',
				description:
					'Acá queda el historial de lo registrado. Podés anular un ítem si te equivocaste y descargar el odontograma en PDF.',
				side: 'top',
				align: 'start',
			},
		});
	}

	return steps;
}

/** Guía repetible del odontograma 3D en el modal de cliente. */
export function showOdontogramTour() {
	const modal = document.querySelector<HTMLDialogElement>(PROFILE_MODAL_SELECTOR);
	if (!modal?.open) return;

	const steps = buildOdontogramTourSteps();
	if (steps.length === 0) return;

	runBookmateTour(steps, {
		...TOUR_OPTIONS,
		storageKey: 'bookmate_odontogram_tour',
		stageRadius: 16,
	});
}
