const BOTTOM_SHEET_SELECTOR = [
	'dialog[data-specialty-modal]',
	'dialog[data-service-modal]',
	'dialog[data-location-modal]',
	'dialog[data-professional-modal]',
	'dialog[data-appointment-modal]',
	'dialog[data-settings-modal]',
].join(',');

const HANDLE_ATTR = 'data-bottom-sheet-handle';
const SCROLL_ATTR = 'data-bottom-sheet-scroll';
const ENHANCED_ATTR = 'data-bottom-sheet-enhanced';

type DragState = {
	pointerId: number;
	startY: number;
	lastY: number;
	startAt: number;
	dragging: boolean;
	source: 'handle' | 'content';
	scrollContainer: HTMLElement | null;
};

const dragStateByDialog = new WeakMap<HTMLDialogElement, DragState>();

const isMobileViewport = () => window.matchMedia('(max-width: 1023px)').matches;

const isInteractiveElement = (target: HTMLElement) => {
	return Boolean(
		target.closest(
			'input, textarea, select, button, a, summary, [role="button"], [contenteditable="true"]'
		)
	);
};

const isCloseControlAttribute = (attributeName: string) => {
	return (
		attributeName === 'data-settings-close' ||
		(attributeName.startsWith('data-close-') && attributeName.endsWith('-modal'))
	);
};

const findCloseTrigger = (dialog: HTMLDialogElement) => {
	const candidates = dialog.querySelectorAll<HTMLElement>('button, a, [role="button"]');
	for (const candidate of candidates) {
		const hasCloseAttribute = Array.from(candidate.attributes).some((attribute) =>
			isCloseControlAttribute(attribute.name)
		);
		if (hasCloseAttribute) return candidate;
	}
	return null;
};

const closeWithFallback = (dialog: HTMLDialogElement) => {
	if (!dialog.open) return;
	if (dialog.classList.contains('is-closing')) return;

	dialog.classList.add('is-closing');
	window.setTimeout(() => {
		dialog.close();
		dialog.classList.remove('is-closing');
	}, 170);
};

const closeSheet = (dialog: HTMLDialogElement) => {
	const closeTrigger = findCloseTrigger(dialog);
	if (closeTrigger) {
		closeTrigger.click();
		return;
	}

	closeWithFallback(dialog);
};

const clearDragStyle = (dialog: HTMLDialogElement) => {
	dragStateByDialog.delete(dialog);
	dialog.classList.remove('is-bottom-sheet-dragging');
	dialog.style.removeProperty('transition');
	dialog.style.removeProperty('transform');
	dialog.style.setProperty('--md3-sheet-drag-progress', '0');
};

const animateBackToRest = (dialog: HTMLDialogElement) => {
	dialog.style.transition = 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)';
	dialog.style.transform = 'translateY(0px)';
	dialog.style.setProperty('--md3-sheet-drag-progress', '0');

	const cleanup = () => {
		dialog.style.removeProperty('transition');
		dialog.classList.remove('is-bottom-sheet-dragging');
	};

	dialog.addEventListener('transitionend', cleanup, { once: true });
	window.setTimeout(cleanup, 220);
};

const getScrollableContainer = (dialog: HTMLDialogElement) => {
	const explicit = dialog.querySelector<HTMLElement>(`[${SCROLL_ATTR}]`);
	if (explicit) return explicit;

	const knownContainer = dialog.querySelector<HTMLElement>(
		[
			'[data-location-form]',
			'[data-service-create-form]',
			'[data-specialty-form]',
			'[data-professional-form]',
			'[data-appointment-form]',
			'.settings-content',
			'form',
		].join(',')
	);
	if (knownContainer) return knownContainer;

	const fallbackCandidates = dialog.querySelectorAll<HTMLElement>('form, div, section');
	for (const candidate of fallbackCandidates) {
		const computed = window.getComputedStyle(candidate);
		const canScrollY =
			(computed.overflowY === 'auto' || computed.overflowY === 'scroll') &&
			candidate.scrollHeight > candidate.clientHeight;
		if (canScrollY) return candidate;
	}

	return null;
};

const ensureDragHandle = (dialog: HTMLDialogElement) => {
	if (dialog.querySelector<HTMLElement>(`[${HANDLE_ATTR}]`)) return;

	const handleWrap = document.createElement('div');
	handleWrap.setAttribute(HANDLE_ATTR, 'true');
	handleWrap.setAttribute('aria-hidden', 'true');
	handleWrap.className = 'md3-bottom-sheet-handle-wrap';

	const handlePill = document.createElement('span');
	handlePill.className = 'md3-bottom-sheet-handle-pill';

	handleWrap.append(handlePill);
	dialog.prepend(handleWrap);
};

const shouldStartDragFromTarget = (
	dialog: HTMLDialogElement,
	target: HTMLElement,
	scrollContainer: HTMLElement | null
) => {
	const handle = dialog.querySelector<HTMLElement>(`[${HANDLE_ATTR}]`);
	const isHandleTarget = Boolean(handle?.contains(target));

	if (isHandleTarget) {
		return { allowed: true, source: 'handle' as const };
	}

	if (!scrollContainer || !scrollContainer.contains(target)) {
		return { allowed: false, source: 'content' as const };
	}

	if (scrollContainer.scrollTop > 0) {
		return { allowed: false, source: 'content' as const };
	}

	if (isInteractiveElement(target)) {
		return { allowed: false, source: 'content' as const };
	}

	return { allowed: true, source: 'content' as const };
};

