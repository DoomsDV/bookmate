import { driver, type DriveStep, type Driver, type PopoverDOM } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../styles/product-tour.css';

const TOUR_SHELL_SELECTOR = '[data-bookmate-tour-shell]';

export type DestroyBookmateTourOptions = {
	/** false = no marcar la guía como vista al cerrar (p. ej. interrumpida por un modal). */
	persistCompletion?: boolean;
};

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
	stagePadding?: number;
	stageRadius?: number;
	/** Desplaza el objetivo al centro del contenedor con scroll antes de posicionar el popover. */
	scrollIntoView?: boolean | { rootSelector?: string };
	/** Destruye la guía si este contenedor se cierra (p. ej. `[data-professional-modal]`). */
	hostSelector?: string;
};

function ensureTourShell(): HTMLDialogElement {
	let shell = document.querySelector<HTMLDialogElement>(TOUR_SHELL_SELECTOR);
	if (!shell) {
		shell = document.createElement('dialog');
		shell.setAttribute('data-bookmate-tour-shell', '');
		shell.setAttribute('aria-hidden', 'true');
		document.body.appendChild(shell);
	}
	// Reabrir siempre para quedar encima de otros `<dialog>` del top layer (p. ej. Ajustes z-index 1200).
	if (shell.open) shell.close();
	shell.showModal();
	return shell;
}

function closeTourShell() {
	const shell = document.querySelector<HTMLDialogElement>(TOUR_SHELL_SELECTOR);
	if (!shell) return;
	shell.querySelectorAll('.driver-popover, .driver-overlay').forEach((node) => node.remove());
	if (shell.open) shell.close();
}

function forceCleanupDriverDom() {
	document
		.querySelectorAll('.driver-overlay, .driver-popover, .bookmate-driver-popover')
		.forEach((node) => node.remove());
	document.getElementById('driver-popover-content')?.remove();
	document.getElementById('driver-dummy-element')?.remove();
	document.querySelectorAll('[id^="driver-popover"]').forEach((node) => node.remove());
	document.querySelectorAll('.driver-active-element').forEach((el) => {
		el.classList.remove('driver-active-element', 'driver-no-interaction');
		el.removeAttribute('aria-haspopup');
		el.removeAttribute('aria-expanded');
		el.removeAttribute('aria-controls');
	});
	document.body.classList.remove('driver-active', 'driver-fade', 'driver-simple');
	closeTourShell();
}

function isTourHostOpen(hostSelector?: string) {
	if (!hostSelector) return true;
	const host = document.querySelector(hostSelector);
	return host instanceof HTMLDialogElement && host.open;
}

function bindTourHostClose(hostSelector: string) {
	const host = document.querySelector(hostSelector);
	if (!(host instanceof HTMLDialogElement)) return;

	const onHostClosed = () => destroyActiveBookmateTour();
	host.addEventListener('close', onHostClosed, { once: true });
	host.addEventListener('cancel', onHostClosed, { once: true });
}

/** driver.js hace body.removeChild al cambiar de paso; hay que devolver el popover a body antes. */
function reparentTourPopoverToBody(popover?: HTMLElement | null) {
	const node = popover ?? document.getElementById('driver-popover-content');
	if (!(node instanceof HTMLElement)) return;
	if (node.parentElement !== document.body) {
		document.body.appendChild(node);
	}
	// Ocultar mientras driver.js cambia de paso: en body queda detrás de modales nativos.
	node.style.display = 'none';
	node.style.visibility = 'hidden';
}

function mountDriverOverlayInTourShell() {
	const shell = ensureTourShell();
	document.querySelectorAll('.driver-overlay').forEach((overlay) => {
		if (overlay.parentElement !== shell) shell.appendChild(overlay);
	});
}

function mountPopoverInTourShell(popoverWrapper: HTMLElement) {
	const shell = ensureTourShell();

	// Limpiar popovers huérfanos de pasos anteriores.
	shell.querySelectorAll('.driver-popover').forEach((node) => {
		if (node !== popoverWrapper) node.remove();
	});

	mountDriverOverlayInTourShell();

	if (popoverWrapper.parentElement !== shell) {
		shell.appendChild(popoverWrapper);
	}

	popoverWrapper.style.display = 'block';
	popoverWrapper.style.visibility = 'visible';
	popoverWrapper.style.opacity = '1';

	const overlay = shell.querySelector('.driver-overlay');
	if (overlay && popoverWrapper.previousElementSibling !== overlay) {
		shell.insertBefore(overlay, popoverWrapper);
	}
}

let tourLayoutSyncGeneration = 0;
let activeTourPopover: HTMLElement | null = null;
let activeTourDriver: Driver | null = null;
let activeTourStorageKey: string | null = null;
let activeTourPersistCompletion = true;
let activeTourUsesTopLayerShell = false;
let destroyPersistOverride: boolean | null = null;

