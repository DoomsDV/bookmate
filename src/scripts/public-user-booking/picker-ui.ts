/** Helpers compartidos para stack/carrusel de sucursales y servicios en u/[slug]. */

import {
	buildStadiaMapPreviewUrl,
	LOCATION_CARD_STATIC_MAP_OPTIONS,
	renderBrandMapMarkerOverlay,
	resolveMapTheme,
	type MapTheme,
} from '../../lib/maplibre-static';

export type PublicLocationCardInput = {
	id_location?: number;
	name?: string;
	address?: string;
	latitude?: number;
	longitude?: number;
};

export const escapeHtml = (value: string) =>
	String(value || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

export const isMobileStack = () =>
	typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;

export const getCarouselPageSize = () =>
	typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches ? 4 : 2;

export const PICKER_GRID_PAGE_SIZE = 4;
export const SERVICE_GRID_PAGE_SIZE = PICKER_GRID_PAGE_SIZE;
export const ORG_GRID_PAGE_SIZE = PICKER_GRID_PAGE_SIZE;

const getPickerGridInitialPageIndex = (
	itemCount: number,
	selectedIndex: number,
	savedPageIndex: number,
	pageSize: number
) => {
	const pageCount = Math.max(1, Math.ceil(itemCount / pageSize));
	if (selectedIndex >= 0) {
		return Math.min(Math.floor(selectedIndex / pageSize), pageCount - 1);
	}
	return Math.min(Math.max(0, savedPageIndex), pageCount - 1);
};

export const getServiceGridInitialPageIndex = (
	services: ReadonlyArray<{ id_service: number }>,
	selectedServiceId: number | null,
	savedPageIndex: number
) => {
	const selectedIndex = selectedServiceId
		? services.findIndex((service) => service.id_service === selectedServiceId)
		: -1;
	return getPickerGridInitialPageIndex(
		services.length,
		selectedIndex,
		savedPageIndex,
		SERVICE_GRID_PAGE_SIZE
	);
};

export const getOrgGridInitialPageIndex = (
	groups: ReadonlyArray<{ org_id_organization: number }>,
	selectedOrgId: number | null,
	savedPageIndex: number
) => {
	const selectedIndex = selectedOrgId
		? groups.findIndex((group) => group.org_id_organization === selectedOrgId)
		: -1;
	return getPickerGridInitialPageIndex(
		groups.length,
		selectedIndex,
		savedPageIndex,
		ORG_GRID_PAGE_SIZE
	);
};

export const mountPaginatedGrid = <T>(options: {
	items: T[];
	pageSize: number;
	initialPageIndex: number;
	signal: AbortSignal;
	renderCard: (item: T) => HTMLElement;
	onPageIndexChange: (pageIndex: number) => void;
}) => {
	const pageCount = Math.max(1, Math.ceil(options.items.length / options.pageSize));
	let pageIndex = Math.min(Math.max(0, options.initialPageIndex), pageCount - 1);

	const pageShell = document.createElement('div');
	pageShell.className = 'public-services-grid__page';

	const pagination = document.createElement('div');
	pagination.className = 'public-services-grid__pagination';
	pagination.hidden = pageCount <= 1;

	const prevButton = document.createElement('button');
	prevButton.type = 'button';
	prevButton.className = 'public-services-grid__pagination-btn public-services-grid__pagination-btn--prev';
	prevButton.setAttribute('aria-label', 'Página anterior');
	prevButton.innerHTML =
		'<span class="material-symbols-rounded" aria-hidden="true">chevron_left</span>';

	const pageLabel = document.createElement('span');
	pageLabel.className = 'public-services-grid__pagination-label';
	pageLabel.setAttribute('aria-live', 'polite');

	const nextButton = document.createElement('button');
	nextButton.type = 'button';
	nextButton.className = 'public-services-grid__pagination-btn public-services-grid__pagination-btn--next';
	nextButton.setAttribute('aria-label', 'Página siguiente');
	nextButton.innerHTML =
		'<span class="material-symbols-rounded" aria-hidden="true">chevron_right</span>';

	const renderPage = () => {
		pageShell.replaceChildren();
		const start = pageIndex * options.pageSize;
		for (const item of options.items.slice(start, start + options.pageSize)) {
			pageShell.appendChild(options.renderCard(item));
		}
		pageLabel.textContent = `${pageIndex + 1} de ${pageCount}`;
		prevButton.disabled = pageIndex <= 0;
		nextButton.disabled = pageIndex >= pageCount - 1;
		options.onPageIndexChange(pageIndex);
	};

	const goToPage = (nextIndex: number) => {
		const clamped = Math.min(Math.max(0, nextIndex), pageCount - 1);
		if (clamped === pageIndex) return;
		pageIndex = clamped;
		renderPage();
	};

	prevButton.addEventListener('click', () => goToPage(pageIndex - 1), { signal: options.signal });
	nextButton.addEventListener('click', () => goToPage(pageIndex + 1), { signal: options.signal });

	pagination.append(prevButton, pageLabel, nextButton);
	renderPage();

	return { pageShell, pagination };
};

export const mountPaginatedServiceGrid = <T extends { id_service: number }>(options: {
	services: T[];
	initialPageIndex: number;
	signal: AbortSignal;
	renderCard: (service: T) => HTMLButtonElement;
	onPageIndexChange: (pageIndex: number) => void;
}) =>
	mountPaginatedGrid({
		items: options.services,
		pageSize: SERVICE_GRID_PAGE_SIZE,
		initialPageIndex: options.initialPageIndex,
		signal: options.signal,
		renderCard: options.renderCard,
		onPageIndexChange: options.onPageIndexChange,
	});

export const mountPaginatedOrgGrid = <T extends { org_id_organization: number }>(options: {
	groups: T[];
	initialPageIndex: number;
	signal: AbortSignal;
	renderCard: (group: T) => HTMLButtonElement;
	onPageIndexChange: (pageIndex: number) => void;
}) =>
	mountPaginatedGrid({
		items: options.groups,
		pageSize: ORG_GRID_PAGE_SIZE,
		initialPageIndex: options.initialPageIndex,
		signal: options.signal,
		renderCard: options.renderCard,
		onPageIndexChange: options.onPageIndexChange,
	});

let pickerUserGestureSeen = false;

/** Reinicia el gate de vibración (nueva instancia de página). */
export const resetPickerUserGesture = () => {
	pickerUserGestureSeen = false;
};

/**
 * Marca interacción real del usuario. Chrome bloquea vibrate sin gesto previo
 * (Intervention en consola aunque el try/catch no lance).
 */
export const markPickerUserGesture = () => {
	pickerUserGestureSeen = true;
};

/** Escucha pointer/touch/teclado en fase capture para marcar gesto antes de handlers hijos. */
export const bindPickerUserGesture = (root: ParentNode, signal?: AbortSignal) => {
	resetPickerUserGesture();
	const mark = () => markPickerUserGesture();
	const opts: AddEventListenerOptions = { capture: true, passive: true, signal };
	root.addEventListener('pointerdown', mark, opts);
	root.addEventListener('touchstart', mark, opts);
	root.addEventListener('keydown', mark, opts);
};

export const triggerPickerHaptic = () => {
	if (!pickerUserGestureSeen) return;
	try {
		if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
			navigator.vibrate(12);
		}
	} catch {
		/* ignore unsupported / blocked */
	}
};

