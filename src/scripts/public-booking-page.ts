import {
	buildApiAppointmentTimes,
	formatApiDate,
	formatLongDateFromApiDate,
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

type WizardStep = 1 | 2 | 3 | 4 | 5;

type BookingService = {
	id_service: number;
	name: string;
	duration_minutes: number;
	price: number;
	requires_deposit?: 0 | 1;
	deposit_type?: 'PERCENT' | 'FIXED' | null;
	deposit_value?: number | null;
	deposit_amount?: number | null;
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

/** Redirige al checkout hospedado de Pagopar (sin elegir tarjeta/QR en Hasel). */
const USE_DIRECT_PAGOPAR_CHECKOUT = true;
/** Forma de pago por defecto al iniciar transacción (9 = tarjeta; Pagopar muestra el resto en su UI). */
const DEFAULT_PAGOPAR_FORMA_PAGO = 9 as const;

const formatCurrency = (value: number) =>
	new Intl.NumberFormat('es-PY', {
		style: 'currency',
		currency: 'PYG',
		maximumFractionDigits: 0,
	}).format(Number.isFinite(value) ? value : 0);

const getBookingRoot = (): HTMLElement | null => {
	const slug = window.location.pathname.match(/\/p\/([^/?#]+)/)?.[1]?.trim();
	if (slug) {
		const escapedSlug =
			typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
				? CSS.escape(slug)
				: slug.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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
	const paymentModal = root.querySelector<HTMLDialogElement>('[data-payment-modal]');
	const paymentModalClose = root.querySelector<HTMLButtonElement>('[data-payment-modal-close]');
	const paymentModalDeposit = root.querySelector<HTMLElement>('[data-payment-modal-deposit]');
	const paymentModalError = root.querySelector<HTMLElement>('[data-payment-modal-error]');
	const payMethodButtons = root.querySelectorAll<HTMLButtonElement>('[data-pay-method]');
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
	const backToCalendar = root.querySelector<HTMLButtonElement>('[data-back-to-calendar]');
	const backToSlots = root.querySelector<HTMLButtonElement>('[data-back-to-slots]');
	const restartButton = root.querySelector<HTMLButtonElement>('[data-restart-booking]');

	if (
		!servicesGrid ||
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
		!paymentModal ||
		!paymentModalClose ||
		!paymentModalDeposit ||
		!paymentModalError ||
		!summaryServiceInline ||
		!summaryDateInline ||
		!summaryProfessional ||
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
		!backToCalendar ||
		!backToSlots ||
		!restartButton
	) {
		return;
	}

	const configuredLocationId = toPositiveInt(root.dataset.locationId, 0);
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
	let customerValidationSeq = 0;
	let validatedCustomerPhoneE164 = '';
	let mapInstance: any = null;
	let mapMarker: any = null;
	let mapOpenSeq = 0;

	let toastTimer: number | null = null;
	const stepLabelByNumber: Record<1 | 2 | 3 | 4, string> = {
		1: 'Servicio',
		2: 'Fecha',
		3: 'Horario',
		4: 'Datos',
	};

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

			if (itemStep === step && step <= 4) {
				item.classList.add('step-item-current');
				continue;
			}

			if (itemStep < step || step === 5) {
				item.classList.add('step-item-done');
				continue;
			}

			item.classList.add('step-item-default');
		}

		const cappedStep = step === 5 ? 4 : step;
		if (stepCompactLabel) {
			stepCompactLabel.textContent =
				step === 5
					? 'Reserva confirmada'
					: `Paso ${cappedStep} de 4: ${stepLabelByNumber[cappedStep]}`;
		}
		if (stepProgressBar) {
			const progress = step === 5 ? 100 : cappedStep * 25;
			stepProgressBar.style.width = `${progress}%`;
		}
	};

	const getSelectedSlotKey = () =>
		selectedLocation && selectedTime
			? `${selectedLocation.id_location}:${selectedTime}`
			: '';

	const formatLocationLabel = (location: BookingLocation | null) => {
		if (!location) return 'Ubicación no disponible';
		const name = String(location.name || '').trim();
		const address = String(location.address || '').trim();
		if (name && address) return `${name} · ${address}`;
		return name || address || 'Ubicación no disponible';
	};

	const refreshSummary = () => {
		const formattedDate = selectedDate ? formatLongDateFromApiDate(selectedDate) : '-';
		const serviceLabel = selectedService ? selectedService.name : '-';
		const timeLabel = selectedTime || '-';

		summaryServiceInline.textContent = serviceLabel;
		summaryDateInline.textContent = formattedDate || '-';
		summaryProfessional.textContent = profile.full_name;
		summaryService.textContent = serviceLabel;
		summaryDate.textContent = formattedDate || '-';
		summaryTime.textContent = timeLabel;
		summaryLocation.textContent = formatLocationLabel(selectedLocation);
		summaryLocation.disabled = !canShowLocationMap(selectedLocation);

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
	};

	const resetPendingAppointment = () => {
		pendingAppointmentId = 0;
	};

	const syncPendingAppointmentContext = () => {
		if (calculateDepositAmount(selectedService) <= 0) {
			resetPendingAppointment();
		}
	};

	const renderServices = () => {
		servicesGrid.innerHTML = '';
		if (profile.services.length === 0) {
			const emptyState = document.createElement('p');
			emptyState.className =
				'rounded-2xl bg-[var(--surface-container-high)] px-5 py-4 text-base font-medium text-[var(--on-surface-variant)]';
			emptyState.textContent = 'Este profesional no tiene servicios disponibles actualmente.';
			servicesGrid.appendChild(emptyState);
			return;
		}

		for (const service of profile.services) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className =
				'group grid gap-2 rounded-2xl border px-5 py-4 text-left cursor-pointer transition ' +
				(selectedService?.id_service === service.id_service
					? 'border-[var(--primary)] bg-[var(--primary-container)]'
					: 'border-[var(--outline-variant)] bg-[var(--surface-container-low)] hover:bg-[var(--surface-container-high)]');

			button.innerHTML = `
				<span class="text-lg font-medium text-(--on-surface)">${service.name}</span>
				<div class="flex items-center justify-between gap-2 text-sm font-medium text-(--on-surface-variant)">
					<span>${formatDuration(service.duration_minutes)}</span>
					<span>${formatCurrency(service.price)}</span>
				</div>
			`;

			button.addEventListener('click', () => {
				selectedService = service;
				selectedDate = '';
				selectedTime = '';
				selectedLocation = defaultLocation;
				availableSlotGroups = [];
				resetPendingAppointment();
				refreshSummary();
				renderServices();
				renderCalendar();
				setStep(2);
			});

			servicesGrid.appendChild(button);
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
			placeholder.className = 'empty-hidden';
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
			dayButton.className =
				'flex h-10 w-10 mx-auto items-center justify-center rounded-full border text-sm font-medium cursor-pointer transition disabled:cursor-not-allowed ' +
				(isSelected
					? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)]'
					: isToday
						? 'border-[var(--primary)] bg-transparent text-[var(--primary)]'
						: 'border-transparent bg-transparent text-[var(--on-surface)] hover:bg-[var(--surface-container-highest)]');

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
				void loadAvailableSlots(dateKey);
			});

			calendarGrid.appendChild(dayButton);
		}
	};

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

		for (const group of availableSlotGroups) {
			if (group.slots.length === 0) continue;

			const section = document.createElement('section');
			section.className = 'grid gap-3';

			const headerRow = document.createElement('div');
			headerRow.className = 'flex flex-wrap items-center justify-between gap-2';

			const heading = document.createElement('h3');
			heading.className = 'text-sm font-semibold uppercase tracking-wide text-[var(--primary)]';
			heading.textContent =
				String(group.location.name || '').trim() ||
				group.location.address ||
				`Sucursal #${group.location.id_location}`;

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
			grid.className = 'grid grid-cols-2 gap-3 sm:grid-cols-4';

			for (const slot of group.slots) {
				const slotKey = `${group.location.id_location}:${slot}`;
				const slotButton = document.createElement('button');
				slotButton.type = 'button';
				slotButton.textContent = slot;
				slotButton.className =
					'flex h-11 items-center justify-center rounded-full border px-4 text-sm font-medium cursor-pointer transition ' +
					(selectedSlotKey === slotKey
						? 'border-[var(--primary)] bg-[var(--primary-container)] text-[var(--on-primary-container)]'
						: 'border-[var(--outline)] bg-transparent text-[var(--on-surface)] hover:bg-[var(--surface-container-highest)]');

				slotButton.addEventListener('click', () => {
					selectedTime = slot;
					selectedLocation = group.location;
					resetPendingAppointment();
					refreshSummary();
					renderSlots();
					setStep(4);
				});

				grid.appendChild(slotButton);
			}

			section.appendChild(grid);
			slotsContainer.appendChild(section);
		}
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

		try {
			const { data } = await fetchJson<{ data?: { locations?: unknown[] } }>(
				`/api/public/profile/${encodeURIComponent(professionalSlug)}`,
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

	const loadAvailableSlots = async (targetDate: string) => {
		if (!selectedService) return;

		isLoadingSlots = true;
		availableSlotGroups = [];
		selectedTime = '';
		selectedLocation = defaultLocation;
		renderSlots();
		setStep(3);

		try {
			bookingLocations = await fetchProfileLocations();
			const locationTargets =
				bookingLocations.length > 0
					? bookingLocations
					: defaultLocation
						? [defaultLocation]
						: configuredLocationId
							? [{ id_location: configuredLocationId, address: '' }]
							: [];

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
		selectedService = null;
		selectedDate = '';
		selectedTime = '';
		selectedLocation = defaultLocation;
		availableSlotGroups = [];
		isLoadingSlots = false;
		resetPendingAppointment();
		customerForm.reset();
		resetCustomerLookupState(true);
		setPhoneFieldError('');
		setSubmitError('');
		refreshSummary();
		renderServices();
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
	backToCalendar.addEventListener('click', () => setStep(2), { signal });
	backToSlots.addEventListener('click', () => setStep(3), { signal });
	restartButton.addEventListener('click', resetFlow, { signal });
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
		},
		{ signal }
	);

	customerPhoneInput.addEventListener(
		'input',
		() => {
			customerPhoneInput.value = formatParaguayMobilePhoneInput(customerPhoneInput.value);
			setPhoneFieldError('');
			setSubmitError('');
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

	const setPaymentModalError = (message: string) => {
		if (!message) {
			paymentModalError.textContent = '';
			paymentModalError.classList.add('hidden');
			return;
		}
		paymentModalError.textContent = message;
		paymentModalError.classList.remove('hidden');
	};

	const setPaymentMethodsLoading = (isLoading: boolean) => {
		for (const button of payMethodButtons) {
			button.disabled = isLoading;
			button.classList.toggle('is-loading', isLoading);
		}
	};

	const closePaymentModal = () => {
		if (!paymentModal.open) return;
		paymentModal.close();
		setPaymentModalError('');
		setPaymentMethodsLoading(false);
		syncPendingAppointmentContext();
	};

	const buildAppointmentHoldPayload = async () => {
		if (isValidatingCustomer) {
			setSubmitError('Estamos validando tu telefono. Espera un momento.');
			return null;
		}
		setSubmitError('');
		setPhoneFieldError('');
		setNameFieldError('');

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
			setSubmitError('Teléfono y nombre completo son obligatorios.');
			return null;
		}

		const parsedPhone = parseParaguayMobilePhone(toParaguayMobileE164FromInput(rawCustomerPhone));
		if (!parsedPhone.isValid) {
			setPhoneFieldError(PARAGUAY_MOBILE_PHONE_ERROR);
			setSubmitError('Revisa el telefono antes de continuar.');
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
			setSubmitError('Teléfono y nombre completo son obligatorios.');
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
		};
	};

	const setPayDepositButtonDefaultLabel = () => {
		payDepositButton.innerHTML =
			'<span>Pagar Seña para Confirmar</span><span aria-hidden="true">🔒</span>';
	};

	const setPayDepositButtonLoadingLabel = (label: string) => {
		payDepositButton.textContent = label;
	};

	const ensurePendingAppointment = async () => {
		const holdPayload = await buildAppointmentHoldPayload();
		if (!holdPayload) return false;

		if (pendingAppointmentId) return true;

		const created = await fetchJson<{ data?: { appointment_id?: number } }>(
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
		const appointmentId = Number(
			(created as any)?.data?.appointment_id || (created as any)?.appointment_id || 0
		);
		if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
			throw new Error('No fue posible obtener la reserva pendiente.');
		}
		pendingAppointmentId = appointmentId;
		return true;
	};

	const openPaymentModal = async () => {
		if (USE_DIRECT_PAGOPAR_CHECKOUT) {
			await startDepositCheckout(DEFAULT_PAGOPAR_FORMA_PAGO);
			return;
		}

		const depositAmount = calculateDepositAmount(selectedService);
		if (depositAmount <= 0) {
			setSubmitError('Este servicio no requiere seña.');
			return;
		}

		const reserved = await ensurePendingAppointment();
		if (!reserved) return;

		paymentModalDeposit.textContent = `Seña requerida: ${formatCurrency(depositAmount)}`;
		setPaymentModalError('');
		setPaymentMethodsLoading(false);
		if (!paymentModal.open) paymentModal.showModal();
	};

	const startDepositCheckout = async (formaPago: 9 | 24 = DEFAULT_PAGOPAR_FORMA_PAGO) => {
		if (isSubmitting) return;

		const depositAmount = calculateDepositAmount(selectedService);
		if (depositAmount <= 0) {
			setSubmitError('Este servicio no requiere seña.');
			return;
		}

		isSubmitting = true;
		payDepositButton.disabled = true;
		submitButton.disabled = true;
		setPayDepositButtonLoadingLabel('Preparando pago...');
		setSubmitError('');
		setPaymentModalError('');

		try {
			setPayDepositButtonLoadingLabel('Reservando turno...');
			const reserved = await ensurePendingAppointment();
			if (!reserved) return;

			setPayDepositButtonLoadingLabel('Redirigiendo a Pagopar...');
			const result = await fetchJson<{ data?: { checkout_url?: string } }>(
				'/api/public/payments',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Accept: 'application/json',
					},
					body: JSON.stringify({
						id_appointment: pendingAppointmentId,
						forma_pago: formaPago,
					}),
				},
				'No fue posible iniciar el pago.'
			);
			const checkoutUrl = String((result as any)?.data?.checkout_url || '').trim();
			if (!checkoutUrl) {
				throw new Error('No fue posible obtener la URL de pago.');
			}
			window.location.href = checkoutUrl;
		} catch (error) {
			if (error instanceof PublicBookingClientError && error.status === 409) {
				showToast(error.message, 'error');
				resetPendingAppointment();
				await loadAvailableSlots(selectedDate);
				setStep(3);
				return;
			}
			const message =
				error instanceof Error ? error.message : 'No fue posible iniciar el pago.';
			setSubmitError(message);
		} finally {
			isSubmitting = false;
			payDepositButton.disabled = false;
			submitButton.disabled = false;
			setPayDepositButtonDefaultLabel();
		}
	};

	const beginDepositFlow = async () => {
		if (USE_DIRECT_PAGOPAR_CHECKOUT) {
			await startDepositCheckout(DEFAULT_PAGOPAR_FORMA_PAGO);
			return;
		}
		await openPaymentModal();
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
			setSubmitError('Teléfono y nombre completo son obligatorios.');
			return;
		}

		const parsedPhone = parseParaguayMobilePhone(toParaguayMobileE164FromInput(rawCustomerPhone));
		if (!parsedPhone.isValid) {
			setPhoneFieldError(PARAGUAY_MOBILE_PHONE_ERROR);
			setSubmitError('Revisa el telefono antes de continuar.');
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
			setSubmitError('Teléfono y nombre completo son obligatorios.');
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

			setStep(5);
		} catch (error) {
			if (error instanceof PublicBookingClientError && error.status === 409) {
				showToast(error.message, 'error');
				await loadAvailableSlots(selectedDate);
				setStep(3);
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

	const handlePayClick = async (formaPago: 9 | 24) => {
		if (!pendingAppointmentId) {
			setPaymentModalError('Primero debés reservar el turno. Cerrá el modal e intentá de nuevo.');
			return;
		}

		isSubmitting = true;
		setPaymentMethodsLoading(true);
		setPaymentModalError('');
		payDepositButton.disabled = true;

		try {
			const result = await fetchJson<{ data?: { checkout_url?: string } }>(
				'/api/public/payments',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Accept: 'application/json',
					},
					body: JSON.stringify({
						id_appointment: pendingAppointmentId,
						forma_pago: formaPago,
					}),
				},
				'No fue posible iniciar el pago.'
			);
			const checkoutUrl = String((result as any)?.data?.checkout_url || '').trim();
			if (!checkoutUrl) {
				throw new Error('No fue posible obtener la URL de pago.');
			}
			window.location.href = checkoutUrl;
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'No fue posible iniciar el pago.';
			if (paymentModal.open) {
				setPaymentModalError(message);
			} else {
				setSubmitError(message);
			}
		} finally {
			isSubmitting = false;
			setPaymentMethodsLoading(false);
			payDepositButton.disabled = false;
		}
	};

	payDepositButton.addEventListener('click', () => void beginDepositFlow(), { signal });
	paymentModalClose.addEventListener('click', closePaymentModal, { signal });
	paymentModal.addEventListener('cancel', closePaymentModal, { signal });
	paymentModal.addEventListener('click', (event) => {
		if (event.target === paymentModal) closePaymentModal();
	}, { signal });

	for (const button of payMethodButtons) {
		button.addEventListener(
			'click',
			() => {
				const formaPago = Number(button.dataset.payMethod || '0');
				if (formaPago !== 9 && formaPago !== 24) return;
				void handlePayClick(formaPago as 9 | 24);
			},
			{ signal }
		);
	}

	if (signal.aborted) return;

	refreshSummary();
	renderServices();
	renderCalendar();
	renderSlots();
	setStep(1);
	root.dataset.bound = 'true';
};
