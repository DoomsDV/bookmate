import { Calendar, type DateSelectArg, type EventDropArg } from '@fullcalendar/core';
import esLocale from '@fullcalendar/core/locales/es';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventResizeDoneArg } from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import {
	PARAGUAY_MOBILE_PHONE_ERROR,
	parseParaguayMobilePhone,
} from '../lib/paraguay-phone';

type Option = { id: number; name: string };
type SessionData = { role_id: number; user_id: number; professional_id: number };
type AppointmentDetail = {
	id_appointment: number;
	loc_id_location: number;
	pro_id_professional: number;
	ser_id_service: number;
	customer_name: string;
	customer_phone: string;
	status: string;
	start_time: string;
	end_time: string;
};

type AppointmentFormPayload = {
	loc_id_location: number;
	pro_id_professional: number;
	ser_id_service: number;
	customer_name: string;
	customer_phone: string;
	start_time: string;
	end_time: string;
	status: string;
};

type BuildPayloadResult = { payload: AppointmentFormPayload } | { error: string };

const toInt = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) ? parsed : fallback;
};

const formatDateTimeLocal = (date: Date) => {
	const pad = (value: number) => String(value).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const parseIsoToLocalInput = (value: string) => {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return formatDateTimeLocal(date);
};

const toIsoWithOffset = (value: string) => {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';

	const pad = (num: number) => String(num).padStart(2, '0');
	const year = date.getFullYear();
	const month = pad(date.getMonth() + 1);
	const day = pad(date.getDate());
	const hour = pad(date.getHours());
	const minute = pad(date.getMinutes());
	const offsetMinutes = -date.getTimezoneOffset();
	const sign = offsetMinutes >= 0 ? '+' : '-';
	const absOffset = Math.abs(offsetMinutes);
	const tzHour = pad(Math.floor(absOffset / 60));
	const tzMinute = pad(absOffset % 60);

	return `${year}-${month}-${day}T${hour}:${minute}:00${sign}${tzHour}:${tzMinute}`;
};

const readApiError = (data: any, fallbackMessage: string) => {
	if (typeof data?.message === 'string' && data.message.trim()) return data.message.trim();
	if (Array.isArray(data?.errors) && data.errors.length > 0) {
		const messages = data.errors
			.filter((item: any) => item && typeof item === 'object')
			.map((item: any) => String(item.message || '').trim())
			.filter((message: string) => message.length > 0);
		if (messages.length > 0) return messages.join(' | ');
	}
	return fallbackMessage;
};

const showSuccessAlert = async (message: string) => {
	if (!window.BookmateAlert?.alert) return;
	await window.BookmateAlert.alert({
		type: 'success',
		title: 'Operacion exitosa',
		message,
		confirmText: 'Aceptar',
	});
};

const showErrorAlert = async (message: string) => {
	if (!window.BookmateAlert?.alert) return;
	await window.BookmateAlert.alert({
		type: 'error',
		title: 'No fue posible completar la accion',
		message,
		confirmText: 'Aceptar',
	});
};

export const initializeCalendarPage = () => {
	const root = document.querySelector<HTMLElement>('[data-calendar-root]');
	if (!root || root.dataset.bound === 'true') return;

	const debugInfo = (message: string, details?: unknown) => {
		console.info('[calendar-page]', message, details ?? '');
	};
	const debugError = (message: string, details?: unknown) => {
		console.error('[calendar-page]', message, details ?? '');
	};

	debugInfo('initializeCalendarPage:start', {
		pathname: window.location.pathname,
		search: window.location.search,
	});

	const calendarEl = root.querySelector<HTMLElement>('[data-calendar-el]');
	const loadingNode = root.querySelector<HTMLElement>('[data-calendar-loading]');
	const pageErrorNode = root.querySelector<HTMLElement>('[data-calendar-error]');
	const openModalButton = root.querySelector<HTMLButtonElement>('[data-open-appointment-modal]');
	const professionalFilterWrap = root.querySelector<HTMLElement>('[data-professional-filter-wrap]');
	const professionalFilter = root.querySelector<HTMLSelectElement>('[data-professional-filter]');
	const locationFilter = root.querySelector<HTMLSelectElement>('[data-location-filter]');

	const modal = document.querySelector<HTMLDialogElement>('[data-appointment-modal]');
	const modalTitle = document.querySelector<HTMLElement>('[data-appointment-modal-title]');
	const modalDescription = document.querySelector<HTMLElement>('[data-appointment-modal-description]');
	const form = document.querySelector<HTMLFormElement>('[data-appointment-form]');
	const formErrorNode = form?.querySelector<HTMLElement>('[data-form-error]');
	const fieldErrorNodes = form?.querySelectorAll<HTMLElement>('[data-field-error]');
	const modalLoadingNode = form?.querySelector<HTMLElement>('[data-appointment-loading]');
	const closeModalButton = form?.querySelector<HTMLButtonElement>('[data-close-appointment-modal]');
	const submitButton = form?.querySelector<HTMLButtonElement>('[data-submit-appointment]');
	const submitLabel = form?.querySelector<HTMLElement>('[data-submit-appointment-label]');
	const submitIcon = form?.querySelector<HTMLElement>('[data-submit-appointment-icon]');
	const deleteButton = form?.querySelector<HTMLButtonElement>('[data-delete-appointment]');
	const customerNameInput = form?.querySelector<HTMLInputElement>('[name="customer_name"]');
	const customerPhoneInput = form?.querySelector<HTMLInputElement>('[name="customer_phone"]');
	const startInput = form?.querySelector<HTMLInputElement>('[name="start_time"]');
	const endInput = form?.querySelector<HTMLInputElement>('[name="end_time"]');
	const statusInput = form?.querySelector<HTMLSelectElement>('[data-modal-status]');
	const modalProfessionalWrap = form?.querySelector<HTMLElement>('[data-modal-professional-wrap]');
	const modalProfessional = form?.querySelector<HTMLSelectElement>('[data-modal-professional]');
	const modalLocation = form?.querySelector<HTMLSelectElement>('[data-modal-location]');
	const modalService = form?.querySelector<HTMLSelectElement>('[data-modal-service]');
	const formFields = form?.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select');

	const scheduleInitRetry = () => {
		const attempts = toInt(root.dataset.initAttempts, 0) + 1;
		if (attempts > 6) {
			delete root.dataset.initAttempts;
			if (pageErrorNode) {
				pageErrorNode.textContent =
					'No fue posible inicializar el calendario. Recarga la pagina para reintentar.';
				pageErrorNode.classList.remove('hidden');
			}
			console.error('Calendar init aborted: required DOM nodes were not found.');
			return;
		}
		root.dataset.initAttempts = String(attempts);
		window.setTimeout(() => {
			initializeCalendarPage();
		}, 60);
	};

	const requiredNodes = {
		calendarEl,
		professionalFilter,
		locationFilter,
		openModalButton,
		modal,
		form,
		submitButton,
		submitLabel,
		submitIcon,
		deleteButton,
		customerNameInput,
		customerPhoneInput,
		startInput,
		endInput,
		statusInput,
		modalProfessionalWrap,
		modalProfessional,
		modalLocation,
		modalService,
	};
	const missingNodes = Object.entries(requiredNodes)
		.filter(([, value]) => !value)
		.map(([name]) => name);

	if (missingNodes.length > 0) {
		debugInfo('initializeCalendarPage:missing-required-nodes', {
			missingNodes,
			attempt: toInt(root.dataset.initAttempts, 0) + 1,
		});
		scheduleInitRetry();
		return;
	}

	delete root.dataset.initAttempts;
	root.dataset.bound = 'true';
	debugInfo('initializeCalendarPage:bound');

	let calendar: Calendar | null = null;
	let isSubmitting = false;
	let isModalLoading = false;
	let closeTimer: number | null = null;
	let mode: 'create' | 'edit' = 'create';
	let editingAppointmentId = 0;
	let roleId = 0;
	let currentProfessionalId = 0;

	let professionals: Option[] = [];
	let locations: Option[] = [];
	let services: Option[] = [];

	const currentUrl = new URL(window.location.href);
	if (currentUrl.searchParams.has('flash_message')) {
		currentUrl.searchParams.delete('flash_message');
		currentUrl.searchParams.delete('flash_type');
		window.history.replaceState({}, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
	}

	const clearPageError = () => {
		if (!pageErrorNode) return;
		pageErrorNode.textContent = '';
		pageErrorNode.classList.add('hidden');
	};

	const showPageError = (message: string) => {
		if (!pageErrorNode) return;
		pageErrorNode.textContent = message;
		pageErrorNode.classList.remove('hidden');
	};

	const clearFormErrors = () => {
		if (formErrorNode) {
			formErrorNode.textContent = '';
			formErrorNode.classList.add('hidden');
		}
		for (const node of fieldErrorNodes ?? []) {
			node.textContent = '';
			node.classList.add('hidden');
		}
	};

	const showFormError = (message: string) => {
		if (!formErrorNode) return;
		formErrorNode.textContent = message;
		formErrorNode.classList.remove('hidden');
	};

	const setFieldError = (field: string, message: string) => {
		const fieldNode = form.querySelector<HTMLElement>(`[data-field-error="${field}"]`);
		if (!fieldNode) return;
		if (!message) {
			fieldNode.textContent = '';
			fieldNode.classList.add('hidden');
			return;
		}
		fieldNode.textContent = message;
		fieldNode.classList.remove('hidden');
	};

	const applyFieldErrors = (errors: unknown) => {
		if (!Array.isArray(errors)) return;
		for (const item of errors) {
			if (!item || typeof item !== 'object') continue;
			const source = item as Record<string, unknown>;
			const field = String(source.field || '').trim();
			const message = String(source.message || '').trim();
			if (!field || !message) continue;
			setFieldError(field, message);
		}
	};

	const setCalendarLoading = (value: boolean) => {
		if (loadingNode) loadingNode.classList.toggle('hidden', !value);
		professionalFilter.disabled = value || roleId === 3;
		locationFilter.disabled = value;
		openModalButton.disabled = value;
	};

	const setModalLoading = (value: boolean) => {
		isModalLoading = value;
		modalLoadingNode?.classList.toggle('hidden', !value);
		modalLoadingNode?.classList.toggle('flex', value);

		for (const field of formFields ?? []) {
			field.disabled = value;
		}
		submitButton.disabled = value;
		if (mode === 'edit') deleteButton.disabled = value;
	};

	const setSubmittingState = (value: boolean, label = 'Procesando...') => {
		isSubmitting = value;
		if (value) {
			submitButton.disabled = true;
			submitIcon.textContent = 'hourglass_top';
			submitLabel.textContent = label;
			if (mode === 'edit') deleteButton.disabled = true;
		} else {
			submitButton.disabled = false;
			submitIcon.textContent = mode === 'edit' ? 'save' : 'check';
			submitLabel.textContent = mode === 'edit' ? 'Guardar cambios' : 'Crear cita';
			if (mode === 'edit') deleteButton.disabled = false;
		}
	};

	const renderOptions = (
		select: HTMLSelectElement,
		items: Option[],
		emptyLabel: string,
		includeAllOption = false
	) => {
		select.innerHTML = '';
		const emptyOption = document.createElement('option');
		emptyOption.value = '';
		emptyOption.textContent = emptyLabel;
		select.appendChild(emptyOption);
		if (includeAllOption) {
			emptyOption.value = '';
		}
		for (const item of items) {
			const option = document.createElement('option');
			option.value = String(item.id);
			option.textContent = item.name;
			select.appendChild(option);
		}
	};

	const resetFormValues = () => {
		form.reset();
		customerNameInput.value = '';
		customerPhoneInput.value = '';
		startInput.value = '';
		endInput.value = '';
		statusInput.value = 'CONFIRMADO';
		statusInput.disabled = true;
	};

	const openModalShell = () => {
		modal.classList.remove('is-closing');
		if (closeTimer) {
			window.clearTimeout(closeTimer);
			closeTimer = null;
		}
		if (!modal.open) modal.showModal();
	};

	const closeModal = () => {
		if (!modal.open) return;
		modal.classList.add('is-closing');
		closeTimer = window.setTimeout(() => {
			modal.close();
			modal.classList.remove('is-closing');
			closeTimer = null;
			clearFormErrors();
			setModalLoading(false);
			setSubmittingState(false);
			resetFormValues();
			mode = 'create';
			editingAppointmentId = 0;
		}, 160);
	};

	const getSelectedProfessionalId = () => {
		if (roleId === 3 && currentProfessionalId > 0) return currentProfessionalId;
		return toInt(modalProfessional.value, 0);
	};

	const ensureModalProfessionalValue = () => {
		if (roleId === 3 && currentProfessionalId > 0) {
			modalProfessional.value = String(currentProfessionalId);
		}
	};

	const setCreateMode = () => {
		mode = 'create';
		editingAppointmentId = 0;
		if (modalTitle) modalTitle.textContent = 'Crear cita';
		if (modalDescription) {
			modalDescription.textContent = 'Completa los datos para registrar una nueva reserva.';
		}
		submitLabel.textContent = 'Crear cita';
		submitIcon.textContent = 'check';
		deleteButton.classList.add('hidden');
		deleteButton.disabled = true;
		statusInput.value = 'CONFIRMADO';
		statusInput.disabled = true;
	};

	const setEditMode = (appointmentId: number) => {
		mode = 'edit';
		editingAppointmentId = appointmentId;
		if (modalTitle) modalTitle.textContent = 'Editar cita';
		if (modalDescription) {
			modalDescription.textContent = 'Actualiza los datos de la reserva seleccionada.';
		}
		submitLabel.textContent = 'Guardar cambios';
		submitIcon.textContent = 'save';
		deleteButton.classList.remove('hidden');
		deleteButton.disabled = false;
		statusInput.disabled = false;
	};

	const buildPayloadFromForm = (): BuildPayloadResult => {
		const customerName = customerNameInput.value.trim();
		const rawCustomerPhone = customerPhoneInput.value.trim();
		const locId = toInt(modalLocation.value, 0);
		const serviceId = toInt(modalService.value, 0);
		const professionalId = getSelectedProfessionalId();
		const status = String(statusInput.value || '').trim().toUpperCase();
		const startIso = toIsoWithOffset(startInput.value);
		const endIso = toIsoWithOffset(endInput.value);
		const startDate = new Date(startInput.value);
		const endDate = new Date(endInput.value);

		if (!customerName) return { error: 'El nombre del cliente es obligatorio.' };
		let customerPhone = '';
		if (rawCustomerPhone) {
			const parsedPhone = parseParaguayMobilePhone(rawCustomerPhone);
			if (!parsedPhone.isValid) {
				setFieldError('customer_phone', PARAGUAY_MOBILE_PHONE_ERROR);
				return { error: 'Revisa los campos marcados.' };
			}
			customerPhone = parsedPhone.e164;
			customerPhoneInput.value = parsedPhone.pretty;
		}
		if (!locId || !serviceId || !professionalId) {
			return { error: 'Profesional, sucursal y servicio son obligatorios.' };
		}
		if (!startIso || !endIso || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
			return { error: 'La fecha y hora de inicio/fin son obligatorias.' };
		}
		if (startDate >= endDate) {
			return { error: 'La fecha/hora de inicio debe ser menor que la de fin.' };
		}
		if (!['PENDIENTE', 'CONFIRMADO', 'COMPLETADO', 'CANCELADO'].includes(status)) {
			return { error: 'El estado de la cita es invalido.' };
		}

		return {
			payload: {
				loc_id_location: locId,
				pro_id_professional: professionalId,
				ser_id_service: serviceId,
				customer_name: customerName,
				customer_phone: customerPhone,
				start_time: startIso,
				end_time: endIso,
				status,
			},
		};
	};

	customerPhoneInput.addEventListener('input', () => {
		setFieldError('customer_phone', '');
	});

	customerPhoneInput.addEventListener('blur', () => {
		const rawCustomerPhone = customerPhoneInput.value.trim();
		if (!rawCustomerPhone) {
			setFieldError('customer_phone', '');
			return;
		}
		const parsedPhone = parseParaguayMobilePhone(rawCustomerPhone);
		if (!parsedPhone.isValid) {
			setFieldError('customer_phone', PARAGUAY_MOBILE_PHONE_ERROR);
			return;
		}
		customerPhoneInput.value = parsedPhone.pretty;
		setFieldError('customer_phone', '');
	});

	const openCreateModal = (start?: Date, end?: Date) => {
		clearFormErrors();
		setCreateMode();
		resetFormValues();

		const initialStart = start ?? new Date();
		const initialEnd = end ?? new Date(initialStart.getTime() + 60 * 60 * 1000);
		startInput.value = formatDateTimeLocal(initialStart);
		endInput.value = formatDateTimeLocal(initialEnd);

		const filterProfessionalId = toInt(professionalFilter.value, 0);
		if (roleId === 3 && currentProfessionalId > 0) {
			modalProfessional.value = String(currentProfessionalId);
		} else if (filterProfessionalId > 0) {
			modalProfessional.value = String(filterProfessionalId);
		} else if (professionals.length > 0) {
			modalProfessional.value = String(professionals[0].id);
		}

		const filterLocationId = toInt(locationFilter.value, 0);
		if (filterLocationId > 0) {
			modalLocation.value = String(filterLocationId);
		} else if (locations.length > 0) {
			modalLocation.value = String(locations[0].id);
		}

		if (services.length > 0) {
			modalService.value = String(services[0].id);
		}

		ensureModalProfessionalValue();
		openModalShell();
	};

	const fillFormByAppointment = (appointment: AppointmentDetail) => {
		customerNameInput.value = String(appointment.customer_name || '');
		customerPhoneInput.value = String(appointment.customer_phone || '');
		modalProfessional.value = String(appointment.pro_id_professional || '');
		modalLocation.value = String(appointment.loc_id_location || '');
		modalService.value = String(appointment.ser_id_service || '');
		statusInput.value = String(appointment.status || 'CONFIRMADO');
		startInput.value = parseIsoToLocalInput(String(appointment.start_time || ''));
		endInput.value = parseIsoToLocalInput(String(appointment.end_time || ''));
		ensureModalProfessionalValue();
	};

	const openEditModal = async (appointmentId: number) => {
		if (!appointmentId) return;
		clearFormErrors();
		setEditMode(appointmentId);
		openModalShell();
		setModalLoading(true);

		try {
			const response = await fetch(`/api/appointments/${appointmentId}`, {
				method: 'GET',
				headers: { Accept: 'application/json' },
			});

			const data = await response.json();
			if (!response.ok || !data || data.status !== 'success' || !data.data) {
				throw new Error(readApiError(data, 'No fue posible cargar la cita seleccionada.'));
			}

			fillFormByAppointment(data.data as AppointmentDetail);
		} catch (error) {
			showFormError(
				error instanceof Error ? error.message : 'No fue posible cargar la cita seleccionada.'
			);
			setCreateMode();
		} finally {
			setModalLoading(false);
			setSubmittingState(false);
		}
	};

	const reloadCalendarEvents = () => {
		debugInfo('reloadCalendarEvents', {
			professionalFilter: professionalFilter.value,
			locationFilter: locationFilter.value,
		});
		if (calendar) calendar.refetchEvents();
	};

	const handleEventReschedule = async (info: EventDropArg | EventResizeDoneArg) => {
		const appointmentId = toInt(info.event.id, 0);
		if (!appointmentId) {
			info.revert();
			return;
		}

		const eventStart = info.event.start;
		const eventEnd = info.event.end ?? (eventStart ? new Date(eventStart.getTime() + 60 * 60 * 1000) : null);
		if (!eventStart || !eventEnd) {
			info.revert();
			return;
		}

		setCalendarLoading(true);
		clearPageError();

		try {
			const detailResponse = await fetch(`/api/appointments/${appointmentId}`, {
				method: 'GET',
				headers: { Accept: 'application/json' },
			});
			const detailData = await detailResponse.json();
			if (!detailResponse.ok || !detailData || detailData.status !== 'success' || !detailData.data) {
				throw new Error(readApiError(detailData, 'No fue posible cargar la cita para reprogramar.'));
			}

			const detail = detailData.data as AppointmentDetail;
			const payload = {
				loc_id_location: toInt(detail.loc_id_location, 0),
				pro_id_professional:
					roleId === 3 && currentProfessionalId > 0
						? currentProfessionalId
						: toInt(detail.pro_id_professional, 0),
				ser_id_service: toInt(detail.ser_id_service, 0),
				customer_name: String(detail.customer_name || '').trim(),
				customer_phone: String(detail.customer_phone || '').trim(),
				start_time: toIsoWithOffset(formatDateTimeLocal(eventStart)),
				end_time: toIsoWithOffset(formatDateTimeLocal(eventEnd)),
				status: String(detail.status || 'CONFIRMADO').trim().toUpperCase(),
			};

			const updateResponse = await fetch(`/api/appointments/${appointmentId}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
				},
				body: JSON.stringify(payload),
			});
			const updateData = await updateResponse.json();
			if (!updateResponse.ok || !updateData || updateData.status !== 'success') {
				throw new Error(
					readApiError(updateData, 'No fue posible reprogramar la cita seleccionada.')
				);
			}
		} catch (error) {
			info.revert();
			const message =
				error instanceof Error
					? error.message
					: 'No fue posible reprogramar la cita seleccionada.';
			showPageError(message);
			await showErrorAlert(message);
		} finally {
			setCalendarLoading(false);
		}
	};

	const buildEventSource = (
		info: { startStr: string; endStr: string },
		successCallback: (eventInputs: any[]) => void,
		failureCallback: (error: Error) => void
	) => {
		void (async () => {
			setCalendarLoading(true);
			clearPageError();

			try {
				const params = new URLSearchParams({
					start: info.startStr,
					end: info.endStr,
				});

				const professionalId = toInt(professionalFilter.value, 0);
				const locationId = toInt(locationFilter.value, 0);
				if (professionalId > 0) params.set('pro_id', String(professionalId));
				if (locationId > 0) params.set('loc_id', String(locationId));
				const requestUrl = `/api/appointments/calendar?${params.toString()}`;
				debugInfo('buildEventSource:request', {
					requestUrl,
					start: info.startStr,
					end: info.endStr,
					professionalId,
					locationId,
				});

				const response = await fetch(requestUrl, {
					method: 'GET',
					headers: { Accept: 'application/json' },
				});

				const data = await response.json();
				debugInfo('buildEventSource:response', {
					status: response.status,
					ok: response.ok,
					responseStatus: data?.status,
					totalRawEvents: Array.isArray(data?.data) ? data.data.length : -1,
				});
				if (!response.ok || !data || data.status !== 'success' || !Array.isArray(data.data)) {
					throw new Error(readApiError(data, 'No fue posible cargar el calendario.'));
				}

				const events = data.data.map((event: any) => ({
					...event,
					id: String(event?.id ?? ''),
					extendedProps: {
						...(event?.extendedProps || {}),
						pro_id_professional: toInt(
							event?.extendedProps?.pro_id_professional ?? event?.resourceId,
							0
						),
					},
				}));
				debugInfo('buildEventSource:normalized-events', { totalEvents: events.length });

				successCallback(events);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : 'No fue posible cargar el calendario.';
				debugError('buildEventSource:error', {
					message,
					error: error instanceof Error ? error.stack || error.message : String(error),
				});
				showPageError(message);
				failureCallback(error instanceof Error ? error : new Error(message));
			} finally {
				setCalendarLoading(false);
			}
		})();
	};

	const initializeCalendar = () => {
		debugInfo('initializeCalendar:start');
		if (calendar) {
			calendar.destroy();
			calendar = null;
		}

		calendar = new Calendar(calendarEl, {
			plugins: [interactionPlugin, dayGridPlugin, timeGridPlugin, listPlugin],
			locale: esLocale,
			initialView: 'timeGridWeek',
			editable: true,
			selectable: true,
			selectMirror: true,
			nowIndicator: true,
			allDaySlot: false,
			height: 'auto',
			slotMinTime: '06:00:00',
			slotMaxTime: '22:00:00',
			headerToolbar: {
				left: 'prev,next today',
				center: 'title',
				right: 'timeGridDay,timeGridWeek,dayGridMonth,listWeek',
			},
			buttonText: {
				today: 'Hoy',
				week: 'Semana',
				day: 'Dia',
				month: 'Mes',
				list: 'Lista',
			},
			events: buildEventSource,
			select: (info: DateSelectArg) => {
				openCreateModal(info.start, info.end);
			},
			eventClick: (info) => {
				const appointmentId = toInt(info.event.id, 0);
				if (appointmentId > 0) {
					void openEditModal(appointmentId);
				}
			},
			eventDrop: (info) => {
				void handleEventReschedule(info);
			},
			eventResize: (info) => {
				void handleEventReschedule(info);
			},
		});

		calendar.render();
		debugInfo('initializeCalendar:rendered');
	};

	const loadMeta = async () => {
		setCalendarLoading(true);
		clearPageError();
		debugInfo('loadMeta:request');

		try {
			const response = await fetch('/api/appointments/meta', {
				method: 'GET',
				headers: { Accept: 'application/json' },
			});

			const data = await response.json();
			debugInfo('loadMeta:response', {
				status: response.status,
				ok: response.ok,
				responseStatus: data?.status,
			});
			if (!response.ok || !data || data.status !== 'success' || !data.data) {
				throw new Error(readApiError(data, 'No fue posible cargar los catalogos del calendario.'));
			}

			const session = (data.data.session || {}) as SessionData;
			roleId = toInt(session.role_id, 0);
			currentProfessionalId = toInt(session.professional_id, 0);

			professionals = Array.isArray(data.data.professionals)
				? data.data.professionals
						.map((item: any) => ({
							id: toInt(item?.id_professional, 0),
							name: String(item?.display_name || '').trim(),
						}))
						.filter((item: Option) => item.id > 0 && item.name)
				: [];

			locations = Array.isArray(data.data.locations)
				? data.data.locations
						.map((item: any) => ({
							id: toInt(item?.id_location, 0),
							name: String(item?.name || '').trim(),
						}))
						.filter((item: Option) => item.id > 0 && item.name)
				: [];

			services = Array.isArray(data.data.services)
				? data.data.services
						.map((item: any) => ({
							id: toInt(item?.id_service, 0),
							name: String(item?.name || '').trim(),
						}))
						.filter((item: Option) => item.id > 0 && item.name)
				: [];
			debugInfo('loadMeta:catalogs-ready', {
				roleId,
				currentProfessionalId,
				professionals: professionals.length,
				locations: locations.length,
				services: services.length,
			});

			renderOptions(professionalFilter, professionals, 'Todos los profesionales', true);
			renderOptions(modalProfessional, professionals, 'Selecciona un profesional');
			renderOptions(locationFilter, locations, 'Todas las sucursales', true);
			renderOptions(modalLocation, locations, 'Selecciona una sucursal');
			renderOptions(modalService, services, 'Selecciona un servicio');

			if (roleId === 3) {
				modalProfessionalWrap.classList.add('hidden');
				professionalFilter.disabled = true;
				modalProfessional.disabled = true;

				if (currentProfessionalId <= 0 && professionals.length === 1) {
					currentProfessionalId = professionals[0].id;
				}
				if (currentProfessionalId > 0) {
					professionalFilter.value = String(currentProfessionalId);
					modalProfessional.value = String(currentProfessionalId);
				} else {
					showPageError(
						'No fue posible determinar el perfil profesional de tu sesion. Contacta al administrador.'
					);
				}
			} else {
				professionalFilterWrap?.classList.remove('hidden');
				modalProfessionalWrap.classList.remove('hidden');
				professionalFilter.disabled = false;
				modalProfessional.disabled = false;
			}
		} catch (error) {
			debugError('loadMeta:error', {
				error: error instanceof Error ? error.stack || error.message : String(error),
			});
			showPageError(
				error instanceof Error
					? error.message
					: 'No fue posible cargar los catalogos del calendario.'
			);
		} finally {
			setCalendarLoading(false);
		}
	};

	openModalButton.addEventListener('click', () => {
		const now = new Date();
		now.setSeconds(0, 0);
		const next = new Date(now.getTime() + 60 * 60 * 1000);
		openCreateModal(now, next);
	});

	closeModalButton?.addEventListener('click', closeModal);

	modal.addEventListener('click', (event: MouseEvent) => {
		if (event.target instanceof HTMLDialogElement) closeModal();
	});

	professionalFilter.addEventListener('change', () => {
		if (roleId === 3) return;
		reloadCalendarEvents();
	});

	locationFilter.addEventListener('change', () => {
		reloadCalendarEvents();
	});

	form.addEventListener('submit', async (event: SubmitEvent) => {
		event.preventDefault();
		if (isSubmitting || isModalLoading) return;
		clearFormErrors();

		const result = buildPayloadFromForm();
		if ('error' in result) {
			showFormError(result.error);
			return;
		}

		const payload = result.payload;
		setSubmittingState(true, mode === 'edit' ? 'Guardando...' : 'Creando...');

		try {
			const endpoint = mode === 'edit' ? `/api/appointments/${editingAppointmentId}` : '/api/appointments';
			const method = mode === 'edit' ? 'PUT' : 'POST';
			const body =
				mode === 'edit'
					? payload
					: {
							loc_id_location: payload.loc_id_location,
							pro_id_professional: payload.pro_id_professional,
							ser_id_service: payload.ser_id_service,
							customer_name: payload.customer_name,
							customer_phone: payload.customer_phone,
							start_time: payload.start_time,
							end_time: payload.end_time,
						};

			const response = await fetch(endpoint, {
				method,
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
				},
				body: JSON.stringify(body),
			});

			const data = await response.json();
			if (!response.ok || !data || data.status !== 'success') {
				applyFieldErrors(data?.errors);
				throw new Error(
					readApiError(
						data,
						mode === 'edit'
							? 'No fue posible actualizar la cita.'
							: 'No fue posible crear la cita.'
					)
				);
			}

			const successMessage =
				typeof data.message === 'string' && data.message.trim()
					? data.message
					: mode === 'edit'
						? 'Cita actualizada correctamente.'
						: 'Cita agendada correctamente.';

			closeModal();
			reloadCalendarEvents();
			await showSuccessAlert(successMessage);
		} catch (error) {
			showFormError(
				error instanceof Error
					? error.message
					: mode === 'edit'
						? 'No fue posible actualizar la cita.'
						: 'No fue posible crear la cita.'
			);
			setSubmittingState(false);
		}
	});

	deleteButton.addEventListener('click', async () => {
		if (mode !== 'edit' || !editingAppointmentId || isSubmitting || isModalLoading) return;

		const confirmed = await window.BookmateAlert?.confirm?.({
			type: 'error',
			title: 'Eliminar cita',
			message: 'Esta accion eliminara la cita de forma permanente. Deseas continuar?',
			confirmText: 'Eliminar',
			cancelText: 'Cancelar',
		});
		if (!confirmed) return;

		clearFormErrors();
		setSubmittingState(true, 'Eliminando...');

		try {
			const response = await fetch(`/api/appointments/${editingAppointmentId}`, {
				method: 'DELETE',
				headers: { Accept: 'application/json' },
			});
			const data = await response.json();
			if (!response.ok || !data || data.status !== 'success') {
				throw new Error(readApiError(data, 'No fue posible eliminar la cita.'));
			}

			const successMessage =
				typeof data.message === 'string' && data.message.trim()
					? data.message
					: 'Cita eliminada correctamente.';

			closeModal();
			reloadCalendarEvents();
			await showSuccessAlert(successMessage);
		} catch (error) {
			showFormError(error instanceof Error ? error.message : 'No fue posible eliminar la cita.');
			setSubmittingState(false);
		}
	});

	const bootstrap = async () => {
		debugInfo('bootstrap:start');
		await loadMeta().catch(() => {
			// El error ya fue mostrado en pantalla.
		});
		initializeCalendar();
		debugInfo('bootstrap:done');
	};

	void bootstrap();
};
