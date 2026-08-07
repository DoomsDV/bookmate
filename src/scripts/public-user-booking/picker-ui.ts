/** Helpers compartidos para stack/carrusel de sucursales y servicios en u/[slug]. */

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

export const triggerPickerHaptic = () => {
	try {
		if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
			navigator.vibrate(12);
		}
	} catch {
		/* ignore */
	}
};

export const createContinueButton = (
	onClick: () => void,
	options: { signal: AbortSignal; disabled?: boolean; className?: string }
) => {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = options.className || 'public-booking-continue';
	button.textContent = 'Continuar';
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
