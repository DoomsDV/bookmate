import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../styles/product-tour.css';

const TOUR_SHELL_SELECTOR = '[data-bookmate-tour-shell]';

export type BookmateTourRunOptions = {
	force?: boolean;
	storageKey: string;
	/** Si es false, la guía puede repetirse sin guardar en localStorage (p. ej. botón Guía en un modal). */
	persistCompletion?: boolean;
	/**
	 * Monta overlay y popover de driver.js en un `<dialog>` transparente encima de modales
	 * con `showModal()` (top layer). Sin esto, la guía queda detrás del modal.
	 */
	useTopLayerShell?: boolean;
};

function ensureTourShell(): HTMLDialogElement {
	let shell = document.querySelector<HTMLDialogElement>(TOUR_SHELL_SELECTOR);
	if (!shell) {
		shell = document.createElement('dialog');
		shell.setAttribute('data-bookmate-tour-shell', '');
		shell.setAttribute('aria-hidden', 'true');
		document.body.appendChild(shell);
	}
	if (!shell.open) shell.showModal();
	return shell;
}

function closeTourShell() {
	const shell = document.querySelector<HTMLDialogElement>(TOUR_SHELL_SELECTOR);
	if (shell?.open) shell.close();
}

function mountDriverUiInTourShell() {
	const shell = ensureTourShell();
	document.querySelectorAll('.driver-overlay').forEach((overlay) => {
		if (overlay.parentElement !== shell) shell.appendChild(overlay);
	});
	const popover = document.getElementById('driver-popover-content');
	if (popover && popover.parentElement !== shell) shell.appendChild(popover);
}

function scheduleMountDriverUiInTourShell() {
	mountDriverUiInTourShell();
	requestAnimationFrame(mountDriverUiInTourShell);
}

export function hasSeenBookmateTour(storageKey: string) {
	return localStorage.getItem(storageKey) === '1';
}

export function markBookmateTourSeen(storageKey: string) {
	localStorage.setItem(storageKey, '1');
}

export function runBookmateTour(steps: DriveStep[], options: BookmateTourRunOptions) {
	if (typeof window === 'undefined') return;
	if (!options.force && hasSeenBookmateTour(options.storageKey)) return;
	if (steps.length === 0) return;

	const useShell = options.useTopLayerShell === true;

	const driverObj = driver({
		allowClose: true,
		showProgress: true,
		progressText: '{{current}} de {{total}}',
		showButtons: ['next', 'previous'],
		nextBtnText: 'Siguiente',
		prevBtnText: 'Atrás',
		doneBtnText: 'Entendido',
		overlayOpacity: 0.55,
		stagePadding: 4,
		stageRadius: 16,
		popoverClass: 'bookmate-driver-popover',
		steps,
		onPopoverRender: useShell ? () => scheduleMountDriverUiInTourShell() : undefined,
		onHighlighted: useShell ? () => scheduleMountDriverUiInTourShell() : undefined,
		onDestroyed: () => {
			if (useShell) closeTourShell();
			if (options.persistCompletion !== false) {
				markBookmateTourSeen(options.storageKey);
			}
		},
	});

	if (useShell) ensureTourShell();
	driverObj.drive();
}
