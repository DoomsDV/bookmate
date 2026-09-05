import { appendLocationSlotHeader } from './public-booking-locations';
import { setContinueButtonContent, triggerPickerHaptic } from '../scripts/public-user-booking/picker-ui';

export type PublicSlotBranchLocation = {
	id_location: number;
	name?: string;
	address?: string;
	latitude?: number;
	longitude?: number;
};

export type PublicSlotBranchGroup = {
	location: PublicSlotBranchLocation;
	slots: string[];
};

const escapeHtml = (value: string) =>
	String(value || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

export type SlotDayPeriod = 'morning' | 'afternoon';

export const SLOT_DAY_PERIODS: ReadonlyArray<{ key: SlotDayPeriod; label: string }> = [
	{ key: 'morning', label: 'Mañana' },
	{ key: 'afternoon', label: 'Tarde' },
];

/** Mañana hasta las 11:59; tarde desde mediodía (incluye noche). */
export const getSlotDayPeriod = (slot: string): SlotDayPeriod => {
	const match = String(slot || '')
		.trim()
		.match(/^(\d{1,2}):/);
	const hour = Number(match?.[1]);
	return Number.isFinite(hour) && hour < 12 ? 'morning' : 'afternoon';
};

export const forEachSlotPeriod = (
	slots: string[],
	callback: (period: { key: SlotDayPeriod; label: string; slots: string[] }) => void
) => {
	for (const period of SLOT_DAY_PERIODS) {
		const periodSlots = slots.filter((slot) => getSlotDayPeriod(slot) === period.key);
		if (periodSlots.length === 0) continue;
		callback({ key: period.key, label: period.label, slots: periodSlots });
	}
};

/** Etiqueta visible HH:mm (24h). Mañana/Tarde ya cubren el periodo. */
export const formatSlotLabel24h = (slot: string) => {
	const match = String(slot || '')
		.trim()
		.match(/^(\d{1,2}):(\d{2})$/);
	if (!match) return String(slot || '');
	const hour = Number(match[1]);
	if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
		return String(slot || '');
	}
	return `${String(hour).padStart(2, '0')}:${match[2]}`;
};

/** Etiqueta visible HH:mm + A.M./P.M. (el valor interno del slot sigue en 24h). */
export const formatSlotLabelAmPm = (slot: string) => {
	const time = formatSlotLabel24h(slot);
	const match = String(slot || '')
		.trim()
		.match(/^(\d{1,2}):(\d{2})$/);
	if (!match) return { time, meridiem: '' };
	const hour = Number(match[1]);
	if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
		return { time, meridiem: '' };
	}
	return {
		time,
		meridiem: hour < 12 ? 'A.M.' : 'P.M.',
	};
};

const SLOT_PILL_OVERFLOW_PX = 6;

const syncSlotPillScrollerFades = (frame: HTMLElement, scroller: HTMLElement) => {
	const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
	const atStart = scroller.scrollLeft <= SLOT_PILL_OVERFLOW_PX;
	const atEnd = maxScroll - scroller.scrollLeft <= SLOT_PILL_OVERFLOW_PX;
	frame.classList.toggle('has-overflow', maxScroll > SLOT_PILL_OVERFLOW_PX);
	frame.classList.toggle('has-overflow-start', !atStart);
	frame.classList.toggle('has-overflow-end', maxScroll > SLOT_PILL_OVERFLOW_PX && !atEnd);
};

/** Peek a la derecha + degradados; el primer horario queda entero al cargar. */
export const wrapSlotPillGrid = (
	grid: HTMLElement,
	options?: { signal?: AbortSignal }
): HTMLElement => {
	const frame = document.createElement('div');
	frame.className = 'public-slot-pill-scroller';
	frame.appendChild(grid);

	const update = () => {
		if (!grid.isConnected) return;
		syncSlotPillScrollerFades(frame, grid);
	};
	const snapToStart = () => {
		grid.scrollLeft = 0;
		update();
	};

	grid.addEventListener('scroll', update, { signal: options?.signal, passive: true });

	if (typeof ResizeObserver !== 'undefined') {
		const resizeObserver = new ResizeObserver(() => {
			if (!grid.isConnected) {
				resizeObserver.disconnect();
				return;
			}
			update();
		});
		resizeObserver.observe(grid);
		options?.signal?.addEventListener('abort', () => resizeObserver.disconnect(), { once: true });
	}

	requestAnimationFrame(() => {
		snapToStart();
		requestAnimationFrame(snapToStart);
	});
	if (typeof document !== 'undefined' && document.fonts?.ready) {
		void document.fonts.ready.then(() => {
			if (grid.isConnected) snapToStart();
		});
	}
	return frame;
};

