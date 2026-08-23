import {
	buildApiAppointmentTimes,
	formatApiDate,
	formatApiTime,
	formatFriendlyTime,
	formatLongDateFromApiDate,
	formatReservationStatusLabel,
	formatTicketDate,
	getTodayStart,
	isReservationPast,
	isValidApiTimeSlot,
	parseApiDateTime,
	resolveInitialSelectableDate,
	sortTimeSlotsChronologically,
	toDateStart,
} from '../lib/booking-datetime';
import { formatCustomerCancelNoRefundHint } from '../lib/public-reservation-refund';
import { parseSipapAlias, sanitizeSipapAliasInput, SIPAP_ALIAS_ERROR } from '../lib/sipap-alias';
import { normalizePublicBookingLocations } from '../lib/public-booking-locations';
import {
	isMobileSlotRouletteViewport,
	mountPublicSlotBranches,
} from '../lib/public-booking-slots-ui';
import {
	createBrandMarker,
	getStadiaStyleUrl,
	loadMapLibre,
	resolveMapTheme,
	scheduleMapLayout,
	type MapLibreModule,
} from '../lib/maplibre-interactive';
import {
	bindMapImageLifecycle,
	bindVerticalStackGestures,
	escapeHtml,
	getCoords,
	isMobileStack,
	syncStackLayers,
} from './public-user-booking/picker-ui';
import {
	bindSipapCopyButtons,
	bindSipapReceiptUpload,
	fillSipapDepositPanel,
	type PublicDepositSettings,
} from './public-deposit-sipap';

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
	service_name?: string;
	professional_name?: string;
	start_time: string;
	end_time?: string;
	status?: string;
	duration_minutes?: number;
	payment_status?: string | null;
	deposit_amount?: number | null;
	policy_code_snapshot?: string | null;
	policy_label?: string | null;
	ocr_status?: string | null;
	reject_reason?: string | null;
	payment_reference?: string | null;
	payment_expires_at?: string | null;
	deposit_settings?: PublicDepositSettings | null;
	refund_status?: string | null;
	refund_amount?: number | null;
	refund_preview?: {
		amount: number;
		requires_alias: boolean;
		policy_code?: string | null;
		policy_label?: string | null;
		policy_summary?: string | null;
		no_refund_reason?: 'WITHIN_24H' | 'POLICY_STRICT' | null;
	} | null;
	can_claim_refund?: number | null;
	refund_claim_open?: number | null;
};

type Coordinates = { lat: number; lng: number };

type RescheduleStep = 1 | 2 | 3 | 4;

const RESCHEDULE_MODAL_TITLES: Record<RescheduleStep, string> = {
	1: 'Elige una nueva fecha y horario',
	2: '¿Dónde querés atenderte?',
	3: 'Selecciona un horario',
	4: 'Confirma tu reprogramación',
};

const RESCHEDULE_STEP_LABELS: Record<RescheduleStep, string> = {
	1: 'Fecha',
	2: 'Sucursal',
	3: 'Horario',
	4: 'Confirmar',
};

