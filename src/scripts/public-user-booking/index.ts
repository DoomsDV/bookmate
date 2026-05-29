import {
	formatApiDate,
	formatLongDateFromApiDate,
	getTodayStart,
	toDateStart,
} from '../../lib/booking-datetime';
import {
	formatParaguayMobilePhoneInput,
	PARAGUAY_MOBILE_PHONE_ERROR,
	parseParaguayMobilePhone,
	toParaguayMobileE164FromInput,
} from '../../lib/paraguay-phone';
import {
	buildApiAppointmentTimes,
	createPublicAppointment,
	fetchAvailableSlots,
	startPagoparCheckout,
	validateCustomerPhone,
} from './api-client';
import {
	calculateDepositAmount,
	formatCurrency,
	formatDuration,
	formatLocationCardTitle,
} from './formatters';
import { createPublicUserMapController, type MapLocation } from './map';
import {
	USER_BOOKING_STEP_LABELS,
	buildLocationCardKey,
	parseProfileFromDom,
	type UserBookingContext,
	type UserBookingService,
	type UserBookingWizardStep,
} from './types';

const USE_DIRECT_PAGOPAR_CHECKOUT = true;
const DEFAULT_PAGOPAR_FORMA_PAGO = 9 as const;

const toPositiveInt = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const pageControllers = new WeakMap<HTMLElement, AbortController>();