export const isMobileSlotRouletteViewport = () =>
	typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;

const syncSlotRouletteLayers = (
	roulette: HTMLElement,
	focusedIndex: number,
	options?: { wrap?: boolean }
) => {
	const buttons = Array.from(roulette.querySelectorAll<HTMLElement>('[data-slot-roulette-index]'));
	const total = buttons.length;
	const wrap = Boolean(options?.wrap) && total >= 3;

	for (const button of buttons) {
		const index = Number(button.dataset.slotRouletteIndex ?? -1);
		button.classList.remove(
			'is-focus',
			'is-near',
			'is-near-up',
			'is-near-down',
			'is-far-up',
			'is-far-down',
			'is-near-left',
			'is-near-right',
			'is-far'
		);

		let distance: number;
		if (wrap) {
			const raw = (((index - focusedIndex) % total) + total) % total;
			distance = raw > total / 2 ? raw - total : raw;
		} else {
			distance = index - focusedIndex;
		}

		const role =
			distance === 0
				? 'focus'
				: distance === -1
					? 'near-up'
					: distance === 1
						? 'near-down'
						: distance === -2
							? 'far-up'
							: distance === 2
								? 'far-down'
								: 'far';

		button.setAttribute('aria-selected', role === 'focus' ? 'true' : 'false');
		button.tabIndex = role === 'focus' ? 0 : -1;
		if (role === 'focus') {
			button.classList.add('is-focus');
		} else if (role === 'near-up') {
			button.classList.add('is-near', 'is-near-up');
		} else if (role === 'near-down') {
			button.classList.add('is-near', 'is-near-down');
		} else if (role === 'far-up') {
			button.classList.add('is-far-up');
		} else if (role === 'far-down') {
			button.classList.add('is-far-down');
		} else {
			button.classList.add('is-far');
		}
	}
};

export type MountPublicSlotBranchesOptions = {
	container: HTMLElement;
	groups: PublicSlotBranchGroup[];
	selectedSlotKey: string;
	useRoulette?: boolean;
	onSelect: (locationId: number, slot: string, location: PublicSlotBranchLocation) => void;
	onAddressClick?: (location: PublicSlotBranchLocation) => void;
	/** Si true, el roulette incluye botón Continuar que dispara onSelect del foco. */
	showRouletteContinue?: boolean;
	/** Header nombre/dirección de sucursal encima de los slots (default true). */
	showLocationHeader?: boolean;
	/**
	 * Grilla compacta 3 columnas (píldoras bajo el calendario).
	 * Default true cuando no hay roulette.
	 */
	compactPillGrid?: boolean;
};

/**
 * Monta sucursales + slots con el look de la reserva pública (grid o roulette móvil).
 */
