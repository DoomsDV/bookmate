import {
	buildApiAppointmentTimes,
	formatApiDate,
	formatApiTime,
	formatHumanDateTime,
	formatLongDateFromApiDate,
	getTodayStart,
	isValidApiTimeSlot,
	parseApiDateTime,
	resolveInitialSelectableDate,
	sortTimeSlotsChronologically,
	toDateStart,
} from '../lib/booking-datetime';
import {
	normalizePublicBookingLocations,
} from '../lib/public-booking-locations';

type BookingLocation = {
	id_location: number;
	name?: string;
	address: string;
	latitude?: number;
	longitude?: number;
};

type LocationSlotGroup = {
	location: BookingLocation;
	slots: string[];
};

type PublicReservationDetail = {
	id_appointment: number;
	pro_id_professional: number;
	loc_id_location: number;
	location_name?: string;
	location_address?: string;
	ser_id_service: number;
	start_time: string;
	end_time?: string;
	status?: string;
	duration_minutes?: number;
};

type Coordinates = { lat: number; lng: number };

type GoogleMapsNamespace = {
	Map: new (container: HTMLElement, options: Record<string, unknown>) => any;
	Marker: new (options: Record<string, unknown>) => any;
	event?: { trigger?: (instance: unknown, eventName: string) => void };
};

type WindowWithGoogleMaps = Window & {
	google?: { maps?: GoogleMapsNamespace };
	__bookmateGoogleMapsLoader?: Promise<GoogleMapsNamespace> | null;
};

type RescheduleStep = 1 | 2 | 3;

const RESCHEDULE_MODAL_TITLES: Record<RescheduleStep, string> = {
	1: 'Elige una nueva fecha y horario',
	2: 'Selecciona un horario',
	3: 'Confirma tu reprogramación',
};

