import type { DriveStep } from 'driver.js';
import { runBookmateTour } from './product-tour';

const PUBLIC_PROFILE_FIELD_SELECTOR = '[data-professional-public-profile-field]';
const ACCOUNT_STATUS_CARD_SELECTOR = '[data-professional-tour-account-status]';
const PERMISSIONS_BLOCK_SELECTOR = '[data-professional-permissions-block]';
const STATUS_SECTION_SELECTOR = '[data-professional-status-section]';
const MODAL_HOST_SELECTOR = '[data-professional-modal]';

function isElementVisible(selector: string) {
	const el = document.querySelector(selector);
	if (!el) return false;
	return !el.classList.contains('hidden');
}

function buildTourSteps(): DriveStep[] {
	const steps: DriveStep[] = [];

	if (document.querySelector(PUBLIC_PROFILE_FIELD_SELECTOR)) {
		steps.push({
			element: PUBLIC_PROFILE_FIELD_SELECTOR,
			popover: {
				title: 'URL del perfil público',
				description:
					'Enlace para que los clientes reserven en el negocio directamente con este profesional. Editá la parte final y usá copiar para compartir la URL completa.',
				side: 'top',
				align: 'start',
			},
		});
	}

	if (isElementVisible(STATUS_SECTION_SELECTOR) && document.querySelector(ACCOUNT_STATUS_CARD_SELECTOR)) {
		steps.push({
			element: ACCOUNT_STATUS_CARD_SELECTOR,
			popover: {
				title: 'Estado de la cuenta',
				description:
					'Activo: sigue en el equipo y podés ajustar permisos. Inactivo: no puede ingresar ni aparecer en reservas; se apagan panel y visibilidad pública. Al reactivar, se restauran los permisos anteriores.',
				side: 'bottom',
				align: 'center',
			},
		});
	}

	if (isElementVisible(STATUS_SECTION_SELECTOR) && document.querySelector(PERMISSIONS_BLOCK_SELECTOR)) {
		steps.push({
			element: PERMISSIONS_BLOCK_SELECTOR,
			popover: {
				title: 'Permisos',
				description:
					'Solo con cuenta activa. Podés permitir acceso al panel sin mostrar la agenda pública, o al revés.',
				side: 'top',
				align: 'center',
			},
		});
	}

	return steps;
}

/** Guía repetible del modal de personal (URL pública, estado y permisos). */
export function showProfessionalProfileUrlTour() {
	const steps = buildTourSteps();
	if (steps.length === 0) return;

	runBookmateTour(steps, {
		force: true,
		storageKey: 'bookmate_professional_profile_url_tour',
		persistCompletion: false,
		useTopLayerShell: true,
		hostSelector: MODAL_HOST_SELECTOR,
		scrollIntoView: { rootSelector: '[data-professional-modal-scroll]' },
		stagePadding: 8,
	});
}
