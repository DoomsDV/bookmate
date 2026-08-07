import type { DriveStep } from 'driver.js';
import { runBookmateTour } from './product-tour';

const STORAGE_KEY = 'bookmate_calendar_tour_v4';
const FILTERS_SELECTOR = '[data-calendar-filters]';
const FILTERS_TRIGGER_SELECTOR = '[data-calendar-filters-open]';
const STATUS_LEGEND_SELECTOR = '[data-calendar-status-legend]';
const HELP_SELECTOR = '[data-calendar-tour-help]';
const NEW_APPOINTMENT_SELECTOR = '[data-open-appointment-modal]';
/** Solo flechas + Hoy (no filtros ni título). */
const NAV_SELECTOR = '[data-calendar-tour-nav]';
/** Solo Día/Semana/Mes/Lista (no actualizar/guía/agendar). */
const VIEW_SWITCH_SELECTOR = '[data-calendar-tour-views]';

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
	if (document.querySelector(HELP_SELECTOR)) return HELP_SELECTOR;
	const legend = document.querySelector(STATUS_LEGEND_SELECTOR);
	if (isVisible(legend)) return STATUS_LEGEND_SELECTOR;
	return null;
}

function buildTourSteps(): DriveStep[] {
	const steps: DriveStep[] = [];
	const filtersTarget = getFiltersTourTarget();

	const isMobile = window.innerWidth < 768;

	if (filtersTarget) {
		steps.push({
			element: filtersTarget,
			popover: {
				title: isMobile ? 'Agenda' : 'Filtros',
				description: isMobile
					? hasProfessionalFilter()
						? 'Abrí este menú para cambiar la vista (Día, 3 días o Lista) y filtrar por profesional o sucursal.'
						: 'Abrí este menú para cambiar la vista (Día, 3 días o Lista) y filtrar por sucursal.'
					: hasProfessionalFilter()
						? 'Acota la vista del calendario por profesional y sucursal. Así puedes revisar la agenda de una persona, de una ubicación o de todo el equipo.'
						: 'Acota la vista del calendario por sucursal para ver solo las reservas de una ubicación concreta.',
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
				title: 'Estados de las reservas',
				description:
					'Toca Ayuda (?) para ver qué significa cada color: naranja pendiente, verde confirmada, azul completada y rojo cancelada. Desde ahí también podés abrir el recorrido del calendario.',
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
					'Muévete en el tiempo con las flechas y usá «Hoy» para volver al día actual.',
				side: 'bottom',
				align: 'center',
			},
		});
	}

	// Desktop: vistas en el toolbar. Mobile: ya cubiertas por el menú Agenda.
	if (!isMobile && document.querySelector(VIEW_SWITCH_SELECTOR)) {
		steps.push({
			element: VIEW_SWITCH_SELECTOR,
			popover: {
				title: 'Vista del calendario',
				description:
					'Elegí cómo querés ver tu agenda. Alterná entre las distintas vistas para organizar tus reservas de la forma que te resulte más cómoda.',
				side: 'bottom',
				align: 'center',
			},
		});
	}

	if (document.querySelector(NEW_APPOINTMENT_SELECTOR)) {
		steps.push({
			element: NEW_APPOINTMENT_SELECTOR,
			popover: {
				title: 'Agendar',
				description:
					'Creá reservas de forma manual para agendar fuera del horario habitual o cuando no haya huecos libres.',
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

		const isMobile = window.innerWidth < 768;
		const toolbarReady = isMobile
			? Boolean(document.querySelector(NAV_SELECTOR))
			: Boolean(document.querySelector(NAV_SELECTOR) && document.querySelector(VIEW_SWITCH_SELECTOR));

		if (!toolbarReady && attempt < 12) {
			window.setTimeout(() => tryStart(attempt + 1), 120);
			return;
		}

		showCalendarTour();
	};

	window.setTimeout(() => tryStart(), 450);
}