const getBookingRoot = () => {
	const match = window.location.pathname.match(/\/u\/([^/?#]+)/);
	const slug = match?.[1]?.trim();
	if (!slug) return null;

	const escapeAttr = (value: string) =>
		typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
			? CSS.escape(value)
			: value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

	return document.querySelector<HTMLElement>(
		`[data-public-user-booking-root][data-public-slug="${escapeAttr(slug)}"]`
	);
};

export const initializePublicUserBookingPage = () => {
	const root = getBookingRoot();
	if (!root) return;

	pageControllers.get(root)?.abort();
	const controller = new AbortController();
	pageControllers.set(root, controller);
	const { signal } = controller;

	const profile = parseProfileFromDom(root);
	if (!profile) return;

	const locationsRoot = root.querySelector<HTMLElement>('[data-user-locations-root]');
	const calendarMonth = root.querySelector<HTMLElement>('[data-calendar-month]');
	const calendarGrid = root.querySelector<HTMLElement>('[data-calendar-grid]');
	const slotsContainer = root.querySelector<HTMLElement>('[data-slots-container]');
	const noSlotsNode = root.querySelector<HTMLElement>('[data-no-slots]');
	const slotsLoadingNode = root.querySelector<HTMLElement>('[data-slots-loading]');
	const customerForm = root.querySelector<HTMLFormElement>('[data-customer-form]');
	const customerNameWrapper = customerForm?.querySelector<HTMLElement>('[data-customer-name-wrapper]');
	const customerNameInput = customerForm?.querySelector<HTMLInputElement>('[name="customer_name"]');
	const customerPhoneInput = customerForm?.querySelector<HTMLInputElement>('[name="customer_phone"]');
	const submitButton = root.querySelector<HTMLButtonElement>('[data-submit-booking]');
	const payDepositButton = root.querySelector<HTMLButtonElement>('[data-pay-deposit-submit]');
	const submitErrorNode = root.querySelector<HTMLElement>('[data-submit-error]');
	const toastNode = root.querySelector<HTMLElement>('[data-booking-toast]');
	const stepCompactLabel = root.querySelector<HTMLElement>('[data-step-compact-label]');
	const stepProgressBar = root.querySelector<HTMLElement>('[data-step-progress-bar]');
	const stepItems = root.querySelectorAll<HTMLElement>('[data-step-item]');
	const stepPanels = root.querySelectorAll<HTMLElement>('[data-step-panel]');
	const prevMonthButton = root.querySelector<HTMLButtonElement>('[data-calendar-prev]');
	const nextMonthButton = root.querySelector<HTMLButtonElement>('[data-calendar-next]');
	const backToLocations = root.querySelector<HTMLButtonElement>('[data-back-to-locations]');
	const backToCalendar = root.querySelector<HTMLButtonElement>('[data-back-to-calendar]');
	const backToSlots = root.querySelector<HTMLButtonElement>('[data-back-to-slots]');
	const restartButton = root.querySelector<HTMLButtonElement>('[data-restart-booking]');
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

	if (
		!locationsRoot ||
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
		!prevMonthButton ||
		!nextMonthButton ||
		!backToLocations ||
		!backToCalendar ||
		!backToSlots ||
		!restartButton
	) {
		return;
	}

	const applyLocationUpdate = (updated: MapLocation) => {
		const locationId = toPositiveInt(updated.id_location, 0);
		if (!locationId) return;

		profile.locations = profile.locations.map((location) =>
			location.id_location === locationId ? { ...location, ...updated } : location
		);

		if (selectedContext?.id_location === locationId) {
			selectedContext = profile.locations.find((location) => location.id_location === locationId) ?? selectedContext;
			refreshSummary();
		}
	};

	const mapController = createPublicUserMapController({
		root,
		signal,
		onLocationUpdated: applyLocationUpdate,
	});

	const formatLocationLabel = (location: UserBookingContext | null) => {
		if (!location) return 'Ubicación no disponible';
		const title = formatLocationCardTitle(location);
		const address = String(location.address || '').trim();
		if (title && address && title !== address) return `${title} · ${address}`;
		return title || address || 'Ubicación no disponible';
	};

	const today = getTodayStart();
	let step: UserBookingWizardStep = 1;
	let expandedLocationKey = '';
	let selectedContext: UserBookingContext | null = null;
	let selectedService: UserBookingService | null = null;
	let selectedDate = '';
	let selectedTime = '';
	let availableSlots: string[] = [];
	let visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
	let isLoadingSlots = false;
	let isSubmitting = false;
	let isValidatingCustomer = false;
	let pendingAppointmentId = 0;
	let validatedCustomerPhoneE164 = '';
	let toastTimer: number | null = null;

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

	const setStep = (nextStep: UserBookingWizardStep) => {
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
					: `Paso ${cappedStep} de 4: ${USER_BOOKING_STEP_LABELS[cappedStep as 1 | 2 | 3 | 4]}`;
		}
		if (stepProgressBar) {
			stepProgressBar.style.width = `${step === 5 ? 100 : cappedStep * 25}%`;
		}
	};

	const refreshSummary = () => {
		const formattedDate = selectedDate ? formatLongDateFromApiDate(selectedDate) : '-';
		const serviceLabel = selectedService?.name || '-';
		const timeLabel = selectedTime || '-';
		const locationLabel = selectedContext
			? formatLocationLabel(selectedContext)
			: 'Ubicación no disponible';

		summaryServiceInline.textContent = serviceLabel;
		summaryDateInline.textContent = formattedDate;
		summaryProfessional.textContent = profile.full_name;
		summaryService.textContent = serviceLabel;
		summaryDate.textContent = formattedDate;
		summaryTime.textContent = timeLabel;
		summaryLocation.textContent = locationLabel;
		summaryLocation.disabled = !mapController?.canShowLocationMap(selectedContext);

		const depositAmount = calculateDepositAmount(selectedService);
		summaryDepositWrap.classList.toggle('hidden', depositAmount <= 0);
		summaryDeposit.textContent = depositAmount > 0 ? formatCurrency(depositAmount) : '';
		submitButton.classList.toggle('is-hidden', depositAmount > 0);
		payDepositButton.classList.toggle('is-hidden', depositAmount <= 0);
	};

	const renderLocations = () => {
		locationsRoot.innerHTML = '';
		if (profile.locations.length === 0) {
			const empty = document.createElement('p');
			empty.className =
				'rounded-2xl bg-[var(--surface-container-high)] px-5 py-4 text-base font-medium text-[var(--on-surface-variant)]';
			empty.textContent = 'Este profesional no tiene sucursales disponibles para reservar.';
			locationsRoot.appendChild(empty);
			return;
		}

		for (const location of profile.locations) {
			const cardKey = buildLocationCardKey(location);
			const isExpanded = expandedLocationKey === cardKey;

			const card = document.createElement('article');
			card.className =
				'user-location-card overflow-hidden rounded-2xl border border-white/5 bg-[#18181b] transition-shadow' +
				(isExpanded ? ' user-location-card--expanded shadow-lg' : '');

			const headerWrap = document.createElement('div');
			headerWrap.className = 'px-5 py-4';

			const header = document.createElement('button');
			header.type = 'button';
			header.className =
				'flex w-full items-center justify-between gap-4 text-left transition hover:opacity-90';
			header.innerHTML = `
				<span class="text-base font-semibold text-[var(--on-surface)]">${formatLocationCardTitle(location)}</span>
				<span class="material-symbols-rounded shrink-0 text-[var(--on-surface-variant)] transition-transform ${isExpanded ? 'rotate-180' : ''}">expand_more</span>
			`;

			header.addEventListener(
				'click',
				() => {
					expandedLocationKey = isExpanded ? '' : cardKey;
					renderLocations();
				},
				{ signal }
			);

			const addressText = location.address?.trim() || 'Dirección no disponible';

			const addressRow = document.createElement('div');
			addressRow.className =
				'mt-1.5 inline-flex items-start gap-1.5 text-sm font-medium text-[var(--on-surface-variant)]';

			const addressIcon = document.createElement('span');
			addressIcon.className = 'material-symbols-rounded text-base leading-none text-[var(--primary)]';
			addressIcon.textContent = 'location_on';
			addressIcon.setAttribute('aria-hidden', 'true');

			if (mapController?.canShowLocationMap(location)) {
				const addressLink = document.createElement('button');
				addressLink.type = 'button';
				addressLink.className = 'public-location-link text-left text-sm font-medium';
				addressLink.textContent = addressText;
				addressLink.addEventListener(
					'click',
					(event) => {
						event.preventDefault();
						event.stopPropagation();
						void mapController.openLocationMap(location, { fetchCoordinates: true });
					},
					{ signal }
				);
				addressRow.appendChild(addressIcon);
				addressRow.appendChild(addressLink);
			} else {
				const addressLabel = document.createElement('span');
				addressLabel.textContent = addressText;
				addressRow.appendChild(addressIcon);
				addressRow.appendChild(addressLabel);
			}

			headerWrap.appendChild(header);
			headerWrap.appendChild(addressRow);

			card.appendChild(headerWrap);

			if (isExpanded) {
				const body = document.createElement('div');
				body.className = 'grid gap-3 border-t border-white/5 px-5 py-4';

				if (location.services.length === 0) {
					const emptyServices = document.createElement('p');
					emptyServices.className = 'text-sm font-medium text-[var(--on-surface-variant)]';
					emptyServices.textContent = 'No hay servicios disponibles en esta sucursal.';
					body.appendChild(emptyServices);
				} else {
					for (const service of location.services) {
						const serviceButton = document.createElement('button');
						serviceButton.type = 'button';
						serviceButton.className =
							'grid gap-1 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-4 py-3 text-left transition hover:border-[var(--primary)] hover:bg-[var(--surface-container-high)]';
						serviceButton.innerHTML = `
							<span class="text-base font-medium text-[var(--on-surface)]">${service.name}</span>
							<span class="flex items-center justify-between gap-2 text-sm font-medium text-[var(--on-surface-variant)]">
								<span>${formatDuration(service.duration_minutes)}</span>
								<span>${formatCurrency(service.price)}</span>
							</span>
						`;
						serviceButton.addEventListener(
							'click',
							() => {
								selectedContext = location;
								selectedService = service;
								selectedDate = '';
								selectedTime = '';
								availableSlots = [];
								pendingAppointmentId = 0;
								refreshSummary();
								renderCalendar();
								setStep(2);
							},
							{ signal }
						);
						body.appendChild(serviceButton);
					}
				}

				card.appendChild(body);
			}

			locationsRoot.appendChild(card);
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
			calendarGrid.appendChild(placeholder);
		}

		for (let day = 1; day <= daysInMonth; day += 1) {
			const dateValue = new Date(year, month, day);
			const dateKey = formatApiDate(dateValue);
			const dateStart = toDateStart(dateValue);
			const isPast = dateStart.getTime() < today.getTime();
			const isSelected = selectedDate === dateKey;

			const dayButton = document.createElement('button');
			dayButton.type = 'button';
			dayButton.textContent = String(day);
			dayButton.disabled = isPast || !selectedService;
			dayButton.className =
				'flex h-10 w-10 mx-auto items-center justify-center rounded-full border text-sm font-medium transition disabled:cursor-not-allowed ' +
				(isSelected
					? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)]'
					: 'border-transparent bg-transparent text-[var(--on-surface)] hover:bg-[var(--surface-container-highest)]');

			dayButton.addEventListener(
				'click',
				() => {
					if (!selectedService || !selectedContext) return;
					selectedDate = dateKey;
					selectedTime = '';
					pendingAppointmentId = 0;
					refreshSummary();
					renderCalendar();
					void loadSlots(dateKey);
				},
				{ signal }
			);

			calendarGrid.appendChild(dayButton);
		}
	};

	const renderSlots = () => {
		slotsContainer.innerHTML = '';
		slotsLoadingNode.classList.toggle('hidden', !isLoadingSlots);
		noSlotsNode.classList.toggle('hidden', isLoadingSlots || availableSlots.length > 0);
		if (isLoadingSlots) return;

		const grid = document.createElement('div');
		grid.className = 'grid grid-cols-2 gap-3 sm:grid-cols-4';

		for (const slot of availableSlots) {
			const isSelected = selectedTime === slot;
			const button = document.createElement('button');
			button.type = 'button';
			button.textContent = slot;
			button.className =
				'rounded-xl border px-4 py-3 text-sm font-semibold transition ' +
				(isSelected
					? 'border-[var(--primary)] bg-[var(--primary-container)] text-[var(--on-primary-container)]'
					: 'border-[var(--outline-variant)] bg-[var(--surface-container-low)] text-[var(--on-surface)] hover:bg-[var(--surface-container-high)]');
			button.addEventListener(
				'click',
				() => {
					selectedTime = slot;
					pendingAppointmentId = 0;
					refreshSummary();
					renderSlots();
					setStep(4);
				},
				{ signal }
			);
			grid.appendChild(button);
		}

		slotsContainer.appendChild(grid);
	};

	const loadSlots = async (targetDate: string) => {
		if (!selectedService || !selectedContext) return;
		isLoadingSlots = true;
		availableSlots = [];
		selectedTime = '';
		renderSlots();
		setStep(3);

		try {
			availableSlots = await fetchAvailableSlots({
				pro_id: selectedContext.id_professional,
				loc_id: selectedContext.id_location,
				ser_id: selectedService.id_service,
				target_date: targetDate,
			});
		} catch (error) {
			availableSlots = [];
			showToast(error instanceof Error ? error.message : 'No fue posible consultar horarios.', 'error');
		} finally {
			isLoadingSlots = false;
			renderSlots();
		}
	};

	const setPhoneFieldError = (message: string) => {
		const node = customerForm.querySelector<HTMLElement>('[data-field-error="customer_phone"]');
		if (!node) return;
		node.textContent = message;
		node.classList.toggle('hidden', !message);
	};

	const setNameFieldError = (message: string) => {
		const node = customerForm.querySelector<HTMLElement>('[data-field-error="customer_name"]');
		if (!node) return;
		node.textContent = message;
		node.classList.toggle('hidden', !message);
	};

	const setSubmitError = (message: string) => {
		if (!submitErrorNode) return;
		submitErrorNode.textContent = message;
		submitErrorNode.classList.toggle('hidden', !message);
	};

	const resetCustomerLookupState = () => {
		validatedCustomerPhoneE164 = '';
		customerNameWrapper.classList.add('hidden');
		customerNameInput.value = '';
		customerNameInput.required = false;
	};

	const setCustomerNameVisibility = (visible: boolean) => {
		customerNameWrapper.classList.toggle('hidden', !visible);
		customerNameInput.required = visible;
	};

	const runCustomerValidation = async (phoneE164: string) => {
		if (!selectedContext) return false;
		isValidatingCustomer = true;
		try {
			const result = await validateCustomerPhone(phoneE164, selectedContext.org_id_organization);
			validatedCustomerPhoneE164 = phoneE164;
			if (result.exists && result.fullName) {
				customerNameInput.value = result.fullName;
				setCustomerNameVisibility(false);
			} else {
				setCustomerNameVisibility(true);
			}
			return true;
		} catch (error) {
			resetCustomerLookupState();
			showToast(error instanceof Error ? error.message : 'No fue posible validar el teléfono.', 'error');
			return false;
		} finally {
			isValidatingCustomer = false;
		}
	};

	const buildAppointmentPayload = async (reserveForDeposit: boolean) => {
		if (!selectedService || !selectedContext || !selectedDate || !selectedTime) {
			setSubmitError('Seleccioná sucursal, servicio, fecha y horario.');
			return null;
		}

		const rawPhone = customerPhoneInput.value.trim();
		if (!rawPhone) {
			setPhoneFieldError('El teléfono es obligatorio.');
			return null;
		}

		const parsedPhone = parseParaguayMobilePhone(toParaguayMobileE164FromInput(rawPhone));
		if (!parsedPhone.isValid) {
			setPhoneFieldError(PARAGUAY_MOBILE_PHONE_ERROR);
			return null;
		}

		customerPhoneInput.value = formatParaguayMobilePhoneInput(rawPhone);
		if (validatedCustomerPhoneE164 !== parsedPhone.e164) {
			const ok = await runCustomerValidation(parsedPhone.e164);
			if (!ok) return null;
		}

		const customerName = String(customerNameInput.value || '').trim();
		if (customerNameWrapper.classList.contains('hidden') === false && !customerName) {
			setNameFieldError('El nombre completo es obligatorio.');
			return null;
		}
		if (!customerName) {
			setNameFieldError('El nombre completo es obligatorio.');
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
			org_id_organization: selectedContext.org_id_organization,
			loc_id_location: selectedContext.id_location,
			pro_id_professional: selectedContext.id_professional,
			ser_id_service: selectedService.id_service,
			customer_name: customerName,
			customer_phone: parsedPhone.e164,
			start_time: appointmentTimes.start_time,
			end_time: appointmentTimes.end_time,
			reserve_for_deposit: reserveForDeposit,
		};
	};

	const finalizeSuccess = () => {
		ticketProfessional.textContent = profile.full_name;
		ticketService.textContent = selectedService?.name || '-';
		ticketDate.textContent = selectedDate ? formatLongDateFromApiDate(selectedDate) : '-';
		ticketTime.textContent = selectedTime || '-';
		setStep(5);
	};

	const submitBooking = async (reserveForDeposit: boolean) => {
		if (isSubmitting) return;
		setSubmitError('');
		setPhoneFieldError('');
		setNameFieldError('');

		const payload = await buildAppointmentPayload(reserveForDeposit);
		if (!payload) return;

		isSubmitting = true;
		submitButton.disabled = true;
		payDepositButton.disabled = true;

		try {
			if (reserveForDeposit && USE_DIRECT_PAGOPAR_CHECKOUT) {
				await startPagoparCheckout({
					forma_pago: DEFAULT_PAGOPAR_FORMA_PAGO,
					...payload,
				});
				return;
			}

			if (reserveForDeposit && pendingAppointmentId <= 0) {
				pendingAppointmentId = await createPublicAppointment(payload);
			} else if (!reserveForDeposit) {
				await createPublicAppointment(payload);
			}

			finalizeSuccess();
			showToast('Reserva confirmada.', 'success');
		} catch (error) {
			showToast(error instanceof Error ? error.message : 'No fue posible confirmar la reserva.', 'error');
		} finally {
			isSubmitting = false;
			submitButton.disabled = false;
			payDepositButton.disabled = false;
		}
	};

	const resetFlow = () => {
		expandedLocationKey = '';
		selectedContext = null;
		selectedService = null;
		selectedDate = '';
		selectedTime = '';
		availableSlots = [];
		pendingAppointmentId = 0;
		isLoadingSlots = false;
		customerForm.reset();
		resetCustomerLookupState();
		setSubmitError('');
		refreshSummary();
		renderLocations();
		renderCalendar();
		renderSlots();
		setStep(1);
	};

	prevMonthButton.addEventListener('click', () => {
		visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
		renderCalendar();
	}, { signal });

	nextMonthButton.addEventListener('click', () => {
		visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
		renderCalendar();
	}, { signal });

	backToLocations.addEventListener('click', () => setStep(1), { signal });
	backToCalendar.addEventListener('click', () => setStep(2), { signal });
	backToSlots.addEventListener('click', () => setStep(3), { signal });
	restartButton.addEventListener('click', resetFlow, { signal });

	summaryLocation.addEventListener(
		'click',
		(event) => {
			event.preventDefault();
			event.stopPropagation();
			if (!selectedContext) return;
			void mapController?.openLocationMap(selectedContext, { fetchCoordinates: true });
		},
		{ signal }
	);

	customerForm.addEventListener('submit', (event) => {
		event.preventDefault();
		void submitBooking(false);
	}, { signal });

	submitButton.addEventListener('click', (event) => {
		event.preventDefault();
		void submitBooking(false);
	}, { signal });

	payDepositButton.addEventListener('click', (event) => {
		event.preventDefault();
		void submitBooking(true);
	}, { signal });

	customerPhoneInput.addEventListener('input', () => {
		customerPhoneInput.value = formatParaguayMobilePhoneInput(customerPhoneInput.value);
		setPhoneFieldError('');
		setSubmitError('');
		if (validatedCustomerPhoneE164) resetCustomerLookupState();
	}, { signal });

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
		await runCustomerValidation(parsedPhone.e164);
	}, { signal });

	customerNameInput.addEventListener('input', () => {
		setNameFieldError('');
		setSubmitError('');
	}, { signal });

	refreshSummary();
	renderLocations();
	renderCalendar();
	renderSlots();
	setStep(1);
};
