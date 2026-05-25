import type { DriveStep } from 'driver.js';
import { runBookmateTour } from './product-tour';

const PUBLIC_PROFILE_FIELD_SELECTOR = '[data-professional-public-profile-field]';

function buildTourSteps(): DriveStep[] {
	if (!document.querySelector(PUBLIC_PROFILE_FIELD_SELECTOR)) return [];

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

/** Guía repetible sobre la URL del perfil público (modal de personal abierto). */
export function showProfessionalProfileUrlTour() {
	const steps = buildTourSteps();
	if (steps.length === 0) return;

	runBookmateTour(steps, {
		force: true,
		storageKey: 'bookmate_professional_profile_url_tour',
		persistCompletion: false,
		useTopLayerShell: true,
	});
}
