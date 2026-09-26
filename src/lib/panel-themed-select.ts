const ROOT_SELECTOR = '.panel-themed-select, .schedule-themed-select';
const OPEN_ROOT_SELECTOR = '.panel-themed-select.is-open, .schedule-themed-select.is-open';
const MOBILE_SELECT_QUERY = '(max-width: 767px)';
let responsiveListenerBound = false;

function syncNativeSelectAccessibility(select: HTMLSelectElement): void {
	const mobile = window.matchMedia(MOBILE_SELECT_QUERY).matches;
	select.tabIndex = mobile ? 0 : -1;
	if (mobile) select.removeAttribute('aria-hidden');
	else select.setAttribute('aria-hidden', 'true');
}

function bindResponsiveListener(): void {
	if (responsiveListenerBound) return;
	responsiveListenerBound = true;
	window.matchMedia(MOBILE_SELECT_QUERY).addEventListener('change', () => {
		closePanelThemedSelects();
		syncPanelThemedSelectTriggers();
	});
}

export type PanelThemedSelectOptions = {
	triggerClass?: string;
	placeholder?: string;
	hideEmptyOption?: boolean;
};

const defaultOptions: Required<PanelThemedSelectOptions> = {
	triggerClass: 'panel-themed-select__trigger panel-modal-select__trigger',
	placeholder: 'Seleccionar',
	hideEmptyOption: true,
};

function clearNode(node: Element): void {
	while (node.firstChild) {
		node.removeChild(node.firstChild);
	}
}

function resolveOptions(options?: PanelThemedSelectOptions): Required<PanelThemedSelectOptions> {
	return { ...defaultOptions, ...options };
}

function getRootFromSelect(select: HTMLSelectElement): HTMLElement | null {
	return select.closest<HTMLElement>(ROOT_SELECTOR);
}

function positionPanelThemedSelectMenu(root: HTMLElement, menu: HTMLElement, trigger: HTMLElement): void {
	const viewportTop = window.visualViewport?.offsetTop ?? 0;
	const viewportBottom = viewportTop + (window.visualViewport?.height ?? window.innerHeight);
	let top = viewportTop;
	let bottom = viewportBottom;
	for (let parent = root.parentElement; parent; parent = parent.parentElement) {
		if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) continue;
		const bounds = parent.getBoundingClientRect();
		top = Math.max(top, bounds.top);
		bottom = Math.min(bottom, bounds.bottom);
		break;
	}

	const triggerBounds = trigger.getBoundingClientRect();
	const spaceAbove = Math.max(0, triggerBounds.top - top);
	const spaceBelow = Math.max(0, bottom - triggerBounds.bottom);
	menu.style.maxHeight = '';
	const menuHeight = Math.min(menu.scrollHeight, 256, (viewportBottom - viewportTop) * 0.48);
	const openUpward = spaceBelow < menuHeight + 6 && spaceAbove > spaceBelow;
	root.classList.toggle('is-open-upward', openUpward);
	const available = openUpward ? spaceAbove : spaceBelow;
	menu.style.maxHeight = `${Math.max(0, Math.min(256, available - 6))}px`;
}

export function mountPanelThemedSelect(
	select: HTMLSelectElement,
	options?: PanelThemedSelectOptions
): HTMLElement {
	bindResponsiveListener();
	const config = resolveOptions(options);
	const existing = getRootFromSelect(select);
	if (existing) {
		syncPanelThemedSelect(existing, options);
		return existing;
	}

	select.classList.add('sr-only');
	select.tabIndex = -1;
	select.setAttribute('aria-hidden', 'true');

	const root = document.createElement('div');
	root.className = 'panel-themed-select schedule-themed-select';

	const trigger = document.createElement('button');
	trigger.type = 'button';
	trigger.className = config.triggerClass;
	trigger.dataset.panelThemedSelectTrigger = 'true';
	trigger.setAttribute('aria-haspopup', 'listbox');
	trigger.setAttribute('aria-expanded', 'false');

	const value = document.createElement('span');
	value.className = 'panel-themed-select__value schedule-themed-select__value';
	value.dataset.panelThemedSelectValue = 'true';

	const chevron = document.createElement('span');
	chevron.className =
		'panel-themed-select__chevron schedule-themed-select__chevron material-symbols-rounded';
	chevron.setAttribute('aria-hidden', 'true');
	chevron.textContent = 'expand_more';

	trigger.append(value, chevron);

	const menu = document.createElement('div');
	menu.className = 'panel-themed-select__menu schedule-themed-select__menu';
	menu.hidden = true;
	menu.setAttribute('role', 'listbox');
	menu.dataset.panelThemedSelectMenu = 'true';

	const parent = select.parentElement;
	root.append(select, trigger, menu);
	root.addEventListener('change', () => syncPanelThemedSelect(root, options));
	syncPanelThemedSelect(root, options);
	if (parent && !parent.contains(root)) {
		parent.appendChild(root);
	}
	return root;
}

