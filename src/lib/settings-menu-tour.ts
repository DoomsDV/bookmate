import type { DriveStep } from 'driver.js';
import {
	isBlockingDialogOpen,
	runBookmateTour,
	waitUntilBlockingDialogsClosed,
} from './product-tour';

const STORAGE_KEY = 'bookmate_settings_menu_tour_v2';
const SETTINGS_MENU_TRIGGER = '[data-settings-menu-trigger]';
const PWA_INSTALL_TRIGGER = '[data-pwa-install-trigger]';

export function hasSeenSettingsMenuTour() {
	return localStorage.getItem(STORAGE_KEY) === '1';
}

function isPwaInstallButtonVisible() {
	const installBtn = document.querySelector<HTMLElement>(PWA_INSTALL_TRIGGER);
	if (!installBtn) return false;
	return (
		installBtn.classList.contains('flex') && !installBtn.classList.contains('hidden')
	);
}

function waitForOptionalInstallButton(maxMs = 4500): Promise<boolean> {
	if (isPwaInstallButtonVisible()) return Promise.resolve(true);

	return new Promise((resolve) => {
		const startedAt = Date.now();
		let settled = false;

		const finish = (visible: boolean) => {
			if (settled) return;
			settled = true;
			window.clearInterval(pollTimer);
			window.removeEventListener('beforeinstallprompt', onInstallPrompt);
			resolve(visible);
		};

		const onInstallPrompt = () => {
			window.setTimeout(() => finish(isPwaInstallButtonVisible()), 80);
		};

		const pollTimer = window.setInterval(() => {
			if (isPwaInstallButtonVisible()) {
				finish(true);
				return;
			}
			if (Date.now() - startedAt >= maxMs) finish(false);
		}, 200);

		window.addEventListener('beforeinstallprompt', onInstallPrompt);
	});
}

function buildTourSteps(includeInstallStep: boolean): DriveStep[] {
	const trigger = document.querySelector(SETTINGS_MENU_TRIGGER);
	if (!trigger) return [];

	const steps: DriveStep[] = [
		{
			element: SETTINGS_MENU_TRIGGER,
			popover: {
				title: 'Ajustes y cuenta',
				description:
					'Abre este menú para entrar a Ajustes: edita tu perfil, cambia la contraseña, personaliza la apariencia del panel y configura el negocio (horarios, recordatorios y más). También puedes cerrar sesión desde aquí.',
				side: 'bottom',
				align: 'end',
			},
		},
	];

	if (includeInstallStep && isPwaInstallButtonVisible()) {
		steps.push({
			element: PWA_INSTALL_TRIGGER,
			popover: {
				title: 'Instalar la aplicación',
				description:
					'Este botón instala Hasel en tu dispositivo como aplicación. Así podrás abrir el panel más rápido y, tras instalar, activar notificaciones para recibir avisos de citas nuevas y recordatorios.',
				side: 'bottom',
				align: 'end',
			},
		});
	}

	return steps;
}

export function showSettingsMenuTour(options?: { force?: boolean; includeInstallStep?: boolean }) {
	const includeInstallStep = options?.includeInstallStep ?? isPwaInstallButtonVisible();
	const steps = buildTourSteps(includeInstallStep);
	runBookmateTour(steps, { force: options?.force, storageKey: STORAGE_KEY });
}

async function tryRunSettingsMenuTour() {
	if (hasSeenSettingsMenuTour()) return;
	if (document.body.classList.contains('driver-active')) return;
	if (!document.querySelector(SETTINGS_MENU_TRIGGER)) return;

	const path = window.location.pathname.replace(/\/+$/, '') || '/';
	if (path !== '/panel/dashboard') return;

	const includeInstallStep = await waitForOptionalInstallButton();
	if (hasSeenSettingsMenuTour()) return;
	if (document.body.classList.contains('driver-active')) return;

	if (isBlockingDialogOpen()) {
		await waitUntilBlockingDialogsClosed();
	}

	if (hasSeenSettingsMenuTour()) return;
	if (document.body.classList.contains('driver-active')) return;
	if (isBlockingDialogOpen()) return;

	const steps = buildTourSteps(includeInstallStep);
	if (steps.length === 0) return;

	runBookmateTour(steps, { storageKey: STORAGE_KEY });
}

function bindSettingsMenuTourRetry() {
	if (typeof window === 'undefined') return;
	const globalWindow = window as typeof window & { __bookmateSettingsTourRetryBound?: boolean };
	if (globalWindow.__bookmateSettingsTourRetryBound) return;
	globalWindow.__bookmateSettingsTourRetryBound = true;

	window.addEventListener('bookmate:tour-interrupted-by-dialog', (event) => {
		const storageKey =
			event instanceof CustomEvent && typeof event.detail?.storageKey === 'string'
				? event.detail.storageKey
				: '';
		if (storageKey !== STORAGE_KEY) return;

		window.setTimeout(() => {
			void tryRunSettingsMenuTour();
		}, 400);
	});
}

/** Muestra la guía una sola vez (en el dashboard al entrar al panel). */
export function maybeShowSettingsMenuTour() {
	if (hasSeenSettingsMenuTour()) return;
	if (!document.querySelector(SETTINGS_MENU_TRIGGER)) return;

	const path = window.location.pathname.replace(/\/+$/, '') || '/';
	if (path !== '/panel/dashboard') return;

	bindSettingsMenuTourRetry();

	window.setTimeout(() => {
		void tryRunSettingsMenuTour();
	}, 900);
}