const darkMapStyles = [
	{ elementType: 'geometry', stylers: [{ color: '#1d1f24' }] },
	{ elementType: 'labels.text.fill', stylers: [{ color: '#c9d1d9' }] },
	{ elementType: 'labels.text.stroke', stylers: [{ color: '#1d1f24' }] },
	{ featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a2d33' }] },
	{ featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#3a3f47' }] },
	{ featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9aa4b2' }] },
	{ featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#23262c' }] },
	{ featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#8a94a3' }] },
	{ featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#23262c' }] },
	{ featureType: 'water', elementType: 'geometry', stylers: [{ color: '#111827' }] },
	{ featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4f8cc9' }] },
];

const toPositiveInt = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const parseJsonScript = <T>(id: string): T | null => {
	const node = document.getElementById(id);
	if (!node?.textContent) return null;
	try {
		return JSON.parse(node.textContent) as T;
	} catch {
		return null;
	}
};

const showToast = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
	const detail = {
		message,
		type,
		autoHideMs: type === 'success' ? 5000 : 6500,
	};
	if (window.BookmateFlash?.show) {
		window.BookmateFlash.show(detail);
		return;
	}
	document.dispatchEvent(new CustomEvent('bookmate:flash', { detail }));
};

export const initializePublicReservationPage = () => {
	const root = document.querySelector<HTMLElement>('[data-reservation-root]');
	if (!root || root.dataset.bound === 'true') return;
	root.dataset.bound = 'true';

	const reservation = parseJsonScript<PublicReservationDetail>('reservation-json');
	if (!reservation) return;

	const token = root.dataset.token || '';
	const isCancelledReservation =
		String(reservation.status || '').trim().toUpperCase() === 'CANCELADO';
	if (isCancelledReservation) return;

	const locations = normalizePublicBookingLocations(
		parseJsonScript<unknown[]>('reservation-locations-json') || []
	);
	const mapsApiKey = String(root.dataset.googleMapsApiKey || '').trim();

	const form = root.querySelector<HTMLFormElement>('[data-reservation-form]');
	const dateInput = root.querySelector<HTMLInputElement>('[data-reservation-date]');
	const slotInput = root.querySelector<HTMLInputElement>('[data-reservation-slot]');
	const locationInput = root.querySelector<HTMLInputElement>('[data-reservation-location]');
	const slotsContainer = root.querySelector<HTMLElement>('[data-reservation-slots-container]');
	const slotsPanel = root.querySelector<HTMLElement>('[data-reservation-slots-panel]');
	const slotsSectionHeading = root.querySelector<HTMLElement>('[data-reservation-slots-heading]');
	const slotsLoading = root.querySelector<HTMLElement>('[data-reservation-slots-loading]');
	const noSlots = root.querySelector<HTMLElement>('[data-no-reservation-slots]');
	const selectedDateLabel = root.querySelector<HTMLElement>('[data-reservation-selected-date]');
	const cancelButton = root.querySelector<HTMLButtonElement>('[data-cancel-reservation]');
	const openRescheduleButton = root.querySelector<HTMLButtonElement>('[data-open-reschedule-modal]');
	const currentDate = root.querySelector<HTMLElement>('[data-current-date]');
	const locationName = root.querySelector<HTMLElement>('[data-location-name]');
	const statusText = root.querySelector<HTMLElement>('[data-status-text]');
	const calendarMonth = root.querySelector<HTMLElement>('[data-calendar-month]');
	const calendarGrid = root.querySelector<HTMLElement>('[data-calendar-grid]');
	const prevMonthButton = root.querySelector<HTMLButtonElement>('[data-calendar-prev]');
	const nextMonthButton = root.querySelector<HTMLButtonElement>('[data-calendar-next]');
	const rescheduleModal = root.querySelector<HTMLDialogElement>('[data-reschedule-modal]');
	const rescheduleModalTitle = root.querySelector<HTMLElement>('[data-reschedule-modal-title]');
	const rescheduleCloseButton = root.querySelector<HTMLButtonElement>('[data-reschedule-close]');
	const rescheduleBackButton = root.querySelector<HTMLButtonElement>('[data-reschedule-back]');
	const rescheduleNextButton = root.querySelector<HTMLButtonElement>('[data-reschedule-next]');
	const rescheduleSubmitButton = root.querySelector<HTMLButtonElement>('[data-reschedule-submit]');
	const rescheduleStepItems = root.querySelectorAll<HTMLElement>('[data-reschedule-step-item]');
	const rescheduleStepPanels = root.querySelectorAll<HTMLElement>('[data-reschedule-step-panel]');
	const changeSummary = root.querySelector<HTMLElement>('[data-reschedule-change-summary]');
	const mapModal = root.querySelector<HTMLDialogElement>('[data-public-map-modal]');
	const mapCanvasWrap = root.querySelector<HTMLElement>('.public-map-canvas-wrap');
	const mapCanvas = root.querySelector<HTMLElement>('[data-public-map-canvas]');
	const mapLoading = root.querySelector<HTMLElement>('[data-public-map-loading]');
	const mapAddress = root.querySelector<HTMLElement>('[data-public-map-address]');
	const mapStatus = root.querySelector<HTMLElement>('[data-public-map-status]');
	const mapCloseButton = root.querySelector<HTMLButtonElement>('[data-public-map-close]');

	if (
		!form ||
		!dateInput ||
		!slotInput ||
		!locationInput ||
		!slotsContainer ||
		!slotsLoading ||
		!noSlots ||
		!selectedDateLabel ||
		!cancelButton ||
		!openRescheduleButton ||
		!calendarMonth ||
		!calendarGrid ||
		!prevMonthButton ||
		!nextMonthButton ||
		!rescheduleModal ||
		!rescheduleModalTitle ||
		!rescheduleCloseButton ||
		!rescheduleBackButton ||
		!rescheduleNextButton ||
		!rescheduleSubmitButton ||
		!changeSummary ||
		!mapModal ||
		!mapCanvas ||
		!mapCloseButton
	) {
		return;
	}

	const start = parseApiDateTime(reservation.start_time);
	if (!start) return;

	const durationMinutes = Number(reservation.duration_minutes || 30);
	const today = getTodayStart();
	const initialDate = resolveInitialSelectableDate(start, today);
	const defaultLocation: BookingLocation = {
		id_location: reservation.loc_id_location,
		name: reservation.location_name,
		address: reservation.location_address || '',
	};

	let selectedDate = '';
	let selectedSlot = '';
	let selectedLocationId = reservation.loc_id_location;
	let availableSlotGroups: LocationSlotGroup[] = [];
	let visibleMonth = new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);
	let isLoadingSlots = false;
	let rescheduleStep: RescheduleStep = 1;
	let mapInstance: any = null;
	let mapMarker: any = null;

	if (currentDate) currentDate.textContent = formatHumanDateTime(start);
	locationInput.value = String(reservation.loc_id_location);

	const getSelectedSlotKey = () =>
		selectedSlot ? `${selectedLocationId}:${selectedSlot}` : '';

	const getLocationLabel = (location: BookingLocation) =>
		String(location.name || '').trim() ||
		String(location.address || '').trim() ||
		`Sucursal #${location.id_location}`;

	const getTotalAvailableSlots = () =>
		availableSlotGroups.reduce((count, group) => count + group.slots.length, 0);

	const setMapStatus = (message: string) => {
		if (!mapStatus) return;
		mapStatus.textContent = message;
		mapStatus.classList.toggle('hidden', !message.trim());
	};

	const setMapLoading = (isLoading: boolean) => {
		if (mapLoading) {
			mapLoading.classList.toggle('hidden', !isLoading);
			mapLoading.setAttribute('aria-hidden', isLoading ? 'false' : 'true');
		}
		mapCanvasWrap?.classList.toggle('is-loading', isLoading);
	};

	const getLocationCoordinatesFrom = (
		location: BookingLocation | null | undefined
	): Coordinates | null => {
		const lat = Number(location?.latitude);
		const lng = Number(location?.longitude);
		return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
	};

	const fetchPublicLocationDetails = async (location: BookingLocation): Promise<BookingLocation> => {
		const response = await fetch(`/api/public/locations/${location.id_location}`, {
			method: 'GET',
			headers: { Accept: 'application/json' },
			cache: 'no-store',
		});
		const data = await response.json().catch(() => ({}));
		if (!response.ok || data.status !== 'success') {
			throw new Error(data.message || 'No fue posible obtener la ubicación.');
		}

		const item = Array.isArray(data.data) ? data.data[0] : data.data;
		if (!item || typeof item !== 'object') {
			throw new Error('No fue posible obtener la ubicación.');
		}

		const source = item as Record<string, unknown>;
		const latitude = Number(source.latitude);
		const longitude = Number(source.longitude);

		return {
			...location,
			name: String(source.name || location.name || '').trim(),
			address: String(source.address || location.address || '').trim(),
			latitude: Number.isFinite(latitude) ? latitude : location.latitude,
			longitude: Number.isFinite(longitude) ? longitude : location.longitude,
		};
	};

	const loadGoogleMaps = async (): Promise<GoogleMapsNamespace> => {
		if (!mapsApiKey) {
			throw new Error('No se encontró la API key de Google Maps para mostrar la ubicación.');
		}

		const win = window as WindowWithGoogleMaps;
		if (win.google?.maps) return win.google.maps;
		if (win.__bookmateGoogleMapsLoader) return win.__bookmateGoogleMapsLoader;

		win.__bookmateGoogleMapsLoader = new Promise<GoogleMapsNamespace>((resolve, reject) => {
			const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-maps-loader]');
			if (existingScript) {
				existingScript.addEventListener(
					'load',
					() => {
						const maps = (window as WindowWithGoogleMaps).google?.maps;
						maps ? resolve(maps) : reject(new Error('No fue posible cargar Google Maps.'));
					},
					{ once: true }
				);
				existingScript.addEventListener(
					'error',
					() => reject(new Error('No fue posible cargar Google Maps.')),
					{ once: true }
				);
				return;
			}

			const script = document.createElement('script');
			script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsApiKey)}&v=weekly`;
			script.async = true;
			script.defer = true;
			script.dataset.googleMapsLoader = 'true';
			script.addEventListener(
				'load',
				() => {
					const maps = (window as WindowWithGoogleMaps).google?.maps;
					maps ? resolve(maps) : reject(new Error('No fue posible cargar Google Maps.'));
				},
				{ once: true }
			);
			script.addEventListener(
				'error',
				() => reject(new Error('No fue posible cargar Google Maps.')),
				{ once: true }
			);
			document.head.appendChild(script);
		});

		try {
			return await win.__bookmateGoogleMapsLoader;
		} catch (error) {
			win.__bookmateGoogleMapsLoader = null;
			throw error;
		}
	};

	const openLocationMap = async (location: BookingLocation) => {
		if (!toPositiveInt(location.id_location, 0)) return;

		setMapStatus('');
		if (mapAddress) mapAddress.textContent = location.address || '';
		if (!mapModal.open) mapModal.showModal();

		setMapLoading(true);

		try {
			let mapLocation = location;
			let coords = getLocationCoordinatesFrom(mapLocation);

			if (!coords) {
				try {
					mapLocation = await fetchPublicLocationDetails(mapLocation);
					coords = getLocationCoordinatesFrom(mapLocation);
				} catch (error) {
					setMapStatus(
						error instanceof Error ? error.message : 'No fue posible obtener la ubicación.'
					);
					setMapLoading(false);
					return;
				}
			}

			if (!coords) {
				setMapStatus('Esta sucursal no tiene coordenadas cargadas.');
				setMapLoading(false);
				return;
			}

			if (mapAddress) {
				mapAddress.textContent = mapLocation.address || location.address || '';
			}

			const locationTitle = getLocationLabel(mapLocation);

			const maps = await loadGoogleMaps();
			if (!mapInstance) {
				mapInstance = new maps.Map(mapCanvas, {
					center: coords,
					zoom: 16,
					disableDefaultUI: false,
					mapTypeControl: false,
					streetViewControl: false,
					fullscreenControl: true,
					styles: darkMapStyles,
				});
				mapMarker = new maps.Marker({
					map: mapInstance,
					position: coords,
					title: locationTitle,
				});
			} else {
				mapInstance.setOptions?.({ styles: darkMapStyles });
				mapInstance.setCenter(coords);
				mapInstance.setZoom(16);
				mapMarker?.setPosition?.(coords);
				mapMarker?.setTitle?.(locationTitle);
			}

			window.setTimeout(() => {
				maps.event?.trigger?.(mapInstance, 'resize');
				mapInstance?.setCenter?.(coords);
				setMapLoading(false);
			}, 80);
		} catch (error) {
			setMapStatus(error instanceof Error ? error.message : 'No fue posible mostrar el mapa.');
			setMapLoading(false);
		}
	};

	const updateLocationSummary = (location: BookingLocation) => {
		if (locationName) locationName.textContent = getLocationLabel(location);
	};

	const formatLongReservationDateTime = (date: Date) => {
		const label = `${formatLongDateFromApiDate(formatApiDate(date))} a las ${formatApiTime(date)}`;
		return label.charAt(0).toUpperCase() + label.slice(1);
	};

	const formatLongReservationDateTimeFromParts = (ymd: string, time: string) => {
		const label = `${formatLongDateFromApiDate(ymd)} a las ${time}`;
		return label.charAt(0).toUpperCase() + label.slice(1);
	};

	const updateChangeSummary = () => {
		const currentStart = parseApiDateTime(reservation.start_time);
		if (!currentStart || !selectedDate || !selectedSlot) {
			changeSummary.innerHTML = '';
			return;
		}

		const currentLabel = formatLongReservationDateTime(currentStart);
		const nextLabelFormatted = formatLongReservationDateTimeFromParts(selectedDate, selectedSlot);
		changeSummary.innerHTML = `
			<div class="reservation-change-diff__block reservation-change-diff__block--previous">
				<span class="reservation-change-diff__microcopy">Anterior:</span>
				<span class="reservation-change-diff__previous">${currentLabel}</span>
			</div>
			<div class="reservation-change-diff__block reservation-change-diff__block--next">
				<span class="reservation-change-diff__microcopy">Nuevo:</span>
				<strong class="reservation-change-diff__next">${nextLabelFormatted}</strong>
			</div>
		`;
	};

	const updateFooterButtons = () => {
		const isStep1 = rescheduleStep === 1;
		const isStep3 = rescheduleStep === 3;
		const hasSlots = getTotalAvailableSlots() > 0;

		rescheduleBackButton.textContent = isStep1 ? 'Cancelar' : 'Volver atrás';
		rescheduleNextButton.classList.toggle('is-hidden', isStep3);
		rescheduleSubmitButton.classList.toggle('is-hidden', !isStep3);

		if (isStep1) {
			rescheduleNextButton.disabled = !selectedDate;
			return;
		}

		if (rescheduleStep === 2) {
			rescheduleNextButton.disabled =
				isLoadingSlots || !selectedSlot || !hasSlots;
			return;
		}

		rescheduleSubmitButton.disabled = !selectedDate || !selectedSlot;
	};

	const setRescheduleStep = (nextStep: RescheduleStep) => {
		rescheduleStep = nextStep;
		form.dataset.rescheduleStep = String(nextStep);
		rescheduleModalTitle.textContent = RESCHEDULE_MODAL_TITLES[nextStep];

		for (const panel of rescheduleStepPanels) {
			const panelStep = Number(panel.dataset.rescheduleStepPanel || '0');
			panel.classList.toggle('hidden', panelStep !== nextStep);
		}

		for (const item of rescheduleStepItems) {
			const itemStep = Number(item.dataset.rescheduleStepItem || '0');
			item.classList.remove('step-item-default', 'step-item-current', 'step-item-done');

			if (itemStep === nextStep) {
				item.classList.add('step-item-current');
				continue;
			}

			if (itemStep < nextStep) {
				item.classList.add('step-item-done');
				continue;
			}

			item.classList.add('step-item-default');
		}

		if (nextStep === 3) {
			updateChangeSummary();
		}

		updateFooterButtons();
	};

	const resetRescheduleFlow = () => {
		selectedDate = '';
		selectedSlot = '';
		selectedLocationId = reservation.loc_id_location;
		availableSlotGroups = [];
		isLoadingSlots = false;
		dateInput.value = '';
		slotInput.value = '';
		locationInput.value = String(reservation.loc_id_location);
		visibleMonth = new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);
		slotsContainer.innerHTML = '';
		noSlots.classList.add('hidden');
		if (slotsPanel) slotsPanel.classList.add('hidden');
		if (slotsSectionHeading) slotsSectionHeading.classList.add('hidden');
		slotsLoading.classList.add('hidden');
		setRescheduleStep(1);
		renderCalendar();
	};

	const openRescheduleModal = () => {
		resetRescheduleFlow();
		if (!rescheduleModal.open) {
			rescheduleModal.showModal();
		}
	};

	const closeRescheduleModal = () => {
		if (rescheduleModal.open) {
			rescheduleModal.close();
		}
		resetRescheduleFlow();
	};

	const selectDate = (date: Date, options: { loadSlots?: boolean } = {}) => {
		const dateStart = toDateStart(date);
		const dateKey = formatApiDate(dateStart);
		selectedDate = dateKey;
		dateInput.value = dateKey;
		selectedDateLabel.textContent = formatLongDateFromApiDate(dateKey);
		selectedSlot = '';
		slotInput.value = '';
		renderCalendar();
		updateFooterButtons();
		if (options.loadSlots) void loadSlots(dateKey);
	};

	const fetchAvailableSlotsForLocation = async (location: BookingLocation, targetDate: string) => {
		const params = new URLSearchParams({
			pro_id: String(reservation.pro_id_professional),
			loc_id: String(location.id_location),
			ser_id: String(reservation.ser_id_service),
			target_date: targetDate,
		});
		if (reservation.id_appointment > 0) {
			params.set('exclude_app_id', String(reservation.id_appointment));
		}

		const response = await fetch(`/api/public/available-slots?${params.toString()}`);
		const data = await response.json().catch(() => ({}));

		if (!response.ok || data.status !== 'success' || !Array.isArray(data.data)) {
			throw new Error(data.message || 'No fue posible consultar horarios disponibles.');
		}

		return {
			location,
			slots: sortTimeSlotsChronologically(
				data.data.map((value: unknown) => String(value || '').trim()).filter(isValidApiTimeSlot)
			),
		} satisfies LocationSlotGroup;
	};

	const renderSlotSections = () => {
		slotsContainer.innerHTML = '';
		slotsLoading.classList.toggle('hidden', !isLoadingSlots);

		const totalSlots = getTotalAvailableSlots();
		noSlots.classList.toggle('hidden', isLoadingSlots || totalSlots > 0);
		if (slotsPanel) {
			slotsPanel.classList.toggle('hidden', isLoadingSlots);
		}
		if (slotsSectionHeading) {
			slotsSectionHeading.classList.toggle('hidden', isLoadingSlots || totalSlots === 0);
		}

		if (isLoadingSlots) {
			updateFooterButtons();
			return;
		}

		const selectedSlotKey = getSelectedSlotKey();
		let renderedSectionCount = 0;

		for (const group of availableSlotGroups) {
			if (group.slots.length === 0) continue;

			if (renderedSectionCount > 0) {
				const divider = document.createElement('div');
				divider.className = 'reservation-slot-location-divider';
				divider.setAttribute('role', 'separator');
				slotsContainer.appendChild(divider);
			}
			renderedSectionCount += 1;

			const section = document.createElement('section');
			section.className = 'grid gap-3 pt-0.5';

			const headerRow = document.createElement('div');
			headerRow.className = 'flex flex-wrap items-center justify-between gap-2';

			const heading = document.createElement('h3');
			heading.className = 'reservation-slot-location-name';
			heading.textContent = getLocationLabel(group.location);

			const locationButton = document.createElement('button');
			locationButton.type = 'button';
			locationButton.className = 'public-location-link text-sm font-medium';
			locationButton.innerHTML =
				'<span class="material-symbols-rounded text-base leading-none">location_on</span><span class="public-location-link__label">Ver ubicación</span>';
			locationButton.addEventListener('click', () => {
				void openLocationMap(group.location);
			});

			headerRow.appendChild(heading);
			headerRow.appendChild(locationButton);
			section.appendChild(headerRow);

			const grid = document.createElement('div');
			grid.className = 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4';

			for (const slot of group.slots) {
				const slotKey = `${group.location.id_location}:${slot}`;
				const button = document.createElement('button');
				button.type = 'button';
				button.textContent = slot;
				button.className =
					'flex h-11 items-center justify-center rounded-full border px-4 text-sm font-medium cursor-pointer transition ' +
					(selectedSlotKey === slotKey
						? 'border-[var(--primary)] bg-[var(--primary-container)] text-[var(--on-primary-container)]'
						: 'border-[var(--outline)] bg-transparent text-[var(--on-surface)] hover:bg-[var(--surface-container-highest)]');
				button.addEventListener('click', () => {
					selectedSlot = slot;
					selectedLocationId = group.location.id_location;
					slotInput.value = slot;
					locationInput.value = String(group.location.id_location);
					updateLocationSummary(group.location);
					renderSlotSections();
					updateFooterButtons();
				});
				grid.appendChild(button);
			}

			section.appendChild(grid);
			slotsContainer.appendChild(section);
		}

		updateFooterButtons();
	};

	const loadSlots = async (targetDate: string) => {
		if (!targetDate) return;

		isLoadingSlots = true;
		availableSlotGroups = [];
		selectedSlot = '';
		slotInput.value = '';
		renderSlotSections();

		try {
			const locationTargets =
				locations.length > 0
					? locations
					: defaultLocation.id_location
						? [defaultLocation]
						: [];

			const slotResults = await Promise.allSettled(
				locationTargets.map((location) => fetchAvailableSlotsForLocation(location, targetDate))
			);

			const groups = slotResults
				.filter(
					(result): result is PromiseFulfilledResult<LocationSlotGroup> =>
						result.status === 'fulfilled'
				)
				.map((result) => result.value);

			const rejected = slotResults.find(
				(result): result is PromiseRejectedResult => result.status === 'rejected'
			);
			if (rejected && groups.length === 0) {
				throw rejected.reason;
			}

			const reservationStart = parseApiDateTime(reservation.start_time);
			const currentSlot =
				reservationStart && targetDate === formatApiDate(reservationStart)
					? formatApiTime(reservationStart)
					: '';
			const currentLocationId = reservation.loc_id_location;

			availableSlotGroups = groups
				.map((group) => {
					if (
						currentSlot &&
						group.location.id_location === currentLocationId &&
						!group.slots.includes(currentSlot)
					) {
						return {
							...group,
							slots: sortTimeSlotsChronologically([...group.slots, currentSlot]),
						};
					}
					return group;
				})
				.filter((group) => group.slots.length > 0)
				.sort((left, right) =>
					getLocationLabel(left.location).localeCompare(getLocationLabel(right.location), 'es')
				);

			if (currentSlot) {
				const currentGroup = availableSlotGroups.find(
					(group) => group.location.id_location === currentLocationId
				);
				if (currentGroup?.slots.includes(currentSlot)) {
					selectedSlot = currentSlot;
					selectedLocationId = currentLocationId;
					slotInput.value = currentSlot;
					locationInput.value = String(currentLocationId);
				}
			}
		} catch (error) {
			availableSlotGroups = [];
			showToast(
				error instanceof Error ? error.message : 'No fue posible cargar horarios.',
				'error'
			);
		} finally {
			isLoadingSlots = false;
			renderSlotSections();
		}
	};

	const renderCalendar = () => {
		calendarGrid.innerHTML = '';
		calendarMonth.textContent = new Intl.DateTimeFormat('es-PY', {
			month: 'long',
			year: 'numeric',
		}).format(visibleMonth);

		const year = visibleMonth.getFullYear();
		const month = visibleMonth.getMonth();
		const firstDay = new Date(year, month, 1);
		const daysInMonth = new Date(year, month + 1, 0).getDate();
		const firstWeekday = (firstDay.getDay() + 6) % 7;

		for (let blank = 0; blank < firstWeekday; blank += 1) {
			const placeholder = document.createElement('span');
			placeholder.setAttribute('aria-hidden', 'true');
			calendarGrid.appendChild(placeholder);
		}

		for (let day = 1; day <= daysInMonth; day += 1) {
			const dateValue = new Date(year, month, day);
			const dateKey = formatApiDate(dateValue);
			const dateStart = toDateStart(dateValue);
			const isPast = dateStart.getTime() < today.getTime();
			const isToday = dateStart.getTime() === today.getTime();
			const isSelected = selectedDate === dateKey;

			const dayButton = document.createElement('button');
			dayButton.type = 'button';
			dayButton.textContent = String(day);
			dayButton.disabled = isPast;
			dayButton.className =
				'flex h-9 w-9 mx-auto items-center justify-center rounded-full border text-sm font-medium cursor-pointer transition disabled:cursor-not-allowed ' +
				(isSelected
					? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)]'
					: isToday
						? 'border-[var(--primary)] bg-transparent text-[var(--primary)]'
						: 'border-transparent bg-transparent text-[var(--on-surface)] hover:bg-[var(--surface-container-highest)]');

			dayButton.addEventListener('click', () => {
				selectDate(dateValue);
			});

			calendarGrid.appendChild(dayButton);
		}
	};

	const refreshReservationSummary = async () => {
		const response = await fetch(`/api/public/reservations/${encodeURIComponent(token)}`, {
			headers: { Accept: 'application/json' },
		});
		const data = await response.json().catch(() => ({}));
		if (!response.ok || data.status !== 'success' || !data.data) return false;

		const updated = data.data as PublicReservationDetail;
		reservation.start_time = updated.start_time;
		reservation.end_time = updated.end_time;
		reservation.status = updated.status;
		reservation.duration_minutes = updated.duration_minutes || reservation.duration_minutes;
		reservation.loc_id_location = updated.loc_id_location || reservation.loc_id_location;
		reservation.location_name = updated.location_name || reservation.location_name;
		reservation.location_address = updated.location_address || reservation.location_address;

		const nextStart = parseApiDateTime(updated.start_time);
		if (!nextStart) return false;

		if (statusText) statusText.textContent = String(updated.status || reservation.status || '');
		if (currentDate) currentDate.textContent = formatHumanDateTime(nextStart);
		if (locationName && updated.location_name) {
			locationName.textContent = updated.location_name;
		}
		locationInput.value = String(reservation.loc_id_location);
		selectedLocationId = reservation.loc_id_location;
		return true;
	};

	const handleRescheduleNext = async () => {
		if (rescheduleStep === 1) {
			if (!selectedDate) {
				showToast('Selecciona una fecha.', 'error');
				return;
			}
			setRescheduleStep(2);
			await loadSlots(selectedDate);
			return;
		}

		if (rescheduleStep === 2) {
			if (!selectedSlot) {
				showToast('Selecciona un horario.', 'error');
				return;
			}
			setRescheduleStep(3);
		}
	};

	const handleRescheduleBack = () => {
		if (rescheduleStep === 1) {
			closeRescheduleModal();
			return;
		}

		if (rescheduleStep === 2) {
			setRescheduleStep(1);
			return;
		}

		setRescheduleStep(2);
	};

	openRescheduleButton.addEventListener('click', openRescheduleModal);

	rescheduleCloseButton.addEventListener('click', closeRescheduleModal);
	rescheduleModal.addEventListener('click', (event) => {
		if (event.target === rescheduleModal) closeRescheduleModal();
	});
	rescheduleModal.addEventListener('cancel', (event) => {
		event.preventDefault();
		closeRescheduleModal();
	});

	rescheduleBackButton.addEventListener('click', handleRescheduleBack);
	rescheduleNextButton.addEventListener('click', () => {
		void handleRescheduleNext();
	});

	prevMonthButton.addEventListener('click', () => {
		visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
		renderCalendar();
	});

	nextMonthButton.addEventListener('click', () => {
		visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
		renderCalendar();
	});

	mapCloseButton.addEventListener('click', () => {
		mapModal.close();
	});
	mapModal.addEventListener('click', (event) => {
		if (event.target === mapModal) mapModal.close();
	});

	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (!selectedDate || !slotInput.value) {
			showToast('Selecciona fecha y horario.', 'error');
			return;
		}

		const appointmentTimes = buildApiAppointmentTimes(
			selectedDate,
			slotInput.value,
			durationMinutes
		);
		if (!appointmentTimes) {
			showToast('Selecciona fecha y horario válidos.', 'error');
			return;
		}

		const payload: Record<string, string | number> = {
			...appointmentTimes,
		};
		const nextLocationId = toPositiveInt(locationInput.value, 0);
		if (nextLocationId && nextLocationId !== reservation.loc_id_location) {
			payload.loc_id_location = nextLocationId;
		}

		rescheduleSubmitButton.disabled = true;

		const response = await fetch(`/api/public/reservations/${encodeURIComponent(token)}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify(payload),
		});
		const data = await response.json().catch(() => ({}));

		rescheduleSubmitButton.disabled = false;

		if (response.ok) {
			await refreshReservationSummary();
			closeRescheduleModal();
			showToast('Tu cita se modificó correctamente.', 'success');
			return;
		}
		showToast(data.message || 'No fue posible actualizar tu cita.', 'error');
	});

	cancelButton.addEventListener('click', async () => {
		const confirmed = window.BookmateAlert?.confirm
			? await window.BookmateAlert.confirm({
					type: 'warning',
					title: '¿Cancelar tu reserva?',
					message: 'Tu turno será cancelado definitivamente. ¿Deseas continuar?',
					confirmText: 'Sí, cancelar',
					cancelText: 'Mantener reserva',
				})
			: window.confirm('¿Quieres cancelar esta reserva?');
		if (!confirmed) return;

		const response = await fetch(`/api/public/reservations/${encodeURIComponent(token)}`, {
			method: 'DELETE',
			headers: { Accept: 'application/json' },
		});
		const data = await response.json().catch(() => ({}));
		if (response.ok) {
			window.location.reload();
			return;
		}
		showToast(data.message || 'No fue posible cancelar tu cita.', 'error');
	});
};
