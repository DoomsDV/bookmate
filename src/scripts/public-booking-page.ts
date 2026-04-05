import {
	PARAGUAY_MOBILE_PHONE_ERROR,
	parseParaguayMobilePhone,
} from '../lib/paraguay-phone';

type WizardStep = 1 | 2 | 3 | 4 | 5;

type BookingService = {
	id_service: number;
	name: string;
	duration_minutes: number;
	price: number;
};

type BookingProfile = {
	id_professional: number;
	org_id_organization: number;
	full_name: string;
	specialty: string;
	image_url: string;
	services: BookingService[];
};

const toPositiveInt = (value: unknown, fallback = 1) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const toDateStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const formatYmd = (date: Date) => {
	const pad = (value: number) => String(value).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const parseYmdDate = (value: string) => {
	const [year, month, day] = value.split('-').map((part) => Number(part));
	if (!year || !month || !day) return null;
	return new Date(year, month - 1, day);
};

const formatCurrency = (value: number) =>
	new Intl.NumberFormat('es-PY', {
		style: 'currency',
		currency: 'PYG',
		maximumFractionDigits: 0,
	}).format(Number.isFinite(value) ? value : 0);

const formatLongDate = (value: string) => {
	const parsed = parseYmdDate(value);
	if (!parsed) return '';
	return new Intl.DateTimeFormat('es-PY', {
		weekday: 'long',
		day: '2-digit',
		month: 'long',
		year: 'numeric',
	}).format(parsed);
};

const formatIsoWithOffset = (date: Date) => {
	const pad = (value: number) => String(value).padStart(2, '0');
	const offsetMinutes = -date.getTimezoneOffset();
	const sign = offsetMinutes >= 0 ? '+' : '-';
	const absoluteOffset = Math.abs(offsetMinutes);
	const offsetHour = pad(Math.floor(absoluteOffset / 60));
	const offsetMinute = pad(absoluteOffset % 60);

	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00${sign}${offsetHour}:${offsetMinute}`;
};

const parseProfileFromDom = () => {
	const profileNode = document.getElementById('public-booking-profile-json');
	if (!profileNode) return null;

	try {
		const parsed = JSON.parse(profileNode.textContent || '{}') as BookingProfile;
		if (!parsed || typeof parsed !== 'object') return null;
		if (!Array.isArray(parsed.services)) parsed.services = [];
		return parsed;
	} catch {
		return null;
	}
};

const readApiMessage = (data: any, fallbackMessage: string) => {
	const message = typeof data?.message === 'string' ? data.message.trim() : '';
	return message || fallbackMessage;
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
	const ticketProfessional = root.querySelector<HTMLElement>('[data-ticket-professional]');
	const ticketService = root.querySelector<HTMLElement>('[data-ticket-service]');
	const ticketDate = root.querySelector<HTMLElement>('[data-ticket-date]');
	const ticketTime = root.querySelector<HTMLElement>('[data-ticket-time]');
	const stepCompactLabel = root.querySelector<HTMLElement>('[data-step-compact-label]');
	const stepProgressBar = root.querySelector<HTMLElement>('[data-step-progress-bar]');

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
		!customerPhoneInput ||
		!submitButton ||
		!summaryServiceInline ||
		!summaryDateInline ||
		!summaryProfessional ||
		!summaryService ||
		!summaryDate ||
		!summaryTime ||
		!ticketProfessional ||
		!ticketService ||
		!ticketDate ||
		!ticketTime ||
		!prevMonthButton ||
		!nextMonthButton ||
		!backToServices ||
		!backToCalendar ||
		!backToSlots ||
		!restartButton
	) {
		return;
	}

	const locationId = toPositiveInt(root.dataset.locationId, 1);
	const today = toDateStart(new Date());

	let step: WizardStep = 1;
	let selectedService: BookingService | null = null;
	let selectedDate = '';
	let selectedTime = '';
	let availableSlots: string[] = [];
	let visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
	let isLoadingSlots = false;
	let isSubmitting = false;

	let toastTimer: number | null = null;
	const stepLabelByNumber: Record<1 | 2 | 3 | 4, string> = {
		1: 'Servicio',
		2: 'Fecha',
		3: 'Horario',
		4: 'Datos',
	};

	const showToast = (message: string, kind: 'success' | 'error' = 'error') => {
		if (!toastNode) return;
		toastNode.textContent = message;
		toastNode.classList.remove('hidden', 'is-success', 'is-error');
		toastNode.classList.add(kind === 'success' ? 'is-success' : 'is-error');

		if (toastTimer) window.clearTimeout(toastTimer);
		toastTimer = window.setTimeout(() => {
			toastNode.classList.add('hidden');
			toastNode.classList.remove('is-success', 'is-error');
		}, 3600);
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
		const formattedDate = selectedDate ? formatLongDate(selectedDate) : '-';
		const serviceLabel = selectedService ? selectedService.name : '-';
		const timeLabel = selectedTime || '-';

		summaryServiceInline.textContent = serviceLabel;
		summaryDateInline.textContent = formattedDate || '-';
		summaryProfessional.textContent = profile.full_name;
		summaryService.textContent = serviceLabel;
		summaryDate.textContent = formattedDate || '-';
		summaryTime.textContent = timeLabel;
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
				'group grid gap-2 rounded-2xl border px-5 py-4 text-left transition ' +
				(selectedService?.id_service === service.id_service
					? 'border-[var(--primary)] bg-[var(--primary-container)]'
					: 'border-[var(--outline-variant)] bg-[var(--surface-container-low)] hover:bg-[var(--surface-container-high)]');

			button.innerHTML = `
				<span class="text-lg font-medium text-[var(--on-surface)]">${service.name}</span>
				<div class="flex items-center justify-between gap-2 text-sm font-medium text-[var(--on-surface-variant)]">
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
			const dateKey = formatYmd(dateValue);
			const dateStart = toDateStart(dateValue);
			const isPast = dateStart.getTime() < today.getTime();
			const isToday = dateStart.getTime() === today.getTime();
			const isSelected = selectedDate === dateKey;

			const dayButton = document.createElement('button');
			dayButton.type = 'button';
			dayButton.textContent = String(day);
			dayButton.disabled = isPast || !selectedService;
			dayButton.className =
				'flex h-10 w-10 mx-auto items-center justify-center rounded-full border text-sm font-medium transition ' +
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
				'flex h-11 items-center justify-center rounded-full border px-4 text-sm font-medium transition ' +
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

			const response = await fetch(`/api/public/available-slots?${params.toString()}`, {
				method: 'GET',
				headers: { Accept: 'application/json' },
			});
			const data = await response.json();

			if (!response.ok || !data || data.status !== 'success' || !Array.isArray(data.data)) {
				throw new Error(readApiMessage(data, 'No fue posible consultar horarios disponibles.'));
			}

			availableSlots = data.data
				.map((value: unknown) => String(value || '').trim())
				.filter((slot: string) => /^\d{2}:\d{2}$/.test(slot));
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
	customerPhoneInput.addEventListener('input', () => setPhoneFieldError(''));
	customerPhoneInput.addEventListener('blur', () => {
		const rawPhone = customerPhoneInput.value.trim();
		if (!rawPhone) {
			setPhoneFieldError('');
			return;
		}

		const parsedPhone = parseParaguayMobilePhone(rawPhone);
		if (!parsedPhone.isValid) {
			setPhoneFieldError(PARAGUAY_MOBILE_PHONE_ERROR);
			return;
		}

		customerPhoneInput.value = parsedPhone.pretty;
		setPhoneFieldError('');
	});

	customerForm.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (isSubmitting) return;
		setSubmitError('');
		setPhoneFieldError('');

		if (!selectedService || !selectedDate || !selectedTime) {
			setSubmitError('Selecciona servicio, fecha y horario antes de confirmar.');
			return;
		}

		const formData = new FormData(customerForm);
		const customerName = String(formData.get('customer_name') || '').trim();
		const rawCustomerPhone = customerPhoneInput.value.trim();

		if (!customerName || !rawCustomerPhone) {
			if (!rawCustomerPhone) setPhoneFieldError('El telefono es obligatorio.');
			setSubmitError('Nombre y telefono son obligatorios.');
			return;
		}

		const parsedPhone = parseParaguayMobilePhone(rawCustomerPhone);
		if (!parsedPhone.isValid) {
			setPhoneFieldError(PARAGUAY_MOBILE_PHONE_ERROR);
			setSubmitError('Revisa el telefono antes de continuar.');
			return;
		}

		const customerPhone = parsedPhone.e164;
		customerPhoneInput.value = parsedPhone.pretty;

		const startDate = new Date(`${selectedDate}T${selectedTime}:00`);
		if (Number.isNaN(startDate.getTime())) {
			setSubmitError('No fue posible interpretar la fecha y hora seleccionada.');
			return;
		}

		const endDate = new Date(startDate.getTime() + selectedService.duration_minutes * 60 * 1000);
		const payload = {
			org_id_organization: profile.org_id_organization,
			loc_id_location: locationId,
			pro_id_professional: profile.id_professional,
			ser_id_service: selectedService.id_service,
			customer_name: customerName,
			customer_phone: customerPhone,
			start_time: formatIsoWithOffset(startDate),
			end_time: formatIsoWithOffset(endDate),
		};

		isSubmitting = true;
		submitButton.disabled = true;
		submitButton.textContent = 'Confirmando...';

		try {
			const response = await fetch('/api/public/appointments', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
				},
				body: JSON.stringify(payload),
			});
			const data = await response.json();

			if (!response.ok || !data || data.status !== 'success') {
				const apiMessage = readApiMessage(data, 'No fue posible confirmar tu reserva.');

				if (response.status === 409) {
					showToast(apiMessage, 'error');
					await loadAvailableSlots(selectedDate);
					setStep(3);
					return;
				}

				setSubmitError(apiMessage);
				return;
			}

			ticketProfessional.textContent = profile.full_name;
			ticketService.textContent = selectedService.name;
			ticketDate.textContent = formatLongDate(selectedDate);
			ticketTime.textContent = selectedTime;

			showToast(readApiMessage(data, 'Cita confirmada!'), 'success');
			setStep(5);
		} catch (error) {
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
