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

type PublicReservationDetail = {
	id_appointment: number;
	pro_id_professional: number;
	loc_id_location: number;
	ser_id_service: number;
	start_time: string;
	end_time?: string;
	status?: string;
	duration_minutes?: number;
};

const parseReservationFromDom = () => {
	const jsonScript = document.getElementById('reservation-json');
	if (!jsonScript?.textContent) return null;

	try {
		return JSON.parse(jsonScript.textContent) as PublicReservationDetail;
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

	const reservation = parseReservationFromDom();
	if (!reservation) return;

	const token = root.dataset.token || '';
	const isCancelledReservation =
		String(reservation.status || '').trim().toUpperCase() === 'CANCELADO';
	if (isCancelledReservation) return;

	const form = root.querySelector<HTMLFormElement>('[data-reservation-form]');
	const dateInput = root.querySelector<HTMLInputElement>('[data-reservation-date]');
	const slotInput = root.querySelector<HTMLInputElement>('[data-reservation-slot]');
	const slotsPanel = root.querySelector<HTMLElement>('[data-reservation-slots-panel]');
	const slotsGrid = root.querySelector<HTMLElement>('[data-reservation-slots]');
	const slotsLoading = root.querySelector<HTMLElement>('[data-reservation-slots-loading]');
	const noSlots = root.querySelector<HTMLElement>('[data-no-reservation-slots]');
	const selectedDateLabel = root.querySelector<HTMLElement>('[data-reservation-selected-date]');
	const cancelButton = root.querySelector<HTMLButtonElement>('[data-cancel-reservation]');
	const currentDate = root.querySelector<HTMLElement>('[data-current-date]');
	const statusText = root.querySelector<HTMLElement>('[data-status-text]');
	const calendarMonth = root.querySelector<HTMLElement>('[data-calendar-month]');
	const calendarGrid = root.querySelector<HTMLElement>('[data-calendar-grid]');
	const prevMonthButton = root.querySelector<HTMLButtonElement>('[data-calendar-prev]');
	const nextMonthButton = root.querySelector<HTMLButtonElement>('[data-calendar-next]');

	if (
		!form ||
		!dateInput ||
		!slotInput ||
		!slotsPanel ||
		!slotsGrid ||
		!slotsLoading ||
		!noSlots ||
		!selectedDateLabel ||
		!cancelButton ||
		!calendarMonth ||
		!calendarGrid ||
		!prevMonthButton ||
		!nextMonthButton
	) {
		return;
	}

	const start = parseApiDateTime(reservation.start_time);
	if (!start) return;

	const durationMinutes = Number(reservation.duration_minutes || 30);
	const today = getTodayStart();
	const initialDate = resolveInitialSelectableDate(start, today);

	let selectedDate = '';
	let selectedSlot = '';
	let availableSlots: string[] = [];
	let visibleMonth = new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);
	let isLoadingSlots = false;

	if (currentDate) currentDate.textContent = formatHumanDateTime(start);

	const setSlotsPanelVisible = (visible: boolean) => {
		slotsPanel.classList.toggle('hidden', !visible);
	};

	const selectDate = (
		date: Date,
		options: { loadSlots?: boolean; showSlotsPanel?: boolean } = {}
	) => {
		const dateStart = toDateStart(date);
		const dateKey = formatApiDate(dateStart);
		selectedDate = dateKey;
		dateInput.value = dateKey;
		selectedDateLabel.textContent = formatLongDateFromApiDate(dateKey);
		if (options.showSlotsPanel) setSlotsPanelVisible(true);
		renderCalendar();
		if (options.loadSlots) void loadSlots(dateKey);
	};

	const renderSlotButtons = () => {
		slotsGrid.innerHTML = '';
		slotsLoading.classList.toggle('hidden', !isLoadingSlots);
		noSlots.classList.toggle('hidden', isLoadingSlots || availableSlots.length > 0);

		if (isLoadingSlots) return;

		for (const slot of availableSlots) {
			const button = document.createElement('button');
			button.type = 'button';
			button.textContent = slot;
			button.className =
				'flex h-11 items-center justify-center rounded-full border px-4 text-sm font-medium cursor-pointer transition ' +
				(selectedSlot === slot
					? 'border-[var(--primary)] bg-[var(--primary-container)] text-[var(--on-primary-container)]'
					: 'border-[var(--outline)] bg-transparent text-[var(--on-surface)] hover:bg-[var(--surface-container-highest)]');
			button.addEventListener('click', () => {
				selectedSlot = slot;
				slotInput.value = slot;
				renderSlotButtons();
			});
			slotsGrid.appendChild(button);
		}
	};

	const loadSlots = async (targetDate: string) => {
		if (!targetDate) return;

		isLoadingSlots = true;
		availableSlots = [];
		selectedSlot = '';
		slotInput.value = '';
		renderSlotButtons();

		try {
			const params = new URLSearchParams({
				pro_id: String(reservation.pro_id_professional),
				loc_id: String(reservation.loc_id_location),
				ser_id: String(reservation.ser_id_service),
				target_date: targetDate,
			});
			if (reservation.id_appointment > 0) {
				params.set('exclude_app_id', String(reservation.id_appointment));
			}
			const response = await fetch(`/api/public/available-slots?${params.toString()}`);
			const data = await response.json().catch(() => ({}));

			if (!response.ok || data.status !== 'success' || !Array.isArray(data.data)) {
				showToast(data.message || 'No fue posible cargar horarios.', 'error');
				availableSlots = [];
				return;
			}

			const reservationStart = parseApiDateTime(reservation.start_time);
			const currentSlot =
				reservationStart && targetDate === formatApiDate(reservationStart)
					? formatApiTime(reservationStart)
					: '';
			const apiSlots = data.data
				.map((value: unknown) => String(value || '').trim())
				.filter(isValidApiTimeSlot);
			const slotsWithReservation =
				currentSlot && !apiSlots.includes(currentSlot) ? [...apiSlots, currentSlot] : apiSlots;
			availableSlots = sortTimeSlotsChronologically(slotsWithReservation);
			selectedSlot = currentSlot && availableSlots.includes(currentSlot) ? currentSlot : '';
			slotInput.value = selectedSlot;
		} finally {
			isLoadingSlots = false;
			renderSlotButtons();
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
				'flex h-10 w-10 mx-auto items-center justify-center rounded-full border text-sm font-medium cursor-pointer transition disabled:cursor-not-allowed ' +
				(isSelected
					? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)]'
					: isToday
						? 'border-[var(--primary)] bg-transparent text-[var(--primary)]'
						: 'border-transparent bg-transparent text-[var(--on-surface)] hover:bg-[var(--surface-container-highest)]');

			dayButton.addEventListener('click', () => {
				selectDate(dateValue, { loadSlots: true, showSlotsPanel: true });
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

		const nextStart = parseApiDateTime(updated.start_time);
		if (!nextStart) return false;

		if (statusText) statusText.textContent = String(updated.status || reservation.status || '');
		if (currentDate) currentDate.textContent = formatHumanDateTime(nextStart);

		const nextDate = resolveInitialSelectableDate(nextStart, today);
		visibleMonth = new Date(nextDate.getFullYear(), nextDate.getMonth(), 1);
		selectDate(nextDate, { showSlotsPanel: true });
		await loadSlots(formatApiDate(nextDate));
		return true;
	};

	prevMonthButton.addEventListener('click', () => {
		visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
		renderCalendar();
	});

	nextMonthButton.addEventListener('click', () => {
		visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
		renderCalendar();
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

		const response = await fetch(`/api/public/reservations/${encodeURIComponent(token)}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify(appointmentTimes),
		});
		const data = await response.json().catch(() => ({}));
		if (response.ok) {
			await refreshReservationSummary();
			showToast('Tu cita se modificó correctamente.', 'success');
			return;
		}
		showToast(data.message || 'No fue posible actualizar tu cita.', 'error');
	});

	cancelButton.addEventListener('click', async () => {
		const confirmed = window.BookmateAlert?.confirm
			? await window.BookmateAlert.confirm({
					type: 'warning',
					title: 'Cancelar reserva',
					message: 'Esta acción cancelará tu reserva. ¿Deseas continuar?',
					confirmText: 'Sí, cancelar',
					cancelText: 'Volver',
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

	selectDate(initialDate, { loadSlots: true, showSlotsPanel: true });
};