function isTourShellDialog(dialog: Element) {
	return dialog.matches(TOUR_SHELL_SELECTOR);
}

/** Hay un `<dialog open>` de la app (no el shell de la guía). */
export function isBlockingDialogOpen() {
	return Array.from(document.querySelectorAll('dialog[open]')).some(
		(dialog) => !isTourShellDialog(dialog)
	);
}

/** Espera a que el usuario cierre modales antes de mostrar la guía del dashboard. */
export function waitUntilBlockingDialogsClosed(timeoutMs = 5 * 60 * 1000): Promise<void> {
	if (!isBlockingDialogOpen()) return Promise.resolve();

	return new Promise((resolve) => {
		const finish = () => {
			observer.disconnect();
			window.clearTimeout(timeoutId);
			resolve();
		};

		const observer = new MutationObserver(() => {
			if (!isBlockingDialogOpen()) finish();
		});

		observer.observe(document.body, {
			subtree: true,
			attributes: true,
			attributeFilter: ['open'],
		});

		const timeoutId = window.setTimeout(finish, timeoutMs);
	});
}

function installBlockingDialogGuard() {
	if (typeof window === 'undefined') return;
	const globalWindow = window as typeof window & { __bookmateTourDialogGuard?: boolean };
	if (globalWindow.__bookmateTourDialogGuard) return;
	globalWindow.__bookmateTourDialogGuard = true;

	const observer = new MutationObserver(() => {
		if (!activeTourDriver?.isActive()) return;
		if (!isBlockingDialogOpen()) return;
		if (activeTourUsesTopLayerShell) return;

		const interruptedKey = activeTourStorageKey;
		destroyActiveBookmateTour({ persistCompletion: false });

		if (interruptedKey) {
			window.dispatchEvent(
				new CustomEvent('bookmate:tour-interrupted-by-dialog', {
					detail: { storageKey: interruptedKey },
				})
			);
		}
	});

	observer.observe(document.body, {
		subtree: true,
		attributes: true,
		attributeFilter: ['open'],
	});
}

/** Cierra la guía activa (p. ej. al cerrar el modal que la inició). */
export function destroyActiveBookmateTour(options?: DestroyBookmateTourOptions) {
	if (options?.persistCompletion !== undefined) {
		destroyPersistOverride = options.persistCompletion;
	}

	tourLayoutSyncGeneration += 1;
	activeTourPopover = null;

	const driverInstance = activeTourDriver;
	activeTourDriver = null;

	if (driverInstance?.isActive()) {
		try {
			driverInstance.destroy();
		} catch {
			// noop
		}
		return;
	}

	destroyPersistOverride = null;
	forceCleanupDriverDom();
}

function scheduleTourLayoutSync(onSynced?: () => void) {
	const generation = ++tourLayoutSyncGeneration;
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			if (generation !== tourLayoutSyncGeneration) return;
			onSynced?.();
		});
	});
}

function scrollTourTargetIntoView(
	element: Element | undefined,
	scrollIntoView: BookmateTourRunOptions['scrollIntoView']
) {
	if (!scrollIntoView || !(element instanceof HTMLElement)) return;

	const rootSelector =
		typeof scrollIntoView === 'object' ? scrollIntoView.rootSelector : undefined;
	const scrollRoot = rootSelector ? element.closest(rootSelector) : null;

	if (scrollRoot instanceof HTMLElement) {
		const rootRect = scrollRoot.getBoundingClientRect();
		const elRect = element.getBoundingClientRect();
		const delta = elRect.top - rootRect.top - rootRect.height / 2 + elRect.height / 2;

		if (Math.abs(delta) > 1) {
			scrollRoot.scrollBy({ top: delta, behavior: 'auto' });
		}
		return;
	}

	element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
}

function isPopoverOffscreen(popover: HTMLElement) {
	const rect = popover.getBoundingClientRect();
	if (rect.width < 1 || rect.height < 1) return true;

	const margin = 10;
	return (
		rect.bottom < margin ||
		rect.top > window.innerHeight - margin ||
		rect.right < margin ||
		rect.left > window.innerWidth - margin
	);
}

