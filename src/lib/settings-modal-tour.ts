import type { DriveStep } from 'driver.js';
import { runBookmateTour } from './product-tour';

const PUBLIC_PROFILE_FIELD_SELECTOR = '[data-settings-public-profile-field]';

export type SettingsModalTourContext = {
	activateProfileTab?: () => void;
};

function isPublicProfileFieldVisible() {
	const field = document.querySelector(PUBLIC_PROFILE_FIELD_SELECTOR);
	if (!field) return false;
	const section = field.closest('[data-settings-prof-fields]');
	return section ? !section.classList.contains('hidden') : true;
}

function buildTourSteps(): DriveStep[] {
	if (!isPublicProfileFieldVisible()) return [];

	return [
		{
			element: PUBLIC_PROFILE_FIELD_SELECTOR,
			popover: {
				title: 'URL del perfil público',
				description:
					'Define el enlace que compartirás con tus clientes para reservar en línea. El prefijo es fijo; solo editas la parte final (por ejemplo, tu nombre). Usa el botón copiar para compartir la URL completa.',
				side: 'bottom',
				align: 'start',
			},
		},
	];
}

/** Guía repetible sobre la URL del perfil público (modal de ajustes abierto). */
export function showSettingsModalTour(context: SettingsModalTourContext = {}) {
	const steps = buildTourSteps();
	if (steps.length === 0) return;

	context.activateProfileTab?.();

	runBookmateTour(steps, {
		force: true,
		storageKey: 'bookmate_settings_modal_tour',
		persistCompletion: false,
		useTopLayerShell: true,
	});
}