export const CONTINUE_BUTTON_INNER_HTML =
	'<span class="public-booking-continue__label">Continuar</span><span class="material-symbols-rounded public-booking-continue__icon" aria-hidden="true">chevron_right</span>';

export const SUBMIT_BOOKING_BUTTON_INNER_HTML =
	'<span class="material-symbols-rounded booking-primary-action__icon" aria-hidden="true">event_available</span><span class="booking-primary-action__label">Confirmar reserva</span>';

export const setContinueButtonContent = (button: HTMLButtonElement) => {
	button.innerHTML = CONTINUE_BUTTON_INNER_HTML;
};

export const setSubmitBookingButtonContent = (
	button: HTMLButtonElement,
	options: { loading?: boolean } = {}
) => {
	button.innerHTML = options.loading ? 'Confirmando...' : SUBMIT_BOOKING_BUTTON_INNER_HTML;
};

export const createContinueButton = (
	onClick: () => void,
	options: { signal: AbortSignal; disabled?: boolean; className?: string }
) => {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = options.className || 'public-booking-continue';
	setContinueButtonContent(button);
	button.disabled = Boolean(options.disabled);
	button.addEventListener('click', onClick, { signal: options.signal });
	return button;
};

export const getCoords = (location: {
	latitude?: number;
	longitude?: number;
}): { lat: number; lng: number } | null => {
	const lat = Number(location.latitude);
	const lng = Number(location.longitude);
	return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

export const buildPublicLocationMapPreviewUrl = (
	location: PublicLocationCardInput,
	stadiaKey: string,
	theme?: MapTheme
) => {
	const key = String(stadiaKey || '').trim();
	if (!key) return null;
	return buildStadiaMapPreviewUrl(key, getCoords(location), {
		theme: theme ?? resolveMapTheme(),
		...LOCATION_CARD_STATIC_MAP_OPTIONS,
	});
};

const buildPublicLocationBrandPreviewHtml = (name: string) => {
	const nameEsc = escapeHtml(name);
	return `<button type="button" class="public-location-card__preview public-location-card__preview--brand" data-location-map-trigger aria-label="Ver mapa de ${nameEsc}"><span class="public-location-card__preview-icon material-symbols-rounded" aria-hidden="true">location_on</span><span class="public-location-card__preview-label">Ver ubicación</span></button>`;
};

export const buildPublicLocationCardContent = (
	location: PublicLocationCardInput,
	options: {
		showMap?: boolean;
		canShowMap?: boolean;
		stadiaKey?: string;
		mapTheme?: MapTheme;
	} = {}
) => {
	const name = String(location.name || 'Sucursal').trim() || 'Sucursal';
	const address = String(location.address || '').trim();
	const canShowMap = options.canShowMap !== false && toPositiveInt(location.id_location, 0) > 0;
	const showMap = options.showMap !== false && canShowMap;

	let preview = '';
	if (showMap) {
		const mapPreview = buildPublicLocationMapPreviewUrl(
			location,
			options.stadiaKey || '',
			options.mapTheme
		);
		if (mapPreview) {
			const nameEsc = escapeHtml(name);
			const { width, height } = LOCATION_CARD_STATIC_MAP_OPTIONS;
			const objectPosition = escapeHtml(mapPreview.objectPosition);
			preview = `<button type="button" class="public-location-card__preview is-map-loading" data-location-map-trigger aria-label="Ver mapa de ${nameEsc}"><span class="public-location-card__map-skeleton" aria-hidden="true"></span><img class="public-location-card__map-img" data-location-map-img src="${escapeHtml(mapPreview.url)}" alt="" loading="lazy" decoding="async" width="${width}" height="${height}" style="object-position: ${objectPosition}" />${renderBrandMapMarkerOverlay()}<span class="public-location-card__preview-dim" aria-hidden="true"></span><span class="public-location-card__preview-hint"><span class="public-location-card__preview-label">Ver ubicación</span></span></button>`;
		} else {
			preview = buildPublicLocationBrandPreviewHtml(name);
		}
	}

	return `
		${preview}
		<button type="button" class="public-location-card__main">
			<span class="public-location-card__body">
				<span class="public-location-card__name">${escapeHtml(name)}</span>
				${
					address
						? `<span class="public-location-card__address"><span class="material-symbols-rounded" aria-hidden="true">location_on</span><span class="public-location-card__address-text">${escapeHtml(address)}</span></span>`
						: ''
				}
			</span>
		</button>
		<span class="material-symbols-rounded public-location-card__check" aria-hidden="true">check_circle</span>
	`;
};

const toPositiveInt = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const bindMapImageLifecycle = (
	card: HTMLElement,
	options: {
		signal: AbortSignal;
		onOpenMap: () => void;
	}
) => {
	const mapTrigger = card.querySelector<HTMLButtonElement>('[data-location-map-trigger]');
	mapTrigger?.addEventListener(
		'click',
		(event) => {
			event.preventDefault();
			event.stopPropagation();
			options.onOpenMap();
		},
		{ signal: options.signal }
	);

	const mapImg = card.querySelector<HTMLImageElement>('[data-location-map-img]');
	if (!mapTrigger || !mapImg) return;

	const revealMap = () => {
		mapTrigger.classList.remove('is-map-loading');
	};

	mapImg.addEventListener('load', revealMap, { once: true, signal: options.signal });
	mapImg.addEventListener(
		'error',
		() => {
			mapImg.remove();
			mapTrigger.classList.remove('is-map-loading');
			mapTrigger.classList.add('public-location-card__preview--brand');
			mapTrigger.innerHTML =
				'<span class="public-location-card__preview-icon material-symbols-rounded" aria-hidden="true">location_on</span><span class="public-location-card__preview-label">Ver ubicación</span>';
		},
		{ once: true, signal: options.signal }
	);

	if (mapImg.complete && mapImg.naturalWidth > 0) {
		revealMap();
	}
};

export const syncStackLayers = (
	stack: HTMLElement,
	focusedIndex: number,
	indexAttr: string,
	options?: { farLevels?: boolean }
) => {
	const cards = Array.from(stack.querySelectorAll<HTMLElement>(`[${indexAttr}]`));
	stack.classList.toggle('has-prev', focusedIndex > 0);
	for (const card of cards) {
		const index = Number(card.getAttribute(indexAttr) ?? -1);
		const distance = index - focusedIndex;
		card.classList.remove(
			'is-focus',
			'is-near',
			'is-near-up',
			'is-near-down',
			'is-far-up',
			'is-far-down',
			'is-far'
		);
		card.setAttribute('aria-selected', distance === 0 ? 'true' : 'false');
		card.tabIndex = distance === 0 ? 0 : -1;
		if (distance === 0) {
			card.classList.add('is-focus');
		} else if (distance === -1) {
			card.classList.add('is-near', 'is-near-up');
		} else if (distance === 1) {
			card.classList.add('is-near', 'is-near-down');
		} else if (options?.farLevels && distance === -2) {
			card.classList.add('is-far-up');
		} else if (options?.farLevels && distance === 2) {
			card.classList.add('is-far-down');
		} else {
			card.classList.add('is-far');
		}
	}
};

export const bindVerticalStackGestures = (
	stack: HTMLElement,
	options: {
		signal: AbortSignal;
		itemCount: number;
		getFocusIndex: () => number;
		setFocusIndex: (index: number) => void;
		onFocusChanged: () => void;
		onContinue: () => void;
	}
) => {
	let touchStartY: number | null = null;
	let touchTarget: EventTarget | null = null;
	let touchMoved = false;
	let wheelLockedUntil = 0;
	let suppressClickUntil = 0;

	const findStackIndex = (from: EventTarget | null): number | null => {
		if (!(from instanceof Element)) return null;
		const card = from.closest<HTMLElement>(
			'[data-location-stack-index], [data-service-stack-index], [data-org-stack-index]'
		);
		if (!card || !stack.contains(card)) return null;
		const raw =
			card.getAttribute('data-location-stack-index') ??
			card.getAttribute('data-service-stack-index') ??
			card.getAttribute('data-org-stack-index');
		if (raw == null) return null;
		const index = Number(raw);
		return Number.isFinite(index) ? index : null;
	};

	const moveFocus = (delta: number) => {
		const next = Math.min(
			Math.max(0, options.getFocusIndex() + delta),
			options.itemCount - 1
		);
		if (next === options.getFocusIndex()) return;
		options.setFocusIndex(next);
		options.onFocusChanged();
		triggerPickerHaptic();
	};

	const focusIndex = (index: number) => {
		if (index === options.getFocusIndex()) return false;
		if (index < 0 || index >= options.itemCount) return false;
		options.setFocusIndex(index);
		options.onFocusChanged();
		triggerPickerHaptic();
		return true;
	};

	stack.addEventListener(
		'touchstart',
		(event) => {
			if (event.touches.length !== 1) return;
			touchStartY = event.touches[0]?.clientY ?? null;
			touchTarget = event.target;
			touchMoved = false;
		},
		{ signal: options.signal, passive: true }
	);

	stack.addEventListener(
		'touchmove',
		(event) => {
			if (touchStartY == null || event.touches.length !== 1) return;
			const currentY = event.touches[0]?.clientY ?? touchStartY;
			if (Math.abs(currentY - touchStartY) <= 8) return;
			touchMoved = true;
			event.preventDefault();
		},
		{ signal: options.signal, passive: false }
	);

	stack.addEventListener(
		'touchend',
		(event) => {
			if (touchStartY == null) return;
			const endY = event.changedTouches[0]?.clientY ?? touchStartY;
			const deltaY = endY - touchStartY;
			const startTarget = touchTarget;
			touchStartY = null;
			touchTarget = null;

			// Tap (poco movimiento): enfocar la card tocada. En iOS el click sintético
			// a veces falla sobre elementos con transform.
			if (!touchMoved || Math.abs(deltaY) < 40) {
				if (!touchMoved && Math.abs(deltaY) < 40) {
					const index = findStackIndex(startTarget);
					if (index != null && focusIndex(index)) {
						suppressClickUntil = Date.now() + 450;
					}
				}
				return;
			}

			suppressClickUntil = Date.now() + 350;
			moveFocus(deltaY < 0 ? 1 : -1);
		},
		{ signal: options.signal }
	);

	stack.addEventListener(
		'click',
		(event) => {
			if (Date.now() < suppressClickUntil) {
				event.preventDefault();
				event.stopPropagation();
			}
		},
		{ signal: options.signal, capture: true }
	);

	stack.addEventListener(
		'wheel',
		(event) => {
			const now = Date.now();
			if (now < wheelLockedUntil) {
				event.preventDefault();
				return;
			}
			if (Math.abs(event.deltaY) < 8) return;
			event.preventDefault();
			wheelLockedUntil = now + 280;
			moveFocus(event.deltaY > 0 ? 1 : -1);
		},
		{ signal: options.signal, passive: false }
	);

	stack.addEventListener(
		'keydown',
		(event) => {
			if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
				event.preventDefault();
				moveFocus(1);
			} else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
				event.preventDefault();
				moveFocus(-1);
			} else if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				options.onContinue();
			}
		},
		{ signal: options.signal }
	);

	return {
		shouldSuppressClick: () => Date.now() < suppressClickUntil,
	};
};