const RESCHEDULE_STEP_COUNT = 4;

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
	const reservationStart = parseApiDateTime(reservation.start_time);
	const currentDate = root.querySelector<HTMLElement>('[data-current-date]');
	const currentTime = root.querySelector<HTMLElement>('[data-current-time]');
	const statusText = root.querySelector<HTMLElement>('[data-status-text]');

	const applyTicketSummary = (start: Date, status: string, isPast: boolean) => {
		if (currentDate) currentDate.textContent = formatTicketDate(start);
		if (currentTime) currentTime.textContent = `${formatFriendlyTime(start)} hs`;
		if (statusText) {
			const meta = formatReservationStatusLabel(status, { isPast });
			statusText.textContent = meta.label;
			statusText.dataset.status = meta.variant;
		}
	};

	const historyModal = root.querySelector<HTMLDialogElement>('[data-visit-history-modal]');
	const historyOpenButton = root.querySelector<HTMLButtonElement>('[data-open-visit-history-modal]');
	const historyCloseButton = root.querySelector<HTMLButtonElement>('[data-visit-history-close]');
	if (historyModal && historyOpenButton) {
		const closeHistoryModal = () => historyModal.close();
		historyOpenButton.addEventListener('click', () => historyModal.showModal());
		historyCloseButton?.addEventListener('click', closeHistoryModal);
		historyModal.addEventListener('click', (event) => {
			if (event.target === historyModal) closeHistoryModal();
		});
		historyModal.addEventListener('cancel', (event) => {
			event.preventDefault();
			closeHistoryModal();
		});
	}

	const isCancelledReservation =
		String(reservation.status || '').trim().toUpperCase() === 'CANCELADO';
	const isPastReservation = isReservationPast(reservation);
	if (reservationStart) {
		applyTicketSummary(reservationStart, reservation.status || '', isPastReservation);
	}
	const refundStatus = String(reservation.refund_status || '').trim().toUpperCase();

	const formatMoney = (amount: number) =>
		new Intl.NumberFormat('es-PY', {
			style: 'currency',
			currency: 'PYG',
			maximumFractionDigits: 0,
		}).format(Number(amount) || 0);

	// Cancelada esperando alias (C2): solo bind del form de alias.
	if (isCancelledReservation && refundStatus === 'AWAITING_ALIAS') {
		const aliasForm = root.querySelector<HTMLFormElement>('[data-refund-alias-form]');
		const aliasInput = root.querySelector<HTMLInputElement>('[data-refund-alias-input]');
		const aliasStatus = root.querySelector<HTMLElement>('[data-refund-alias-status]');
		const aliasSubmit = root.querySelector<HTMLButtonElement>('[data-refund-alias-submit]');
		const syncAliasSubmit = () => {
			if (!aliasInput) return;
			const cleaned = sanitizeSipapAliasInput(aliasInput.value);
			if (aliasInput.value !== cleaned) aliasInput.value = cleaned;
			if (aliasSubmit) aliasSubmit.disabled = !parseSipapAlias(cleaned).isValid;
		};
		aliasInput?.addEventListener('input', syncAliasSubmit);
		aliasInput?.addEventListener('paste', () => {
			requestAnimationFrame(syncAliasSubmit);
		});
		syncAliasSubmit();

		aliasForm?.addEventListener('submit', async (event) => {
			event.preventDefault();
			const parsed = parseSipapAlias(aliasInput?.value || '');
			if (!parsed.isValid) {
				showToast(parsed.message || SIPAP_ALIAS_ERROR, 'error');
				return;
			}
			const alias = parsed.normalized;
			if (aliasStatus) aliasStatus.textContent = 'Enviando…';
			const response = await fetch(
				`/api/public/reservations/${encodeURIComponent(token)}/refund-alias`,
				{
					method: 'POST',
					headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
					body: JSON.stringify({ refund_alias: alias }),
				}
			);
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				if (aliasStatus) aliasStatus.textContent = '';
				showToast(data.message || 'No fue posible guardar el alias.', 'error');
				return;
			}
			window.location.reload();
		});
		return;
	}

	// Reembolso pendiente: reclamo si SLA vencido.
	if (isCancelledReservation && refundStatus === 'PENDING') {
		const claimBtn = root.querySelector<HTMLButtonElement>('[data-refund-claim-submit]');
		const claimStatus = root.querySelector<HTMLElement>('[data-refund-claim-status]');
		claimBtn?.addEventListener('click', async () => {
			if (claimStatus) claimStatus.textContent = 'Registrando reclamo…';
			claimBtn.disabled = true;
			const response = await fetch(
				`/api/public/reservations/${encodeURIComponent(token)}/refund-claim`,
				{
					method: 'POST',
					headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
					body: JSON.stringify({ notes: 'Reclamo desde enlace de reserva' }),
				}
			);
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				claimBtn.disabled = false;
				if (claimStatus) claimStatus.textContent = '';
				showToast(data.message || 'No fue posible registrar el reclamo.', 'error');
				return;
			}
			window.location.reload();
		});
		return;
	}

	if (isCancelledReservation || isPastReservation) return;

	const locations = normalizePublicBookingLocations(
		parseJsonScript<unknown[]>('reservation-locations-json') || []
	);
	const stadiaKey = String(root.dataset.stadiaKey || '').trim();

	const form = root.querySelector<HTMLFormElement>('[data-reservation-form]');
	const dateInput = root.querySelector<HTMLInputElement>('[data-reservation-date]');
	const slotInput = root.querySelector<HTMLInputElement>('[data-reservation-slot]');
	const locationInput = root.querySelector<HTMLInputElement>('[data-reservation-location]');
	const slotsContainer = root.querySelector<HTMLElement>('[data-reservation-slots-container]');
	const slotsPanel = root.querySelector<HTMLElement>('[data-reservation-slots-panel]');
	const slotsLoading = root.querySelector<HTMLElement>('[data-reservation-slots-loading]');
	const noSlots = root.querySelector<HTMLElement>('[data-no-reservation-slots]');
	const locationsGrid = root.querySelector<HTMLElement>('[data-reschedule-locations-grid]');
	const locationsLoading = root.querySelector<HTMLElement>('[data-reservation-locations-loading]');
	const noLocations = root.querySelector<HTMLElement>('[data-no-reservation-locations]');
	const selectedDateLabel = root.querySelector<HTMLElement>('[data-reservation-selected-date]');
	const cancelButton = root.querySelector<HTMLButtonElement>('[data-cancel-reservation]');
	const openRescheduleButton = root.querySelector<HTMLButtonElement>('[data-open-reschedule-modal]');
	const locationName = root.querySelector<HTMLElement>('[data-location-name]');
	const locationAddressEl = root.querySelector<HTMLElement>('[data-location-address]');
	const manageOpenMapButton = root.querySelector<HTMLButtonElement>('[data-manage-open-map]');
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
	const rescheduleStepCompactLabel = root.querySelector<HTMLElement>('[data-reschedule-step-compact-label]');
	const rescheduleStepProgressBar = root.querySelector<HTMLElement>('[data-reschedule-step-progress-bar]');
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
		!locationsGrid ||
		!locationsLoading ||
		!noLocations ||
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

	const start = reservationStart;
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
	let mapLibre: MapLibreModule | null = null;
	let mapInstance: InstanceType<MapLibreModule['Map']> | null = null;
	let mapMarker: InstanceType<MapLibreModule['Marker']> | null = null;
	let locationStackFocusIndex = 0;
	let locationsRenderAbort: AbortController | null = null;
	const availableDatesCache = new Map<string, Set<string>>();
	let availableDatesLoadingKey: string | null = null;
	let availableDatesRequestSeq = 0;

	locationInput.value = String(reservation.loc_id_location);

	const getLocationTargets = (): BookingLocation[] =>
		locations.length > 0
			? locations
			: defaultLocation.id_location
				? [defaultLocation]
				: [];

	const availableDatesMonthKey = (year: number, monthIndex: number) => {
		const ym = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
		const locIds = getLocationTargets()
			.map((loc) => loc.id_location)
			.sort((a, b) => a - b)
			.join(',');
		return `${reservation.pro_id_professional}|${reservation.ser_id_service}|${locIds}|${ym}`;
	};

	const fetchAvailableDatesForLocation = async (
		locationId: number,
		fromDate: string,
		toDate: string
	) => {
		const params = new URLSearchParams({
			pro_id: String(reservation.pro_id_professional),
			loc_id: String(locationId),
			ser_id: String(reservation.ser_id_service),
			from_date: fromDate,
			to_date: toDate,
		});
		if (reservation.id_appointment > 0) {
			params.set('exclude_app_id', String(reservation.id_appointment));
		}

		const response = await fetch(`/api/public/available-dates?${params.toString()}`, {
			headers: { Accept: 'application/json' },
			cache: 'no-store',
		});
		const data = await response.json().catch(() => ({}));
		if (!response.ok || data.status !== 'success' || !Array.isArray(data.data)) {
			return [] as string[];
		}
		return data.data
			.map((value: unknown) => String(value || '').trim())
			.filter((value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value));
	};

	const loadAvailableDatesForVisibleMonth = async (options?: { preferDate?: string }) => {
		const year = visibleMonth.getFullYear();
		const month = visibleMonth.getMonth();
		const cacheKey = availableDatesMonthKey(year, month);
		const ymPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
		const locationTargets = getLocationTargets();
		const prefer = String(options?.preferDate || '').trim();

		const applyPreferOrClear = (dates: Set<string>) => {
			if (prefer && dates.has(prefer) && prefer.startsWith(ymPrefix)) {
				selectedDate = prefer;
				dateInput.value = prefer;
				syncDateLabels(prefer);
				return;
			}
			if (selectedDate.startsWith(ymPrefix) && selectedDate && !dates.has(selectedDate)) {
				selectedDate = '';
				dateInput.value = '';
				syncDateLabels('');
			}
		};

		if (availableDatesCache.has(cacheKey)) {
			const dates = availableDatesCache.get(cacheKey)!;
			applyPreferOrClear(dates);
			renderCalendar();
			updateFooterButtons();
			return;
		}

		if (locationTargets.length === 0) {
			availableDatesCache.set(cacheKey, new Set());
			selectedDate = '';
			dateInput.value = '';
			renderCalendar();
			updateFooterButtons();
			return;
		}

		const reqId = ++availableDatesRequestSeq;
		availableDatesLoadingKey = cacheKey;
		renderCalendar();
		updateFooterButtons();

		try {
			const monthStart = new Date(year, month, 1);
			const fromDate = formatApiDate(
				monthStart.getTime() < today.getTime() ? today : monthStart
			);
			const toDate = formatApiDate(new Date(year, month + 1, 0));
			const results = await Promise.allSettled(
				locationTargets.map((loc) =>
					fetchAvailableDatesForLocation(loc.id_location, fromDate, toDate)
				)
			);
			if (reqId !== availableDatesRequestSeq) return;

			const union = new Set<string>();
			for (const result of results) {
				if (result.status !== 'fulfilled') continue;
				for (const date of result.value) union.add(date);
			}
			availableDatesCache.set(cacheKey, union);
			applyPreferOrClear(union);
		} catch {
			if (reqId !== availableDatesRequestSeq) return;
			availableDatesCache.set(cacheKey, new Set());
			selectedDate = '';
			dateInput.value = '';
		} finally {
			if (reqId !== availableDatesRequestSeq) return;
			availableDatesLoadingKey = null;
			renderCalendar();
			updateFooterButtons();
		}
	};

	const getSelectedSlotKey = () =>
		selectedSlot ? `${selectedLocationId}:${selectedSlot}` : '';

	const getLocationLabel = (location: BookingLocation) =>
		String(location.name || '').trim() ||
		String(location.address || '').trim() ||
		`Sucursal #${location.id_location}`;

	const getSelectedLocationGroup = () =>
		availableSlotGroups.find((group) => group.location.id_location === selectedLocationId) || null;

	const syncDateLabels = (ymd: string) => {
		const label = ymd ? formatLongDateFromApiDate(ymd) : '';
		if (selectedDateLabel) selectedDateLabel.textContent = label;
	};

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

	const ensureMapLibre = async (): Promise<MapLibreModule> => {
		if (!stadiaKey) {
			throw new Error('No se encontró la API key de Stadia Maps para mostrar la ubicación.');
		}
		if (!mapLibre) mapLibre = await loadMapLibre();
		return mapLibre;
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

			const maplibregl = await ensureMapLibre();
			if (!mapInstance) {
				mapInstance = new maplibregl.Map({
					container: mapCanvas,
					style: getStadiaStyleUrl(resolveMapTheme(), stadiaKey),
					center: [coords.lng, coords.lat],
					zoom: 16,
					attributionControl: { compact: true },
				});
				mapInstance.addControl(
					new maplibregl.NavigationControl({ showCompass: false }),
					'top-right'
				);
				mapMarker = createBrandMarker(maplibregl, coords, {
					color: '#FB7185',
					title: locationTitle,
				})
					.setPopup(new maplibregl.Popup({ closeButton: false, offset: 24 }).setText(locationTitle))
					.addTo(mapInstance);
			} else {
				mapInstance.setCenter([coords.lng, coords.lat]);
				mapInstance.setZoom(16);
				mapMarker?.setLngLat([coords.lng, coords.lat]);
				mapMarker?.setPopup(
					new maplibregl.Popup({ closeButton: false, offset: 24 }).setText(locationTitle)
				);
			}

			if (mapInstance) {
				scheduleMapLayout(mapInstance, coords);
			}
			window.setTimeout(() => {
				if (mapInstance) scheduleMapLayout(mapInstance, coords);
				setMapLoading(false);
			}, 80);
		} catch (error) {
			setMapStatus(error instanceof Error ? error.message : 'No fue posible mostrar el mapa.');
			setMapLoading(false);
		}
	};

	const updateLocationSummary = (location: BookingLocation) => {
		const label = getLocationLabel(location);
		if (locationName) locationName.textContent = label;
		const address = String(location.address || '').trim();
		if (locationAddressEl) {
			locationAddressEl.textContent = address || '—';
		}
		if (manageOpenMapButton) {
			manageOpenMapButton.setAttribute('aria-label', `Ver mapa de ${label}`);
		}
	};

	const capitalizeLabel = (value: string) =>
		value ? value.charAt(0).toUpperCase() + value.slice(1) : value;

	const formatCompareDate = (ymd: string) => capitalizeLabel(formatLongDateFromApiDate(ymd));

	const buildCompareCard = (options: {
		variant: 'previous' | 'next';
		label: string;
		dateLabel: string;
		timeLabel: string;
	}) => `
		<article class="reservation-change-compare__card reservation-change-compare__card--${options.variant}">
			<div class="reservation-change-compare__header">
				<span class="reservation-change-compare__heading">
					<span class="material-symbols-rounded" aria-hidden="true">calendar_month</span>
					<span class="reservation-change-compare__label">${escapeHtml(options.label)}</span>
				</span>
				<span class="material-symbols-rounded reservation-change-compare__clock" aria-hidden="true">schedule</span>
			</div>
			<div class="reservation-change-compare__body">
				<span class="reservation-change-compare__date">${escapeHtml(options.dateLabel)}</span>
				<strong class="reservation-change-compare__time">${escapeHtml(options.timeLabel)}</strong>
			</div>
		</article>
	`;

	const updateChangeSummary = () => {
		const currentStart = parseApiDateTime(reservation.start_time);
		if (!currentStart || !selectedDate || !selectedSlot) {
			changeSummary.innerHTML = '';
			return;
		}

		const previousDateLabel = formatCompareDate(formatApiDate(currentStart));
		const previousTimeLabel = formatApiTime(currentStart);
		const nextDateLabel = formatCompareDate(selectedDate);
		const nextTimeLabel = selectedSlot;
		const nextLocation =
			getLocationTargets().find((loc) => loc.id_location === selectedLocationId) ||
			(selectedLocationId === defaultLocation.id_location ? defaultLocation : null);
		const nextLocationLabel = nextLocation
			? getLocationLabel(nextLocation)
			: `Sucursal #${selectedLocationId}`;
		const locationChanged =
			selectedLocationId > 0 && selectedLocationId !== reservation.loc_id_location;

		changeSummary.innerHTML = `
			<div class="reservation-change-compare__row">
				${buildCompareCard({
					variant: 'previous',
					label: 'Anterior:',
					dateLabel: previousDateLabel,
					timeLabel: previousTimeLabel,
				})}
				<span class="reservation-change-compare__arrow material-symbols-rounded" aria-hidden="true">chevron_right</span>
				${buildCompareCard({
					variant: 'next',
					label: 'Nuevo:',
					dateLabel: nextDateLabel,
					timeLabel: nextTimeLabel,
				})}
			</div>
			${
				locationChanged
					? `<p class="reservation-change-compare__location">Nueva sucursal: <strong>${escapeHtml(nextLocationLabel)}</strong></p>`
					: ''
			}
		`;
	};

	const updateFooterButtons = () => {
		const isStep1 = rescheduleStep === 1;
		const isConfirmStep = rescheduleStep === 4;
		const hasLocations = availableSlotGroups.length > 0;
		const selectedGroup = getSelectedLocationGroup();
		const hasSlotsForLocation = Boolean(selectedGroup && selectedGroup.slots.length > 0);

		rescheduleBackButton.classList.toggle('is-hidden', isStep1);
		rescheduleBackButton.textContent = 'Volver';
		rescheduleNextButton.classList.toggle('is-hidden', isConfirmStep);
		rescheduleSubmitButton.classList.toggle('is-hidden', !isConfirmStep);

		if (isStep1) {
			const year = visibleMonth.getFullYear();
			const month = visibleMonth.getMonth();
			const isLoadingAvailability =
				availableDatesLoadingKey === availableDatesMonthKey(year, month);
			rescheduleNextButton.disabled = !selectedDate || isLoadingAvailability;
			return;
		}

		if (rescheduleStep === 2) {
			rescheduleNextButton.disabled =
				isLoadingSlots || !hasLocations || selectedLocationId <= 0;
			return;
		}

		if (rescheduleStep === 3) {
			rescheduleNextButton.disabled =
				isLoadingSlots || !selectedSlot || !hasSlotsForLocation;
			return;
		}

		rescheduleSubmitButton.disabled = !selectedDate || !selectedSlot || selectedLocationId <= 0;
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

		if (rescheduleStepCompactLabel) {
			rescheduleStepCompactLabel.textContent = `Paso ${nextStep} de ${RESCHEDULE_STEP_COUNT}: ${RESCHEDULE_STEP_LABELS[nextStep]}`;
		}
		if (rescheduleStepProgressBar) {
			rescheduleStepProgressBar.style.width = `${(nextStep / RESCHEDULE_STEP_COUNT) * 100}%`;
		}

		if (nextStep === 3) {
			const group = getSelectedLocationGroup();
			const orderedSlots = group
				? sortTimeSlotsChronologically(group.slots)
				: [];
			if (group && orderedSlots.length > 0) {
				group.slots = orderedSlots;
				// Empezar siempre por el primer horario disponible (más temprano).
				if (!selectedSlot || !orderedSlots.includes(selectedSlot)) {
					selectedSlot = orderedSlots[0];
					slotInput.value = orderedSlots[0];
					locationInput.value = String(group.location.id_location);
				}
			}
			renderSlotSections();
		}

		if (nextStep === 4) {
			updateChangeSummary();
		}

		updateFooterButtons();
	};

	const resetRescheduleFlow = (options?: { loadAvailability?: boolean }) => {
		selectedDate = '';
		selectedSlot = '';
		selectedLocationId = reservation.loc_id_location;
		availableSlotGroups = [];
		isLoadingSlots = false;
		availableDatesCache.clear();
		availableDatesLoadingKey = null;
		availableDatesRequestSeq += 1;
		dateInput.value = '';
		slotInput.value = '';
		locationInput.value = String(reservation.loc_id_location);
		visibleMonth = new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);
		slotsContainer.innerHTML = '';
		locationsGrid.innerHTML = '';
		noSlots.classList.add('hidden');
		noLocations.classList.add('hidden');
		if (slotsPanel) slotsPanel.classList.add('hidden');
		slotsLoading.classList.add('hidden');
		locationsLoading.classList.add('hidden');
		syncDateLabels('');
		setRescheduleStep(1);
		if (options?.loadAvailability !== false) {
			const preferDate = formatApiDate(initialDate);
			void loadAvailableDatesForVisibleMonth({ preferDate });
		}
	};

	const openRescheduleModal = () => {
		resetRescheduleFlow({ loadAvailability: true });
		if (!rescheduleModal.open) {
			rescheduleModal.showModal();
		}
	};

	const closeRescheduleModal = () => {
		if (rescheduleModal.open) {
			rescheduleModal.close();
		}
		resetRescheduleFlow({ loadAvailability: false });
	};

	const selectDate = (date: Date, options: { loadSlots?: boolean } = {}) => {
		const dateStart = toDateStart(date);
		const dateKey = formatApiDate(dateStart);
		if (dateStart.getTime() < today.getTime()) return;

		const cacheKey = availableDatesMonthKey(dateStart.getFullYear(), dateStart.getMonth());
		const availableDates = availableDatesCache.get(cacheKey);
		if (!availableDates?.has(dateKey)) return;

		selectedDate = dateKey;
		dateInput.value = dateKey;
		syncDateLabels(dateKey);
		selectedSlot = '';
		slotInput.value = '';
		availableSlotGroups = [];
		locationsGrid.innerHTML = '';
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

	const buildLocationCardContent = (location: BookingLocation) => {
		const name = getLocationLabel(location);
		const address = String(location.address || '').trim();
		const showMap = Boolean(getCoords(location));
		const preview = showMap
			? `<button type="button" class="public-location-card__preview public-location-card__preview--brand" data-location-map-trigger aria-label="Ver mapa de ${escapeHtml(name)}"><span class="public-location-card__preview-icon material-symbols-rounded" aria-hidden="true">location_on</span><span class="public-location-card__preview-label">Ver ubicación</span></button>`
			: '';
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

	const softSelectRescheduleLocation = (location: BookingLocation, stack?: HTMLElement | null) => {
		selectedLocationId = location.id_location;
		locationInput.value = String(location.id_location);
		selectedSlot = '';
		slotInput.value = '';
		const rootEl = stack || locationsGrid;
		for (const card of rootEl.querySelectorAll<HTMLElement>('.public-location-card')) {
			const id = Number(card.dataset.locationId || 0);
			card.classList.toggle('is-selected', id === location.id_location);
			card.setAttribute('aria-pressed', id === location.id_location ? 'true' : 'false');
		}
		updateFooterButtons();
	};

	const enrichLocationsWithCoordinates = async () => {
		const enriched = await Promise.all(
			availableSlotGroups.map(async (group) => {
				if (getCoords(group.location)) return group;
				try {
					const detailed = await fetchPublicLocationDetails(group.location);
					return { ...group, location: detailed };
				} catch {
					return group;
				}
			})
		);
		availableSlotGroups = enriched;
	};

	const renderLocationsStep = () => {
		locationsLoading.classList.toggle('hidden', !isLoadingSlots);
		locationsGrid.setAttribute('aria-busy', isLoadingSlots ? 'true' : 'false');

		const hasLocations = availableSlotGroups.length > 0;
		noLocations.classList.toggle('hidden', isLoadingSlots || hasLocations);

		locationsRenderAbort?.abort();
		locationsRenderAbort = new AbortController();
		const { signal } = locationsRenderAbort;

		if (isLoadingSlots) {
			locationsGrid.innerHTML = '';
			locationsGrid.classList.remove('is-location-stack');
			updateFooterButtons();
			return;
		}

		locationsGrid.innerHTML = '';
		if (!hasLocations) {
			locationsGrid.classList.remove('is-location-stack');
			updateFooterButtons();
			return;
		}

		const locations = availableSlotGroups.map((group) => group.location);
		const selectedIndex = locations.findIndex((loc) => loc.id_location === selectedLocationId);
		locationStackFocusIndex =
			selectedIndex >= 0
				? selectedIndex
				: Math.min(Math.max(0, locationStackFocusIndex), locations.length - 1);

		if (isMobileStack() && locations.length >= 1) {
			locationsGrid.classList.add('is-location-stack');

			const stackShell = document.createElement('div');
			stackShell.className = 'public-location-stack-shell';

			const stack = document.createElement('div');
			stack.className = `public-location-stack${locations.length === 1 ? ' is-single' : ''}`;
			stack.setAttribute('role', 'listbox');
			stack.setAttribute('aria-label', 'Sucursales disponibles');
			stack.tabIndex = 0;

			let shouldSuppressClick = () => false;

			const focusLocationAt = (index: number) => {
				if (shouldSuppressClick()) return;
				if (index === locationStackFocusIndex) return;
				const location = locations[index];
				if (!location) return;
				locationStackFocusIndex = index;
				syncStackLayers(stack, locationStackFocusIndex, 'data-location-stack-index', {
					farLevels: true,
				});
				softSelectRescheduleLocation(location, stack);
			};

			for (const [index, location] of locations.entries()) {
				const card = document.createElement('div');
				card.setAttribute('role', 'option');
				card.dataset.locationStackIndex = String(index);
				card.dataset.locationId = String(location.id_location);
				card.className = `public-location-card${
					location.id_location === selectedLocationId ? ' is-selected' : ''
				}`;
				card.innerHTML = buildLocationCardContent(location);

				const focusThisCard = () => focusLocationAt(index);

				// Toda la card enfoca (no solo el botón main) — más fiable en iOS.
				card.addEventListener(
					'click',
					(event) => {
						if (shouldSuppressClick()) {
							event.preventDefault();
							event.stopPropagation();
							return;
						}
						const target = event.target;
						if (
							target instanceof Element &&
							target.closest('[data-location-map-trigger]') &&
							index === locationStackFocusIndex
						) {
							return;
						}
						focusThisCard();
					},
					{ signal }
				);

				bindMapImageLifecycle(card, {
					signal,
					onOpenMap: () => {
						if (shouldSuppressClick()) return;
						if (index !== locationStackFocusIndex) {
							focusThisCard();
							return;
						}
						void openLocationMap(location);
					},
				});
				stack.appendChild(card);
			}

			const gestureApi = bindVerticalStackGestures(stack, {
				signal,
				itemCount: locations.length,
				getFocusIndex: () => locationStackFocusIndex,
				setFocusIndex: (index) => {
					locationStackFocusIndex = index;
				},
				onFocusChanged: () => {
					syncStackLayers(stack, locationStackFocusIndex, 'data-location-stack-index', {
						farLevels: true,
					});
					const location = locations[locationStackFocusIndex];
					if (location) softSelectRescheduleLocation(location, stack);
				},
				onContinue: () => {
					const location = locations[locationStackFocusIndex];
					if (location) softSelectRescheduleLocation(location, stack);
				},
			});
			shouldSuppressClick = gestureApi.shouldSuppressClick;

			syncStackLayers(stack, locationStackFocusIndex, 'data-location-stack-index', {
				farLevels: true,
			});
			const focused = locations[locationStackFocusIndex];
			if (focused) softSelectRescheduleLocation(focused, stack);

			stackShell.appendChild(stack);
			locationsGrid.appendChild(stackShell);
			updateFooterButtons();
			return;
		}

		locationsGrid.classList.remove('is-location-stack');
		for (const location of locations) {
			const isSelected = location.id_location === selectedLocationId;
			const card = document.createElement('div');
			card.className = `public-location-card${isSelected ? ' is-selected' : ''}`;
			card.dataset.locationId = String(location.id_location);
			card.innerHTML = buildLocationCardContent(location);
			card.querySelector<HTMLButtonElement>('.public-location-card__main')?.addEventListener(
				'click',
				() => softSelectRescheduleLocation(location),
				{ signal }
			);
			bindMapImageLifecycle(card, {
				signal,
				onOpenMap: () => {
					void openLocationMap(location);
				},
			});
			locationsGrid.appendChild(card);
		}

		updateFooterButtons();
	};

	const renderSlotSections = () => {
		slotsLoading.classList.toggle('hidden', !isLoadingSlots);

		const selectedGroup = getSelectedLocationGroup();
		const totalSlots = selectedGroup?.slots.length || 0;
		noSlots.classList.toggle('hidden', isLoadingSlots || totalSlots > 0);
		if (slotsPanel) {
			slotsPanel.classList.toggle('hidden', isLoadingSlots);
		}

		if (isLoadingSlots) {
			slotsContainer.innerHTML = '';
			updateFooterButtons();
			return;
		}

		mountPublicSlotBranches({
			container: slotsContainer,
			groups: selectedGroup
				? [
						{
							...selectedGroup,
							slots: sortTimeSlotsChronologically(selectedGroup.slots),
						},
					]
				: [],
			selectedSlotKey: getSelectedSlotKey(),
			useRoulette: isMobileSlotRouletteViewport(),
			showLocationHeader: false,
			onSelect: (locationId, slot) => {
				selectedSlot = slot;
				selectedLocationId = locationId;
				slotInput.value = slot;
				locationInput.value = String(locationId);
				updateFooterButtons();
			},
		});

		updateFooterButtons();
	};

	const loadSlots = async (targetDate: string) => {
		if (!targetDate) return;

		isLoadingSlots = true;
		availableSlotGroups = [];
		selectedSlot = '';
		slotInput.value = '';
		renderLocationsStep();
		if (rescheduleStep === 3) renderSlotSections();
		updateFooterButtons();

		try {
			const locationTargets = getLocationTargets();

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

			const preferredStillAvailable = availableSlotGroups.some(
				(group) => group.location.id_location === selectedLocationId
			);
			if (!preferredStillAvailable) {
				selectedLocationId = availableSlotGroups[0]?.location.id_location || 0;
			}
			locationInput.value = selectedLocationId ? String(selectedLocationId) : '';
			await enrichLocationsWithCoordinates();
		} catch (error) {
			availableSlotGroups = [];
			showToast(
				error instanceof Error ? error.message : 'No fue posible cargar horarios.',
				'error'
			);
		} finally {
			isLoadingSlots = false;
			renderLocationsStep();
			if (rescheduleStep === 3) renderSlotSections();
			updateFooterButtons();
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
		const cacheKey = availableDatesMonthKey(year, month);
		const availableDates = availableDatesCache.get(cacheKey);
		const isLoadingAvailability = availableDatesLoadingKey === cacheKey;
		const calendarRoot = calendarGrid.closest('.public-booking-calendar');
		calendarRoot?.classList.toggle('is-loading-availability', isLoadingAvailability);
		calendarGrid.classList.toggle('is-loading', isLoadingAvailability);
		calendarGrid.setAttribute('aria-busy', isLoadingAvailability ? 'true' : 'false');

		for (let blank = 0; blank < firstWeekday; blank += 1) {
			const placeholder = document.createElement('span');
			placeholder.className = 'public-cal-day--empty';
			calendarGrid.appendChild(placeholder);
		}

		for (let day = 1; day <= daysInMonth; day += 1) {
			const dateValue = new Date(year, month, day);
			const dateKey = formatApiDate(dateValue);
			const dateStart = toDateStart(dateValue);
			const isPast = dateStart.getTime() < today.getTime();
			const isToday = dateStart.getTime() === today.getTime();
			const isSelected = selectedDate === dateKey;

			if (isLoadingAvailability && !isPast) {
				const skeleton = document.createElement('span');
				skeleton.className = 'public-cal-day--skeleton';
				skeleton.setAttribute('aria-hidden', 'true');
				calendarGrid.appendChild(skeleton);
				continue;
			}

			// Solo días con horarios (API available-dates), igual que reserva pública.
			const isUnavailable =
				!isPast && (availableDates ? !availableDates.has(dateKey) : true);

			const dayButton = document.createElement('button');
			dayButton.type = 'button';
			dayButton.textContent = String(day);
			dayButton.disabled = isPast || isUnavailable;
			dayButton.className = [
				isSelected ? 'is-selected' : '',
				isToday ? 'is-today' : '',
				isPast ? 'is-past' : '',
				isUnavailable ? 'is-unavailable' : '',
			]
				.filter(Boolean)
				.join(' ');
			if (isUnavailable && !isPast) {
				dayButton.title = 'Sin horarios disponibles';
			}

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

		applyTicketSummary(
			nextStart,
			updated.status || reservation.status || '',
			isReservationPast(updated)
		);
		const matchedLocation =
			getLocationTargets().find((loc) => loc.id_location === reservation.loc_id_location) || {
				id_location: reservation.loc_id_location,
				name: reservation.location_name,
				address: reservation.location_address || '',
			};
		updateLocationSummary(matchedLocation);
		locationInput.value = String(reservation.loc_id_location);
		selectedLocationId = reservation.loc_id_location;
		return true;
	};

	// Seña pendiente: permite subir/resubir el comprobante SIPAP sin salir de esta
	// página (evita que el cliente tenga que escribir por WhatsApp ante un rechazo).
	const depositRoot = root.querySelector<HTMLElement>('[data-reservation-deposit]');
	const sipapPanel = depositRoot?.querySelector<HTMLElement>('[data-step-panel]') ?? null;
	if (depositRoot && sipapPanel) {
		sipapPanel.classList.remove('hidden');
		fillSipapDepositPanel(
			sipapPanel,
			{
				deposit_amount: reservation.deposit_amount ?? undefined,
				payment_reference: reservation.payment_reference ?? undefined,
				payment_expires_at: reservation.payment_expires_at ?? undefined,
				sipap: reservation.deposit_settings?.sipap ?? undefined,
				refund_policy: reservation.policy_code_snapshot ?? undefined,
				refund_policy_label: reservation.policy_label ?? undefined,
				ocr_status: reservation.ocr_status ?? undefined,
				reject_reason: reservation.reject_reason ?? undefined,
				public_manage_token: token,
			},
			reservation.deposit_settings ?? undefined,
			{
				serviceName: reservation.service_name,
				professionalName: reservation.professional_name,
				depositAmount: reservation.deposit_amount ?? undefined,
			}
		);
		bindSipapCopyButtons(depositRoot);
		bindSipapReceiptUpload(sipapPanel, {
			onResult: (result) => {
				depositRoot.querySelector('[data-deposit-reject-notice]')?.remove();
				const ocr = String(result.ocr_status || '').toUpperCase();
				showToast(
					result.message ||
						(ocr === 'MATCH'
							? 'Pago verificado. Tu turno quedó confirmado.'
							: 'Comprobante recibido.'),
					'success'
				);
				void refreshReservationSummary();
			},
			onError: (message) => showToast(message, 'error'),
		});
	}

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
			if (selectedLocationId <= 0) {
				showToast('Selecciona una sucursal.', 'error');
				return;
			}
			if (!getSelectedLocationGroup()) {
				showToast('Esa sucursal no tiene horarios para este día.', 'error');
				return;
			}
			selectedSlot = '';
			slotInput.value = '';
			setRescheduleStep(3);
			return;
		}

		if (rescheduleStep === 3) {
			if (!selectedSlot) {
				showToast('Selecciona un horario.', 'error');
				return;
			}
			setRescheduleStep(4);
		}
	};

	const handleRescheduleBack = () => {
		if (rescheduleStep === 2) {
			setRescheduleStep(1);
			return;
		}

		if (rescheduleStep === 3) {
			selectedSlot = '';
			slotInput.value = '';
			setRescheduleStep(2);
			return;
		}

		if (rescheduleStep === 4) {
			setRescheduleStep(3);
		}
	};

	openRescheduleButton.addEventListener('click', openRescheduleModal);

	manageOpenMapButton?.addEventListener('click', () => {
		const currentLocId = toPositiveInt(locationInput.value, selectedLocationId);
		const target =
			locations.find((loc) => loc.id_location === currentLocId) ||
			(defaultLocation.id_location ? defaultLocation : null);
		if (target) void openLocationMap(target);
	});

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
		void loadAvailableDatesForVisibleMonth();
	});

	nextMonthButton.addEventListener('click', () => {
		visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
		void loadAvailableDatesForVisibleMonth();
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

	const cancelRefundModal = root.querySelector<HTMLDialogElement>('[data-cancel-refund-modal]');
	const cancelRefundForm = root.querySelector<HTMLFormElement>('[data-cancel-refund-form]');
	const cancelRefundAlias = root.querySelector<HTMLInputElement>('[data-cancel-refund-alias]');
	const cancelRefundSubmit = root.querySelector<HTMLButtonElement>('[data-cancel-refund-submit]');
	const cancelRefundSummary = root.querySelector<HTMLElement>('[data-cancel-refund-summary]');

	const syncCancelRefundSubmit = () => {
		if (!cancelRefundAlias) return;
		const cleaned = sanitizeSipapAliasInput(cancelRefundAlias.value);
		if (cancelRefundAlias.value !== cleaned) cancelRefundAlias.value = cleaned;
		if (cancelRefundSubmit) cancelRefundSubmit.disabled = !parseSipapAlias(cleaned).isValid;
	};

	cancelRefundAlias?.addEventListener('input', syncCancelRefundSubmit);
	cancelRefundAlias?.addEventListener('paste', () => {
		requestAnimationFrame(syncCancelRefundSubmit);
	});
	syncCancelRefundSubmit();

	cancelButton.addEventListener('click', async () => {
		const preview = reservation.refund_preview;
		const requiresAlias = Boolean(preview?.requires_alias && (preview.amount || 0) > 0);

		const doCancel = async (refundAlias?: string) => {
			const response = await fetch(`/api/public/reservations/${encodeURIComponent(token)}`, {
				method: 'DELETE',
				headers: {
					Accept: 'application/json',
					...(refundAlias ? { 'Content-Type': 'application/json' } : {}),
				},
				body: refundAlias ? JSON.stringify({ refund_alias: refundAlias }) : undefined,
			});
			const data = await response.json().catch(() => ({}));
			if (response.ok) {
				window.location.reload();
				return;
			}
			showToast(data.message || 'No fue posible cancelar tu cita.', 'error');
		};

		if (requiresAlias && cancelRefundModal && cancelRefundForm && cancelRefundAlias) {
			if (cancelRefundSummary) {
				const amount = document.createElement('strong');
				amount.textContent = formatMoney(preview?.amount || 0);
				cancelRefundSummary.replaceChildren(
					'Te corresponde un reembolso de ',
					amount,
					'. Ingresá tu alias SIPAP para recibirlo.'
				);
			}
			cancelRefundAlias.value = '';
			syncCancelRefundSubmit();
			if (!cancelRefundModal.open) cancelRefundModal.showModal();

			const onClose = () => cancelRefundModal.close();
			root.querySelectorAll('[data-cancel-refund-close]').forEach((el) => {
				el.addEventListener('click', onClose, { once: true });
			});

			cancelRefundForm.onsubmit = async (event) => {
				event.preventDefault();
				const parsed = parseSipapAlias(cancelRefundAlias.value);
				if (!parsed.isValid) {
					showToast(parsed.message || SIPAP_ALIAS_ERROR, 'error');
					return;
				}
				cancelRefundModal.close();
				await doCancel(parsed.normalized);
			};
			return;
		}

		const noRefundHint = formatCustomerCancelNoRefundHint(preview, {
			depositAmount: Number(reservation.deposit_amount || 0),
			startTime: reservation.start_time,
		});

		const confirmed = window.BookmateAlert?.confirm
			? await window.BookmateAlert.confirm({
					type: 'warning',
					title: '¿Cancelar tu reserva?',
					message: `Tu turno será cancelado definitivamente.${noRefundHint} ¿Deseas continuar?`,
					confirmText: 'Sí, cancelar',
					cancelText: 'Mantener reserva',
				})
			: window.confirm('¿Quieres cancelar esta reserva?');
		if (!confirmed) return;

		await doCancel();
	});
};