export function syncPanelThemedSelect(
	root: HTMLElement,
	options?: PanelThemedSelectOptions
): void {
	const config = resolveOptions(options);
	const select = root.querySelector('select');
	const valueNode = root.querySelector('[data-panel-themed-select-value]');
	const menu = root.querySelector('[data-panel-themed-select-menu]');
	const trigger = root.querySelector<HTMLButtonElement>('[data-panel-themed-select-trigger]');
	if (!select || !valueNode || !menu) return;
	syncNativeSelectAccessibility(select);

	const selected = select.selectedOptions[0];
	const selectedLabel = selected?.textContent?.trim() || '';
	valueNode.textContent = selected ? selectedLabel || config.placeholder : config.placeholder;
	if (trigger) trigger.disabled = select.disabled;

	clearNode(menu);
	for (const option of Array.from(select.options)) {
		if (config.hideEmptyOption && option.value === '') continue;

		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'panel-themed-select__option schedule-themed-select__option';
		button.dataset.panelThemedSelectOption = option.value;
		button.setAttribute('role', 'option');
		button.setAttribute('aria-selected', option.selected ? 'true' : 'false');
		button.classList.toggle('is-selected', option.selected);
		button.textContent = option.textContent;
		menu.appendChild(button);
	}
	if (root.classList.contains('is-open') && !menu.hasAttribute('hidden') && trigger) {
		positionPanelThemedSelectMenu(root, menu as HTMLElement, trigger);
	}
}

function setPanelThemedSelectOpen(root: HTMLElement, open: boolean, options?: PanelThemedSelectOptions): void {
	const menu = root.querySelector<HTMLElement>('[data-panel-themed-select-menu]');
	const trigger = root.querySelector<HTMLButtonElement>('[data-panel-themed-select-trigger]');
	if (!menu || !trigger) return;
	menu.hidden = !open;
	trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
	root.classList.toggle('is-open', open);
	if (open) {
		syncPanelThemedSelect(root, options);
	} else {
		root.classList.remove('is-open-upward');
		menu.style.maxHeight = '';
	}
}

export function closePanelThemedSelects(scope: ParentNode = document, except?: HTMLElement | null): void {
	for (const root of scope.querySelectorAll<HTMLElement>(OPEN_ROOT_SELECTOR)) {
		if (except && root === except) continue;
		setPanelThemedSelectOpen(root, false);
	}
}

export function syncPanelThemedSelectTriggers(scope: ParentNode = document): void {
	for (const root of scope.querySelectorAll<HTMLElement>(ROOT_SELECTOR)) {
		const select = root.querySelector('select');
		const trigger = root.querySelector<HTMLButtonElement>('[data-panel-themed-select-trigger]');
		if (select && trigger) {
			trigger.disabled = select.disabled;
			syncNativeSelectAccessibility(select);
		}
	}
}

export function handlePanelThemedSelectClick(event: MouseEvent, options?: PanelThemedSelectOptions): void {
	const target = event.target;
	if (!(target instanceof Element)) return;

	const option = target.closest<HTMLButtonElement>('[data-panel-themed-select-option]');
	if (option) {
		const root = option.closest<HTMLElement>(ROOT_SELECTOR);
		const select = root?.querySelector('select');
		if (!root || !select || select.disabled) return;
		event.preventDefault();
		select.value = option.dataset.panelThemedSelectOption || '';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		syncPanelThemedSelect(root, options);
		closePanelThemedSelects(document, root);
		setPanelThemedSelectOpen(root, false, options);
		return;
	}

	const trigger = target.closest<HTMLButtonElement>('[data-panel-themed-select-trigger]');
	if (!trigger || trigger.disabled) return;
	const root = trigger.closest<HTMLElement>(ROOT_SELECTOR);
	if (!root) return;
	event.preventDefault();
	const willOpen = !root.classList.contains('is-open');
	closePanelThemedSelects(document, willOpen ? root : null);
	if (willOpen) setPanelThemedSelectOpen(root, true, options);
}

export function bindPanelThemedSelectRoot(scope: ParentNode, signal: AbortSignal): void {
	const onClick = (event: MouseEvent) => handlePanelThemedSelectClick(event);
	scope.addEventListener('click', onClick, { signal });
	const repositionOpenMenus = () => {
		for (const root of scope.querySelectorAll<HTMLElement>(OPEN_ROOT_SELECTOR)) {
			const menu = root.querySelector<HTMLElement>('[data-panel-themed-select-menu]');
			const trigger = root.querySelector<HTMLElement>('[data-panel-themed-select-trigger]');
			if (menu && trigger) positionPanelThemedSelectMenu(root, menu, trigger);
		}
	};
	scope.addEventListener('scroll', repositionOpenMenus, { capture: true, signal });
	window.addEventListener('resize', repositionOpenMenus, { signal });

	const onPointerDown = (event: PointerEvent) => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		if (!target.closest(ROOT_SELECTOR)) {
			closePanelThemedSelects(scope);
		}
	};

	document.addEventListener('pointerdown', onPointerDown, { signal });
}

export function destroyPanelThemedSelect(select: HTMLSelectElement): void {
	const root = getRootFromSelect(select);
	if (!root?.parentElement) return;

	closePanelThemedSelects(document, root);
	select.classList.remove('sr-only');
	select.removeAttribute('aria-hidden');
	select.tabIndex = 0;
	root.parentElement.insertBefore(select, root);
	root.remove();
}

export function ensurePanelThemedSelect(
	select: HTMLSelectElement | null | undefined,
	options?: PanelThemedSelectOptions
): HTMLElement | null {
	if (!select) return null;
	return mountPanelThemedSelect(select, options);
}