const MOBILE_ACTIONS_CONTINUE_SELECTORS = [
	'.public-booking-continue',
	'.public-service-stack__continue',
	'.public-location-stack__continue',
	'.public-slot-roulette__continue',
].join(',');

type ActionsRestoreSlot = {
	parent: HTMLElement;
	nextSibling: ChildNode | null;
};

const actionsRestoreSlots = new WeakMap<HTMLElement, ActionsRestoreSlot>();

const rememberActionsRestoreSlot = (node: HTMLElement) => {
	if (actionsRestoreSlots.has(node)) return;
	const parent = node.parentElement;
	if (!parent) return;
	actionsRestoreSlots.set(node, { parent, nextSibling: node.nextSibling });
};

const restoreActionsNode = (node: HTMLElement) => {
	const slot = actionsRestoreSlots.get(node);
	if (!slot) return;
	if (slot.nextSibling && slot.nextSibling.parentElement === slot.parent) {
		slot.parent.insertBefore(node, slot.nextSibling);
		return;
	}
	slot.parent.appendChild(node);
};

const restorePublicBookingMobileActions = (root: ParentNode) => {
	for (const node of root.querySelectorAll<HTMLElement>('[data-public-booking-actions-node]')) {
		restoreActionsNode(node);
		node.removeAttribute('data-public-booking-actions-node');
	}
};

