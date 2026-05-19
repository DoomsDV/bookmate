import {
	buildApiAppointmentTimes,
	formatApiDate,
	formatLongDateFromApiDate,
	getTodayStart,
	sortTimeSlotsChronologically,
	toDateStart,
} from '../lib/booking-datetime';
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
};

type BookingLocation = {
	id_location: number;
	name?: string;
	address: string;
	latitude?: number;
	longitude?: number;
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

const formatCurrency = (value: number) =>
	new Intl.NumberFormat('es-PY', {
		style: 'currency',
		currency: 'PYG',
		maximumFractionDigits: 0,
	}).format(Number.isFinite(value) ? value : 0);

const parseProfileFromDom = () => {
	const profileNode = document.getElementById('public-booking-profile-json');
	if (!profileNode) return null;

	try {
		const parsed = JSON.parse(profileNode.textContent || '{}') as BookingProfile;
		if (!parsed || typeof parsed !== 'object') return null;
		if (!Array.isArray(parsed.services)) parsed.services = [];
		if (!Array.isArray(parsed.locations)) parsed.locations = [];
		return parsed;
	} catch {
		return null;
	}
};

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

export const initializePublicBookingPage = () => {
	const root = document.querySelector<HTMLElement>('[data-public-booking-root]');
	if (!root || root.dataset.bound === 'true') return;
	root.dataset.bound = 'true';

	const profile = parseProfileFromDom();
	if (!profile) return;

	const servicesGrid = root.querySelector<HTMLElement>('[data-services-grid]');
	const calendarMonth = root.querySelector<HTMLElement>('[data-calendar-month]');
	const calendarGrid = root.querySelector<HTMLElement>('[data-calendar-grid]');
	const slotsGrid = root.querySelector<HTMLElement>('[data-slots-grid]');
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
	const submitErrorNode = root.querySelector<HTMLElement>('[data-submit-error]');
	const toastNode = root.querySelector<HTMLElement>('[data-booking-toast]');

	const summaryServiceInline = root.querySelector<HTMLElement>('[data-summary-service-inline]');
	const summaryDateInline = root.querySelector<HTMLElement>('[data-summary-date-inline]');
	const summaryProfessional = root.querySelector<HTMLElement>('[data-summary-professional]');
	const summaryService = root.querySelector<HTMLElement>('[data-summary-service]');
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
	const mapCanvas = root.querySelector<HTMLElement>('[data-public-map-canvas]');
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
		!slotsGrid ||
		!noSlotsNode ||
		!slotsLoadingNode ||
		!customerForm ||
		!customerNameWrapper ||
		!customerNameInput ||
		!customerPhoneInput ||
		!submitButton ||
		!summaryServiceInline ||
		!summaryDateInline ||
		!summaryProfessional ||
		!summaryService ||
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
	const locations = Array.isArray(profile.locations) ? profile.locations : [];
	const selectedLocation =
		locations.find((location) => location.id_location === configuredLocationId) ??
		locations[0] ??
		null;
	const locationId = selectedLocation?.id_location || configuredLocationId || 1;
	const mapsApiKey = String(root.dataset.googleMapsApiKey || '').trim();
	const today = getTodayStart();

	let step: WizardStep = 1;
	let selectedService: BookingService | null = null;
	let selectedDate = '';
	let selectedTime = '';
	let availableSlots: string[] = [];
	let visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
	let isLoadingSlots = false;
	let isSubmitting = false;
	let isValidatingCustomer = false;
	let customerValidationSeq = 0;
	let validatedCustomerPhoneE164 = '';
	let mapInstance: any = null;
	let mapMarker: any = null;

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

	const getLocationCoordinates = (): Coordinates | null => {
		const lat = Number(selectedLocation?.latitude);
		const lng = Number(selectedLocation?.longitude);
		return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
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

	const openLocationMap = async () => {
		const coords = getLocationCoordinates();
		if (!coords) {
			setMapStatus('Esta sucursal no tiene coordenadas cargadas.');
			return;
		}

		if (mapAddress) mapAddress.textContent = selectedLocation?.address || '';
		setMapStatus('');
		if (!mapModal.open) mapModal.showModal();

		try {
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
					title: selectedLocation?.name || 'Ubicación',
				});
			} else {
				mapInstance.setOptions?.({ styles: darkMapStyles });
				mapInstance.setCenter(coords);
				mapInstance.setZoom(16);
				mapMarker?.setPosition?.(coords);
			}

			window.setTimeout(() => {
				maps.event?.trigger?.(mapInstance, 'resize');
				mapInstance?.setCenter?.(coords);
			}, 80);
		} catch (error) {
			setMapStatus(error instanceof Error ? error.message : 'No fue posible mostrar el mapa.');
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
		summaryLocation.textContent = selectedLocation?.address || 'Ubicación no disponible';
		summaryLocation.disabled = !getLocationCoordinates();
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
					<span>${service.duration_minutes} min</span>
					<span>${formatCurrency(service.price)}</span>
				</div>
			`;

			button.addEventListener('click', () => {
				selectedService = service;
				selectedDate = '';
				selectedTime = '';
				availableSlots = [];
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
				refreshSummary();
				renderCalendar();
				void loadAvailableSlots(dateKey);
			});

			calendarGrid.appendChild(dayButton);
		}
	};

	const renderSlots = () => {
		slotsGrid.innerHTML = '';
		slotsLoadingNode.classList.toggle('hidden', !isLoadingSlots);
		noSlotsNode.classList.toggle('hidden', isLoadingSlots || availableSlots.length > 0);

		if (isLoadingSlots) return;

		for (const slot of availableSlots) {
			const slotButton = document.createElement('button');
			slotButton.type = 'button';
			slotButton.textContent = slot;
			slotButton.className =
				'flex h-11 items-center justify-center rounded-full border px-4 text-sm font-medium cursor-pointer transition ' +
				(selectedTime === slot
					? 'border-[var(--primary)] bg-[var(--primary-container)] text-[var(--on-primary-container)]'
					: 'border-[var(--outline)] bg-transparent text-[var(--on-surface)] hover:bg-[var(--surface-container-highest)]');

			slotButton.addEventListener('click', () => {
				selectedTime = slot;
				refreshSummary();
				renderSlots();
				setStep(4);
			});

			slotsGrid.appendChild(slotButton);
		}
	};

	const loadAvailableSlots = async (targetDate: string) => {
		if (!selectedService) return;

		isLoadingSlots = true;
		availableSlots = [];
		renderSlots();
		setStep(3);

		try {
			const params = new URLSearchParams({
				pro_id: String(profile.id_professional),
				loc_id: String(locationId),
				ser_id: String(selectedService.id_service),
				target_date: targetDate,
			});

			const { data } = await fetchJson<{ data?: unknown[] }>(
				`/api/public/available-slots?${params.toString()}`,
				{
					method: 'GET',
					headers: { Accept: 'application/json' },
				},
				'No fue posible consultar horarios disponibles.'
			);

			if (!Array.isArray(data.data)) {
				throw new Error('No fue posible consultar horarios disponibles.');
			}

			availableSlots = sortTimeSlotsChronologically(
				data.data.map((value: unknown) => String(value || '').trim())
			);
		} catch (error) {
			availableSlots = [];
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
		availableSlots = [];
		isLoadingSlots = false;
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

	prevMonthButton.addEventListener('click', () => {
		visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
		renderCalendar();
	});

	nextMonthButton.addEventListener('click', () => {
		visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
		renderCalendar();
	});

	backToServices.addEventListener('click', () => setStep(1));
	backToCalendar.addEventListener('click', () => setStep(2));
	backToSlots.addEventListener('click', () => setStep(3));
	restartButton.addEventListener('click', resetFlow);
	summaryLocation.addEventListener('click', () => {
		void openLocationMap();
	});
	mapCloseButton.addEventListener('click', () => {
		mapModal.close();
	});
	mapModal.addEventListener('click', (event) => {
		if (event.target === mapModal) mapModal.close();
	});
	setCustomerNameLocked(false);
	setCustomerNameVisibility(false);
	customerPhoneInput.value = formatParaguayMobilePhoneInput(customerPhoneInput.value);
	customerNameInput.addEventListener('input', () => {
		setNameFieldError('');
		setSubmitError('');
	});

	customerPhoneInput.addEventListener('input', () => {
		customerPhoneInput.value = formatParaguayMobilePhoneInput(customerPhoneInput.value);
		setPhoneFieldError('');
		setSubmitError('');
		if (isValidatingCustomer) resetCustomerLookupState();

		const parsedPhone = parseParaguayMobilePhone(toParaguayMobileE164FromInput(customerPhoneInput.value));
		if (!parsedPhone.isValid) {
			if (validatedCustomerPhoneE164) resetCustomerLookupState();
			return;
		}

		if (validatedCustomerPhoneE164 && parsedPhone.e164 !== validatedCustomerPhoneE164) {
			resetCustomerLookupState();
		}
	});
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
	});

	customerForm.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (isSubmitting) return;
		if (isValidatingCustomer) {
			setSubmitError('Estamos validando tu telefono. Espera un momento.');
			return;
		}
		setSubmitError('');
		setPhoneFieldError('');
		setNameFieldError('');

		if (!selectedService || !selectedDate || !selectedTime) {
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
			loc_id_location: locationId,
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
	});

	refreshSummary();
	renderServices();
	renderCalendar();
	renderSlots();
	setStep(1);
};
