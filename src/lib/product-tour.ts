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
	/** Opacidad del velo de driver.js. Default 0: el encuadre es el anillo fixed. */
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
		shell
			.querySelectorAll('.driver-popover, .driver-overlay, [data-bookmate-tour-focus]')
			.forEach((node) => node.remove());
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
	removeTourFocusRing();
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
let activeTourDurationMs = 280;
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

const TOUR_FOCUS_SELECTOR = '[data-bookmate-tour-focus]';
/** Misma holgura que el outline-offset anterior (~0.7rem). */
const TOUR_FOCUS_PAD_REM = 0.7;

let focusRingTarget: HTMLElement | null = null;
let focusRingRaf = 0;
let focusRingSyncBound = false;
let focusRingObserver: ResizeObserver | null = null;

function getTourFocusRingHost(): HTMLElement {
	if (activeTourUsesTopLayerShell) {
		const shell = document.querySelector<HTMLElement>(TOUR_SHELL_SELECTOR);
		if (shell) return shell;
	}
	return document.body;
}

function ensureTourFocusRing(): HTMLElement {
	const host = getTourFocusRingHost();
	let ring = document.querySelector<HTMLElement>(TOUR_FOCUS_SELECTOR);
	if (!ring) {
		ring = document.createElement('div');
		ring.setAttribute('data-bookmate-tour-focus', '');
		ring.setAttribute('aria-hidden', 'true');
		ring.hidden = true;
		host.appendChild(ring);
	} else if (ring.parentElement !== host) {
		host.appendChild(ring);
	}
	ring.style.setProperty('--driver-animation-duration', `${activeTourDurationMs}ms`);
	return ring;
}

function resolveTourFocusRadius(element: HTMLElement, pad: number): string {
	if (
		element.matches(
			'[data-professional-card-avatar], [data-voice-overlay-record], [data-calendar-tour-help], .calendar-tour-help, .calendar-filters-trigger'
		)
	) {
		return '999px';
	}

	const radius = getComputedStyle(element).borderRadius;
	const parts = radius.split(/\s+/).filter(Boolean);
	if (parts.some((part) => part.includes('%') && parseFloat(part) >= 50)) {
		return '999px';
	}

	const values = parts.map((part) => parseFloat(part)).filter((n) => Number.isFinite(n));
	const max = values.length ? Math.max(...values) : 0;
	const rect = element.getBoundingClientRect();
	const minSide = Math.min(rect.width, rect.height);
	if (max >= 999 || (minSide > 0 && max >= minSide / 2 - 0.5)) {
		return '999px';
	}

	const base = max > 0 ? max : 16;
	return `${base + pad}px`;
}

function placeTourFocusRing(element?: Element | null, options?: { snap?: boolean }) {
	const ring = ensureTourFocusRing();
	if (!(element instanceof HTMLElement) || element.getClientRects().length === 0) {
		ring.hidden = true;
		return;
	}

	const rect = element.getBoundingClientRect();
	if (rect.width < 1 && rect.height < 1) {
		ring.hidden = true;
		return;
	}

	const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
	const pad = TOUR_FOCUS_PAD_REM * rootFont;
	const snap = Boolean(options?.snap || ring.hidden);

	if (snap) ring.style.transition = 'none';

	ring.hidden = false;
	ring.style.top = `${rect.top - pad}px`;
	ring.style.left = `${rect.left - pad}px`;
	ring.style.width = `${rect.width + pad * 2}px`;
	ring.style.height = `${rect.height + pad * 2}px`;
	ring.style.borderRadius = resolveTourFocusRadius(element, pad);

	if (snap) {
		void ring.offsetWidth;
		ring.style.transition = '';
	}
}

function onTourFocusViewportChange() {
	if (!focusRingTarget) return;
	if (focusRingRaf) return;
	focusRingRaf = window.requestAnimationFrame(() => {
		focusRingRaf = 0;
		placeTourFocusRing(focusRingTarget);
	});
}

function startTourFocusRingSync(element: Element | undefined) {
	const next = element instanceof HTMLElement ? element : null;
	const ring = document.querySelector<HTMLElement>(TOUR_FOCUS_SELECTOR);
	const snap = !ring || ring.hidden;
	focusRingTarget = next;
	placeTourFocusRing(next, { snap });

	if (!focusRingObserver) {
		focusRingObserver = new ResizeObserver(onTourFocusViewportChange);
	}
	focusRingObserver.disconnect();
	if (next) focusRingObserver.observe(next);

	if (focusRingSyncBound) return;
	focusRingSyncBound = true;
	window.addEventListener('scroll', onTourFocusViewportChange, true);
	window.addEventListener('resize', onTourFocusViewportChange);
	window.visualViewport?.addEventListener('resize', onTourFocusViewportChange);
	window.visualViewport?.addEventListener('scroll', onTourFocusViewportChange);
}

function stopTourFocusRingSync() {
	focusRingTarget = null;
	if (focusRingRaf) {
		window.cancelAnimationFrame(focusRingRaf);
		focusRingRaf = 0;
	}
	focusRingObserver?.disconnect();
	if (!focusRingSyncBound) return;
	focusRingSyncBound = false;
	window.removeEventListener('scroll', onTourFocusViewportChange, true);
	window.removeEventListener('resize', onTourFocusViewportChange);
	window.visualViewport?.removeEventListener('resize', onTourFocusViewportChange);
	window.visualViewport?.removeEventListener('scroll', onTourFocusViewportChange);
}

function removeTourFocusRing() {
	stopTourFocusRingSync();
	document.querySelectorAll(TOUR_FOCUS_SELECTOR).forEach((node) => node.remove());
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
	placeTourFocusRing(activeElement);
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
	activeTourDurationMs = animate ? duration : 0;
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
			startTourFocusRingSync(element);
			scheduleRemoveTourOverlaysAfterDriverPaint();
		},
		onHighlighted: (element, step, { driver: activeDriver }) => {
			startTourFocusRingSync(element);
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
			activeTourDurationMs = 280;
			stopOverlayStripObserver();
			removeTourFocusRing();
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
