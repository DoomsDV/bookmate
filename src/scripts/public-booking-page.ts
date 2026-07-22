import {
	buildApiAppointmentTimes,
	formatApiDate,
	formatLongDateFromApiDate,
	formatShortDateFromApiDate,
	getTodayStart,
	isValidApiTimeSlot,
	sortTimeSlotsChronologically,
	toDateStart,
} from '../lib/booking-datetime';
import {
	mergePublicBookingLocations,
	normalizePublicBookingLocations,
} from '../lib/public-booking-locations';
import {
	formatParaguayMobilePhoneInput,
	PARAGUAY_MOBILE_PHONE_ERROR,
	parseParaguayMobilePhone,
	toParaguayMobileE164FromInput,
} from '../lib/paraguay-phone';
import {
	createDraftPersister,
	proBookingDraftKey,
	readPublicBookingDraft,
	SLOT_UNAVAILABLE_RESTORE_MESSAGE,
	type PublicBookingDraft,
	type PublicBookingDraftStep,
} from '../lib/public-booking-draft';
import {
	bindSipapCopyButtons,
	bindSipapReceiptUpload,
	fillSipapDepositPanel,
	isDepositsEnabled,
	POLICY_SUMMARIES,
	normalizePolicyCode,
	stopSipapHoldCountdown,
	unwrapSipapHold,
	type PublicDepositSettings,
} from './public-deposit-sipap';

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type BookingService = {
	id_service: number;
	name: string;
	duration_minutes: number;
	price: number;
	requires_deposit?: 0 | 1;
	deposit_type?: 'PERCENT' | 'FIXED' | null;
	deposit_value?: number | null;
	deposit_amount?: number | null;
	hide_public_price?: 0 | 1;
	hidden_price_label?: string | null;
};

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

type BookingProfile = {
	id_professional: number;
	org_id_organization: number;
	full_name: string;
	specialty: string;
	image_url: string;
	services: BookingService[];
	locations?: BookingLocation[];
	deposit_settings?: PublicDepositSettings | null;
};

type ValidateCustomerApiData = {
	id_customer?: number;
	full_name?: string;
};

type ValidateCustomerApiResponse = {
	status?: string;
	message?: string;
	exists?: boolean;
	data?: ValidateCustomerApiData | null;
};

