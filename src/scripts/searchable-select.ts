import TomSelect from 'tom-select';

export type SearchableSelectInstance = TomSelect;

const instances = new WeakMap<HTMLSelectElement, TomSelect>();
const bodyDropdownCleanups = new WeakMap<TomSelect, () => void>();

const usesFixedDropdown = (instance: TomSelect) => {
	const parent = instance.settings.dropdownParent;
	return parent === 'body' || (typeof HTMLElement !== 'undefined' && parent instanceof HTMLElement);
};

const DROPDOWN_GAP_PX = 4;
const DROPDOWN_VIEWPORT_MARGIN_PX = 10;
const DROPDOWN_PREFERRED_MAX_PX = 256; // ~16rem
const DROPDOWN_MIN_PX = 120;

const getLayoutViewportHeight = () =>
	document.documentElement.clientHeight || window.innerHeight;

/** Bounds visibles (incluye teclado móvil vía visualViewport). */
const getVisibleBounds = () => {
	const vv = window.visualViewport;
	if (!vv) {
		const height = getLayoutViewportHeight();
		return { top: 0, bottom: height };
	}
	return { top: vv.offsetTop, bottom: vv.offsetTop + vv.height };
};

const applyDropdownMaxHeight = (instance: TomSelect, maxHeight: number) => {
	instance.dropdown.style.maxHeight = `${maxHeight}px`;
	instance.dropdown.style.overflowY = 'hidden';

	const content = instance.dropdown.querySelector<HTMLElement>('.ts-dropdown-content');
	const inputWrap = instance.dropdown.querySelector<HTMLElement>('.dropdown-input-wrap');
	const chrome = inputWrap?.offsetHeight ?? 0;
	if (content) {
		content.style.maxHeight = `${Math.max(72, maxHeight - chrome)}px`;
		content.style.overflowY = 'auto';
	}
};

const positionFixedDropdown = (instance: TomSelect) => {
	if (!usesFixedDropdown(instance) || !instance.isOpen) return;

	const rect = instance.control.getBoundingClientRect();
	const parent = instance.settings.dropdownParent;
	const visible = getVisibleBounds();

	const spaceBelow = Math.max(
		0,
		visible.bottom - rect.bottom - DROPDOWN_GAP_PX - DROPDOWN_VIEWPORT_MARGIN_PX
	);
	const spaceAbove = Math.max(
		0,
		rect.top - visible.top - DROPDOWN_GAP_PX - DROPDOWN_VIEWPORT_MARGIN_PX
	);
	// En bottom sheets / cerca del borde inferior: abrir hacia arriba.
	const openUpward =
		spaceBelow < Math.min(DROPDOWN_PREFERRED_MAX_PX, 200) && spaceAbove > spaceBelow;
	const available = openUpward ? spaceAbove : spaceBelow;
	const maxHeight = Math.min(
		DROPDOWN_PREFERRED_MAX_PX,
		Math.max(80, available || DROPDOWN_MIN_PX)
	);

	// `position: fixed` inside <dialog> (or any transformed ancestor) is relative to that
	// element, not the viewport — convert coordinates when the parent is an HTMLElement.
	if (parent instanceof HTMLElement) {
		const parentRect = parent.getBoundingClientRect();
		const left = `${rect.left - parentRect.left + parent.scrollLeft}px`;

		if (openUpward) {
			Object.assign(instance.dropdown.style, {
				position: 'absolute',
				width: `${rect.width}px`,
				top: 'auto',
				bottom: `${parentRect.bottom - rect.top + parent.scrollTop + DROPDOWN_GAP_PX}px`,
				left,
				right: 'auto',
				zIndex: '1000',
			});
		} else {
			Object.assign(instance.dropdown.style, {
				position: 'absolute',
				width: `${rect.width}px`,
				top: `${rect.bottom - parentRect.top + parent.scrollTop + DROPDOWN_GAP_PX}px`,
				bottom: 'auto',
				left,
				right: 'auto',
				zIndex: '1000',
			});
		}
		applyDropdownMaxHeight(instance, maxHeight);
		return;
	}

	if (openUpward) {
		Object.assign(instance.dropdown.style, {
			position: 'fixed',
			width: `${rect.width}px`,
			top: 'auto',
			bottom: `${getLayoutViewportHeight() - rect.top + DROPDOWN_GAP_PX}px`,
			left: `${rect.left}px`,
			right: 'auto',
			zIndex: '1000',
		});
	} else {
		Object.assign(instance.dropdown.style, {
			position: 'fixed',
			width: `${rect.width}px`,
			top: `${rect.bottom + DROPDOWN_GAP_PX}px`,
			bottom: 'auto',
			left: `${rect.left}px`,
			right: 'auto',
			zIndex: '1000',
		});
	}
	applyDropdownMaxHeight(instance, maxHeight);
};