export const mountPublicSlotBranches = (options: MountPublicSlotBranchesOptions) => {
	const {
		container,
		groups,
		selectedSlotKey,
		onSelect,
		onAddressClick,
		showRouletteContinue = false,
		showLocationHeader = true,
	} = options;
	const useRoulette = options.useRoulette ?? isMobileSlotRouletteViewport();
	const compactPillGrid = options.compactPillGrid ?? !useRoulette;
	const slotFocusByLocation = new Map<number, number>();

	container.innerHTML = '';
	let branchToneIndex = 0;

	const createSlotButton = (group: PublicSlotBranchGroup, slot: string) => {
		const slotKey = `${group.location.id_location}:${slot}`;
		const slotButton = document.createElement('button');
		slotButton.type = 'button';
		const time = formatSlotLabel24h(slot);
		const periodKey = getSlotDayPeriod(slot);
		slotButton.innerHTML = `<span class="public-slot-time__label">${escapeHtml(time)}</span>`;
		slotButton.setAttribute(
			'aria-label',
			`${time} de la ${periodKey === 'morning' ? 'mañana' : 'tarde'}`
		);
		slotButton.dataset.slotKey = slotKey;
		const isSelected = selectedSlotKey === slotKey;
		slotButton.className =
			(compactPillGrid
				? 'public-slot-time public-slot-time--pill flex min-h-11 items-center justify-center rounded-xl border px-2 py-3 text-sm font-medium cursor-pointer transition'
				: 'public-slot-time flex h-11 items-center justify-center rounded-full border px-4 text-sm font-medium cursor-pointer transition') +
			(isSelected ? ' is-selected' : '');

		slotButton.addEventListener('click', () => {
			onSelect(group.location.id_location, slot, group.location);
			for (const btn of container.querySelectorAll<HTMLElement>('.public-slot-time')) {
				btn.classList.toggle('is-selected', btn.dataset.slotKey === slotKey);
			}
		});
		return slotButton;
	};

	const mountGrid = (section: HTMLElement, group: PublicSlotBranchGroup) => {
		if (showLocationHeader) {
			appendLocationSlotHeader(section, group.location, {
				onAddressClick: onAddressClick
					? (location) => onAddressClick(location as PublicSlotBranchLocation)
					: undefined,
			});
		}

		if (compactPillGrid) {
			const periods = document.createElement('div');
			periods.className = 'public-slot-periods';

			forEachSlotPeriod(group.slots, (period) => {
				const block = document.createElement('div');
				block.className = 'public-slot-period';
				block.dataset.slotPeriod = period.key;

				const heading = document.createElement('p');
				heading.className = 'public-slot-period__label';
				heading.textContent = period.label;
				block.appendChild(heading);

				const grid = document.createElement('div');
				grid.className = 'public-slot-pill-grid';

				for (const slot of period.slots) {
					grid.appendChild(createSlotButton(group, slot));
				}

				block.appendChild(wrapSlotPillGrid(grid));
				periods.appendChild(block);
			});

			section.appendChild(periods);
			return;
		}

		const grid = document.createElement('div');
		grid.className = 'grid grid-cols-2 gap-3 sm:grid-cols-4';

		for (const slot of group.slots) {
			grid.appendChild(createSlotButton(group, slot));
		}

		section.appendChild(grid);
	};

	const mountRoulette = (
		section: HTMLElement,
		group: PublicSlotBranchGroup,
		rouletteOptions?: { softSelectOnMount?: boolean }
	) => {
		if (showLocationHeader) {
			appendLocationSlotHeader(section, group.location, {
				onAddressClick: onAddressClick
					? (location) => onAddressClick(location as PublicSlotBranchLocation)
					: undefined,
			});
		}

		const locationId = group.location.id_location;
		const totalSlots = group.slots.length;
		const wrapRoulette = false;
		const selectedIndex = group.slots.findIndex(
			(slot) => `${locationId}:${slot}` === selectedSlotKey
		);
		let focusedIndex =
			selectedIndex >= 0
				? selectedIndex
				: Math.min(
						Math.max(0, slotFocusByLocation.get(locationId) ?? 0),
						Math.max(0, totalSlots - 1)
					);
		slotFocusByLocation.set(locationId, focusedIndex);

		const softSelect = (slot: string, roulette: HTMLElement, index: number) => {
			onSelect(locationId, slot, group.location);
			for (const button of roulette.querySelectorAll<HTMLElement>('[data-slot-roulette-index]')) {
				const btnIndex = Number(button.dataset.slotRouletteIndex ?? -1);
				button.classList.toggle('is-selected', btnIndex === index);
			}
		};

		const shell = document.createElement('div');
		shell.className = 'public-slot-roulette-shell';

		const roulette = document.createElement('div');
		roulette.className = 'public-slot-roulette';
		roulette.setAttribute('role', 'listbox');
		roulette.setAttribute('aria-label', `Horarios en ${group.location.name || 'sucursal'}`);
		roulette.tabIndex = 0;

		let touchStartY: number | null = null;
		let touchMoved = false;
		let lastStepY: number | null = null;
		let wheelLockedUntil = 0;
		let suppressClickUntil = 0;
		let lastFocusAt = 0;
		const STEP_PX = 62;
		const MAX_STEPS_PER_MOVE = 1;
		const MIN_FOCUS_INTERVAL_MS = 70;
		const WHEEL_LOCK_MS = 380;

		const applyFocus = (nextIndex: number) => {
			if (nextIndex === focusedIndex) return;
			focusedIndex = nextIndex;
			slotFocusByLocation.set(locationId, focusedIndex);
			syncSlotRouletteLayers(roulette, focusedIndex, { wrap: wrapRoulette });
			const slot = group.slots[focusedIndex];
			if (slot) softSelect(slot, roulette, focusedIndex);
			triggerPickerHaptic();
		};

		const moveFocus = (delta: number) => {
			if (totalSlots <= 0) return;
			applyFocus(Math.min(Math.max(0, focusedIndex + delta), totalSlots - 1));
		};

		for (const [index, slot] of group.slots.entries()) {
			const button = document.createElement('button');
			button.type = 'button';
			button.setAttribute('role', 'option');
			button.dataset.slotRouletteIndex = String(index);
			const { time, meridiem } = formatSlotLabelAmPm(slot);
			button.innerHTML = meridiem
				? `<span class="public-slot-time__label">${escapeHtml(time)} <span class="public-slot-time__meridiem">${escapeHtml(meridiem)}</span></span>`
				: `<span class="public-slot-time__label">${escapeHtml(slot)}</span>`;
			button.setAttribute('aria-label', meridiem ? `${time} ${meridiem}` : slot);
			button.className =
				'public-slot-time public-slot-time--roulette' +
				(`${locationId}:${slot}` === selectedSlotKey ? ' is-selected' : '');
			button.addEventListener('click', () => {
				if (Date.now() < suppressClickUntil) return;
				applyFocus(index);
			});
			roulette.appendChild(button);
		}

		syncSlotRouletteLayers(roulette, focusedIndex, { wrap: wrapRoulette });
		const focusedSlot = group.slots[focusedIndex];
		const shouldSoftSelectOnMount =
			Boolean(rouletteOptions?.softSelectOnMount) &&
			(selectedIndex >= 0 || !selectedSlotKey);
		if (focusedSlot && shouldSoftSelectOnMount) {
			softSelect(focusedSlot, roulette, focusedIndex);
		}

		roulette.addEventListener(
			'touchstart',
			(event) => {
				if (event.touches.length !== 1) return;
				const y = event.touches[0]?.clientY ?? null;
				touchStartY = y;
				lastStepY = y;
				touchMoved = false;
			},
			{ passive: true }
		);

		roulette.addEventListener(
			'touchmove',
			(event) => {
				if (touchStartY == null || lastStepY == null || event.touches.length !== 1) return;
				const currentY = event.touches[0]?.clientY ?? touchStartY;
				const deltaFromStart = currentY - touchStartY;
				if (Math.abs(deltaFromStart) > 8) {
					touchMoved = true;
					event.preventDefault();
				}
				const stepDelta = currentY - lastStepY;
				if (Math.abs(stepDelta) < STEP_PX) return;
				const now = Date.now();
				if (now - lastFocusAt < MIN_FOCUS_INTERVAL_MS) return;
				event.preventDefault();
				let steps = Math.trunc(stepDelta / STEP_PX);
				steps = Math.max(-MAX_STEPS_PER_MOVE, Math.min(MAX_STEPS_PER_MOVE, steps));
				if (steps === 0) return;
				lastStepY += steps * STEP_PX;
				lastFocusAt = now;
				suppressClickUntil = now + 350;
				moveFocus(-steps);
			},
			{ passive: false }
		);

		roulette.addEventListener('touchend', () => {
			touchStartY = null;
			lastStepY = null;
			if (touchMoved) suppressClickUntil = Date.now() + 350;
			touchMoved = false;
		});

		roulette.addEventListener('touchcancel', () => {
			touchStartY = null;
			lastStepY = null;
			touchMoved = false;
		});

		roulette.addEventListener(
			'click',
			(event) => {
				if (Date.now() < suppressClickUntil) {
					event.preventDefault();
					event.stopPropagation();
				}
			},
			{ capture: true }
		);

		roulette.addEventListener(
			'wheel',
			(event) => {
				const now = Date.now();
				if (now < wheelLockedUntil) {
					event.preventDefault();
					return;
				}
				if (Math.abs(event.deltaY) < 8) return;
				event.preventDefault();
				wheelLockedUntil = now + WHEEL_LOCK_MS;
				moveFocus(event.deltaY > 0 ? 1 : -1);
			},
			{ passive: false }
		);

		roulette.addEventListener('keydown', (event) => {
			if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
				event.preventDefault();
				moveFocus(1);
			} else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
				event.preventDefault();
				moveFocus(-1);
			} else if ((event.key === 'Enter' || event.key === ' ') && showRouletteContinue) {
				event.preventDefault();
				const slot = group.slots[focusedIndex];
				if (slot) onSelect(locationId, slot, group.location);
			}
		});

		shell.appendChild(roulette);
		section.appendChild(shell);

		if (showRouletteContinue) {
			const continueButton = document.createElement('button');
			continueButton.type = 'button';
			continueButton.className = 'public-booking-continue public-slot-roulette__continue';
			setContinueButtonContent(continueButton);
			continueButton.addEventListener('click', () => {
				const slot = group.slots[focusedIndex];
				if (slot) onSelect(locationId, slot, group.location);
			});
			section.appendChild(continueButton);
		}
	};

	for (const group of groups) {
		if (group.slots.length === 0) continue;

		const isFirstBranch = branchToneIndex === 0;
		const section = document.createElement('section');
		section.className = `public-slot-branch public-slot-branch--tone-${branchToneIndex % 4}${
			useRoulette ? ' is-slot-roulette' : ''
		}`;
		branchToneIndex += 1;

		if (useRoulette) {
			mountRoulette(section, group, { softSelectOnMount: Boolean(selectedSlotKey) || isFirstBranch });
		} else {
			mountGrid(section, group);
		}

		container.appendChild(section);
	}
};
