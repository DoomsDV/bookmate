import type { DriveStep } from 'driver.js';
import { runBookmateTour } from './product-tour';

const PUBLIC_PROFILE_FIELD_SELECTOR = '[data-settings-public-profile-field]';
const SETTINGS_MODAL_SELECTOR = '[data-settings-modal]';
const PAYMENTS_ENABLE_SELECTOR = '[data-payments-tour-enable]';
const PAYMENTS_POLICY_SELECTOR = '[data-payments-tour-policy]';
const PAYMENTS_SIPAP_SELECTOR = '[data-payments-tour-sipap]';
const PAYMENTS_DETAILS_SELECTOR = '[data-payments-details]';

export type SettingsModalTourContext = {
	activateProfileTab?: () => void;
	activatePaymentsTab?: () => void;
	getActiveTab?: () => string;
	/** Muestra temporalmente los bloques de política/SIPAP; debe devolver un restore. */
	revealPaymentsDetailsForTour?: () => (() => void) | void;
};

function isPublicProfileFieldVisible() {
	return Boolean(document.querySelector(PUBLIC_PROFILE_FIELD_SELECTOR));
}

function isPaymentsTourAvailable() {
	return Boolean(document.querySelector(PAYMENTS_ENABLE_SELECTOR));
}

function buildProfileTourSteps(): DriveStep[] {
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

function buildPaymentsTourSteps(): DriveStep[] {
	if (!isPaymentsTourAvailable()) return [];

	const steps: DriveStep[] = [
		{
			element: PAYMENTS_ENABLE_SELECTOR,
			popover: {
				title: 'Cobro de señas',
				description:
					'Activá este interruptor para pedir una seña por transferencia SIPAP al reservar. El dinero va directo a tu cuenta; Hasel no intermedia el pago.',
				side: 'bottom',
				align: 'start',
			},
		},
	];

	if (document.querySelector(PAYMENTS_POLICY_SELECTOR)) {
		steps.push({
			element: PAYMENTS_POLICY_SELECTOR,
			popover: {
				title: 'Política de cancelación',
				description:
					'Elegí Flexible, Moderada o Estricta. El cliente la acepta al reservar y define cuánto se reembolsa si cancela (ventana de 24 horas antes del turno).',
				side: 'bottom',
				align: 'start',
			},
		});
	}

	if (document.querySelector(PAYMENTS_SIPAP_SELECTOR)) {
		steps.push({
			element: PAYMENTS_SIPAP_SELECTOR,
			popover: {
				title: 'Datos para recibir la transferencia',
				description:
					'Completá banco, titular, documento y alias. El cliente usa estos datos y el código HASEL en el asunto de la transferencia.',
				side: 'top',
				align: 'start',
			},
		});
	}

	return steps;
}

function runSettingsTour(steps: DriveStep[], onDestroyed?: () => void) {
	if (steps.length === 0) return;

	runBookmateTour(steps, {
		force: true,
		storageKey: 'bookmate_settings_modal_tour',
		persistCompletion: false,
		useTopLayerShell: true,
		hostSelector: SETTINGS_MODAL_SELECTOR,
		scrollIntoView: { rootSelector: '[data-settings-content]' },
		onDestroyed,
	});
}

function showProfileTour(context: SettingsModalTourContext) {
	const steps = buildProfileTourSteps();
	if (steps.length === 0) return;
	context.activateProfileTab?.();
	runSettingsTour(steps);
}

function showPaymentsTour(context: SettingsModalTourContext) {
	context.activatePaymentsTab?.();
	const restore = context.revealPaymentsDetailsForTour?.();

	// Esperar un frame para que el panel y los detalles estén visibles antes de medir.
	requestAnimationFrame(() => {
		const steps = buildPaymentsTourSteps();
		if (steps.length === 0) {
			if (typeof restore === 'function') restore();
			return;
		}
		runSettingsTour(steps, () => {
			if (typeof restore === 'function') restore();
		});
	});
}

/**
 * Tabs con recorrido definido: Mi perfil (enlace personal) y Pagos (señas SIPAP).
 */
export function hasSettingsModalTourForTab(tab: string): boolean {
	if (tab === 'payments') return isPaymentsTourAvailable();
	if (tab === 'profile') return isPublicProfileFieldVisible();
	return false;
}

/**
 * Guía contextual del modal de ajustes.
 * En Pagos: cobro de señas → políticas → datos SIPAP.
 * En Mi perfil: enlace personal (si está disponible).
 */
export function showSettingsModalTour(context: SettingsModalTourContext = {}) {
	const tab = context.getActiveTab?.() ?? 'profile';

	if (tab === 'payments') {
		if (!isPaymentsTourAvailable()) return;
		showPaymentsTour(context);
		return;
	}

	if (tab === 'profile') {
		showProfileTour(context);
	}
}

/** Fuerza mostrar `[data-payments-details]` sin cambiar el toggle; restaura con `classList`. */
export function revealPaymentsDetailsForTour(): (() => void) | void {
	const details = document.querySelector<HTMLElement>(PAYMENTS_DETAILS_SELECTOR);
	if (!details) return;
	const wasHidden = details.classList.contains('hidden');
	if (wasHidden) details.classList.remove('hidden');
	return () => {
		if (wasHidden) details.classList.add('hidden');
	};
}
