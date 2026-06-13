import type { DriveStep } from 'driver.js';
import { runBookmateTour } from './product-tour';

const PUBLIC_PROFILE_FIELD_SELECTOR = '[data-settings-public-profile-field]';
const SETTINGS_MODAL_SELECTOR = '[data-settings-modal]';

export type SettingsModalTourContext = {
	activateProfileTab?: () => void;
};

function isPublicProfileFieldVisible() {
	return Boolean(document.querySelector(PUBLIC_PROFILE_FIELD_SELECTOR));
}

function buildTourSteps(): DriveStep[] {
	if (!isPublicProfileFieldVisible()) return [];

	return [
		{
			element: PUBLIC_PROFILE_FIELD_SELECTOR,
			popover: {
				title: 'Enlace personal',
				description:
					'Define tu enlace único para compartir en redes (hasel.app/u/tu-nombre). El prefijo es fijo; solo editas la parte final. Usa el botón copiar para compartir la URL completa.',
				side: 'bottom',
				align: 'start',
			},
		},
	];
}

/** Guía repetible sobre el enlace personal (modal de ajustes abierto). */
export function showSettingsModalTour(context: SettingsModalTourContext = {}) {
	const steps = buildTourSteps();
	if (steps.length === 0) return;

	context.activateProfileTab?.();

	runBookmateTour(steps, {
		force: true,
		storageKey: 'bookmate_settings_modal_tour',
		persistCompletion: false,
		useTopLayerShell: true,
		hostSelector: SETTINGS_MODAL_SELECTOR,
		scrollIntoView: { rootSelector: '[data-settings-content]' },
	});
}
