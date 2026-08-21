const PANEL_MODAL_OPEN_CLASS = 'panel-modal-open';
const PANEL_MOBILE_MQ = '(max-width: 1023.98px)';

let lockCount = 0;
let savedScrollTops: Map<HTMLElement, number> | null = null;
let viewportRestoreCleanup: (() => void) | null = null;
const dialogUnlockers = new WeakMap<HTMLDialogElement, () => void>();

export function isPanelMobileViewport() {
	return typeof window !== 'undefined' && window.matchMedia(PANEL_MOBILE_MQ).matches;
}

export function getLayoutViewportHeight() {
	return document.documentElement.clientHeight || window.innerHeight;
}

export function getPanelScrollRoots(): HTMLElement[] {
	return [
		document.querySelector<HTMLElement>('.app-shell > :last-child'),
		document.querySelector<HTMLElement>('.app-shell > :last-child > main'),
	].filter((node): node is HTMLElement => Boolean(node));
}

export function restorePanelScrollLayout(saved = savedScrollTops) {
	if (!saved) return;
	window.scrollTo(0, 0);
	for (const [root, scrollTop] of saved) {
		root.scrollTop = scrollTop;
	}
}

function cancelViewportRestore() {
	viewportRestoreCleanup?.();
	viewportRestoreCleanup = null;
}

function schedulePanelScrollRestore(saved: Map<HTMLElement, number> | null) {
	if (!saved) return;

	cancelViewportRestore();

	const restore = () => restorePanelScrollLayout(saved);

	restore();
	requestAnimationFrame(restore);
	window.setTimeout(restore, 120);
	window.setTimeout(restore, 320);

	const vv = window.visualViewport;
	if (!vv) return;

	let ticks = 0;
	const onViewportChange = () => {
		restore();
		ticks += 1;
		if (ticks >= 8) cleanup();
	};
	const cleanup = () => {
		vv.removeEventListener('resize', onViewportChange);
		vv.removeEventListener('scroll', onViewportChange);
		if (viewportRestoreCleanup === cleanup) {
			viewportRestoreCleanup = null;
		}
	};

	vv.addEventListener('resize', onViewportChange);
	vv.addEventListener('scroll', onViewportChange);
	window.setTimeout(cleanup, 900);
	viewportRestoreCleanup = cleanup;
}

/** Traba el canvas del panel en mobile. Ref-count para dialogs anidados. */
export function lockPanelScroll(): () => void {
	if (typeof document === 'undefined' || !isPanelMobileViewport()) {
		return () => {};
	}

	if (lockCount === 0) {
		const roots = getPanelScrollRoots();
		savedScrollTops = new Map(roots.map((root) => [root, root.scrollTop]));
		document.documentElement.classList.add(PANEL_MODAL_OPEN_CLASS);
	}
	lockCount += 1;

	let released = false;
	return () => {
		if (released) return;
		released = true;
		if (lockCount === 0) return;
		lockCount -= 1;
		if (lockCount > 0) return;

		const saved = savedScrollTops;
		document.documentElement.classList.remove(PANEL_MODAL_OPEN_CLASS);
		schedulePanelScrollRestore(saved);
		savedScrollTops = null;
	};
}

/** `showModal()` + lock del canvas. Unlock automático en `close`. */
export function openPanelModal(dialog: HTMLDialogElement) {
	if (dialog.open) return;
	bindPanelModalUnlock(dialog, lockPanelScroll());
	dialog.showModal();
}

function bindPanelModalUnlock(dialog: HTMLDialogElement, unlock: () => void) {
	dialogUnlockers.get(dialog)?.();
	dialogUnlockers.set(dialog, unlock);
	const onClose = () => {
		dialog.removeEventListener('close', onClose);
		if (dialogUnlockers.get(dialog) !== unlock) return;
		dialogUnlockers.delete(dialog);
		unlock();
	};
	dialog.addEventListener('close', onClose);
}
