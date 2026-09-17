import type { DriveStep } from 'driver.js';
import { hasSeenBookmateTour, runBookmateTour } from './product-tour';
import { COBROS_TOUR_STORAGE_KEY } from './settings-payments-tour-steps';

export { COBROS_TOUR_STORAGE_KEY } from './settings-payments-tour-steps';

const HELP_SELECTOR = '[data-cobros-tour-help]';
const INTRO_SELECTOR = '[data-cobros-tour-intro]';
const TABS_SELECTOR = '[data-cobros-tour-tabs]';
const EMPTY_SELECTOR = '[data-cobros-empty]';
const TABLE_ROW_SELECTOR = '[data-cobros-table-body] tr';
const CARD_SELECTOR = '[data-cobros-cards] .cobros-card';

export function hasSeenCobrosTour() {
	return hasSeenBookmateTour(COBROS_TOUR_STORAGE_KEY);
}

function isVisible(el: Element | null) {
	if (!(el instanceof HTMLElement) || el.hidden) return false;
	if (el.getClientRects().length === 0) return false;
	return window.getComputedStyle(el).display !== 'none';
}

function firstVisibleSelector(selectors: string[]) {
	return selectors.find((selector) =>
		Array.from(document.querySelectorAll(selector)).some((el) => isVisible(el))
	) ?? null;
}

export function buildCobrosTourSteps(): DriveStep[] {
	const steps: DriveStep[] = [];

	if (isVisible(document.querySelector(INTRO_SELECTOR))) {
		steps.push({
			element: INTRO_SELECTOR,
			popover: {
				title: 'Cobros de seña',
				description:
					'Acá llegan las transferencias SIPAP. El cliente paga a tu alias, sube el comprobante y Hasel lee el monto y el código HASEL.',
				side: 'bottom',
				align: 'start',
			},
		});
	}

	if (isVisible(document.querySelector(TABS_SELECTOR))) {
		steps.push({
			element: TABS_SELECTOR,
			popover: {
				title: 'Pendientes de revisión',
				description:
					'El número del menú son estos pendientes: seña para validar, reembolso por enviar o disputa abierta. Si el monto y el código coinciden, aprobá; si la foto no sirve, rechazá y el cliente sube otra.',
				side: 'bottom',
				align: 'start',
			},
		});
	}

	const exampleTarget = firstVisibleSelector([TABLE_ROW_SELECTOR, CARD_SELECTOR, EMPTY_SELECTOR]);
	if (exampleTarget) {
		steps.push({
			element: exampleTarget,
			popover: {
				title: 'Cómo se ve un cobro',
				description: isVisible(document.querySelector(EMPTY_SELECTOR))
					? 'Todavía no hay movimientos. Cuando alguien reserve con seña, el cobro aparece acá para validar el comprobante.'
					: 'Así se ve un cobro: cliente, monto y estado. Tocá Validar comprobante para ver la foto, el código leído y aprobar o rechazar.',
				side: 'top',
				align: 'start',
			},
		});
	}

	return steps;
}

export function showCobrosTour(options?: { force?: boolean }) {
	const steps = buildCobrosTourSteps();
	runBookmateTour(steps, {
		force: options?.force,
		persistCompletion: options?.force ? false : true,
		storageKey: COBROS_TOUR_STORAGE_KEY,
		overlayOpacity: 0,
		duration: 280,
	});
}

export function maybeShowCobrosTour() {
	if (hasSeenCobrosTour()) return;
	if (!document.querySelector(INTRO_SELECTOR)) return;

	window.setTimeout(() => {
		if (hasSeenCobrosTour()) return;
		if (document.body.classList.contains('driver-active')) return;
		showCobrosTour();
	}, 500);
}

export function bindCobrosTourHelp(root: ParentNode = document) {
	root.querySelector<HTMLButtonElement>(HELP_SELECTOR)?.addEventListener('click', () => {
		showCobrosTour({ force: true });
	});
}