function pinPopoverNearActiveElement(popover: HTMLElement, side: 'top' | 'bottom') {
	const active = document.querySelector('.driver-active-element');
	if (!(active instanceof HTMLElement)) return;

	const target = active.getBoundingClientRect();
	const pop = popover.getBoundingClientRect();
	const gap = 12;
	const maxLeft = Math.max(12, window.innerWidth - pop.width - 12);
	const left = Math.min(Math.max(12, target.left + target.width / 2 - pop.width / 2), maxLeft);

	let top: number;
	if (side === 'bottom') {
		top = target.bottom + gap;
		if (top + pop.height > window.innerHeight - 12) {
			top = Math.max(12, target.top - pop.height - gap);
		}
	} else {
		top = target.top - pop.height - gap;
		if (top < 12) {
			top = Math.min(target.bottom + gap, window.innerHeight - pop.height - 12);
		}
	}

	popover.style.display = 'block';
	popover.style.visibility = 'visible';
	popover.style.opacity = '1';
	popover.style.top = `${Math.max(12, top)}px`;
	popover.style.left = `${left}px`;
	popover.style.bottom = 'auto';
	popover.style.right = 'auto';
}

function syncTourLayout(
	activeDriver: Driver,
	preferredSide: 'top' | 'bottom' = 'bottom',
	hostSelector?: string
) {
	if (activeDriver !== activeTourDriver) return;
	if (!isTourHostOpen(hostSelector)) {
		destroyActiveBookmateTour();
		return;
	}

	if (activeTourPopover) mountPopoverInTourShell(activeTourPopover);
	activeDriver.refresh();

	const popover = activeTourPopover;
	if (!(popover instanceof HTMLElement)) return;

	popover.style.display = 'block';
	popover.style.visibility = 'visible';

	if (isPopoverOffscreen(popover)) {
		pinPopoverNearActiveElement(popover, preferredSide);
	}
}

function handlePopoverRender(
	popoverDom: PopoverDOM,
	activeDriver: Driver,
	preferredSide: 'top' | 'bottom',
	hostSelector?: string
) {
	if (!isTourHostOpen(hostSelector)) {
		destroyActiveBookmateTour();
		return;
	}

	activeTourPopover = popoverDom.wrapper;
	mountPopoverInTourShell(popoverDom.wrapper);
	scheduleTourLayoutSync(() => syncTourLayout(activeDriver, preferredSide, hostSelector));
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

	if (!options.useTopLayerShell && isBlockingDialogOpen()) return;

	installBlockingDialogGuard();
	destroyActiveBookmateTour();

	const useShell = options.useTopLayerShell === true;
	const needsScrollSync = Boolean(options.scrollIntoView);
	const hostSelector = options.hostSelector;
	activeTourStorageKey = options.storageKey;
	activeTourPersistCompletion = options.persistCompletion !== false;
	activeTourUsesTopLayerShell = useShell;

	activeTourDriver = driver({
		allowClose: true,
		animate: !(useShell || needsScrollSync),
		showProgress: true,
		progressText: '{{current}} de {{total}}',
		showButtons: ['next', 'previous'],
		nextBtnText: 'Siguiente',
		prevBtnText: 'Atrás',
		doneBtnText: 'Entendido',
		overlayOpacity: 0.55,
		stagePadding: options.stagePadding ?? 4,
		stageRadius: options.stageRadius ?? 16,
		popoverClass: 'bookmate-driver-popover',
		popoverOffset: 12,
		steps,
		onDeselected: useShell
			? () => {
					reparentTourPopoverToBody(activeTourPopover);
					activeTourPopover = null;
				}
			: undefined,
		onHighlightStarted: (element) => {
			scrollTourTargetIntoView(element, options.scrollIntoView);
		},
		onHighlighted: (_element, step, { driver: activeDriver }) => {
			if (!useShell && !needsScrollSync) return;
			if (!isTourHostOpen(hostSelector)) {
				destroyActiveBookmateTour();
				return;
			}
			const preferredSide = step.popover?.side === 'top' ? 'top' : 'bottom';
			scheduleTourLayoutSync(() => syncTourLayout(activeDriver, preferredSide, hostSelector));
		},
		onPopoverRender: useShell
			? (popoverDom, { driver: activeDriver, state }) => {
					const preferredSide = state.activeStep?.popover?.side === 'top' ? 'top' : 'bottom';
					handlePopoverRender(popoverDom, activeDriver, preferredSide, hostSelector);
				}
			: undefined,
		onDestroyed: () => {
			tourLayoutSyncGeneration += 1;
			activeTourPopover = null;
			activeTourDriver = null;
			activeTourUsesTopLayerShell = false;
			if (useShell) closeTourShell();

			const shouldPersist =
				destroyPersistOverride !== null
					? destroyPersistOverride
					: activeTourPersistCompletion;
			destroyPersistOverride = null;

			if (shouldPersist && activeTourStorageKey) {
				markBookmateTourSeen(activeTourStorageKey);
			}
			activeTourStorageKey = null;
		},
	});

	if (useShell) ensureTourShell();
	if (hostSelector) bindTourHostClose(hostSelector);
	activeTourDriver.drive();
}
