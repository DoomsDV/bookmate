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
					'Será un enlace único y directo para el profesional en tu negocio. Edita la parte final del enlace y usa el botón copiar para compartir la URL completa con tus clientes.',
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
