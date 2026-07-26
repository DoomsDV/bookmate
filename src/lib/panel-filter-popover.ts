const DESKTOP_MQ = '(min-width: 768px)';
const POPOVER_CLASS = 'is-desktop-popover';

export const isDesktopFilterPopover = () =>
	typeof window !== 'undefined' && window.matchMedia(DESKTOP_MQ).matches;

const clearPopoverStyles = (sheet: HTMLDialogElement) => {
	sheet.style.top = '';
	sheet.style.left = '';
	sheet.style.right = '';
	sheet.style.bottom = '';
	sheet.style.width = '';
	sheet.style.maxWidth = '';
	sheet.style.margin = '';
};

export const positionFilterPopover = (sheet: HTMLDialogElement, trigger: HTMLElement) => {
	const buttonRect = trigger.getBoundingClientRect();
	const gap = 8;
	const width = Math.min(18.5 * 16, window.innerWidth - 24);
	const spaceRight = window.innerWidth - buttonRect.left - 12;
	const spaceLeft = buttonRect.right - 12;

	// Preferir abrir hacia la derecha del botón (no tapar el sidebar).
	let left =
		spaceRight >= width || spaceRight >= spaceLeft ? buttonRect.left : buttonRect.right - width;
	left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
	const top = buttonRect.bottom + gap;

	sheet.style.width = `${width}px`;
	sheet.style.maxWidth = `${width}px`;
	sheet.style.margin = '0';
	sheet.style.right = 'auto';
	sheet.style.bottom = 'auto';
	sheet.style.left = `${left}px`;
	sheet.style.top = `${top}px`;

	requestAnimationFrame(() => {
		const panelRect = sheet.getBoundingClientRect();
		const overflowBottom = panelRect.bottom - window.innerHeight + 12;
		if (overflowBottom <= 0) return;
		const aboveTop = buttonRect.top - gap - panelRect.height;
		if (aboveTop >= 12) {
			sheet.style.top = `${aboveTop}px`;
		} else {
			sheet.style.top = `${Math.max(12, top - overflowBottom)}px`;
		}
	});
};

export const closeFilterPopoverSheet = (
	sheet: HTMLDialogElement | null | undefined,
	trigger?: HTMLElement | null
) => {
	if (!sheet) return;
	if (sheet.open) {
		sheet.close();
	} else {
		clearPopoverStyles(sheet);
		sheet.classList.remove(POPOVER_CLASS);
	}
	trigger?.setAttribute('aria-expanded', 'false');
};

const openAsPopover = (sheet: HTMLDialogElement, trigger: HTMLElement) => {
	sheet.classList.add(POPOVER_CLASS);
	positionFilterPopover(sheet, trigger);
	sheet.show();
	trigger.setAttribute('aria-expanded', 'true');
};

const openAsModal = (sheet: HTMLDialogElement, trigger: HTMLElement) => {
	sheet.classList.remove(POPOVER_CLASS);
	clearPopoverStyles(sheet);
	sheet.showModal();
	trigger.setAttribute('aria-expanded', 'true');
};

/** Toggle open. On desktop uses non-modal popover; on mobile uses showModal(). */
export const toggleFilterPopoverSheet = (
	sheet: HTMLDialogElement | null | undefined,
	trigger: HTMLElement
) => {
	if (!sheet) return;

	if (sheet.open) {
		closeFilterPopoverSheet(sheet, trigger);
		return;
	}

	// Evita que el mismo click cierre el dialog al instante.
	window.setTimeout(() => {
		if (sheet.open) return;
		if (isDesktopFilterPopover()) {
			openAsPopover(sheet, trigger);
		} else {
			openAsModal(sheet, trigger);
		}
	}, 0);
};

type BindOptions = {
	sheet: HTMLDialogElement;
	getTrigger: () => HTMLElement | null;
	signal?: AbortSignal;
};

/** Escape / outside click / resize-scroll reposition / cleanup on close. */
export const bindFilterPopoverChrome = ({ sheet, getTrigger, signal }: BindOptions) => {
	const onClose = () => {
		clearPopoverStyles(sheet);
		sheet.classList.remove(POPOVER_CLASS);
		getTrigger()?.setAttribute('aria-expanded', 'false');
	};

	const onCancel = (event: Event) => {
		event.preventDefault();
		closeFilterPopoverSheet(sheet, getTrigger());
	};

	const onKeydown = (event: KeyboardEvent) => {
		if (event.key !== 'Escape') return;
		if (!sheet.open || !sheet.classList.contains(POPOVER_CLASS)) return;
		event.preventDefault();
		closeFilterPopoverSheet(sheet, getTrigger());
	};

	const onOutsidePointer = (event: PointerEvent) => {
		if (!sheet.open || !sheet.classList.contains(POPOVER_CLASS)) return;
		const target = event.target;
		if (!(target instanceof Node)) return;
		if (sheet.contains(target)) return;
		const trigger = getTrigger();
		if (trigger?.contains(target)) return;
		closeFilterPopoverSheet(sheet, trigger);
	};

	const onViewportChange = () => {
		if (!sheet.open) return;
		if (!isDesktopFilterPopover()) {
			if (sheet.classList.contains(POPOVER_CLASS)) {
				closeFilterPopoverSheet(sheet, getTrigger());
			}
			return;
		}
		if (sheet.classList.contains(POPOVER_CLASS)) {
			const trigger = getTrigger();
			if (trigger) positionFilterPopover(sheet, trigger);
			return;
		}
		closeFilterPopoverSheet(sheet, getTrigger());
	};

	sheet.addEventListener('close', onClose, { signal });
	sheet.addEventListener('cancel', onCancel, { signal });
	document.addEventListener('keydown', onKeydown, { signal });
	document.addEventListener('pointerdown', onOutsidePointer, { signal, capture: true });
	window.addEventListener('resize', onViewportChange, { signal });
	window.addEventListener('scroll', onViewportChange, { signal, capture: true });
};
