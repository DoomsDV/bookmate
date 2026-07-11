import type { DriveStep } from 'driver.js';
import { runBookmateTour } from './product-tour';

const STORAGE_KEY = 'bookmate_calendar_tour_v3';
const FILTERS_SELECTOR = '[data-calendar-filters]';
const FILTERS_TRIGGER_SELECTOR = '[data-calendar-filters-open]';
const STATUS_LEGEND_SELECTOR = '[data-calendar-status-legend]';
const HELP_SELECTOR = '[data-calendar-tour-help]';
const NEW_APPOINTMENT_SELECTOR = '[data-open-appointment-modal]';
const NAV_SELECTOR = '[data-calendar-nav]';
const VIEW_SWITCH_SELECTOR = '[data-calendar-view-switch]';

export function hasSeenCalendarTour() {
	return localStorage.getItem(STORAGE_KEY) === '1';
}

function isVisible(el: Element | null) {
	if (!(el instanceof HTMLElement)) return false;
	return window.getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
}

function hasProfessionalFilter() {
	const wrap = document.querySelector('[data-professional-filter-wrap]');
	if (!wrap) return false;
	return !wrap.classList.contains('hidden');
}

function getFiltersTourTarget() {
	const trigger = document.querySelector(FILTERS_TRIGGER_SELECTOR);
	if (isVisible(trigger)) return FILTERS_TRIGGER_SELECTOR;
	if (document.querySelector(FILTERS_SELECTOR)) return FILTERS_SELECTOR;
	return null;
}

function getLegendTourTarget() {
	const legend = document.querySelector(STATUS_LEGEND_SELECTOR);
	if (isVisible(legend)) return STATUS_LEGEND_SELECTOR;
	if (document.querySelector(HELP_SELECTOR)) return HELP_SELECTOR;
	return null;
}

function buildTourSteps(): DriveStep[] {
	const steps: DriveStep[] = [];
	const filtersTarget = getFiltersTourTarget();

	if (filtersTarget) {
		steps.push({
			element: filtersTarget,
			popover: {
				title: 'Filtros',
				description: hasProfessionalFilter()
					? 'Acota la vista del calendario por profesional y sucursal. Así puedes revisar la agenda de una persona, de una ubicación o de todo el equipo.'
					: 'Acota la vista del calendario por sucursal para ver solo las citas de una ubicación concreta.',
				side: 'bottom',
				align: 'start',
			},
		});
	}

	const legendTarget = getLegendTourTarget();
	if (legendTarget) {
		steps.push({
			element: legendTarget,
			popover: {
				title: 'Estados de las citas',
				description:
					legendTarget === HELP_SELECTOR
						? 'Toca el botón de ayuda para ver qué significa cada color: naranja pendiente, verde confirmada, azul completada y rojo cancelada.'
						: 'Cada color en el calendario indica el estado de la reserva: naranja pendiente, verde confirmada, azul completada y rojo cancelada. Las citas canceladas o completadas no se pueden mover.',
				side: 'bottom',
				align: 'start',
			},
		});
	}

	if (document.querySelector(NAV_SELECTOR)) {
		steps.push({
			element: NAV_SELECTOR,
			popover: {
				title: 'Navegación',
				description:
					'Muévete en el tiempo con las flechas. En el centro está «Hoy» para volver al día actual.',
				side: 'bottom',
				align: 'start',
			},
		});
	}

	if (document.querySelector(VIEW_SWITCH_SELECTOR)) {
		steps.push({
			element: VIEW_SWITCH_SELECTOR,
			popover: {
				title: 'Vista del calendario',
				description:
					'Cambia entre día, semana, mes o lista según necesites planificar o revisar citas. En móvil también verás la vista de tres días.',
				side: 'bottom',
				align: 'end',
			},
		});
	}

	if (document.querySelector(NEW_APPOINTMENT_SELECTOR)) {
		steps.push({
			element: NEW_APPOINTMENT_SELECTOR,
			popover: {
				title: 'Crear cita',
				description:
					'Crea una cita manualmente indicando fecha, hora, profesional y servicio. Úsalo para agendar fuera del horario habitual, cuando no haya un hueco libre en la grilla o si prefieres no seleccionar directamente en el calendario. También puedes hacer clic o arrastrar sobre un espacio vacío.',
				side: 'top',
				align: 'end',
			},
		});
	}

	return steps;
}

export function showCalendarTour(options?: { force?: boolean }) {
	const steps = buildTourSteps();
	runBookmateTour(steps, { force: options?.force, storageKey: STORAGE_KEY });
}

/** Muestra la guía la primera vez que el calendario termina de inicializarse. */
export function maybeShowCalendarTour() {
	if (hasSeenCalendarTour()) return;

	const tryStart = (attempt = 0) => {
		if (!getFiltersTourTarget()) {
			if (attempt < 12) window.setTimeout(() => tryStart(attempt + 1), 120);
			return;
		}

		const toolbarReady =
			document.querySelector(NAV_SELECTOR) && document.querySelector(VIEW_SWITCH_SELECTOR);

		if (!toolbarReady && attempt < 12) {
			window.setTimeout(() => tryStart(attempt + 1), 120);
			return;
		}

		showCalendarTour();
	};

	window.setTimeout(() => tryStart(), 450);
}