const moveIntoActions = (node: HTMLElement, actions: HTMLElement) => {
	if (node.parentElement === actions) return;
	rememberActionsRestoreSlot(node);
	node.dataset.publicBookingActionsNode = '1';
	actions.appendChild(node);
};

const isDynamicStackContinue = (node: HTMLElement) =>
	node.matches(
		'.public-service-stack__continue, .public-location-stack__continue, .public-slot-roulette__continue'
	);

const detachOrRemoveMobileActionNode = (node: HTMLElement) => {
	node.removeAttribute('data-public-booking-actions-node');
	const slot = actionsRestoreSlots.get(node);
	if (slot?.parent?.isConnected) {
		// Tras re-render del stack, el grid ya tiene un Continuar nuevo; no restaurar el huérfano del footer.
		if (isDynamicStackContinue(node)) {
			const siblings = slot.parent.querySelectorAll<HTMLElement>(MOBILE_ACTIONS_CONTINUE_SELECTORS);
			if (Array.from(siblings).some((candidate) => candidate !== node)) {
				node.remove();
				actionsRestoreSlots.delete(node);
				return;
			}
		}
		restoreActionsNode(node);
		return;
	}
	node.remove();
	actionsRestoreSlots.delete(node);
};

/** Elimina Continuar duplicados fuera del footer (p. ej. stack + footer tras re-render). */
const removeDuplicateMobileContinues = (panel: HTMLElement, actions: HTMLElement) => {
	const kept = actions.querySelector<HTMLElement>(MOBILE_ACTIONS_CONTINUE_SELECTORS);
	if (!kept) return;
	for (const selector of MOBILE_ACTIONS_CONTINUE_SELECTORS.split(',')) {
		for (const node of panel.querySelectorAll<HTMLElement>(selector.trim())) {
			if (node === kept || actions.contains(node)) continue;
			node.remove();
			actionsRestoreSlots.delete(node);
		}
	}
};

