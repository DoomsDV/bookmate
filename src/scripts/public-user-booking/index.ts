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
	formatBranchLabel,
} from './formatters';
import { createPublicUserMapController, type MapLocation } from './map';
import {
	buildOrganizationGroups,
	findOrganizationGroup,
	type LocationSlotGroup,
	type OrganizationBookingGroup,
} from './org-groups';
import {
	USER_BOOKING_STEP_LABELS,
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

		const selectedOrgId = selectedOrgGroup?.org_id_organization ?? 0;
		orgGroups = buildOrganizationGroups(profile.locations);
		if (selectedOrgId > 0) {
			selectedOrgGroup = findOrganizationGroup(orgGroups, selectedOrgId);
		}

		if (selectedContext?.id_location === locationId) {
			selectedContext =
				profile.locations.find((location) => location.id_location === locationId) ?? selectedContext;
			refreshSummary();
		}

		for (const group of availableSlotGroups) {
			if (group.location.id_location === locationId) {
				group.location =
					profile.locations.find((location) => location.id_location === locationId) ??
					group.location;
			}
		}

		renderOrganizationServices();
	};

	const mapController = createPublicUserMapController({
		root,
		signal,
		onLocationUpdated: applyLocationUpdate,
	});

	const formatLocationLabel = (location: UserBookingContext | null) => {
		if (!location) return 'Ubicación no disponible';
		const branch = formatBranchLabel(location);
		const org = String(
			selectedOrgGroup?.organization_name || location.organization_name || ''
		).trim();
		if (org && branch) return `${org} · ${branch}`;
		return branch || org || 'Ubicación no disponible';
	};

	const today = getTodayStart();
	let orgGroups = buildOrganizationGroups(profile.locations);
	let step: UserBookingWizardStep = 1;
	let selectedOrgGroup: OrganizationBookingGroup | null = null;
	let selectedContext: UserBookingContext | null = null;
	let selectedService: UserBookingService | null = null;
	let selectedDate = '';
	let selectedTime = '';
	let availableSlotGroups: LocationSlotGroup[] = [];
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

	const renderOrganizationServices = () => {
		orgGroups = buildOrganizationGroups(profile.locations);
		locationsRoot.innerHTML = '';

		if (orgGroups.length === 0) {
			const empty = document.createElement('p');
			empty.className =
				'rounded-2xl bg-[var(--surface-container-high)] px-5 py-4 text-base font-medium text-[var(--on-surface-variant)]';
			empty.textContent = 'Este profesional no tiene organizaciones disponibles para reservar.';
			locationsRoot.appendChild(empty);
			return;
		}

		for (const group of orgGroups) {
			const section = document.createElement('article');
			section.className =
				'user-org-group overflow-hidden rounded-2xl border border-white/5 bg-[#18181b] p-5 shadow-sm sm:p-6';

			const header = document.createElement('header');
			header.className = 'grid gap-1.5';
			header.innerHTML = `
				<h3 class="text-lg font-semibold text-[var(--on-surface)]">${group.organization_name}</h3>
			`;
			section.appendChild(header);

			const servicesGrid = document.createElement('div');
			servicesGrid.className = 'mt-5 grid gap-3 sm:grid-cols-2';

			if (group.services.length === 0) {
				const emptyServices = document.createElement('p');
				emptyServices.className = 'text-sm font-medium text-[var(--on-surface-variant)] sm:col-span-2';
				emptyServices.textContent = 'No hay servicios disponibles en esta organización.';
				servicesGrid.appendChild(emptyServices);
			} else {
				for (const service of group.services) {
					const isSelected =
						selectedOrgGroup?.org_id_organization === group.org_id_organization &&
						selectedService?.id_service === service.id_service;

					const serviceButton = document.createElement('button');
					serviceButton.type = 'button';
					serviceButton.className =
						'grid gap-1 rounded-xl border px-4 py-3 text-left transition ' +
						(isSelected
							? 'border-[var(--primary)] bg-[var(--primary-container)]'
							: 'border-[var(--outline-variant)] bg-[var(--surface-container-low)] hover:border-[var(--primary)] hover:bg-[var(--surface-container-high)]');
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
							selectedOrgGroup = group;
							selectedService = service;
							selectedContext = null;
							selectedDate = '';
							selectedTime = '';
							availableSlotGroups = [];
							pendingAppointmentId = 0;
							refreshSummary();
							renderOrganizationServices();
							renderCalendar();
							setStep(2);
						},
						{ signal }
					);
					servicesGrid.appendChild(serviceButton);
				}
			}

			section.appendChild(servicesGrid);
			locationsRoot.appendChild(section);
		}
	};

	const getSelectedSlotKey = () =>
		selectedContext && selectedTime ? `${selectedContext.id_location}:${selectedTime}` : '';

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
			const isToday = dateStart.getTime() === today.getTime();
			const isSelected = selectedDate === dateKey;

			const dayButton = document.createElement('button');
			dayButton.type = 'button';
			dayButton.textContent = String(day);
			dayButton.disabled = isPast || !selectedService;
			dayButton.className =
				'flex h-10 w-10 mx-auto items-center justify-center rounded-full border text-sm font-medium transition disabled:cursor-not-allowed ' +
				(isSelected
					? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)]'
					: isToday
						? 'border-[var(--primary)] bg-transparent text-[var(--primary)]'
						: 'border-transparent bg-transparent text-[var(--on-surface)] hover:bg-[var(--surface-container-highest)]');

			dayButton.addEventListener(
				'click',
				() => {
					if (!selectedService || !selectedOrgGroup) return;
					selectedDate = dateKey;
					selectedTime = '';
					selectedContext = null;
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
			heading.textContent = formatBranchLabel(group.location);

			const locationButton = document.createElement('button');
			locationButton.type = 'button';
			locationButton.className = 'public-location-link text-sm font-medium';
			locationButton.innerHTML =
				'<span class="material-symbols-rounded text-base leading-none">location_on</span><span class="public-location-link__label">Ver ubicación</span>';
			locationButton.addEventListener(
				'click',
				() => {
					void mapController?.openLocationMap(group.location, { fetchCoordinates: true });
				},
				{ signal }
			);

			headerRow.appendChild(heading);
			if (mapController?.canShowLocationMap(group.location)) {
				headerRow.appendChild(locationButton);
			}
			section.appendChild(headerRow);

			const grid = document.createElement('div');
			grid.className = 'grid grid-cols-2 gap-3 sm:grid-cols-4';

			for (const slot of group.slots) {
				const slotKey = `${group.location.id_location}:${slot}`;
				const isSelected = selectedSlotKey === slotKey;
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
						selectedContext = group.location;
						pendingAppointmentId = 0;
						refreshSummary();
						renderSlots();
						setStep(4);
					},
					{ signal }
				);
				grid.appendChild(button);
			}

			section.appendChild(grid);
			slotsContainer.appendChild(section);
		}
	};

	const loadSlots = async (targetDate: string) => {
		const service = selectedService;
		const orgGroup = selectedOrgGroup;
		if (!service || !orgGroup) return;
		isLoadingSlots = true;
		availableSlotGroups = [];
		selectedTime = '';
		selectedContext = null;
		renderSlots();
		setStep(3);

		try {
			const results = await Promise.allSettled(
				orgGroup.locations.map(async (location) => ({
					location,
					slots: await fetchAvailableSlots({
						pro_id: location.id_professional,
						loc_id: location.id_location,
						ser_id: service.id_service,
						target_date: targetDate,
					}),
				}))
			);

			if (results.every((result) => result.status === 'rejected')) {
				const firstError = results.find(
					(result): result is PromiseRejectedResult => result.status === 'rejected'
				);
				throw firstError?.reason;
			}

			availableSlotGroups = results
				.filter(
					(result): result is PromiseFulfilledResult<LocationSlotGroup> =>
						result.status === 'fulfilled'
				)
				.map((result) => result.value)
				.filter((group) => group.slots.length > 0)
				.sort((left, right) =>
					formatBranchLabel(left.location).localeCompare(
						formatBranchLabel(right.location),
						'es',
						{ sensitivity: 'base' }
					)
				);
		} catch (error) {
			availableSlotGroups = [];
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
		const orgId =
			selectedContext?.org_id_organization ?? selectedOrgGroup?.org_id_organization ?? 0;
		if (!orgId) return false;
		isValidatingCustomer = true;
		try {
			const result = await validateCustomerPhone(phoneE164, orgId);
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
			setSubmitError('Seleccioná servicio, fecha, horario y sucursal.');
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
		orgGroups = buildOrganizationGroups(profile.locations);
		selectedOrgGroup = null;
		selectedContext = null;
		selectedService = null;
		selectedDate = '';
		selectedTime = '';
		availableSlotGroups = [];
		pendingAppointmentId = 0;
		isLoadingSlots = false;
		customerForm.reset();
		resetCustomerLookupState();
		setSubmitError('');
		refreshSummary();
		renderOrganizationServices();
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
	renderOrganizationServices();
	renderCalendar();
	renderSlots();
	setStep(1);
};