export const bindFixedDropdownPosition = (instance: TomSelect) => {
	if (!usesFixedDropdown(instance)) return;

	const reposition = () => positionFixedDropdown(instance);
	const onScroll = () => reposition();
	const onResize = () => reposition();

	instance.on('dropdown_open', () => {
		window.requestAnimationFrame(reposition);
	});
	window.addEventListener('scroll', onScroll, true);
	window.addEventListener('resize', onResize, { passive: true });
	window.visualViewport?.addEventListener('resize', onResize);
	window.visualViewport?.addEventListener('scroll', onResize);

	bodyDropdownCleanups.set(instance, () => {
		window.removeEventListener('scroll', onScroll, true);
		window.removeEventListener('resize', onResize);
		window.visualViewport?.removeEventListener('resize', onResize);
		window.visualViewport?.removeEventListener('scroll', onResize);
	});
};

type SearchableSelectOptions = {
	placeholder?: string;
	maxOptions?: number;
	closeAfterSelect?: boolean;
	dropdownParent?: 'body' | HTMLElement;
};

export const getSearchableSelect = (select: HTMLSelectElement | null | undefined) =>
	select ? instances.get(select) ?? null : null;

export const ensureSearchableSelect = (
	select: HTMLSelectElement | null | undefined,
	options: SearchableSelectOptions = {}
) => {
	if (!select) return null;

	const current = instances.get(select);
	if (current) return current;

	select.className = 'bookmate-searchable-select';

	const instance = new TomSelect(select, {
		allowEmptyOption: true,
		create: false,
		persist: false,
		plugins: ['dropdown_input'],
		maxOptions: options.maxOptions ?? 500,
		closeAfterSelect: options.closeAfterSelect ?? true,
		placeholder: options.placeholder,
		controlInput: '<input type="text" autocomplete="off" />',
		dropdownParent: options.dropdownParent ?? null,
		dropdownClass: 'ts-dropdown bookmate-searchable-select-dropdown',
	});

	instance.on('dropdown_open', () => {
		const controlInput = instance.control_input;
		if (!(controlInput instanceof HTMLInputElement)) return;
		if (instance.isDisabled) return;

		// En mobile algunos navegadores no enfocan automaticamente el input del dropdown.
		window.requestAnimationFrame(() => {
			controlInput.focus({ preventScroll: true });
		});
	});

	bindFixedDropdownPosition(instance);

	instances.set(select, instance);
	if (select.disabled) instance.disable();
	return instance;
};

export type SearchableSelectOption = {
	value: string;
	label: string;
};

export const rebuildSearchableSelect = (
	select: HTMLSelectElement | null | undefined,
	options: SearchableSelectOption[],
	widgetOptions: SearchableSelectOptions = {},
	selectedValue = '',
) => {
	if (!select) return null;

	destroySearchableSelect(select);

	select.innerHTML = '';
	for (const option of options) {
		const element = document.createElement('option');
		element.value = option.value;
		element.textContent = option.label;
		select.appendChild(element);
	}

	const nextValue =
		selectedValue !== '' && options.some((option) => option.value === selectedValue)
			? selectedValue
			: '';
	select.value = nextValue;

	const instance = ensureSearchableSelect(select, widgetOptions);
	if (!instance) return null;

	instance.setValue(nextValue, true);
	if (select.disabled) instance.disable();
	else instance.enable();

	return instance;
};

export const setSearchableSelectOptions = (
	select: HTMLSelectElement | null | undefined,
	options: SearchableSelectOption[],
	widgetOptions: SearchableSelectOptions = {},
	selectedValue = '',
) => rebuildSearchableSelect(select, options, widgetOptions, selectedValue);

export const syncSearchableSelect = (select: HTMLSelectElement | null | undefined) => {
	if (!select) return;
	const instance = instances.get(select);
	if (!instance) return;

	const value = select.value;
	instance.sync();
	instance.refreshOptions(false);
	instance.setValue(value, true);
	if (select.disabled) instance.disable();
	else instance.enable();
};

export const setSearchableSelectValue = (
	select: HTMLSelectElement | null | undefined,
	value: string | number | null | undefined,
	silent = true
) => {
	if (!select) return;
	const nextValue = value === null || value === undefined ? '' : String(value);
	select.value = nextValue;
	const instance = instances.get(select);
	if (instance) instance.setValue(nextValue, silent);
};

export const setSearchableSelectDisabled = (
	select: HTMLSelectElement | null | undefined,
	disabled: boolean
) => {
	if (!select) return;
	select.disabled = disabled;
	const instance = instances.get(select);
	if (!instance) return;
	if (disabled) instance.disable();
	else instance.enable();
};

export const destroySearchableSelect = (select: HTMLSelectElement | null | undefined) => {
	if (!select) return;
	const instance = instances.get(select);
	if (!instance) return;
	bodyDropdownCleanups.get(instance)?.();
	bodyDropdownCleanups.delete(instance);
	instance.destroy();
	instances.delete(select);
	select.className = select.className
		.replace(/\bbookmate-searchable-select\b/g, '')
		.replace(/\bts-hidden-accessible\b/g, '')
		.trim();
};
