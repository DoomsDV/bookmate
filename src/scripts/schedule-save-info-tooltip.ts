import { openPanelModal } from '../lib/panel-scroll-lock';

const GLOBAL_HANDLERS_FLAG = '__scheduleSaveInfoGlobalHandlers';

type ScheduleSaveInfoState = {
	button: HTMLButtonElement;
	popover: HTMLElement;
	popoverId: string;
	tapPinned: boolean;
	setOpen: (open: boolean) => void;
};

const states = new WeakMap<HTMLElement, ScheduleSaveInfoState>();

let saveInfoSheet: HTMLDialogElement | null = null;
let saveInfoSheetTrigger: HTMLButtonElement | null = null;

const supportsHoverPopover = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const getSaveInfoSheet = () => {
	if (!saveInfoSheet) {
		saveInfoSheet = document.querySelector<HTMLDialogElement>('[data-schedule-save-info-sheet]');
	}
	return saveInfoSheet;
};

const closeSaveInfoSheet = () => {
	const sheet = getSaveInfoSheet();
	if (!sheet?.open) return;
	sheet.close();
	saveInfoSheetTrigger?.setAttribute('aria-expanded', 'false');
	saveInfoSheetTrigger = null;
};

const openSaveInfoSheet = (button: HTMLButtonElement) => {
	const sheet = getSaveInfoSheet();
	if (!sheet) return;

	closeAllScheduleSaveInfo();
	saveInfoSheetTrigger = button;
	openPanelModal(sheet);
	button.setAttribute('aria-expanded', 'true');
};

const closeAllScheduleSaveInfo = () => {
	closeSaveInfoSheet();
	document.querySelectorAll<HTMLElement>('[data-schedule-save-info]').forEach((wrap) => {
		states.get(wrap)?.setOpen(false);
	});
};

const ensureGlobalHandlers = () => {
	const win = window as unknown as Record<string, boolean | undefined>;
	if (win[GLOBAL_HANDLERS_FLAG]) return;
	win[GLOBAL_HANDLERS_FLAG] = true;

	document.addEventListener('click', (event) => {
		const target = event.target;
		if (!(target instanceof Node)) return;

		if (target instanceof Element && target.closest('[data-close-schedule-save-info]')) {
			closeSaveInfoSheet();
			return;
		}

		document.querySelectorAll<HTMLElement>('[data-schedule-save-info]').forEach((wrap) => {
			const state = states.get(wrap);
			if (!state || wrap.contains(target)) return;
			state.setOpen(false);
		});
	});

	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') closeAllScheduleSaveInfo();
	});

	const sheet = getSaveInfoSheet();
	sheet?.addEventListener('close', () => {
		saveInfoSheetTrigger?.setAttribute('aria-expanded', 'false');
		saveInfoSheetTrigger = null;
	});

	sheet?.addEventListener('click', (event) => {
		if (event.target === sheet) closeSaveInfoSheet();
	});
};

function initScheduleSaveInfoTooltip(scope: ParentNode = document) {
	ensureGlobalHandlers();

	const wraps = scope.querySelectorAll<HTMLElement>('[data-schedule-save-info]');
	for (const wrap of wraps) {
		if (wrap.dataset.saveInfoBound === 'true') continue;

		const button = wrap.querySelector<HTMLButtonElement>('[data-schedule-save-info-btn]');
		const popover = wrap.querySelector<HTMLElement>('[data-schedule-save-info-popover]');
		if (!button || !popover) continue;

		wrap.dataset.saveInfoBound = 'true';

		const popoverId = popover.id || 'schedule-save-info-popover';
		if (!popover.id) popover.id = popoverId;

		const hoverMedia = window.matchMedia('(hover: hover) and (pointer: fine)');
		const state: ScheduleSaveInfoState = {
			button,
			popover,
			popoverId,
			tapPinned: false,
			setOpen: () => {},
		};

		state.setOpen = (open: boolean) => {
			if (!supportsHoverPopover()) return;

			popover.classList.toggle('is-visible', open);
			button.setAttribute('aria-expanded', open ? 'true' : 'false');

			if (open) {
				button.setAttribute('aria-describedby', popoverId);
				popover.setAttribute('aria-hidden', 'false');
				return;
			}

			button.removeAttribute('aria-describedby');
			popover.setAttribute('aria-hidden', 'true');
			state.tapPinned = false;
		};

		states.set(wrap, state);

		const supportsHover = () => hoverMedia.matches;

		if (supportsHover()) {
			wrap.addEventListener('mouseenter', () => state.setOpen(true));
			wrap.addEventListener('mouseleave', () => {
				if (!state.tapPinned) state.setOpen(false);
			});
			button.addEventListener('focus', () => state.setOpen(true));
			button.addEventListener('blur', (event) => {
				if (!wrap.contains(event.relatedTarget as Node)) state.setOpen(false);
			});
		}

		button.addEventListener('click', (event) => {
			if (supportsHover()) return;

			event.preventDefault();
			event.stopPropagation();

			const sheet = getSaveInfoSheet();
			if (sheet?.open && saveInfoSheetTrigger === button) {
				closeSaveInfoSheet();
				return;
			}

			openSaveInfoSheet(button);
		});

		hoverMedia.addEventListener('change', () => {
			state.setOpen(false);
			if (saveInfoSheetTrigger === button) closeSaveInfoSheet();
		});
	}
}

initScheduleSaveInfoTooltip();
document.addEventListener('astro:page-load', () => initScheduleSaveInfoTooltip());