/** Limpia Continuar/CTA dinámicos del footer antes de re-sync (evita duplicados tras re-render). */
const prepareMobileActionsFooter = (actions: HTMLElement) => {
	for (const child of [...actions.children]) {
		if (!(child instanceof HTMLElement)) continue;
		if (child.classList.contains('public-booking-back-row')) continue;
		// Botón fijo del markup (Fecha y Hora / legado calendario).
		if (child.hasAttribute('data-datetime-continue') || child.hasAttribute('data-calendar-continue'))
			continue;

		const isMovable =
			child.matches(MOBILE_ACTIONS_CONTINUE_SELECTORS) ||
			child.hasAttribute('data-booking-primary-actions');
		if (!isMovable) continue;

		detachOrRemoveMobileActionNode(child);
	}
};

const findMobileContinueButton = (
	panel: HTMLElement,
	actions: HTMLElement
): HTMLButtonElement | null => {
	for (const selector of MOBILE_ACTIONS_CONTINUE_SELECTORS.split(',')) {
		const trimmed = selector.trim();
		for (const node of panel.querySelectorAll<HTMLButtonElement>(trimmed)) {
			if (!actions.contains(node)) return node;
		}
	}
	return actions.querySelector<HTMLButtonElement>(MOBILE_ACTIONS_CONTINUE_SELECTORS);
};