const enhanceBottomSheet = (dialog: HTMLDialogElement) => {
	if (dialog.dataset[ENHANCED_ATTR] === 'true') return;
	dialog.dataset[ENHANCED_ATTR] = 'true';
	dialog.style.setProperty('--md3-sheet-drag-progress', '0');

	ensureDragHandle(dialog);

	const scrollContainer = getScrollableContainer(dialog);
	if (scrollContainer) {
		scrollContainer.setAttribute(SCROLL_ATTR, 'true');
	}

	dialog.addEventListener('close', () => {
		clearDragStyle(dialog);
	});

	dialog.addEventListener('pointerdown', (event) => {
		if (!dialog.open || !isMobileViewport()) return;
		if (!event.isPrimary) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		if (!(event.target instanceof HTMLElement)) return;

		const activeScrollContainer = getScrollableContainer(dialog);
		const dragPermission = shouldStartDragFromTarget(
			dialog,
			event.target,
			activeScrollContainer
		);

		if (!dragPermission.allowed) return;

		dragStateByDialog.set(dialog, {
			pointerId: event.pointerId,
			startY: event.clientY,
			lastY: event.clientY,
			startAt: performance.now(),
			dragging: false,
			source: dragPermission.source,
			scrollContainer: activeScrollContainer,
		});

		dialog.classList.add('is-bottom-sheet-dragging');
		dialog.style.transition = 'none';
		try {
			dialog.setPointerCapture(event.pointerId);
		} catch {
			// Ignore capture errors for unsupported pointers.
		}
	});

	dialog.addEventListener('pointermove', (event) => {
		const dragState = dragStateByDialog.get(dialog);
		if (!dragState || dragState.pointerId !== event.pointerId) return;

		const deltaY = event.clientY - dragState.startY;
		dragState.lastY = event.clientY;

		if (deltaY <= 0) {
			if (dragState.dragging) {
				dialog.style.transform = 'translateY(0px)';
				dialog.style.setProperty('--md3-sheet-drag-progress', '0');
			}
			return;
		}

		if (dragState.source === 'content' && dragState.scrollContainer && dragState.scrollContainer.scrollTop > 0) {
			return;
		}

		dragState.dragging = true;
		dialog.style.transform = `translateY(${deltaY}px)`;
		const progress = Math.min(deltaY / Math.max(dialog.clientHeight * 0.5, 220), 1);
		dialog.style.setProperty('--md3-sheet-drag-progress', progress.toFixed(3));
		event.preventDefault();
	});

	const finishGesture = (event: PointerEvent) => {
		const dragState = dragStateByDialog.get(dialog);
		if (!dragState || dragState.pointerId !== event.pointerId) return;

		const deltaY = dragState.lastY - dragState.startY;
		const elapsed = Math.max(1, performance.now() - dragState.startAt);
		const velocity = deltaY / elapsed;
		const distanceThreshold = Math.max(120, dialog.clientHeight * 0.22);
		const shouldDismiss = dragState.dragging && (deltaY > distanceThreshold || velocity > 0.75);

		try {
			dialog.releasePointerCapture(event.pointerId);
		} catch {
			// Ignore release errors for unsupported pointers.
		}

		if (shouldDismiss) {
			clearDragStyle(dialog);
			closeSheet(dialog);
			return;
		}

		dragStateByDialog.delete(dialog);
		animateBackToRest(dialog);
	};

	dialog.addEventListener('pointerup', finishGesture);
	dialog.addEventListener('pointercancel', (event) => {
		finishGesture(event);
	});
};

const setupBottomSheets = () => {
	const dialogs = document.querySelectorAll<HTMLDialogElement>(BOTTOM_SHEET_SELECTOR);
	dialogs.forEach(enhanceBottomSheet);
};

if (typeof window !== 'undefined') {
	const win = window as Window & {
		__bookmateBottomSheetInitialized?: boolean;
		__bookmateBottomSheetObserver?: MutationObserver;
	};

	if (!win.__bookmateBottomSheetInitialized) {
		win.__bookmateBottomSheetInitialized = true;

		const runSetup = () => {
			setupBottomSheets();
		};

		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', runSetup, { once: true });
		} else {
			runSetup();
		}

		document.addEventListener('astro:page-load', setupBottomSheets);
		document.addEventListener('astro:after-swap', setupBottomSheets);

		let rafId = 0;
		const queueSetup = () => {
			if (rafId) return;
			rafId = window.requestAnimationFrame(() => {
				rafId = 0;
				setupBottomSheets();
			});
		};

		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				for (const node of Array.from(mutation.addedNodes)) {
					if (!(node instanceof Element)) continue;
					if (node.matches(BOTTOM_SHEET_SELECTOR) || node.querySelector(BOTTOM_SHEET_SELECTOR)) {
						queueSetup();
						return;
					}
				}
			}
		});

		observer.observe(document.documentElement, {
			childList: true,
			subtree: true,
		});

		win.__bookmateBottomSheetObserver = observer;
	}
}