type CreatedAppointmentApiData = {
	appointment_id?: number;
	start_time?: string;
	end_time?: string;
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

const toPositiveInt = (value: unknown, fallback = 1) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const formatDuration = (totalMinutes: number) => {
	if (totalMinutes < 60) {
		return `${totalMinutes} min`;
	}
	
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	
	if (minutes === 0) {
		return `${hours} h`;
	}
	
	return `${hours} h ${minutes} min`;
};

const calculateDepositAmount = (service: BookingService | null) => {
	if (!service || Number(service.requires_deposit || 0) !== 1) return 0;

	const fromApi = Number(service.deposit_amount ?? NaN);
	if (Number.isFinite(fromApi) && fromApi > 0) return fromApi;

	const depositType = String(service.deposit_type || '').trim().toUpperCase();
	const depositValue = Number(service.deposit_value || 0);
	const price = Number(service.price || 0);

	if (depositType === 'PERCENT') {
		return Math.round((price * depositValue) / 100);
	}
	if (depositType === 'FIXED') {
		return depositValue;
	}
	return 0;
};

/** Flujo de seña: transferencia SIPAP (Pagopar de señas deprecado). */

const formatCurrency = (value: number) =>
	new Intl.NumberFormat('es-PY', {
		style: 'currency',
		currency: 'PYG',
		maximumFractionDigits: 0,
	}).format(Number.isFinite(value) ? value : 0);

const getBookingRoot = (): HTMLElement | null => {
	const scopedMatch = window.location.pathname.match(/\/([^/?#]+)\/p\/([^/?#]+)/);
	const orgSlug = scopedMatch?.[1]?.trim() || '';
	const proSlug = scopedMatch?.[2]?.trim() || '';

	if (orgSlug && proSlug) {
		const escapeAttr = (value: string) =>
			typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
				? CSS.escape(value)
				: value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

		const scopedRoot = document.querySelector<HTMLElement>(
			`[data-public-booking-root][data-organization-slug="${escapeAttr(orgSlug)}"][data-professional-slug="${escapeAttr(proSlug)}"]`
		);
		if (scopedRoot) return scopedRoot;
	}

	const legacySlug = window.location.pathname.match(/\/p\/([^/?#]+)/)?.[1]?.trim();
	if (legacySlug) {
		const escapedSlug =
			typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
				? CSS.escape(legacySlug)
				: legacySlug.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
		const scopedRoot = document.querySelector<HTMLElement>(
			`[data-public-booking-root][data-professional-slug="${escapedSlug}"]`
		);
		if (scopedRoot) return scopedRoot;
	}

	const roots = document.querySelectorAll<HTMLElement>('[data-public-booking-root]');
	return roots.length ? roots[roots.length - 1] : null;
};

const parseProfileFromDom = (root: HTMLElement) => {
	const profileNode = root.querySelector<HTMLElement>('#public-booking-profile-json');
	if (!profileNode) return null;

	try {
		const parsed = JSON.parse(profileNode.textContent || '{}') as BookingProfile;
		if (!parsed || typeof parsed !== 'object') return null;
		if (!Array.isArray(parsed.services)) parsed.services = [];
		parsed.locations = normalizePublicBookingLocations(parsed.locations);
		return parsed;
	} catch {
		return null;
	}
};

const parseJsonScript = <T>(root: HTMLElement, id: string): T | null => {
	const node = root.querySelector<HTMLElement>(`#${id}`);
	if (!node?.textContent) return null;

	try {
		return JSON.parse(node.textContent) as T;
	} catch {
		return null;
	}
};

const mergeBookingLocations = mergePublicBookingLocations;

const readApiMessage = (data: any, fallbackMessage: string) => {
	const message = typeof data?.message === 'string' ? data.message.trim() : '';
	return message || fallbackMessage;
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

class PublicBookingClientError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = 'PublicBookingClientError';
		this.status = status;
	}
}

const fetchJson = async <T>(url: string, init: RequestInit, fallbackMessage: string) => {
	const response = await fetch(url, init);
	const data = await response.json().catch(() => null) as T & { status?: string; message?: string };

	if (!response.ok || !data || data.status !== 'success') {
		throw new PublicBookingClientError(readApiMessage(data, fallbackMessage), response.status || 500);
	}

	return { response, data };
};

const bookingPageControllers = new WeakMap<HTMLElement, AbortController>();

export const initializePublicBookingPage = () => {
	const root = getBookingRoot();
	if (!root) return;

	bookingPageControllers.get(root)?.abort();
	const pageController = new AbortController();
	bookingPageControllers.set(root, pageController);
	const { signal } = pageController;

	const profile = parseProfileFromDom(root);
	if (!profile) return;

	const servicesGrid = root.querySelector<HTMLElement>('[data-services-grid]');
	const locationsGrid = root.querySelector<HTMLElement>('[data-locations-grid]');
	const calendarMonth = root.querySelector<HTMLElement>('[data-calendar-month]');
	const calendarGrid = root.querySelector<HTMLElement>('[data-calendar-grid]');
	const slotsContainer = root.querySelector<HTMLElement>('[data-slots-container]');
	const noSlotsNode = root.querySelector<HTMLElement>('[data-no-slots]');
	const slotsLoadingNode = root.querySelector<HTMLElement>('[data-slots-loading]');
	const customerForm = root.querySelector<HTMLFormElement>('[data-customer-form]');
	const customerNameWrapper = customerForm?.querySelector<HTMLElement>('[data-customer-name-wrapper]');
	const customerNameInput = customerForm?.querySelector<HTMLInputElement>('[name="customer_name"]');
	const customerNameFieldError = customerForm?.querySelector<HTMLElement>(
		'[data-field-error="customer_name"]'
	);
	const customerPhoneInput = customerForm?.querySelector<HTMLInputElement>('[name="customer_phone"]');
	const customerPhoneFieldError = customerForm?.querySelector<HTMLElement>(
		'[data-field-error="customer_phone"]'
	);
	const submitButton = root.querySelector<HTMLButtonElement>('[data-submit-booking]');
	const payDepositButton = root.querySelector<HTMLButtonElement>('[data-pay-deposit-submit]');
	const depositPolicyWrap = root.querySelector<HTMLElement>('[data-deposit-policy-wrap]');
	const depositPolicyAccept = root.querySelector<HTMLInputElement>('[data-deposit-policy-accept]');
	const depositPolicySummary = root.querySelector<HTMLElement>('[data-deposit-policy-summary]');
	const submitErrorNode = root.querySelector<HTMLElement>('[data-submit-error]');
	const toastNode = root.querySelector<HTMLElement>('[data-booking-toast]');

	const summaryServiceInline = root.querySelector<HTMLElement>('[data-summary-service-inline]');
	const summaryDateInline = root.querySelector<HTMLElement>('[data-summary-date-inline]');
	const summaryProfessional = root.querySelector<HTMLElement>('[data-summary-professional]');
	const summaryService = root.querySelector<HTMLElement>('[data-summary-service]');
	const summaryDepositWrap = root.querySelector<HTMLElement>('[data-summary-deposit-wrap]');
	const summaryDeposit = root.querySelector<HTMLElement>('[data-summary-deposit]');
	const summaryDate = root.querySelector<HTMLElement>('[data-summary-date]');
	const summaryTime = root.querySelector<HTMLElement>('[data-summary-time]');
	const summaryLocation = root.querySelector<HTMLButtonElement>('[data-summary-location]');
	const ticketProfessional = root.querySelector<HTMLElement>('[data-ticket-professional]');
	const ticketService = root.querySelector<HTMLElement>('[data-ticket-service]');
	const ticketDate = root.querySelector<HTMLElement>('[data-ticket-date]');
	const ticketTime = root.querySelector<HTMLElement>('[data-ticket-time]');
	const stepCompactLabel = root.querySelector<HTMLElement>('[data-step-compact-label]');
	const stepProgressBar = root.querySelector<HTMLElement>('[data-step-progress-bar]');
	const bookingProfileHeader = root.querySelector<HTMLElement>('[data-booking-profile-header]');
	const mapModal = root.querySelector<HTMLDialogElement>('[data-public-map-modal]');
	const mapCanvasWrap = root.querySelector<HTMLElement>('.public-map-canvas-wrap');
	const mapCanvas = root.querySelector<HTMLElement>('[data-public-map-canvas]');
	const mapLoading = root.querySelector<HTMLElement>('[data-public-map-loading]');
	const mapAddress = root.querySelector<HTMLElement>('[data-public-map-address]');
	const mapStatus = root.querySelector<HTMLElement>('[data-public-map-status]');
	const mapCloseButton = root.querySelector<HTMLButtonElement>('[data-public-map-close]');

	const stepItems = root.querySelectorAll<HTMLElement>('[data-step-item]');
	const stepPanels = root.querySelectorAll<HTMLElement>('[data-step-panel]');
	const prevMonthButton = root.querySelector<HTMLButtonElement>('[data-calendar-prev]');
	const nextMonthButton = root.querySelector<HTMLButtonElement>('[data-calendar-next]');
	const backToServices = root.querySelector<HTMLButtonElement>('[data-back-to-services]');
	const backToLocations = root.querySelector<HTMLButtonElement>('[data-back-to-locations]');
	const backToCalendarButtons = root.querySelectorAll<HTMLButtonElement>('[data-back-to-calendar]');
	const backToSlots = root.querySelector<HTMLButtonElement>('[data-back-to-slots]');
	const restartButtons = root.querySelectorAll<HTMLButtonElement>('[data-restart-booking]');

	if (
		!servicesGrid ||
		!locationsGrid ||
		!calendarMonth ||
		!calendarGrid ||
		!slotsContainer ||
		!noSlotsNode ||
		!slotsLoadingNode ||
		!customerForm ||
		!customerNameWrapper ||
		!customerNameInput ||
		!customerPhoneInput ||
		!submitButton ||
		!payDepositButton ||
		!summaryDateInline ||
		!summaryService ||
		!summaryDepositWrap ||
		!summaryDeposit ||
		!summaryDate ||
		!summaryTime ||
		!summaryLocation ||
		!ticketProfessional ||
		!ticketService ||
		!ticketDate ||
		!ticketTime ||
		!mapModal ||
		!mapCanvas ||
		!mapCloseButton ||
		!prevMonthButton ||
		!nextMonthButton ||
		!backToServices ||
		!backToLocations ||
		!backToCalendarButtons.length ||
		!backToSlots ||
		restartButtons.length === 0
	) {
		return;
	}

	const configuredLocationId = toPositiveInt(root.dataset.locationId, 0);
	const organizationSlug = String(root.dataset.organizationSlug || '').trim();
	const professionalSlug = String(root.dataset.professionalSlug || '').trim();
	let bookingLocations = mergeBookingLocations(
		normalizePublicBookingLocations(
			parseJsonScript<unknown[]>(root, 'public-booking-locations-json')
		),
		normalizePublicBookingLocations(profile.locations)
	);
	const defaultLocation =
		bookingLocations.find((location) => location.id_location === configuredLocationId) ??
		bookingLocations[0] ??
		null;
	const mapsApiKey = String(root.dataset.googleMapsApiKey || '').trim();
	const today = getTodayStart();

	let step: WizardStep = 1;
	let selectedService: BookingService | null = null;
	let selectedDate = '';
	let selectedTime = '';
	let selectedLocation: BookingLocation | null = defaultLocation;
	let availableSlotGroups: LocationSlotGroup[] = [];
	let visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
	let isLoadingSlots = false;
	let isSubmitting = false;
	let isValidatingCustomer = false;
	let pendingAppointmentId = 0;
	let pendingSipapHold: ReturnType<typeof unwrapSipapHold> | null = null;
	let customerValidationSeq = 0;
	let validatedCustomerPhoneE164 = '';
	let mapInstance: any = null;
	let mapMarker: any = null;
	let mapOpenSeq = 0;

	const draftStorageKey = proBookingDraftKey(organizationSlug, professionalSlug);
	const draftPersister = createDraftPersister(draftStorageKey, () => {
		if (step >= 6 || !selectedService) return null;
		const draftStep = (step <= 5 ? step : 5) as PublicBookingDraftStep;
		return {
			v: 1 as const,
			step: draftStep,
			serviceId: selectedService.id_service,
			locationId: selectedLocation?.id_location ?? null,
			date: selectedDate,
			time: selectedTime,
			phone: customerPhoneInput.value,
			name: customerNameInput.value,
			policyAccepted: Boolean(depositPolicyAccept?.checked),
			savedAt: Date.now(),
		} satisfies PublicBookingDraft;
	});

	let toastTimer: number | null = null;
	const stepLabelByNumber: Record<1 | 2 | 3 | 4 | 5, string> = {
		1: 'Servicio',
		2: 'Sucursal',
		3: 'Fecha',
		4: 'Horario',
		5: 'Datos',
	};

	const hasMultipleLocations = () => bookingLocations.length > 1;
	const stepAfterService = (): WizardStep => (hasMultipleLocations() ? 2 : 3);
	const stepBeforeDate = (): WizardStep => (hasMultipleLocations() ? 2 : 1);

	const showToast = (message: string, kind: 'success' | 'error' = 'error', durationMs = 3600) => {
		if (!toastNode) return;
		toastNode.textContent = message;
		toastNode.classList.remove('hidden', 'is-success', 'is-error');
		toastNode.classList.add(kind === 'success' ? 'is-success' : 'is-error');

		if (toastTimer) window.clearTimeout(toastTimer);
		toastTimer = window.setTimeout(() => {
			toastNode.classList.add('hidden');
			toastNode.classList.remove('is-success', 'is-error');
		}, durationMs);
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

	const getLocationCoordinates = () => getLocationCoordinatesFrom(selectedLocation);

	const canShowLocationMap = (location: BookingLocation | null | undefined) =>
		Boolean(location && toPositiveInt(location.id_location, 0));

	const fetchPublicLocationDetails = async (location: BookingLocation): Promise<BookingLocation> => {
		const { data } = await fetchJson<{ data?: unknown[] }>(
			`/api/public/locations/${location.id_location}`,
			{
				method: 'GET',
				headers: { Accept: 'application/json' },
				cache: 'no-store',
			},
			'No fue posible obtener la ubicación.'
		);

		const item = Array.isArray(data.data) ? data.data[0] : data.data;
		if (!item || typeof item !== 'object') {
			throw new PublicBookingClientError('No fue posible obtener la ubicación.', 502);
		}

		const source = item as Record<string, unknown>;
		const latitude = Number(source.latitude);
		const longitude = Number(source.longitude);

		return {
			...location,
			address: String(source.address || location.address || '').trim(),
			latitude: Number.isFinite(latitude) ? latitude : location.latitude,
			longitude: Number.isFinite(longitude) ? longitude : location.longitude,
		};
	};

	const applyLocationUpdate = (updated: BookingLocation) => {
		const locationId = toPositiveInt(updated.id_location, 0);
		if (!locationId) return;

		if (selectedLocation?.id_location === locationId) {
			selectedLocation = updated;
		}

		bookingLocations = bookingLocations.map((location) =>
			location.id_location === locationId ? updated : location
		);

		for (const group of availableSlotGroups) {
			if (group.location.id_location === locationId) {
				group.location = updated;
			}
		}
	};

	const resolveLocationForSelectedSlot = (): BookingLocation | null => {
		if (!selectedLocation) return null;

		const locationId = toPositiveInt(selectedLocation.id_location, 0);
		if (!locationId || !selectedTime) return selectedLocation;

		const matchedGroup = availableSlotGroups.find(
			(group) =>
				toPositiveInt(group.location.id_location, 0) === locationId &&
				group.slots.includes(selectedTime)
		);

		return matchedGroup?.location ?? selectedLocation;
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
				existingScript.addEventListener('load', () => {
					const maps = (window as WindowWithGoogleMaps).google?.maps;
					maps ? resolve(maps) : reject(new Error('No fue posible cargar Google Maps.'));
				}, { once: true });
				existingScript.addEventListener('error', () => reject(new Error('No fue posible cargar Google Maps.')), { once: true });
				return;
			}

			const script = document.createElement('script');
			script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsApiKey)}&v=weekly`;
			script.async = true;
			script.defer = true;
			script.dataset.googleMapsLoader = 'true';
			script.addEventListener('load', () => {
				const maps = (window as WindowWithGoogleMaps).google?.maps;
				maps ? resolve(maps) : reject(new Error('No fue posible cargar Google Maps.'));
			}, { once: true });
			script.addEventListener('error', () => reject(new Error('No fue posible cargar Google Maps.')), { once: true });
			document.head.appendChild(script);
		});

		try {
			return await win.__bookmateGoogleMapsLoader;
		} catch (error) {
			win.__bookmateGoogleMapsLoader = null;
			throw error;
		}
	};

	type OpenLocationMapOptions = {
		fetchCoordinates?: boolean;
	};

	const openLocationMap = async (
		location: BookingLocation | null = selectedLocation,
		options: OpenLocationMapOptions = {}
	) => {
		if (!canShowLocationMap(location)) return;

		const requestedLocationId = toPositiveInt(location!.id_location, 0);
		const openSeq = ++mapOpenSeq;
		const shouldFetchCoordinates = options.fetchCoordinates === true;
		const isActiveMapOpen = (locationId = requestedLocationId) =>
			openSeq === mapOpenSeq && toPositiveInt(locationId, 0) === requestedLocationId;

		setMapStatus('');
		if (mapAddress) mapAddress.textContent = location?.address || '';
		if (!mapModal.open) mapModal.showModal();

		setMapLoading(true);

		try {
			let mapLocation = location!;
			let coords = getLocationCoordinatesFrom(mapLocation);

			if (shouldFetchCoordinates || !coords) {
				try {
					mapLocation = await fetchPublicLocationDetails(mapLocation);
					if (!isActiveMapOpen(mapLocation.id_location)) return;

					applyLocationUpdate(mapLocation);
					coords = getLocationCoordinatesFrom(mapLocation);
				} catch (error) {
					if (!isActiveMapOpen()) return;
					setMapStatus(
						error instanceof PublicBookingClientError
							? error.message
							: 'No fue posible obtener la ubicación.'
					);
					if (openSeq === mapOpenSeq) {
						setMapLoading(false);
					}
					return;
				}
			}

			if (!isActiveMapOpen(mapLocation.id_location)) return;

			if (!coords) {
				setMapStatus('Esta sucursal no tiene coordenadas cargadas.');
				if (openSeq === mapOpenSeq) {
					setMapLoading(false);
				}
				return;
			}

			if (mapAddress) {
				mapAddress.textContent = mapLocation.address || location?.address || '';
			}

			const locationTitle =
				String(mapLocation.name || location?.name || '').trim() || 'Ubicación';

			const maps = await loadGoogleMaps();
			if (!isActiveMapOpen(mapLocation.id_location)) return;

			if (!mapInstance) {
				mapInstance = new maps.Map(mapCanvas, {
					center: coords,
					zoom: 16,
					disableDefaultUI: false,
					mapTypeControl: false,
					streetViewControl: false,
					fullscreenControl: false,
					gestureHandling: 'cooperative',
					styles: darkMapStyles,
				});
				mapMarker = new maps.Marker({
					map: mapInstance,
					position: coords,
					title: locationTitle,
				});
			} else {
				mapInstance.setOptions?.({
					styles: darkMapStyles,
					gestureHandling: 'cooperative',
					fullscreenControl: false,
				});
				mapInstance.setCenter(coords);
				mapInstance.setZoom(16);
				mapMarker?.setPosition?.(coords);
				mapMarker?.setTitle?.(locationTitle);
			}

			window.setTimeout(() => {
				if (!isActiveMapOpen(mapLocation.id_location)) return;
				maps.event?.trigger?.(mapInstance, 'resize');
				mapInstance?.setCenter?.(coords);
				if (openSeq === mapOpenSeq) {
					setMapLoading(false);
				}
			}, 80);
		} catch (error) {
			if (!isActiveMapOpen()) return;
			setMapStatus(error instanceof Error ? error.message : 'No fue posible mostrar el mapa.');
			if (openSeq === mapOpenSeq) {
				setMapLoading(false);
			}
		}
	};

	const setSubmitError = (message: string) => {
		if (!submitErrorNode) return;
		if (!message) {
			submitErrorNode.textContent = '';
			submitErrorNode.classList.add('hidden');
			return;
		}
		submitErrorNode.textContent = message;
		submitErrorNode.classList.remove('hidden');
	};

	const setPhoneFieldError = (message: string) => {
		if (!customerPhoneFieldError) return;
		if (!message) {
			customerPhoneFieldError.textContent = '';
			customerPhoneFieldError.classList.add('hidden');
			return;
		}
		customerPhoneFieldError.textContent = message;
		customerPhoneFieldError.classList.remove('hidden');
	};

	const setNameFieldError = (message: string) => {
		if (!customerNameFieldError) return;
		if (!message) {
			customerNameFieldError.textContent = '';
			customerNameFieldError.classList.add('hidden');
			return;
		}
		customerNameFieldError.textContent = message;
		customerNameFieldError.classList.remove('hidden');
	};

	const setPolicyFieldError = (message: string) => {
		const node = root.querySelector<HTMLElement>('[data-field-error="policy_accepted"]');
		if (!node) return;
		node.textContent = message;
		node.classList.toggle('hidden', !message);
	};

	const setCustomerNameVisibility = (visible: boolean) => {
		customerNameWrapper.classList.toggle('hidden', !visible);
		customerNameInput.required = visible;
	};

	const setCustomerNameLocked = (locked: boolean) => {
		customerNameInput.disabled = locked;
	};

	const resetCustomerLookupState = (clearPhone = false) => {
		customerValidationSeq += 1;
		isValidatingCustomer = false;
		validatedCustomerPhoneE164 = '';
		customerNameInput.value = '';
		setCustomerNameLocked(false);
		if (clearPhone) customerPhoneInput.value = '';
		setCustomerNameVisibility(false);
		setNameFieldError('');
	};

	const validateCustomerPhone = async (customerPhoneE164: string) => {
		if (!customerPhoneE164) return false;
		if (validatedCustomerPhoneE164 === customerPhoneE164 && !customerNameWrapper.classList.contains('hidden')) {
			return true;
		}

		const currentValidationSeq = ++customerValidationSeq;
		isValidatingCustomer = true;
		setSubmitError('');
		setNameFieldError('');
		setCustomerNameVisibility(false);

		try {
			const { data } = await fetchJson<ValidateCustomerApiResponse>(
				'/api/public/validate-customer',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Accept: 'application/json',
					},
					body: JSON.stringify({
						org_id_organization: profile.org_id_organization,
						customer_phone: customerPhoneE164,
					}),
				},
				'No fue posible validar el cliente.'
			);

			if (currentValidationSeq !== customerValidationSeq) return false;

			if (typeof data.exists !== 'boolean') {
				throw new Error('No fue posible validar el cliente.');
			}

			validatedCustomerPhoneE164 = customerPhoneE164;
			setCustomerNameVisibility(true);

			if (data.exists) {
				const fullName = String(data.data?.full_name || '').trim();
				if (!fullName) {
					throw new Error('No fue posible recuperar el nombre del cliente.');
				}
				customerNameInput.value = fullName;
				setCustomerNameLocked(true);
			} else {
				customerNameInput.value = '';
				setCustomerNameLocked(false);
			}

			return true;
		} catch (error) {
			if (currentValidationSeq !== customerValidationSeq) return false;
			resetCustomerLookupState();
			setSubmitError(
				error instanceof Error ? error.message : 'No fue posible validar el cliente.'
			);
			return false;
		} finally {
			if (currentValidationSeq === customerValidationSeq) {
				isValidatingCustomer = false;
			}
		}
	};

	const setStep = (nextStep: WizardStep) => {
		step = nextStep;

		for (const panel of stepPanels) {
			const panelStep = Number(panel.dataset.stepPanel || '0');
			panel.classList.toggle('hidden', panelStep !== step);
		}

		for (const item of stepItems) {
			const itemStep = Number(item.dataset.stepItem || '0');
			item.classList.remove('step-item-default', 'step-item-current', 'step-item-done');

			if (itemStep === step && step <= 5) {
				item.classList.add('step-item-current');
				continue;
			}

			if (itemStep < step || step >= 6) {
				item.classList.add('step-item-done');
				continue;
			}

			item.classList.add('step-item-default');
		}

		// A partir del paso 2 el header pasa a barra compacta (avatar chico + nombre),
		// liberando espacio vertical. El paso 1 (bienvenida) y la confirmación (6) usan el hero.
		if (bookingProfileHeader) {
			bookingProfileHeader.classList.toggle('is-compact', step >= 2 && step !== 6);
		}

		const cappedStep = (step >= 6 ? 5 : step) as 1 | 2 | 3 | 4 | 5;
		if (stepCompactLabel) {
			stepCompactLabel.textContent =
				step === 7
					? 'Transferí la seña'
					: step === 6
						? 'Reserva confirmada'
						: `Paso ${cappedStep} de 5: ${stepLabelByNumber[cappedStep]}`;
		}
		if (stepProgressBar) {
			const progress = step >= 6 ? 100 : cappedStep * 20;
			stepProgressBar.style.width = `${progress}%`;
		}

		if (step <= 5) draftPersister.schedule();
	};

	const getSelectedSlotKey = () =>
		selectedLocation && selectedTime
			? `${selectedLocation.id_location}:${selectedTime}`
			: '';

	const formatLocationLabel = (location: BookingLocation | null) => {
		if (!location) return 'Ubicación no disponible';
		const name = String(location.name || '').trim();
		const address = String(location.address || '').trim();
		if (address && name && address.toLowerCase() !== name.toLowerCase()) return address;
		return address || name || 'Ubicación no disponible';
	};

	const refreshSummaryLocation = (location: BookingLocation | null) => {
		const label = formatLocationLabel(location);
		const canOpen = canShowLocationMap(location);
		summaryLocation.className =
			'public-location-link public-booking-summary__value cursor-pointer text-right font-normal disabled:cursor-not-allowed disabled:text-[var(--on-surface-variant)]';
		summaryLocation.disabled = !canOpen;
		summaryLocation.replaceChildren();
		if (!location || label === 'Ubicación no disponible') {
			summaryLocation.textContent = label;
			return;
		}
		const icon = document.createElement('span');
		icon.className = 'material-symbols-rounded';
		icon.setAttribute('aria-hidden', 'true');
		icon.textContent = 'location_on';
		const text = document.createElement('span');
		text.className = 'public-location-link__label';
		text.textContent = label;
		summaryLocation.append(icon, text);
	};

	const refreshSummary = () => {
		const formattedDate = selectedDate ? formatLongDateFromApiDate(selectedDate) : '-';
		const serviceLabel = selectedService ? selectedService.name : '-';
		const timeLabel = selectedTime || '-';

		if (summaryServiceInline) summaryServiceInline.textContent = serviceLabel;
		summaryDateInline.textContent = selectedDate
			? formatShortDateFromApiDate(selectedDate) || formattedDate
			: '-';
		if (summaryProfessional) summaryProfessional.textContent = profile.full_name;
		summaryService.textContent = serviceLabel;
		summaryDate.textContent = formattedDate || '-';
		summaryTime.textContent = timeLabel;
		refreshSummaryLocation(selectedLocation);

		const depositAmount = calculateDepositAmount(selectedService);
		const requiresDeposit = depositAmount > 0;

		summaryDepositWrap.classList.toggle('hidden', !requiresDeposit);
		if (requiresDeposit) {
			summaryDeposit.textContent = formatCurrency(depositAmount);
		} else {
			summaryDeposit.textContent = '';
		}

		submitButton.classList.toggle('is-hidden', requiresDeposit);
		payDepositButton.classList.toggle('is-hidden', !requiresDeposit);

		if (depositPolicyWrap && depositPolicySummary) {
			const settings = profile.deposit_settings;
			const policyCode = normalizePolicyCode(settings?.refund_policy);
			const summary =
				String(settings?.refund_policy_summary || '').trim() ||
				(policyCode ? POLICY_SUMMARIES[policyCode] : '');
			depositPolicyWrap.classList.toggle('hidden', !requiresDeposit);
			depositPolicySummary.textContent = summary || 'Consultá la política con el comercio.';
			if (!requiresDeposit && depositPolicyAccept) depositPolicyAccept.checked = false;
			if (!requiresDeposit) setPolicyFieldError('');
		}
	};

	const resetPendingAppointment = () => {
		pendingAppointmentId = 0;
		pendingSipapHold = null;
	};

	const syncPendingAppointmentContext = () => {
		if (calculateDepositAmount(selectedService) <= 0) {
			resetPendingAppointment();
		}
	};

	let servicesExpanded = false;
	let serviceStackFocusIndex = 0;
	let serviceStackBound = false;
	let locationStackFocusIndex = 0;

	const isMobileServicesStack = () =>
		typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;
	const isMobileLocationsStack = () => isMobileServicesStack();

	/** Mejora progresiva: Android vibra; iOS ignora sin romper. */
	const triggerPickerHaptic = () => {
		try {
			if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
				navigator.vibrate(12);
			}
		} catch {
			/* ignore unsupported / blocked */
		}
	};

	const selectServiceAndAdvance = (service: BookingService) => {
		selectedService = service;
		selectedDate = '';
		selectedTime = '';
		selectedLocation = defaultLocation;
		availableSlotGroups = [];
		resetPendingAppointment();
		refreshSummary();
		renderLocations();
		renderCalendar();
		draftPersister.schedule();
		setStep(stepAfterService());
	};

	const selectLocationAndAdvance = (location: BookingLocation) => {
		const changed = selectedLocation?.id_location !== location.id_location;
		selectedLocation = location;
		if (changed) {
			selectedDate = '';
			selectedTime = '';
			availableSlotGroups = [];
			resetPendingAppointment();
		}
		refreshSummary();
		renderLocations();
		renderCalendar();
		draftPersister.schedule();
		setStep(3);
	};

	const softSelectService = (service: BookingService, stack: HTMLElement) => {
		const changed = selectedService?.id_service !== service.id_service;
		if (changed) {
			selectedService = service;
			selectedDate = '';
			selectedTime = '';
			selectedLocation = defaultLocation;
			availableSlotGroups = [];
			resetPendingAppointment();
			refreshSummary();
			draftPersister.schedule();
		}
		for (const card of stack.querySelectorAll<HTMLElement>('[data-service-stack-index]')) {
			const index = Number(card.dataset.serviceStackIndex ?? -1);
			card.classList.toggle('is-selected', index === serviceStackFocusIndex);
		}
	};

	const buildServiceCardInnerHtml = (service: BookingService) => `
		<span class="public-service-card__title text-lg font-medium text-(--on-surface)">${service.name}</span>
		<div class="public-service-card__meta flex items-center justify-between gap-2 text-sm font-medium text-(--on-surface-variant)">
			<span>${formatDuration(service.duration_minutes)}</span>
			<span>${
				service.hide_public_price === 1
					? service.hidden_price_label || 'A evaluar'
					: formatCurrency(service.price)
			}</span>
		</div>
		<span class="material-symbols-rounded public-service-card__check" aria-hidden="true">check_circle</span>
	`;

	const syncServiceStackLayers = (stack: HTMLElement, focusedIndex: number) => {
		const cards = Array.from(stack.querySelectorAll<HTMLElement>('[data-service-stack-index]'));
		for (const card of cards) {
			const index = Number(card.dataset.serviceStackIndex ?? -1);
			const distance = index - focusedIndex;
			card.classList.remove('is-focus', 'is-near', 'is-near-up', 'is-near-down', 'is-far');
			card.setAttribute('aria-selected', distance === 0 ? 'true' : 'false');
			card.tabIndex = distance === 0 ? 0 : -1;
			if (distance === 0) {
				card.classList.add('is-focus');
			} else if (distance === -1) {
				card.classList.add('is-near', 'is-near-up');
			} else if (distance === 1) {
				card.classList.add('is-near', 'is-near-down');
			} else {
				card.classList.add('is-far');
			}
		}
	};

	const renderServicesStack = () => {
		const services = profile.services;
		servicesGrid.classList.add('is-service-stack');

		const selectedIndex = selectedService
			? services.findIndex((service) => service.id_service === selectedService.id_service)
			: -1;
		if (selectedIndex >= 0) {
			serviceStackFocusIndex = selectedIndex;
		} else {
			serviceStackFocusIndex = Math.min(
				Math.max(0, serviceStackFocusIndex),
				Math.max(0, services.length - 1)
			);
		}

		const stackShell = document.createElement('div');
		stackShell.className = 'public-service-stack-shell';

		const stack = document.createElement('div');
		stack.className = 'public-service-stack';
		stack.setAttribute('role', 'listbox');
		stack.setAttribute('aria-label', 'Servicios disponibles');
		stack.tabIndex = 0;

		let touchStartY: number | null = null;
		let touchMoved = false;
		let wheelLockedUntil = 0;
		let suppressClickUntil = 0;

		const continueWithFocused = () => {
			const service = services[serviceStackFocusIndex];
			if (service) selectServiceAndAdvance(service);
		};

		const moveFocus = (delta: number) => {
			const next = Math.min(
				Math.max(0, serviceStackFocusIndex + delta),
				services.length - 1
			);
			if (next === serviceStackFocusIndex) return;
			serviceStackFocusIndex = next;
			syncServiceStackLayers(stack, serviceStackFocusIndex);
			const service = services[serviceStackFocusIndex];
			if (service) softSelectService(service, stack);
			triggerPickerHaptic();
		};

		for (const [index, service] of services.entries()) {
			const button = document.createElement('button');
			button.type = 'button';
			button.setAttribute('role', 'option');
			button.dataset.serviceStackIndex = String(index);
			const isSelected = selectedService?.id_service === service.id_service;
			button.className = `public-service-card${isSelected ? ' is-selected' : ''}`;
			button.innerHTML = buildServiceCardInnerHtml(service);
			button.addEventListener(
				'click',
				() => {
					if (Date.now() < suppressClickUntil) return;
					if (index === serviceStackFocusIndex) return;
					serviceStackFocusIndex = index;
					syncServiceStackLayers(stack, serviceStackFocusIndex);
					softSelectService(service, stack);
					triggerPickerHaptic();
				},
				{ signal }
			);
			stack.appendChild(button);
		}

		syncServiceStackLayers(stack, serviceStackFocusIndex);
		const focusedService = services[serviceStackFocusIndex];
		if (focusedService) softSelectService(focusedService, stack);

		stack.addEventListener(
			'touchstart',
			(event) => {
				if (event.touches.length !== 1) return;
				touchStartY = event.touches[0]?.clientY ?? null;
				touchMoved = false;
			},
			{ signal, passive: true }
		);

		stack.addEventListener(
			'touchmove',
			(event) => {
				if (touchStartY == null || event.touches.length !== 1) return;
				const currentY = event.touches[0]?.clientY ?? touchStartY;
				const deltaY = currentY - touchStartY;
				if (Math.abs(deltaY) <= 8) return;
				touchMoved = true;
				// Evita pull-to-refresh / scroll de la página al deslizar el picker.
				event.preventDefault();
			},
			{ signal, passive: false }
		);

		stack.addEventListener(
			'touchend',
			(event) => {
				if (touchStartY == null) return;
				const endY = event.changedTouches[0]?.clientY ?? touchStartY;
				const deltaY = endY - touchStartY;
				touchStartY = null;
				if (!touchMoved || Math.abs(deltaY) < 40) return;
				suppressClickUntil = Date.now() + 350;
				moveFocus(deltaY < 0 ? 1 : -1);
			},
			{ signal }
		);

		stack.addEventListener(
			'click',
			(event) => {
				if (Date.now() < suppressClickUntil) {
					event.preventDefault();
					event.stopPropagation();
				}
			},
			{ signal, capture: true }
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
			{ signal, passive: false }
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
					continueWithFocused();
				}
			},
			{ signal }
		);

		stackShell.appendChild(stack);

		const continueButton = document.createElement('button');
		continueButton.type = 'button';
		continueButton.className = 'public-service-stack__continue';
		continueButton.textContent = 'Continuar';
		continueButton.addEventListener('click', continueWithFocused, { signal });

		servicesGrid.appendChild(stackShell);
		servicesGrid.appendChild(continueButton);
	};

	const renderServicesGrid = () => {
		servicesGrid.classList.remove('is-service-stack');

		const INITIAL_VISIBLE_SERVICES = 4;
		const totalServices = profile.services.length;
		const selectedIndex = selectedService
			? profile.services.findIndex((service) => service.id_service === selectedService.id_service)
			: -1;
		if (selectedIndex >= INITIAL_VISIBLE_SERVICES) {
			servicesExpanded = true;
		}

		const visibleServices = servicesExpanded
			? profile.services
			: profile.services.slice(0, INITIAL_VISIBLE_SERVICES);
		const hiddenCount = Math.max(0, totalServices - INITIAL_VISIBLE_SERVICES);

		for (const service of visibleServices) {
			const button = document.createElement('button');
			button.type = 'button';
			const isSelected = selectedService?.id_service === service.id_service;
			button.className = `public-service-card${isSelected ? ' is-selected' : ''}`;
			button.innerHTML = buildServiceCardInnerHtml(service);
			button.addEventListener('click', () => selectServiceAndAdvance(service), { signal });
			servicesGrid.appendChild(button);
		}

		if (!servicesExpanded && hiddenCount > 0) {
			const moreButton = document.createElement('button');
			moreButton.type = 'button';
			moreButton.className = 'public-services-more';
			moreButton.textContent =
				hiddenCount === 1 ? 'Ver 1 servicio más' : `Ver ${hiddenCount} servicios más`;
			moreButton.addEventListener(
				'click',
				() => {
					servicesExpanded = true;
					renderServices();
				},
				{ signal }
			);
			servicesGrid.appendChild(moreButton);
		}
	};

	const renderServices = () => {
		servicesGrid.innerHTML = '';
		servicesGrid.removeAttribute('aria-busy');
		if (profile.services.length === 0) {
			servicesGrid.classList.remove('is-service-stack');
			const emptyState = document.createElement('p');
			emptyState.className =
				'rounded-2xl bg-[var(--surface-container-high)] px-5 py-4 text-base font-medium text-[var(--on-surface-variant)]';
			emptyState.textContent = 'Este profesional no tiene servicios disponibles actualmente.';
			servicesGrid.appendChild(emptyState);
			return;
		}

		if (isMobileServicesStack()) {
			renderServicesStack();
		} else {
			renderServicesGrid();
		}
	};

	if (!serviceStackBound && typeof window !== 'undefined') {
		serviceStackBound = true;
		const media = window.matchMedia('(max-width: 639px)');
		const onViewportChange = () => {
			if (signal.aborted) return;
			renderServices();
			renderLocations();
			renderSlots();
		};
		if (typeof media.addEventListener === 'function') {
			media.addEventListener('change', onViewportChange, { signal });
		} else {
			media.addListener(onViewportChange);
			signal.addEventListener('abort', () => media.removeListener(onViewportChange));
		}
	}

	const escapeHtml = (value: string) =>
		String(value || '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');

	const softSelectLocation = (location: BookingLocation, stack: HTMLElement) => {
		const changed = selectedLocation?.id_location !== location.id_location;
		if (changed) {
			selectedLocation = location;
			selectedDate = '';
			selectedTime = '';
			availableSlotGroups = [];
			resetPendingAppointment();
			refreshSummary();
			draftPersister.schedule();
		}
		for (const card of stack.querySelectorAll<HTMLElement>('[data-location-stack-index]')) {
			const index = Number(card.dataset.locationStackIndex ?? -1);
			card.classList.toggle('is-selected', index === locationStackFocusIndex);
		}
	};

	const buildLocationCardContent = (location: BookingLocation, options?: { showMap?: boolean }) => {
		const name = String(location.name || 'Sucursal').trim() || 'Sucursal';
		const address = String(location.address || '').trim();
		const showMap = options?.showMap !== false && canShowLocationMap(location);
		return `
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
			${
				showMap
					? `<button type="button" class="public-location-card__map-btn" data-location-map-trigger aria-label="Ver mapa de ${escapeHtml(name)}"><span class="material-symbols-rounded" aria-hidden="true">location_on</span><span>Ver mapa</span></button>`
					: ''
			}
		`;
	};

	const syncLocationStackLayers = (stack: HTMLElement, focusedIndex: number) => {
		const cards = Array.from(stack.querySelectorAll<HTMLElement>('[data-location-stack-index]'));
		for (const card of cards) {
			const index = Number(card.dataset.locationStackIndex ?? -1);
			const distance = index - focusedIndex;
			card.classList.remove('is-focus', 'is-near', 'is-near-up', 'is-near-down', 'is-far');
			card.setAttribute('aria-selected', distance === 0 ? 'true' : 'false');
			card.tabIndex = distance === 0 ? 0 : -1;
			if (distance === 0) {
				card.classList.add('is-focus');
			} else if (distance === -1) {
				card.classList.add('is-near', 'is-near-up');
			} else if (distance === 1) {
				card.classList.add('is-near', 'is-near-down');
			} else {
				card.classList.add('is-far');
			}
		}
	};

	const bindLocationMapTrigger = (card: HTMLElement, location: BookingLocation) => {
		const mapTrigger = card.querySelector<HTMLButtonElement>('[data-location-map-trigger]');
		mapTrigger?.addEventListener(
			'click',
			(event) => {
				event.preventDefault();
				event.stopPropagation();
				void openLocationMap(location, { fetchCoordinates: true });
			},
			{ signal }
		);
	};

	const renderLocationsStack = (locations: BookingLocation[]) => {
		locationsGrid.classList.add('is-location-stack');

		const selectedIndex = selectedLocation
			? locations.findIndex((location) => location.id_location === selectedLocation.id_location)
			: -1;
		if (selectedIndex >= 0) {
			locationStackFocusIndex = selectedIndex;
		} else {
			locationStackFocusIndex = Math.min(
				Math.max(0, locationStackFocusIndex),
				Math.max(0, locations.length - 1)
			);
		}

		const stackShell = document.createElement('div');
		stackShell.className = 'public-location-stack-shell';

		const stack = document.createElement('div');
		stack.className = 'public-location-stack';
		stack.setAttribute('role', 'listbox');
		stack.setAttribute('aria-label', 'Sucursales disponibles');
		stack.tabIndex = 0;

		let touchStartY: number | null = null;
		let touchMoved = false;
		let wheelLockedUntil = 0;
		let suppressClickUntil = 0;

		const continueWithFocused = () => {
			const location = locations[locationStackFocusIndex];
			if (location) selectLocationAndAdvance(location);
		};

		const moveFocus = (delta: number) => {
			const next = Math.min(
				Math.max(0, locationStackFocusIndex + delta),
				locations.length - 1
			);
			if (next === locationStackFocusIndex) return;
			locationStackFocusIndex = next;
			syncLocationStackLayers(stack, locationStackFocusIndex);
			const location = locations[locationStackFocusIndex];
			if (location) softSelectLocation(location, stack);
			triggerPickerHaptic();
		};

		for (const [index, location] of locations.entries()) {
			const card = document.createElement('div');
			card.setAttribute('role', 'option');
			card.dataset.locationStackIndex = String(index);
			const isSelected = selectedLocation?.id_location === location.id_location;
			card.className = `public-location-card${isSelected ? ' is-selected' : ''}`;
			// Map button always in DOM; CSS shows it only on .is-focus
			card.innerHTML = buildLocationCardContent(location, { showMap: true });

			const mainButton = card.querySelector<HTMLButtonElement>('.public-location-card__main');
			mainButton?.addEventListener(
				'click',
				() => {
					if (Date.now() < suppressClickUntil) return;
					if (index === locationStackFocusIndex) return;
					locationStackFocusIndex = index;
					syncLocationStackLayers(stack, locationStackFocusIndex);
					softSelectLocation(location, stack);
					triggerPickerHaptic();
				},
				{ signal }
			);
			bindLocationMapTrigger(card, location);
			stack.appendChild(card);
		}

		syncLocationStackLayers(stack, locationStackFocusIndex);
		const focusedLocation = locations[locationStackFocusIndex];
		if (focusedLocation) softSelectLocation(focusedLocation, stack);

		stack.addEventListener(
			'touchstart',
			(event) => {
				if (event.touches.length !== 1) return;
				touchStartY = event.touches[0]?.clientY ?? null;
				touchMoved = false;
			},
			{ signal, passive: true }
		);

		stack.addEventListener(
			'touchmove',
			(event) => {
				if (touchStartY == null || event.touches.length !== 1) return;
				const currentY = event.touches[0]?.clientY ?? touchStartY;
				const deltaY = currentY - touchStartY;
				if (Math.abs(deltaY) <= 8) return;
				touchMoved = true;
				event.preventDefault();
			},
			{ signal, passive: false }
		);

		stack.addEventListener(
			'touchend',
			(event) => {
				if (touchStartY == null) return;
				const endY = event.changedTouches[0]?.clientY ?? touchStartY;
				const deltaY = endY - touchStartY;
				touchStartY = null;
				if (!touchMoved || Math.abs(deltaY) < 40) return;
				suppressClickUntil = Date.now() + 350;
				moveFocus(deltaY < 0 ? 1 : -1);
			},
			{ signal }
		);

		stack.addEventListener(
			'click',
			(event) => {
				if (Date.now() < suppressClickUntil) {
					event.preventDefault();
					event.stopPropagation();
				}
			},
			{ signal, capture: true }
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
			{ signal, passive: false }
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
					continueWithFocused();
				}
			},
			{ signal }
		);

		stackShell.appendChild(stack);

		const continueButton = document.createElement('button');
		continueButton.type = 'button';
		continueButton.className = 'public-location-stack__continue';
		continueButton.textContent = 'Continuar';
		continueButton.addEventListener('click', continueWithFocused, { signal });

		locationsGrid.appendChild(stackShell);
		locationsGrid.appendChild(continueButton);
	};

	const renderLocationsGrid = (locations: BookingLocation[]) => {
		locationsGrid.classList.remove('is-location-stack');

		for (const location of locations) {
			const isSelected = selectedLocation?.id_location === location.id_location;
			const card = document.createElement('div');
			card.className = `public-location-card${isSelected ? ' is-selected' : ''}`;
			card.innerHTML = buildLocationCardContent(location, { showMap: true });

			const mainButton = card.querySelector<HTMLButtonElement>('.public-location-card__main');
			mainButton?.addEventListener('click', () => selectLocationAndAdvance(location), { signal });
			bindLocationMapTrigger(card, location);

			locationsGrid.appendChild(card);
		}
	};

	const renderLocations = () => {
		locationsGrid.innerHTML = '';
		locationsGrid.removeAttribute('aria-busy');

		const locations =
			bookingLocations.length > 0
				? bookingLocations
				: defaultLocation
					? [defaultLocation]
					: [];

		if (locations.length === 0) {
			locationsGrid.classList.remove('is-location-stack');
			const empty = document.createElement('p');
			empty.className =
				'rounded-2xl bg-[var(--surface-container-high)] px-5 py-4 text-base font-medium text-[var(--on-surface-variant)]';
			empty.textContent = 'No hay sucursales disponibles para este profesional.';
			locationsGrid.appendChild(empty);
			return;
		}

		if (isMobileLocationsStack()) {
			renderLocationsStack(locations);
		} else {
			renderLocationsGrid(locations);
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

			const dayButton = document.createElement('button');
			dayButton.type = 'button';
			dayButton.textContent = String(day);
			dayButton.disabled = isPast || !selectedService;
			dayButton.className = [
				isSelected ? 'is-selected' : '',
				isToday ? 'is-today' : '',
				isPast ? 'is-past' : '',
			]
				.filter(Boolean)
				.join(' ');

			dayButton.addEventListener('click', () => {
				if (!selectedService) {
					showToast('Selecciona primero un servicio.');
					return;
				}
				selectedDate = dateKey;
				selectedTime = '';
				selectedLocation = defaultLocation;
				resetPendingAppointment();
				refreshSummary();
				renderCalendar();
				draftPersister.schedule();
				void loadAvailableSlots(dateKey);
			});

			calendarGrid.appendChild(dayButton);
		}
	};

	const slotFocusByLocation = new Map<number, number>();

	const renderSlots = () => {
		slotsContainer.innerHTML = '';
		slotsLoadingNode.classList.toggle('hidden', !isLoadingSlots);

		const totalSlots = availableSlotGroups.reduce(
			(count, group) => count + group.slots.length,
			0
		);
		noSlotsNode.classList.toggle('hidden', isLoadingSlots || totalSlots > 0);

		if (isLoadingSlots) return;

		const selectedSlotKey = getSelectedSlotKey();
		const useRoulette = isMobileServicesStack();
		let branchToneIndex = 0;

		for (const group of availableSlotGroups) {
			if (group.slots.length === 0) continue;

			const section = document.createElement('section');
			section.className = `public-slot-branch public-slot-branch--tone-${branchToneIndex % 4}${
				useRoulette ? ' is-slot-roulette' : ''
			}`;
			branchToneIndex += 1;

			if (useRoulette) {
				mountSlotRoulette(section, group, selectedSlotKey);
			} else {
				mountSlotGrid(section, group, selectedSlotKey);
			}

			slotsContainer.appendChild(section);
		}
	};

	const selectSlotAndAdvance = (group: LocationSlotGroup, slot: string) => {
		selectedTime = slot;
		selectedLocation = group.location;
		resetPendingAppointment();
		refreshSummary();
		draftPersister.schedule();
		setStep(5);
	};

	const softSelectSlot = (
		group: LocationSlotGroup,
		slot: string,
		roulette: HTMLElement,
		focusedIndex: number
	) => {
		const changed =
			selectedTime !== slot || selectedLocation?.id_location !== group.location.id_location;
		if (changed) {
			selectedTime = slot;
			selectedLocation = group.location;
			resetPendingAppointment();
			refreshSummary();
			draftPersister.schedule();
		}
		for (const button of roulette.querySelectorAll<HTMLElement>('[data-slot-roulette-index]')) {
			const index = Number(button.dataset.slotRouletteIndex ?? -1);
			button.classList.toggle('is-selected', index === focusedIndex);
		}
	};

	const syncSlotRouletteLayers = (
		roulette: HTMLElement,
		focusedIndex: number,
		options?: { wrap?: boolean }
	) => {
		const buttons = Array.from(
			roulette.querySelectorAll<HTMLElement>('[data-slot-roulette-index]')
		);
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

			// Distancia con signo respecto al foco (soporta wrap circular).
			let distance: number;
			if (wrap) {
				const raw = ((index - focusedIndex) % total + total) % total;
				distance = raw > total / 2 ? raw - total : raw;
			} else {
				distance = index - focusedIndex;
			}

			const role:
				| 'focus'
				| 'near-up'
				| 'near-down'
				| 'far-up'
				| 'far-down'
				| 'far' =
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

	const mountSlotGrid = (
		section: HTMLElement,
		group: LocationSlotGroup,
		selectedSlotKey: string
	) => {
		const grid = document.createElement('div');
		grid.className = 'grid grid-cols-2 gap-3 sm:grid-cols-4';

		for (const slot of group.slots) {
			const slotKey = `${group.location.id_location}:${slot}`;
			const slotButton = document.createElement('button');
			slotButton.type = 'button';
			slotButton.textContent = slot;
			const isSelected = selectedSlotKey === slotKey;
			slotButton.className =
				'public-slot-time flex h-11 items-center justify-center rounded-full border px-4 text-sm font-medium cursor-pointer transition' +
				(isSelected ? ' is-selected' : '');

			slotButton.addEventListener(
				'click',
				() => selectSlotAndAdvance(group, slot),
				{ signal }
			);
			grid.appendChild(slotButton);
		}

		section.appendChild(grid);
	};

	/** Dial curvo (regla de ticks en arco + puntero) para el picker de horarios. */
	const buildSlotDialSvg = () => {
		const W = 44;
		const H = 256;
		const cy = H / 2;
		const R = 240; // radio del arco
		const cx = 246; // centro del círculo a la derecha → el arco bulge hacia la izquierda
		const spanDeg = 30; // medio ángulo (±30° = ~240px de recorrido vertical)
		const ticks = 15;
		const half = (ticks - 1) / 2;

		const toX = (radius: number, rad: number) => cx - radius * Math.cos(rad);
		const toY = (radius: number, rad: number) => cy + radius * Math.sin(rad);

		let marks = '';
		for (let i = 0; i < ticks; i += 1) {
			const t = (i - half) / half; // -1..1
			const rad = (t * spanDeg * Math.PI) / 180;
			const isCenter = i === half;
			const len = isCenter ? 13 : 8;
			const x1 = toX(R, rad).toFixed(2);
			const y1 = toY(R, rad).toFixed(2);
			const x2 = toX(R - len, rad).toFixed(2);
			const y2 = toY(R - len, rad).toFixed(2);
			marks += isCenter
				? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--primary)" stroke-width="2.4" stroke-linecap="round" />`
				: `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />`;
		}

		// Puntero triangular en el centro, apuntando a la izquierda (hacia la píldora activa).
		const px = toX(R - 13, 0).toFixed(2);
		const pointer = `<path d="M ${px} ${cy} l 7 -5 l 0 10 z" fill="var(--primary)" />`;

		return `<svg class="public-slot-roulette__dial-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${marks}${pointer}</svg>`;
	};

	const mountSlotRoulette = (
		section: HTMLElement,
		group: LocationSlotGroup,
		selectedSlotKey: string
	) => {
		const locationId = group.location.id_location;
		const totalSlots = group.slots.length;
		const wrapRoulette = totalSlots >= 3;
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

		const shell = document.createElement('div');
		shell.className = 'public-slot-roulette-shell';

		const roulette = document.createElement('div');
		roulette.className = `public-slot-roulette${wrapRoulette ? ' is-circular' : ''}`;
		roulette.setAttribute('role', 'listbox');
		roulette.setAttribute('aria-label', `Horarios en ${group.location.name || 'sucursal'}`);
		roulette.tabIndex = 0;

		const dial = document.createElement('div');
		dial.className = 'public-slot-roulette__dial';
		dial.setAttribute('aria-hidden', 'true');
		dial.innerHTML = buildSlotDialSvg();

		let touchStartY: number | null = null;
		let touchMoved = false;
		let wheelLockedUntil = 0;
		let suppressClickUntil = 0;

		const continueWithFocused = () => {
			const slot = group.slots[focusedIndex];
			if (slot) selectSlotAndAdvance(group, slot);
		};

		const applyFocus = (nextIndex: number) => {
			if (nextIndex === focusedIndex) return;
			focusedIndex = nextIndex;
			slotFocusByLocation.set(locationId, focusedIndex);
			syncSlotRouletteLayers(roulette, focusedIndex, { wrap: wrapRoulette });
			const slot = group.slots[focusedIndex];
			if (slot) softSelectSlot(group, slot, roulette, focusedIndex);
			triggerPickerHaptic();
		};

		const moveFocus = (delta: number) => {
			if (totalSlots <= 0) return;
			if (wrapRoulette) {
				applyFocus((focusedIndex + delta + totalSlots) % totalSlots);
				return;
			}
			applyFocus(Math.min(Math.max(0, focusedIndex + delta), totalSlots - 1));
		};

		for (const [index, slot] of group.slots.entries()) {
			const button = document.createElement('button');
			button.type = 'button';
			button.setAttribute('role', 'option');
			button.dataset.slotRouletteIndex = String(index);
			button.innerHTML = `
				<span class="public-slot-time__icon material-symbols-rounded" aria-hidden="true">schedule</span>
				<span class="public-slot-time__label">${escapeHtml(slot)}</span>
			`;
			button.className =
				'public-slot-time public-slot-time--roulette' +
				(`${locationId}:${slot}` === selectedSlotKey ? ' is-selected' : '');
			button.addEventListener(
				'click',
				() => {
					if (Date.now() < suppressClickUntil) return;
					applyFocus(index);
				},
				{ signal }
			);
			roulette.appendChild(button);
		}

		syncSlotRouletteLayers(roulette, focusedIndex, { wrap: wrapRoulette });
		const focusedSlot = group.slots[focusedIndex];
		if (focusedSlot) softSelectSlot(group, focusedSlot, roulette, focusedIndex);

		roulette.addEventListener(
			'touchstart',
			(event) => {
				if (event.touches.length !== 1) return;
				touchStartY = event.touches[0]?.clientY ?? null;
				touchMoved = false;
			},
			{ signal, passive: true }
		);

		roulette.addEventListener(
			'touchmove',
			(event) => {
				if (touchStartY == null || event.touches.length !== 1) return;
				const currentY = event.touches[0]?.clientY ?? touchStartY;
				const deltaY = currentY - touchStartY;
				if (Math.abs(deltaY) <= 8) return;
				touchMoved = true;
				event.preventDefault();
			},
			{ signal, passive: false }
		);

		roulette.addEventListener(
			'touchend',
			(event) => {
				if (touchStartY == null) return;
				const endY = event.changedTouches[0]?.clientY ?? touchStartY;
				const deltaY = endY - touchStartY;
				touchStartY = null;
				if (!touchMoved || Math.abs(deltaY) < 40) return;
				suppressClickUntil = Date.now() + 350;
				moveFocus(deltaY < 0 ? 1 : -1);
			},
			{ signal }
		);

		roulette.addEventListener(
			'click',
			(event) => {
				if (Date.now() < suppressClickUntil) {
					event.preventDefault();
					event.stopPropagation();
				}
			},
			{ signal, capture: true }
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
				wheelLockedUntil = now + 280;
				moveFocus(event.deltaY > 0 ? 1 : -1);
			},
			{ signal, passive: false }
		);

		roulette.addEventListener(
			'keydown',
			(event) => {
				if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
					event.preventDefault();
					moveFocus(1);
				} else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
					event.preventDefault();
					moveFocus(-1);
				} else if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					continueWithFocused();
				}
			},
			{ signal }
		);

		shell.appendChild(roulette);
		shell.appendChild(dial);

		const continueButton = document.createElement('button');
		continueButton.type = 'button';
		continueButton.className = 'public-slot-roulette__continue';
		continueButton.textContent = 'Continuar';
		continueButton.addEventListener('click', continueWithFocused, { signal });

		section.appendChild(shell);
		section.appendChild(continueButton);
	};

	const readLocationsFromDom = () =>
		mergeBookingLocations(
			normalizePublicBookingLocations(
				parseJsonScript<unknown[]>(root, 'public-booking-locations-json')
			),
			normalizePublicBookingLocations(parseProfileFromDom(root)?.locations)
		);

	const fetchProfileLocations = async () => {
		const fromDom = readLocationsFromDom();
		if (!professionalSlug) return fromDom.length > 0 ? fromDom : bookingLocations;

		const profileApiPath = organizationSlug
			? `/api/public/profile/${encodeURIComponent(organizationSlug)}/${encodeURIComponent(professionalSlug)}`
			: `/api/public/profile/${encodeURIComponent(professionalSlug)}`;

		try {
			const { data } = await fetchJson<{ data?: { locations?: unknown[] } }>(
				profileApiPath,
				{
					method: 'GET',
					headers: { Accept: 'application/json' },
					cache: 'no-store',
				},
				'No fue posible cargar las sucursales.'
			);

			const fromApi = normalizePublicBookingLocations(data.data?.locations);
			if (fromApi.length > 0) return fromApi;

			return fromDom.length > 0 ? fromDom : bookingLocations;
		} catch {
			return fromDom.length > 0 ? fromDom : bookingLocations;
		}
	};

	const fetchAvailableSlotsForLocation = async (
		location: BookingLocation,
		targetDate: string
	) => {
		const params = new URLSearchParams({
			pro_id: String(profile.id_professional),
			loc_id: String(location.id_location),
			ser_id: String(selectedService!.id_service),
			target_date: targetDate,
		});

		const { data } = await fetchJson<{ data?: unknown[] }>(
			`/api/public/available-slots?${params.toString()}`,
			{
				method: 'GET',
				headers: { Accept: 'application/json' },
				cache: 'no-store',
			},
			'No fue posible consultar horarios disponibles.'
		);

		if (!Array.isArray(data.data)) {
			throw new Error('No fue posible consultar horarios disponibles.');
		}

		return {
			location,
			slots: sortTimeSlotsChronologically(
				data.data
					.map((value: unknown) => String(value || '').trim())
					.filter(isValidApiTimeSlot)
			),
		} satisfies LocationSlotGroup;
	};

	const loadAvailableSlots = async (
		targetDate: string,
		options?: { preserveSelection?: boolean; skipStepChange?: boolean }
	) => {
		if (!selectedService) return;

		const preservedTime = options?.preserveSelection ? selectedTime : '';
		const preservedLocationId = options?.preserveSelection
			? selectedLocation?.id_location ?? 0
			: 0;

		isLoadingSlots = true;
		availableSlotGroups = [];
		if (!options?.preserveSelection) {
			selectedTime = '';
		}
		renderSlots();
		if (!options?.skipStepChange) setStep(4);

		try {
			bookingLocations = await fetchProfileLocations();
			const locationTargets = selectedLocation
				? [selectedLocation]
				: defaultLocation
					? [defaultLocation]
					: configuredLocationId
						? [{ id_location: configuredLocationId, address: '' }]
						: [];

			if (locationTargets.length === 0) {
				availableSlotGroups = [];
				showToast('Seleccioná una sucursal para ver horarios.', 'error');
				return;
			}

			const results = await Promise.allSettled(
				locationTargets.map((location) =>
					fetchAvailableSlotsForLocation(location, targetDate)
				)
			);

			const rejected = results.find(
				(result): result is PromiseRejectedResult => result.status === 'rejected'
			);
			if (rejected && results.every((result) => result.status === 'rejected')) {
				throw rejected.reason;
			}

			availableSlotGroups = results
				.filter(
					(result): result is PromiseFulfilledResult<LocationSlotGroup> =>
						result.status === 'fulfilled'
				)
				.map((result) => result.value)
				.filter((group) => group.slots.length > 0)
				.sort((left, right) => {
					const leftLabel = String(left.location.name || left.location.address || '');
					const rightLabel = String(right.location.name || right.location.address || '');
					return leftLabel.localeCompare(rightLabel, 'es');
				});

			if (options?.preserveSelection && preservedTime) {
				const match = availableSlotGroups.find(
					(group) =>
						(!preservedLocationId ||
							group.location.id_location === preservedLocationId) &&
						group.slots.includes(preservedTime)
				);
				if (match) {
					selectedTime = preservedTime;
					selectedLocation = match.location;
				} else {
					selectedTime = '';
				}
			}
		} catch (error) {
			availableSlotGroups = [];
			showToast(
				error instanceof Error
					? error.message
					: 'No fue posible consultar horarios disponibles.',
				'error'
			);
		} finally {
			isLoadingSlots = false;
			renderSlots();
		}
	};

	const resetFlow = () => {
		draftPersister.clear();
		selectedService = null;
		selectedDate = '';
		selectedTime = '';
		selectedLocation = defaultLocation;
		availableSlotGroups = [];
		isLoadingSlots = false;
		servicesExpanded = false;
		resetPendingAppointment();
		stopSipapHoldCountdown(root);
		customerForm.reset();
		resetCustomerLookupState(true);
		setPhoneFieldError('');
		setSubmitError('');
		refreshSummary();
		renderServices();
		renderLocations();
		renderCalendar();
		renderSlots();
		setStep(1);
	};

	prevMonthButton.addEventListener(
		'click',
		() => {
			visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
			renderCalendar();
		},
		{ signal }
	);

	nextMonthButton.addEventListener(
		'click',
		() => {
			visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
			renderCalendar();
		},
		{ signal }
	);

	backToServices.addEventListener('click', () => setStep(1), { signal });
	backToLocations.addEventListener(
		'click',
		() => setStep(stepBeforeDate()),
		{ signal }
	);
	backToCalendarButtons.forEach((button) => {
		button.addEventListener('click', () => setStep(3), { signal });
	});
	backToSlots.addEventListener('click', () => setStep(4), { signal });
	restartButtons.forEach((button) => {
		button.addEventListener('click', resetFlow, { signal });
	});
	summaryLocation.addEventListener(
		'click',
		(event) => {
			event.preventDefault();
			event.stopPropagation();
			const location = resolveLocationForSelectedSlot();
			if (!location) return;
			void openLocationMap(location, { fetchCoordinates: true });
		},
		{ signal }
	);
	mapCloseButton.addEventListener('click', () => mapModal.close(), { signal });
	mapModal.addEventListener(
		'click',
		(event) => {
			if (event.target === mapModal) mapModal.close();
		},
		{ signal }
	);
	setCustomerNameLocked(false);
	setCustomerNameVisibility(false);
	customerPhoneInput.value = formatParaguayMobilePhoneInput(customerPhoneInput.value);
	customerNameInput.addEventListener(
		'input',
		() => {
			setNameFieldError('');
			setSubmitError('');
			draftPersister.schedule();
		},
		{ signal }
	);

	depositPolicyAccept?.addEventListener(
		'change',
		() => {
			setPolicyFieldError('');
			draftPersister.schedule();
		},
		{ signal }
	);

	customerPhoneInput.addEventListener(
		'input',
		() => {
			customerPhoneInput.value = formatParaguayMobilePhoneInput(customerPhoneInput.value);
			setPhoneFieldError('');
			setSubmitError('');
			draftPersister.schedule();
			if (isValidatingCustomer) resetCustomerLookupState();

			const parsedPhone = parseParaguayMobilePhone(
				toParaguayMobileE164FromInput(customerPhoneInput.value)
			);
			if (!parsedPhone.isValid) {
				if (validatedCustomerPhoneE164) resetCustomerLookupState();
				return;
			}

			if (validatedCustomerPhoneE164 && parsedPhone.e164 !== validatedCustomerPhoneE164) {
				resetCustomerLookupState();
			}
		},
		{ signal }
	);
	customerPhoneInput.addEventListener('blur', async () => {
		const rawPhone = customerPhoneInput.value.trim();
		if (!rawPhone) {
			setPhoneFieldError('');
			resetCustomerLookupState();
			return;
		}

		const parsedPhone = parseParaguayMobilePhone(toParaguayMobileE164FromInput(rawPhone));
		if (!parsedPhone.isValid) {
			setPhoneFieldError(PARAGUAY_MOBILE_PHONE_ERROR);
			resetCustomerLookupState();
			return;
		}

		customerPhoneInput.value = formatParaguayMobilePhoneInput(rawPhone);
		setPhoneFieldError('');
		await validateCustomerPhone(parsedPhone.e164);
	}, { signal });

	const setPayDepositButtonDefaultLabel = () => {
		payDepositButton.innerHTML =
			'<span>Confirmar y transferir seña</span><span aria-hidden="true">🔒</span>';
	};

	const setPayDepositButtonLoadingLabel = (label: string) => {
		payDepositButton.textContent = label;
	};

	const buildAppointmentHoldPayload = async () => {
		if (isValidatingCustomer) {
			setSubmitError('Estamos validando tu telefono. Espera un momento.');
			return null;
		}
		setSubmitError('');
		setPhoneFieldError('');
		setNameFieldError('');
		setPolicyFieldError('');

		if (!selectedService || !selectedDate || !selectedTime || !selectedLocation) {
			setSubmitError('Selecciona servicio, fecha y horario antes de continuar.');
			return null;
		}

		const rawCustomerPhone = customerPhoneInput.value.trim();
		const rawCustomerName = String(customerNameInput.value || '').trim();
		const isCustomerNameVisible = !customerNameWrapper.classList.contains('hidden');

		if (!rawCustomerPhone) {
			setPhoneFieldError('El teléfono es obligatorio.');
			if (isCustomerNameVisible && !rawCustomerName) {
				setNameFieldError('El nombre completo es obligatorio.');
			}
			return null;
		}

		const parsedPhone = parseParaguayMobilePhone(toParaguayMobileE164FromInput(rawCustomerPhone));
		if (!parsedPhone.isValid) {
			setPhoneFieldError(PARAGUAY_MOBILE_PHONE_ERROR);
			return null;
		}

		const customerPhone = parsedPhone.e164;
		customerPhoneInput.value = formatParaguayMobilePhoneInput(rawCustomerPhone);

		if (validatedCustomerPhoneE164 !== customerPhone || customerNameWrapper.classList.contains('hidden')) {
			const isCustomerValidated = await validateCustomerPhone(customerPhone);
			if (!isCustomerValidated) return null;
		}

		const customerName = String(customerNameInput.value || '').trim();
		if (!customerName) {
			setNameFieldError('El nombre completo es obligatorio.');
			return null;
		}

		if (calculateDepositAmount(selectedService) > 0 && !depositPolicyAccept?.checked) {
			setPolicyFieldError('Debés aceptar la política de cancelación para continuar.');
			return null;
		}

		if (
			calculateDepositAmount(selectedService) > 0 &&
			!isDepositsEnabled(profile.deposit_settings)
		) {
			setSubmitError('Este negocio aún no tiene habilitado el cobro de señas.');
			return null;
		}

		const appointmentTimes = buildApiAppointmentTimes(
			selectedDate,
			selectedTime,
			selectedService.duration_minutes
		);
		if (!appointmentTimes) {
			setSubmitError('No fue posible interpretar la fecha y hora seleccionada.');
			return null;
		}

		return {
			org_id_organization: profile.org_id_organization,
			loc_id_location: selectedLocation.id_location,
			pro_id_professional: profile.id_professional,
			ser_id_service: selectedService.id_service,
			customer_name: customerName,
			customer_phone: customerPhone,
			start_time: appointmentTimes.start_time,
			end_time: appointmentTimes.end_time,
			reserve_for_deposit: true as const,
			policy_accepted: true as const,
		};
	};

	const ensurePendingAppointment = async () => {
		const holdPayload = await buildAppointmentHoldPayload();
		if (!holdPayload) return null;

		if (pendingAppointmentId && pendingSipapHold?.payment_reference) {
			return pendingSipapHold;
		}

		const { data: apiBody } = await fetchJson(
			'/api/public/appointments',
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
				},
				body: JSON.stringify(holdPayload),
			},
			'No fue posible reservar el turno para el pago.'
		);
		const hold = unwrapSipapHold(apiBody as any);
		const appointmentId = Number(hold.appointment_id || 0);
		if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
			throw new Error('No fue posible obtener la reserva pendiente.');
		}
		if (!String(hold.payment_reference || '').trim()) {
			throw new Error('No fue posible obtener el código de transferencia.');
		}
		pendingAppointmentId = appointmentId;
		pendingSipapHold = hold;
		return hold;
	};

	const beginDepositFlow = async () => {
		if (isSubmitting) return;

		const depositAmount = calculateDepositAmount(selectedService);
		if (depositAmount <= 0) {
			setSubmitError('Este servicio no requiere seña.');
			return;
		}

		isSubmitting = true;
		payDepositButton.disabled = true;
		submitButton.disabled = true;
		setPayDepositButtonLoadingLabel('Reservando turno...');
		setSubmitError('');

		try {
			const hold = await ensurePendingAppointment();
			if (!hold) return;

			fillSipapDepositPanel(root, hold, profile.deposit_settings, {
				serviceName: selectedService?.name,
				professionalName: profile.full_name,
				depositAmount: calculateDepositAmount(selectedService),
			});
			ticketProfessional.textContent = profile.full_name;
			ticketService.textContent = selectedService?.name || '-';
			ticketDate.textContent = selectedDate ? formatLongDateFromApiDate(selectedDate) : '-';
			ticketTime.textContent = selectedTime || '-';
			draftPersister.clear();
			setStep(7);
			showToast('Turno reservado. Completá la transferencia SIPAP.', 'success');
		} catch (error) {
			if (error instanceof PublicBookingClientError && error.status === 409) {
				showToast(error.message, 'error');
				resetPendingAppointment();
				await loadAvailableSlots(selectedDate);
				setStep(4);
				return;
			}
			setSubmitError(
				error instanceof Error ? error.message : 'No fue posible iniciar el cobro de seña.'
			);
		} finally {
			isSubmitting = false;
			payDepositButton.disabled = false;
			submitButton.disabled = false;
			setPayDepositButtonDefaultLabel();
		}
	};

	customerForm.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (isSubmitting) return;
		if (calculateDepositAmount(selectedService) > 0) {
			await beginDepositFlow();
			return;
		}
		if (isValidatingCustomer) {
			setSubmitError('Estamos validando tu telefono. Espera un momento.');
			return;
		}
		setSubmitError('');
		setPhoneFieldError('');
		setNameFieldError('');
		setPolicyFieldError('');

		if (!selectedService || !selectedDate || !selectedTime || !selectedLocation) {
			setSubmitError('Selecciona servicio, fecha y horario antes de confirmar.');
			return;
		}

		const rawCustomerPhone = customerPhoneInput.value.trim();
		const rawCustomerName = String(customerNameInput.value || '').trim();
		const isCustomerNameVisible = !customerNameWrapper.classList.contains('hidden');

		if (!rawCustomerPhone) {
			setPhoneFieldError('El teléfono es obligatorio.');
			if (isCustomerNameVisible && !rawCustomerName) {
				setNameFieldError('El nombre completo es obligatorio.');
			}
			return;
		}

		const parsedPhone = parseParaguayMobilePhone(toParaguayMobileE164FromInput(rawCustomerPhone));
		if (!parsedPhone.isValid) {
			setPhoneFieldError(PARAGUAY_MOBILE_PHONE_ERROR);
			return;
		}

		const customerPhone = parsedPhone.e164;
		customerPhoneInput.value = formatParaguayMobilePhoneInput(rawCustomerPhone);
		if (validatedCustomerPhoneE164 !== customerPhone || customerNameWrapper.classList.contains('hidden')) {
			const isCustomerValidated = await validateCustomerPhone(customerPhone);
			if (!isCustomerValidated) return;
		}

		const customerName = String(customerNameInput.value || '').trim();
		if (!customerName) {
			setNameFieldError('El nombre completo es obligatorio.');
			return;
		}

		const appointmentTimes = buildApiAppointmentTimes(
			selectedDate,
			selectedTime,
			selectedService.duration_minutes
		);
		if (!appointmentTimes) {
			setSubmitError('No fue posible interpretar la fecha y hora seleccionada.');
			return;
		}

		const payload = {
			org_id_organization: profile.org_id_organization,
			loc_id_location: selectedLocation.id_location,
			pro_id_professional: profile.id_professional,
			ser_id_service: selectedService.id_service,
			customer_name: customerName,
			customer_phone: customerPhone,
			start_time: appointmentTimes.start_time,
			end_time: appointmentTimes.end_time,
		};

		isSubmitting = true;
		submitButton.disabled = true;
		submitButton.textContent = 'Confirmando...';

		try {
			await fetchJson<{ message?: string; data?: CreatedAppointmentApiData | null }>(
				'/api/public/appointments',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Accept: 'application/json',
					},
					body: JSON.stringify(payload),
				},
				'No fue posible confirmar tu reserva.'
			);

			ticketProfessional.textContent = profile.full_name;
			ticketService.textContent = selectedService.name;
			ticketDate.textContent = formatLongDateFromApiDate(selectedDate);
			ticketTime.textContent = selectedTime;

			draftPersister.clear();
			setStep(6);
		} catch (error) {
			if (error instanceof PublicBookingClientError && error.status === 409) {
				showToast(error.message, 'error');
				await loadAvailableSlots(selectedDate);
				setStep(4);
				return;
			}

			setSubmitError(
				error instanceof Error ? error.message : 'No fue posible confirmar tu reserva.'
			);
		} finally {
			isSubmitting = false;
			submitButton.disabled = false;
			submitButton.textContent = 'Confirmar reserva';
		}
	}, { signal });

	payDepositButton.addEventListener('click', () => void beginDepositFlow(), { signal });
	bindSipapCopyButtons(root, signal);
	bindSipapReceiptUpload(root, {
		signal,
		onResult: (result) => {
			const ocr = String(result.ocr_status || '').toUpperCase();
			showToast(
				result.message ||
					(ocr === 'MATCH'
						? 'Pago verificado. Turno confirmado.'
						: 'Comprobante recibido.'),
				ocr === 'MATCH' ? 'success' : 'success'
			);
		},
		onError: (message) => showToast(message, 'error'),
	});

	if (signal.aborted) return;

	refreshSummary();
	renderServices();
	renderLocations();
	renderCalendar();
	renderSlots();

	const restoreDraft = async () => {
		const draft = readPublicBookingDraft(draftStorageKey, formatApiDate(today));
		if (!draft || draft.serviceId <= 0) {
			setStep(1);
			return;
		}

		const service =
			profile.services.find((item) => item.id_service === draft.serviceId) ?? null;
		if (!service) {
			draftPersister.clear();
			setStep(1);
			return;
		}

		selectedService = service;
		selectedDate = draft.date || '';
		selectedTime = draft.time || '';
		bookingLocations = await fetchProfileLocations();
		if (signal.aborted) return;
		selectedLocation =
			(draft.locationId
				? bookingLocations.find((loc) => loc.id_location === draft.locationId)
				: null) ?? defaultLocation;

		if (!selectedLocation && bookingLocations.length === 1) {
			selectedLocation = bookingLocations[0] ?? null;
		}

		if (draft.phone) {
			customerPhoneInput.value = formatParaguayMobilePhoneInput(draft.phone);
		}
		if (draft.name) {
			customerNameInput.value = draft.name;
			setCustomerNameVisibility(true);
			setCustomerNameLocked(false);
		}
		if (depositPolicyAccept && draft.policyAccepted) {
			depositPolicyAccept.checked = true;
		}

		if (selectedDate) {
			const [y, m] = selectedDate.split('-').map(Number);
			if (y && m) visibleMonth = new Date(y, m - 1, 1);
		}

		refreshSummary();
		renderServices();
		renderLocations();
		renderCalendar();

		const wantedTime = selectedTime;

		if (selectedDate && selectedLocation) {
			await loadAvailableSlots(selectedDate, {
				preserveSelection: true,
				skipStepChange: true,
			});
			if (signal.aborted) return;

			if (wantedTime && !selectedTime) {
				showToast(SLOT_UNAVAILABLE_RESTORE_MESSAGE, 'error', 4800);
				refreshSummary();
				renderSlots();
				draftPersister.schedule();
				setStep(4);
				return;
			}
		}

		let targetStep: PublicBookingDraftStep = draft.step;
		if (!selectedService) {
			targetStep = 1;
		} else if (hasMultipleLocations() && !selectedLocation) {
			targetStep = 2;
		} else if (!selectedDate) {
			targetStep = Math.min(Math.max(draft.step, stepAfterService()), 3) as PublicBookingDraftStep;
		} else if (!selectedTime) {
			targetStep = Math.min(Math.max(draft.step, 4), 4) as PublicBookingDraftStep;
		} else {
			targetStep = Math.min(Math.max(draft.step, 5), 5) as PublicBookingDraftStep;
		}

		refreshSummary();
		renderSlots();
		setStep(targetStep);
	};

	void restoreDraft();
	root.dataset.bound = 'true';
};