const isFixedDatetimeContinue = (button: HTMLButtonElement) =>
	button.hasAttribute('data-datetime-continue') || button.hasAttribute('data-calendar-continue');

/**
 * Continuar del picker (servicio/sucursal/org). Tras syncPublicBookingMobileActions
 * el botón vive en .public-booking-actions, no dentro del grid.
 */
export const findPickerContinueButton = (origin: HTMLElement): HTMLButtonElement | null => {
	const panel = origin.closest<HTMLElement>('.public-booking-panel');
	const searchRoot = panel ?? origin;
	const actions = panel?.querySelector<HTMLElement>('.public-booking-actions');
	const fromActions = actions?.querySelector<HTMLButtonElement>(MOBILE_ACTIONS_CONTINUE_SELECTORS);
	const candidate =
		fromActions && !isFixedDatetimeContinue(fromActions)
			? fromActions
			: searchRoot.querySelector<HTMLButtonElement>(MOBILE_ACTIONS_CONTINUE_SELECTORS);
	if (!candidate || isFixedDatetimeContinue(candidate)) return null;
	return candidate;
};

export const setPickerContinueEnabled = (origin: HTMLElement, enabled: boolean) => {
	const button = findPickerContinueButton(origin);
	if (button) button.disabled = !enabled;
};

const findMobilePrimaryActions = (
	panel: HTMLElement,
	actions: HTMLElement
): HTMLElement | null => {
	const outside = panel.querySelector<HTMLElement>('[data-booking-primary-actions]');
	if (outside && !actions.contains(outside)) return outside;
	return actions.querySelector<HTMLElement>('[data-booking-primary-actions]');
};

/** Agrupa Volver + Continuar en la fila de acciones (móvil sticky y desktop). */
export const syncPublicBookingMobileActions = (root: ParentNode = document) => {
	for (const panel of root.querySelectorAll<HTMLElement>('.public-booking-panel')) {
		if (panel.classList.contains('sipap-deposit-panel')) continue;
		let actions = panel.querySelector<HTMLElement>('.public-booking-actions');
		if (!actions) {
			actions = document.createElement('div');
			actions.className = 'public-booking-actions';
			panel.appendChild(actions);
		} else {
			prepareMobileActionsFooter(actions);
		}

		const backRow = panel.querySelector<HTMLElement>('.public-booking-back-row');
		const continueBtn = findMobileContinueButton(panel, actions);
		const primaryActions = findMobilePrimaryActions(panel, actions);
		const backVisible = Boolean(backRow && !backRow.classList.contains('hidden'));
		const hasPrimary = Boolean(continueBtn || primaryActions);

		if (!backVisible && !hasPrimary) {
			actions.classList.add('hidden');
			continue;
		}

		if (backRow && backRow.parentElement !== actions) {
			rememberActionsRestoreSlot(backRow);
			backRow.dataset.publicBookingActionsNode = '1';
			actions.prepend(backRow);
		}

		if (continueBtn) moveIntoActions(continueBtn, actions);
		if (primaryActions) {
			moveIntoActions(primaryActions, actions);
			const form = panel.querySelector<HTMLFormElement>('[data-customer-form]');
			if (form?.id) {
				for (const btn of primaryActions.querySelectorAll<HTMLButtonElement>('button[type="submit"]')) {
					btn.setAttribute('form', form.id);
				}
			}
		}
		removeDuplicateMobileContinues(panel, actions);

		actions.classList.toggle('hidden', !backVisible && !hasPrimary);
	}
};
