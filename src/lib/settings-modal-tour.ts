import type { DriveStep } from 'driver.js';
import { runBookmateTour } from './product-tour';

const PUBLIC_PROFILE_FIELD_SELECTOR = '[data-settings-public-profile-field]';
const SETTINGS_MODAL_SELECTOR = '[data-settings-modal]';
const PAYMENTS_ENABLE_SELECTOR = '[data-payments-tour-enable]';
const PAYMENTS_POLICY_SELECTOR = '[data-payments-tour-policy]';
const PAYMENTS_SIPAP_SELECTOR = '[data-payments-tour-sipap]';
const PAYMENTS_DETAILS_SELECTOR = '[data-payments-details]';
const SYSTEM_SLOT_SELECTOR = '[data-settings-tour-system-slot]';
const SYSTEM_SLOT_PREVIEW_SELECTOR = '[data-settings-tour-system-slot-preview]';
const SYSTEM_REMINDER_SELECTOR = '[data-settings-tour-system-reminder]';
const SYSTEM_ALERT_SELECTOR = '[data-settings-tour-system-alert]';
const SYSTEM_PUSH_SELECTOR = '[data-settings-tour-system-push]';
const SYSTEM_NOTIFY_ALL_SELECTOR = '[data-settings-tour-system-notify-all]';

export type SettingsModalTourContext = {
	activateProfileTab?: () => void;
	activatePaymentsTab?: () => void;
	activateSystemTab?: () => void;
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

function isSystemTourAvailable() {
	return Boolean(document.querySelector(SYSTEM_SLOT_SELECTOR));
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

function buildSystemTourSteps(): DriveStep[] {
	if (!isSystemTourAvailable()) return [];

	const steps: DriveStep[] = [
		{
			element: SYSTEM_SLOT_SELECTOR,
			popover: {
				title: 'Intervalo de reserva (slots)',
				description:
					'Elegí cada cuántos minutos se ofrecen turnos en la reserva online (por ejemplo, cada 30 o 60 minutos). Debe coincidir con la duración típica de tus servicios.',
				side: 'bottom',
				align: 'start',
			},
		},
	];

	if (document.querySelector(SYSTEM_SLOT_PREVIEW_SELECTOR)) {
		steps.push({
			element: SYSTEM_SLOT_PREVIEW_SELECTOR,
			popover: {
				title: 'Vista previa de horarios',
				description:
					'Así ve el cliente los horarios disponibles en tu página pública. Cambiá el intervalo arriba y el ejemplo se actualiza al instante.',
				side: 'bottom',
				align: 'start',
			},
		});
	}

	if (document.querySelector(SYSTEM_REMINDER_SELECTOR)) {
		steps.push({
			element: SYSTEM_REMINDER_SELECTOR,
			popover: {
				title: 'Tiempo de recordatorio',
				description:
					'Define cuántas horas antes del turno se envía por WhatsApp el mensaje de reconfirmación al cliente (ej. 24 horas antes).',
				side: 'bottom',
				align: 'start',
			},
		});
	}

	if (document.querySelector(SYSTEM_ALERT_SELECTOR)) {
		steps.push({
			element: SYSTEM_ALERT_SELECTOR,
			popover: {
				title: 'Citas no respondidas',
				description:
					'Si el cliente no responde al recordatorio, podés mantener la cita o cancelarla automáticamente. Al cancelar, también podés configurar cuánto tiempo esperar su respuesta.',
				side: 'bottom',
				align: 'start',
			},
		});
	}

	if (document.querySelector(SYSTEM_PUSH_SELECTOR)) {
		steps.push({
			element: SYSTEM_PUSH_SELECTOR,
			popover: {
				title: 'Notificaciones push',
				description:
					'Activá avisos en este dispositivo para enterarte al instante de citas nuevas, cambios y cancelaciones.',
				side: 'top',
				align: 'start',
			},
		});
	}

	if (document.querySelector(SYSTEM_NOTIFY_ALL_SELECTOR)) {
		steps.push({
			element: SYSTEM_NOTIFY_ALL_SELECTOR,
			popover: {
				title: 'Notificaciones de todo el equipo',
				description:
					'Además de tus propias citas, recibí avisos de reservas de otros profesionales del negocio. Requiere tener activadas las notificaciones push.',
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

function showSystemTour(context: SettingsModalTourContext) {
	context.activateSystemTab?.();
	requestAnimationFrame(() => {
		const steps = buildSystemTourSteps();
		if (steps.length === 0) return;
		runSettingsTour(steps);
	});
}

/**
 * Tabs con recorrido definido: Mi perfil, Pagos (señas SIPAP) y Sistema.
 */
export function hasSettingsModalTourForTab(tab: string): boolean {
	if (tab === 'payments') return isPaymentsTourAvailable();
	if (tab === 'profile') return isPublicProfileFieldVisible();
	if (tab === 'system') return isSystemTourAvailable();
	return false;
}

/**
 * Guía contextual del modal de ajustes.
 * En Pagos: cobro de señas → políticas → datos SIPAP.
 * En Mi perfil: enlace personal (si está disponible).
 * En Sistema: slots, recordatorios, alertas y notificaciones.
 */
export function showSettingsModalTour(context: SettingsModalTourContext = {}) {
	const tab = context.getActiveTab?.() ?? 'profile';

	if (tab === 'payments') {
		if (!isPaymentsTourAvailable()) return;
		showPaymentsTour(context);
		return;
	}

	if (tab === 'system') {
		if (!isSystemTourAvailable()) return;
		showSystemTour(context);
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
