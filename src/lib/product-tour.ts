import { driver, type DriveStep, type Driver, type PopoverDOM } from 'driver.js';
/* Estilos de driver.js + product-tour.css viven en global.css (evita FOUC del auto-tour). */

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
	/** Opacidad del velo de driver.js. Default 0: el encuadre es el anillo CSS. */
	overlayOpacity?: number;
	stagePadding?: number;
	stageRadius?: number;
	/** Transición entre pasos (driver.js). Default: true. */
	animate?: boolean;
	/** Duración de la transición en ms cuando `animate` es true. Default: 280. */
	duration?: number;
	/** Desplaza el objetivo al centro del contenedor con scroll antes de posicionar el popover. */
	scrollIntoView?: boolean | { rootSelector?: string };
	/** Destruye la guía si este contenedor se cierra (p. ej. `[data-professional-modal]`). */
	hostSelector?: string;
	/** Callback al cerrar la guía (completar, saltar o destruir). */
	onDestroyed?: () => void;
};

function markOpenTourHosts() {
	document.querySelectorAll('dialog[open]').forEach((dialog) => {
		if (isTourShellDialog(dialog)) return;
		dialog.classList.add('bookmate-tour-host');
	});
}

function unmarkClosedTourHosts() {
	document.querySelectorAll('dialog.bookmate-tour-host').forEach((dialog) => {
		if (dialog instanceof HTMLDialogElement && dialog.open) return;
		dialog.classList.remove('bookmate-tour-host');
	});
}

function ensureTourShell(): HTMLDialogElement {
	let shell = document.querySelector<HTMLDialogElement>(TOUR_SHELL_SELECTOR);
	if (!shell) {
		shell = document.createElement('dialog');
		shell.setAttribute('data-bookmate-tour-shell', '');
		shell.setAttribute('aria-hidden', 'true');
		document.body.appendChild(shell);
	}
	document.documentElement.classList.add('bookmate-tour-shell-open');
	markOpenTourHosts();
	if (!shell.open) shell.showModal();
	return shell;
}

function closeTourShell() {
	const shell = document.querySelector<HTMLDialogElement>(TOUR_SHELL_SELECTOR);
	if (shell) {
		shell.querySelectorAll('.driver-popover, .driver-overlay').forEach((node) => node.remove());
		delete shell.dataset.overlayOpacity;
		if (shell.open) shell.close();
	}
	delete document.body.dataset.bookmateTourOverlay;
	stopOverlayStripObserver();
	unmarkClosedTourHosts();
	// El ::backdrop del modal host se recrea al salir del top layer.
	// El freeze (html + .bookmate-tour-host) tiene que seguir activo en ese frame.
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			document.documentElement.classList.remove('bookmate-tour-shell-open');
		});
	});
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
	stopOverlayStripObserver();
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
}

function mountDriverOverlayInTourShell() {
	if (isTourOverlayDisabled()) {
		removeTourOverlaysIfDisabled();
		return;
	}
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

	const overlay = shell.querySelector('.driver-overlay');
	if (overlay && popoverWrapper.previousElementSibling !== overlay) {
		shell.insertBefore(overlay, popoverWrapper);
	}

	removeTourOverlaysIfDisabled();
}

let tourLayoutSyncGeneration = 0;
let activeTourPopover: HTMLElement | null = null;
let activeTourDriver: Driver | null = null;
let activeTourStorageKey: string | null = null;
let activeTourPersistCompletion = true;
let activeTourUsesTopLayerShell = false;
let activeTourOverlayOpacity = 0;
let destroyPersistOverride: boolean | null = null;

function isTourOverlayDisabled() {
	return activeTourOverlayOpacity <= 0;
}

/** driver.js siempre crea el SVG del velo; con opacidad 0 lo sacamos del DOM por completo. */
function removeTourOverlaysIfDisabled() {
	if (!isTourOverlayDisabled()) return;
	document.querySelectorAll('.driver-overlay').forEach((overlay) => overlay.remove());
}

let overlayStripObserver: MutationObserver | null = null;

