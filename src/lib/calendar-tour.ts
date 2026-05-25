import type { DriveStep } from 'driver.js';
import { runBookmateTour } from './product-tour';

const STORAGE_KEY = 'bookmate_calendar_tour_v3';
const FILTERS_SELECTOR = '[data-calendar-filters]';
const STATUS_LEGEND_SELECTOR = '[data-calendar-status-legend]';
const NEW_APPOINTMENT_SELECTOR = '[data-open-appointment-modal]';
const NAV_SELECTOR = '[data-calendar-nav]';
const VIEW_SWITCH_SELECTOR = '[data-calendar-view-switch]';

export function hasSeenCalendarTour() {
	return localStorage.getItem(STORAGE_KEY) === '1';
}

function hasProfessionalFilter() {
	const wrap = document.querySelector('[data-professional-filter-wrap]');
	if (!wrap) return false;
	return !wrap.classList.contains('hidden');
}

function buildTourSteps(): DriveStep[] {
	const steps: DriveStep[] = [];

	if (document.querySelector(FILTERS_SELECTOR)) {
		steps.push({
			element: FILTERS_SELECTOR,
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

	if (document.querySelector(STATUS_LEGEND_SELECTOR)) {
		steps.push({
			element: STATUS_LEGEND_SELECTOR,
			popover: {
				title: 'Estados de las citas',
				description:
					'Cada color en el calendario indica el estado de la reserva: naranja pendiente, verde confirmada, azul completada y rojo cancelada. Las citas canceladas o completadas no se pueden mover.',
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
					'Muévete en el tiempo con las flechas anterior y siguiente. Pulsa «Hoy» para volver al día actual y centrar la vista.',
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
				title: 'Nueva cita',
				description:
					'Crea una cita manualmente indicando fecha, hora, profesional y servicio. Úsalo para agendar fuera del horario habitual, cuando no haya un hueco libre en la grilla o si prefieres no seleccionar directamente en el calendario. También puedes hacer clic o arrastrar sobre un espacio vacío.',
				side: 'bottom',
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
		if (!document.querySelector(FILTERS_SELECTOR)) {
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