/** driver.js crea el SVG en body; con velo a 0 lo quitamos en el mismo frame. */
function startOverlayStripObserver() {
	if (!isTourOverlayDisabled()) return;
	stopOverlayStripObserver();
	removeTourOverlaysIfDisabled();

	overlayStripObserver = new MutationObserver(() => {
		removeTourOverlaysIfDisabled();
	});

	const observe = (root: Node) => {
		overlayStripObserver?.observe(root, { childList: true, subtree: true });
	};

	observe(document.body);
	const shell = document.querySelector(TOUR_SHELL_SELECTOR);
	if (shell) observe(shell);
}

function stopOverlayStripObserver() {
	overlayStripObserver?.disconnect();
	overlayStripObserver = null;
}

function scheduleRemoveTourOverlaysAfterDriverPaint() {
	if (!isTourOverlayDisabled()) return;
	removeTourOverlaysIfDisabled();
	requestAnimationFrame(() => {
		removeTourOverlaysIfDisabled();
		requestAnimationFrame(() => {
			removeTourOverlaysIfDisabled();
		});
	});
}

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

type TourPopoverSide = 'top' | 'bottom' | 'left' | 'right';

function rectsOverlap(a: DOMRect, b: DOMRect, gap = 8): boolean {
	return !(
		a.right + gap < b.left ||
		a.left > b.right + gap ||
		a.bottom + gap < b.top ||
		a.top > b.bottom + gap
	);
}

function resolveTourPopoverSide(side: DriveStep['popover'] extends { side?: infer S } ? S : never): TourPopoverSide {
	if (side === 'top' || side === 'bottom' || side === 'left' || side === 'right') {
		return side;
	}
	return 'bottom';
}

function isPopoverMispositioned(popover: HTMLElement, activeElement: Element | null) {
	if (isPopoverOffscreen(popover)) return true;
	if (!(activeElement instanceof HTMLElement)) return false;

	const pop = popover.getBoundingClientRect();
	const target = activeElement.getBoundingClientRect();

	// driver.js a veces deja el popover en la esquina superior izquierda.
	if (pop.top < 28 && pop.left < 28 && (target.top > 96 || target.left > 96)) {
		return true;
	}

	if (rectsOverlap(pop, target)) return true;

	const popCenterX = pop.left + pop.width / 2;
	const popCenterY = pop.top + pop.height / 2;
	const targetCenterX = target.left + target.width / 2;
	const targetCenterY = target.top + target.height / 2;
	const distance = Math.hypot(popCenterX - targetCenterX, popCenterY - targetCenterY);

	return distance > 240;
}

function pinPopoverNearActiveElement(popover: HTMLElement, side: TourPopoverSide) {
	const active = document.querySelector('.driver-active-element');
	if (!(active instanceof HTMLElement)) return;

	const target = active.getBoundingClientRect();
	const pop = popover.getBoundingClientRect();
	const gap = 12;
	const margin = 12;
	const maxLeft = Math.max(margin, window.innerWidth - pop.width - margin);
	const maxTop = Math.max(margin, window.innerHeight - pop.height - margin);

	let top: number;
	let left: number;

	if (side === 'left') {
		left = target.left - pop.width - gap;
		if (left < margin) {
			left = Math.min(target.right + gap, maxLeft);
		}
		top = target.top + target.height / 2 - pop.height / 2;
		top = Math.min(Math.max(margin, top), maxTop);
	} else if (side === 'right') {
		left = target.right + gap;
		if (left + pop.width > window.innerWidth - margin) {
			left = Math.max(margin, target.left - pop.width - gap);
		}
		top = target.top + target.height / 2 - pop.height / 2;
		top = Math.min(Math.max(margin, top), maxTop);
	} else if (side === 'bottom') {
		left = Math.min(Math.max(margin, target.left + target.width / 2 - pop.width / 2), maxLeft);
		top = target.bottom + gap;
		if (top + pop.height > window.innerHeight - margin) {
			top = Math.max(margin, target.top - pop.height - gap);
		}
	} else {
		left = Math.min(Math.max(margin, target.left + target.width / 2 - pop.width / 2), maxLeft);
		top = target.top - pop.height - gap;
		if (top < margin) {
			top = Math.min(target.bottom + gap, maxTop);
		}
	}

	popover.style.display = 'block';
	popover.style.top = `${Math.max(margin, top)}px`;
	popover.style.left = `${left}px`;
	popover.style.bottom = 'auto';
	popover.style.right = 'auto';
}

function syncTourLayout(
	activeDriver: Driver,
	preferredSide: TourPopoverSide = 'bottom',
	hostSelector?: string
) {
	if (activeDriver !== activeTourDriver) return;
	if (!isTourHostOpen(hostSelector)) {
		destroyActiveBookmateTour();
		return;
	}

	const popover = activeTourPopover;
	if (!(popover instanceof HTMLElement)) return;

	mountPopoverInTourShell(popover);
	activeDriver.refresh();
	scheduleRemoveTourOverlaysAfterDriverPaint();

	const activeElement = document.querySelector('.driver-active-element');
	if (activeElement instanceof HTMLElement && isPopoverMispositioned(popover, activeElement)) {
		pinPopoverNearActiveElement(popover, preferredSide);
	}
}

function handlePopoverRender(
	popoverDom: PopoverDOM,
	hostSelector?: string
) {
	if (!isTourHostOpen(hostSelector)) {
		destroyActiveBookmateTour();
		return;
	}

	activeTourPopover = popoverDom.wrapper;
	mountPopoverInTourShell(popoverDom.wrapper);
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
	const overlayOpacity = options.overlayOpacity ?? 0;
	const animate = options.animate ?? true;
	const duration = options.duration ?? 280;
	activeTourOverlayOpacity = overlayOpacity;
	activeTourStorageKey = options.storageKey;
	activeTourPersistCompletion = options.persistCompletion !== false;
	activeTourUsesTopLayerShell = useShell;

	activeTourDriver = driver({
		allowClose: true,
		animate,
		duration,
		showProgress: true,
		progressText: '{{current}} de {{total}}',
		showButtons: ['next', 'previous'],
		nextBtnText: 'Siguiente',
		prevBtnText: 'Atrás',
		doneBtnText: 'Entendido',
		overlayOpacity,
		overlayColor: overlayOpacity <= 0 ? 'transparent' : undefined,
		stagePadding: options.stagePadding ?? 4,
		stageRadius: options.stageRadius ?? 16,
		popoverClass: 'bookmate-driver-popover',
		popoverOffset: 12,
		steps,
		onDeselected: useShell
			? () => {
					reparentTourPopoverToBody(activeTourPopover);
				}
			: undefined,
		onHighlightStarted: (element) => {
			scrollTourTargetIntoView(element, options.scrollIntoView);
			scheduleRemoveTourOverlaysAfterDriverPaint();
		},
		onHighlighted: (_element, step, { driver: activeDriver }) => {
			if (!useShell && !needsScrollSync) return;
			if (!isTourHostOpen(hostSelector)) {
				destroyActiveBookmateTour();
				return;
			}
			const preferredSide = resolveTourPopoverSide(step.popover?.side);
			scheduleTourLayoutSync(() => syncTourLayout(activeDriver, preferredSide, hostSelector));
		},
		onPopoverRender: useShell
			? (popoverDom) => {
					handlePopoverRender(popoverDom, hostSelector);
				}
			: undefined,
		onDestroyed: () => {
			tourLayoutSyncGeneration += 1;
			activeTourPopover = null;
			activeTourDriver = null;
			activeTourUsesTopLayerShell = false;
			activeTourOverlayOpacity = 0;
			stopOverlayStripObserver();
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
			options.onDestroyed?.();
		},
	});

	if (useShell) {
		const shell = ensureTourShell();
		shell.dataset.overlayOpacity = String(overlayOpacity);
		if (animate) {
			shell.style.setProperty('--driver-animation-duration', `${duration}ms`);
		} else {
			shell.style.removeProperty('--driver-animation-duration');
		}
	}
	if (isTourOverlayDisabled()) {
		document.body.dataset.bookmateTourOverlay = '0';
		startOverlayStripObserver();
	} else {
		delete document.body.dataset.bookmateTourOverlay;
		stopOverlayStripObserver();
	}
	if (hostSelector) bindTourHostClose(hostSelector);
	activeTourDriver.drive();
	scheduleRemoveTourOverlaysAfterDriverPaint();
}
