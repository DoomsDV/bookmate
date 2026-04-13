import {
	PARAGUAY_MOBILE_PHONE_ERROR,
	parseParaguayMobilePhone,
} from '../../lib/paraguay-phone';
import { AppointmentsClient } from './appointments-client';
import type { ApiFieldError, AppointmentDetail, AppointmentFormPayload, Option } from './types';
import {
	ApiClientError,
	formatDateTimeLocal,
	isAppointmentStatus,
	parseIsoToLocalInput,
	toIsoWithOffset,
	toPositiveInt,
} from './utils';

type ModalMode = 'create' | 'edit';

type BuildPayloadResult = { payload: AppointmentFormPayload } | { error: string };

export type AppointmentModalConfig = {
	roleId: number;
	currentProfessionalId: number;
	professionals: Option[];
	locations: Option[];
	services: Option[];
};

export type OpenCreateContext = {
	start?: Date;
	end?: Date;
	professionalId?: number;
	locationId?: number;
};

type RequiredNodes = {
	modal: HTMLDialogElement;
	form: HTMLFormElement;
	submitButton: HTMLButtonElement;
	submitLabel: HTMLElement;
	submitIcon: HTMLElement;
	deleteButton: HTMLButtonElement;
	customerNameInput: HTMLInputElement;
	customerPhoneInput: HTMLInputElement;
	startInput: HTMLInputElement;
	endInput: HTMLInputElement;
	statusInput: HTMLSelectElement;
	modalProfessionalWrap: HTMLElement;
	modalProfessional: HTMLSelectElement;
	modalLocation: HTMLSelectElement;
	modalService: HTMLSelectElement;
};

class AppointmentModal extends HTMLElement {
	#bound = false;
	#listeners: AbortController | null = null;
	#bindRetryTimer: number | null = null;
	#bindRetryAttempts = 0;

	client: AppointmentsClient | null = null;
	roleId = 0;
	currentProfessionalId = 0;
	professionals: Option[] = [];
	locations: Option[] = [];
	services: Option[] = [];

	mode: ModalMode = 'create';
	isSubmitting = false;
	isLoading = false;
	editingAppointmentId = 0;
	closeTimer: number | null = null;

	modal: HTMLDialogElement | null = null;
	modalTitle: HTMLElement | null = null;
	modalDescription: HTMLElement | null = null;
	form: HTMLFormElement | null = null;
	formErrorNode: HTMLElement | null = null;
	modalLoadingNode: HTMLElement | null = null;
	closeModalButtons: NodeListOf<HTMLButtonElement> | null = null;
	submitButton: HTMLButtonElement | null = null;
	submitLabel: HTMLElement | null = null;
	submitIcon: HTMLElement | null = null;
	deleteButton: HTMLButtonElement | null = null;
	customerNameInput: HTMLInputElement | null = null;
	customerPhoneInput: HTMLInputElement | null = null;
	startInput: HTMLInputElement | null = null;
	endInput: HTMLInputElement | null = null;
	statusInput: HTMLSelectElement | null = null;
	modalStatusWrap: HTMLElement | null = null;
	modalProfessionalWrap: HTMLElement | null = null;
	modalProfessional: HTMLSelectElement | null = null;
	modalLocation: HTMLSelectElement | null = null;
	modalService: HTMLSelectElement | null = null;
	formFields: NodeListOf<HTMLInputElement | HTMLSelectElement> | null = null;
	fieldErrorNodes: NodeListOf<HTMLElement> | null = null;

	connectedCallback() {
		if (this.#bound) return;

		this.modal = this.querySelector<HTMLDialogElement>('[data-appointment-modal]');
		this.modalTitle = this.querySelector<HTMLElement>('[data-appointment-modal-title]');
		this.modalDescription = this.querySelector<HTMLElement>('[data-appointment-modal-description]');
		this.form = this.querySelector<HTMLFormElement>('[data-appointment-form]');
		this.formErrorNode = this.form?.querySelector<HTMLElement>('[data-form-error]') ?? null;
		this.fieldErrorNodes = this.form?.querySelectorAll<HTMLElement>('[data-field-error]') ?? null;
		this.modalLoadingNode =
			this.form?.querySelector<HTMLElement>('[data-appointment-loading]') ?? null;
		this.closeModalButtons =
			this.querySelectorAll<HTMLButtonElement>('[data-close-appointment-modal]');
		this.submitButton =
			this.form?.querySelector<HTMLButtonElement>('[data-submit-appointment]') ?? null;
		this.submitLabel =
			this.form?.querySelector<HTMLElement>('[data-submit-appointment-label]') ?? null;
		this.submitIcon =
			this.form?.querySelector<HTMLElement>('[data-submit-appointment-icon]') ?? null;
		this.deleteButton =
			this.form?.querySelector<HTMLButtonElement>('[data-delete-appointment]') ?? null;
		this.customerNameInput = this.form?.querySelector<HTMLInputElement>('[name="customer_name"]') ?? null;
		this.customerPhoneInput =
			this.form?.querySelector<HTMLInputElement>('[name="customer_phone"]') ?? null;
		this.startInput = this.form?.querySelector<HTMLInputElement>('[name="start_time"]') ?? null;
		this.endInput = this.form?.querySelector<HTMLInputElement>('[name="end_time"]') ?? null;
		this.statusInput = this.form?.querySelector<HTMLSelectElement>('[data-modal-status]') ?? null;
		this.modalStatusWrap =
			this.form?.querySelector<HTMLElement>('[data-modal-status-wrap]') ?? null;
		this.modalProfessionalWrap =
			this.form?.querySelector<HTMLElement>('[data-modal-professional-wrap]') ?? null;
		this.modalProfessional =
			this.form?.querySelector<HTMLSelectElement>('[data-modal-professional]') ?? null;
		this.modalLocation = this.form?.querySelector<HTMLSelectElement>('[data-modal-location]') ?? null;
		this.modalService = this.form?.querySelector<HTMLSelectElement>('[data-modal-service]') ?? null;
		this.formFields = this.form?.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select') ?? null;

		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) {
			this.scheduleBindRetry();
			return;
		}

		this.#bound = true;
		this.#bindRetryAttempts = 0;
		if (this.#bindRetryTimer) {
			window.clearTimeout(this.#bindRetryTimer);
			this.#bindRetryTimer = null;
		}
		this.#listeners = new AbortController();
		const signal = this.#listeners.signal;

		requiredNodes.form.addEventListener('submit', this.handleSubmit, { signal });
		requiredNodes.modal.addEventListener('click', this.handleBackdropClick, { signal });
		for (const closeButton of this.closeModalButtons ?? []) {
			closeButton.addEventListener('click', this.closeModal, { signal });
		}
		requiredNodes.deleteButton.addEventListener('click', this.handleDelete, { signal });
		requiredNodes.customerPhoneInput.addEventListener('input', this.handlePhoneInput, { signal });
		requiredNodes.customerPhoneInput.addEventListener('blur', this.handlePhoneBlur, { signal });

		this.setCreateMode();
		this.resetFormValues();
	}

	disconnectedCallback() {
		this.#bound = false;
		this.#listeners?.abort();
		this.#listeners = null;
		if (this.#bindRetryTimer) {
			window.clearTimeout(this.#bindRetryTimer);
			this.#bindRetryTimer = null;
		}
		this.#bindRetryAttempts = 0;
		if (this.closeTimer) {
			window.clearTimeout(this.closeTimer);
			this.closeTimer = null;
		}
		if (this.modal?.open) {
			this.modal.close();
		}
	}

	scheduleBindRetry() {
		if (!this.isConnected) return;
		this.#bindRetryAttempts += 1;
		if (this.#bindRetryAttempts > 10) {
			console.error('[appointment-modal] required DOM nodes were not found during initialization.');
			return;
		}
		if (this.#bindRetryTimer) {
			window.clearTimeout(this.#bindRetryTimer);
		}
		this.#bindRetryTimer = window.setTimeout(() => {
			this.connectedCallback();
		}, 50);
	}

	setClient(client: AppointmentsClient) {
		this.client = client;
	}

	configure(config: AppointmentModalConfig) {
		this.roleId = config.roleId;
		this.currentProfessionalId = config.currentProfessionalId;
		this.professionals = config.professionals;
		this.locations = config.locations;
		this.services = config.services;

		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return;

		this.renderOptions(requiredNodes.modalProfessional, this.professionals, 'Selecciona un profesional');
		this.renderOptions(requiredNodes.modalLocation, this.locations, 'Selecciona una sucursal');
		this.renderOptions(requiredNodes.modalService, this.services, 'Selecciona un servicio');

		if (this.roleId === 3) {
			requiredNodes.modalProfessionalWrap.classList.add('hidden');
			requiredNodes.modalProfessional.disabled = true;
			if (this.currentProfessionalId > 0) {
				requiredNodes.modalProfessional.value = String(this.currentProfessionalId);
			}
		} else {
			requiredNodes.modalProfessionalWrap.classList.remove('hidden');
			requiredNodes.modalProfessional.disabled = false;
		}
	}

	openCreate(context: OpenCreateContext = {}) {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return;

		this.clearFormErrors();
		this.setCreateMode();
		this.resetFormValues();

		const initialStart = context.start ?? new Date();
		const initialEnd = context.end ?? new Date(initialStart.getTime() + 60 * 60 * 1000);
		requiredNodes.startInput.value = formatDateTimeLocal(initialStart);
		requiredNodes.endInput.value = formatDateTimeLocal(initialEnd);

		if (this.roleId === 3 && this.currentProfessionalId > 0) {
			requiredNodes.modalProfessional.value = String(this.currentProfessionalId);
		} else if (context.professionalId && context.professionalId > 0) {
			requiredNodes.modalProfessional.value = String(context.professionalId);
		} else if (this.professionals.length > 0) {
			requiredNodes.modalProfessional.value = String(this.professionals[0].id);
		}

		if (context.locationId && context.locationId > 0) {
			requiredNodes.modalLocation.value = String(context.locationId);
		} else if (this.locations.length > 0) {
			requiredNodes.modalLocation.value = String(this.locations[0].id);
		}

		if (this.services.length > 0) {
			requiredNodes.modalService.value = String(this.services[0].id);
		}

		this.ensureModalProfessionalValue();
		this.openModalShell();
	}

	async openEdit(appointmentId: number) {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes || !this.client || appointmentId <= 0) return;

		this.clearFormErrors();
		this.setEditMode(appointmentId);
		this.openModalShell();
		this.setModalLoading(true);

		try {
			const appointment = await this.client.getAppointment(appointmentId);
			this.fillFormByAppointment(appointment);
		} catch (error) {
			this.handleApiError(error, 'No fue posible cargar la cita seleccionada.');
			this.setCreateMode();
		} finally {
			this.setModalLoading(false);
			this.setSubmittingState(false);
		}
	}

	getRequiredNodes(): RequiredNodes | null {
		if (
			!this.modal ||
			!this.form ||
			!this.submitButton ||
			!this.submitLabel ||
			!this.submitIcon ||
			!this.deleteButton ||
			!this.customerNameInput ||
			!this.customerPhoneInput ||
			!this.startInput ||
			!this.endInput ||
			!this.statusInput ||
			!this.modalProfessionalWrap ||
			!this.modalProfessional ||
			!this.modalLocation ||
			!this.modalService
		) {
			return null;
		}

		return {
			modal: this.modal,
			form: this.form,
			submitButton: this.submitButton,
			submitLabel: this.submitLabel,
			submitIcon: this.submitIcon,
			deleteButton: this.deleteButton,
			customerNameInput: this.customerNameInput,
			customerPhoneInput: this.customerPhoneInput,
			startInput: this.startInput,
			endInput: this.endInput,
			statusInput: this.statusInput,
			modalProfessionalWrap: this.modalProfessionalWrap,
			modalProfessional: this.modalProfessional,
			modalLocation: this.modalLocation,
			modalService: this.modalService,
		};
	}

	renderOptions(select: HTMLSelectElement, items: Option[], emptyLabel: string) {
		select.innerHTML = '';
		const emptyOption = document.createElement('option');
		emptyOption.value = '';
		emptyOption.textContent = emptyLabel;
		select.appendChild(emptyOption);
		for (const item of items) {
			const option = document.createElement('option');
			option.value = String(item.id);
			option.textContent = item.name;
			select.appendChild(option);
		}
	}

	clearFormErrors() {
		if (this.formErrorNode) {
			this.formErrorNode.textContent = '';
			this.formErrorNode.classList.add('hidden');
		}
		for (const node of this.fieldErrorNodes ?? []) {
			node.textContent = '';
			node.classList.add('hidden');
		}
	}

	showFormError(message: string) {
		if (!this.formErrorNode) return;
		this.formErrorNode.textContent = message;
		this.formErrorNode.classList.remove('hidden');
	}

	setFieldError(field: string, message: string) {
		const fieldNode = this.form?.querySelector<HTMLElement>(`[data-field-error="${field}"]`);
		if (!fieldNode) return;
		if (!message) {
			fieldNode.textContent = '';
			fieldNode.classList.add('hidden');
			return;
		}
		fieldNode.textContent = message;
		fieldNode.classList.remove('hidden');
	}

	applyFieldErrors(errors: ApiFieldError[]) {
		for (const item of errors) {
			this.setFieldError(item.field, item.message);
		}
	}

	toParaguayPhoneLocalDigits(rawValue: string) {
		const parsedPhone = parseParaguayMobilePhone(rawValue);
		if (parsedPhone.isValid) return parsedPhone.e164.slice(4);

		let digits = String(rawValue || '').replace(/\D/g, '');
		if (digits.startsWith('00595')) digits = digits.slice(5);
		if (digits.startsWith('595')) digits = digits.slice(3);
		if (digits.startsWith('0')) digits = digits.slice(1);
		return digits.slice(0, 9);
	}

	formatParaguayPhoneLocal(rawValue: string) {
		const digits = this.toParaguayPhoneLocalDigits(rawValue);
		if (!digits) return '';
		if (digits.length <= 3) return digits;
		if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
		return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
	}

	private handleApiError(error: unknown, fallbackMessage: string) {
		if (error instanceof ApiClientError) {
			this.applyFieldErrors(error.fieldErrors);
			this.showFormError(error.message);
		} else {
			this.showFormError(error instanceof Error ? error.message : fallbackMessage);
		}
	}

	setModalLoading(value: boolean) {
		this.isLoading = value;
		this.modalLoadingNode?.classList.toggle('hidden', !value);
		this.modalLoadingNode?.classList.toggle('flex', value);

		for (const field of this.formFields ?? []) {
			field.disabled = value;
		}
		if (this.submitButton) this.submitButton.disabled = value;
		if (this.mode === 'edit' && this.deleteButton) this.deleteButton.disabled = value;
	}

	setSubmittingState(value: boolean, label = 'Procesando...') {
		this.isSubmitting = value;
		if (!this.submitButton || !this.submitIcon || !this.submitLabel) return;

		if (value) {
			this.submitButton.disabled = true;
			this.submitIcon.textContent = 'hourglass_top';
			this.submitLabel.textContent = label;
			if (this.mode === 'edit' && this.deleteButton) this.deleteButton.disabled = true;
			return;
		}

		this.submitButton.disabled = false;
		this.submitIcon.textContent = this.mode === 'edit' ? 'save' : 'check';
		this.submitLabel.textContent = this.mode === 'edit' ? 'Guardar cambios' : 'Crear cita';
		if (this.mode === 'edit' && this.deleteButton) this.deleteButton.disabled = false;
	}

	resetFormValues() {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return;

		requiredNodes.form.reset();
		requiredNodes.customerNameInput.value = '';
		requiredNodes.customerPhoneInput.value = '';
		requiredNodes.startInput.value = '';
		requiredNodes.endInput.value = '';
		requiredNodes.statusInput.value = 'CONFIRMADO';
		requiredNodes.statusInput.disabled = true;
	}

	openModalShell() {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return;

		requiredNodes.modal.classList.remove('is-closing');
		if (this.closeTimer) {
			window.clearTimeout(this.closeTimer);
			this.closeTimer = null;
		}
		if (!requiredNodes.modal.open) requiredNodes.modal.showModal();
	}

	closeModal = () => {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes || !requiredNodes.modal.open) return;

		requiredNodes.modal.classList.add('is-closing');

		this.closeTimer = window.setTimeout(() => {
			if (!this.isConnected) return;
			requiredNodes.modal.close();
			requiredNodes.modal.classList.remove('is-closing');
			this.closeTimer = null;
			this.clearFormErrors();
			this.setModalLoading(false);
			this.setSubmittingState(false);
			this.resetFormValues();
			this.mode = 'create';
			this.editingAppointmentId = 0;
		}, 140);
	};

	getSelectedProfessionalId() {
		if (this.roleId === 3 && this.currentProfessionalId > 0) return this.currentProfessionalId;
		return toPositiveInt(this.modalProfessional?.value, 0);
	}

	ensureModalProfessionalValue() {
		if (this.roleId === 3 && this.currentProfessionalId > 0 && this.modalProfessional) {
			this.modalProfessional.value = String(this.currentProfessionalId);
		}
	}

	setCreateMode() {
		this.mode = 'create';
		this.editingAppointmentId = 0;
		if (this.modalTitle) this.modalTitle.textContent = 'Crear cita';
		if (this.modalDescription) {
			this.modalDescription.textContent = 'Completa los datos para registrar una nueva reserva.';
		}
		if (this.submitLabel) this.submitLabel.textContent = 'Crear cita';
		if (this.submitIcon) this.submitIcon.textContent = 'check';
		this.deleteButton?.classList.add('hidden');
		if (this.deleteButton) this.deleteButton.disabled = true;
		if (this.statusInput) {
			this.statusInput.value = 'CONFIRMADO';
			this.statusInput.disabled = true;
		}
		this.modalStatusWrap?.setAttribute('hidden', '');
	}

	setEditMode(appointmentId: number) {
		this.mode = 'edit';
		this.editingAppointmentId = appointmentId;
		if (this.modalTitle) this.modalTitle.textContent = 'Editar cita';
		if (this.modalDescription) {
			this.modalDescription.textContent = 'Actualiza los datos de la reserva seleccionada.';
		}
		if (this.submitLabel) this.submitLabel.textContent = 'Guardar cambios';
		if (this.submitIcon) this.submitIcon.textContent = 'save';
		this.deleteButton?.classList.remove('hidden');
		if (this.deleteButton) this.deleteButton.disabled = false;
		if (this.statusInput) this.statusInput.disabled = false;
		this.modalStatusWrap?.removeAttribute('hidden');
	}

	fillFormByAppointment(appointment: AppointmentDetail) {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return;

		requiredNodes.customerNameInput.value = String(appointment.customer_name || '');
		requiredNodes.customerPhoneInput.value = this.formatParaguayPhoneLocal(
			String(appointment.customer_phone || '')
		);
		requiredNodes.modalProfessional.value = String(appointment.pro_id_professional || '');
		requiredNodes.modalLocation.value = String(appointment.loc_id_location || '');
		requiredNodes.modalService.value = String(appointment.ser_id_service || '');
		requiredNodes.statusInput.value = String(appointment.status || 'CONFIRMADO');
		requiredNodes.startInput.value = parseIsoToLocalInput(String(appointment.start_time || ''));
		requiredNodes.endInput.value = parseIsoToLocalInput(String(appointment.end_time || ''));
		this.ensureModalProfessionalValue();
	}

	buildPayloadFromForm(): BuildPayloadResult {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return { error: 'No fue posible acceder al formulario de citas.' };

		const customerName = requiredNodes.customerNameInput.value.trim();
		const rawCustomerPhone = requiredNodes.customerPhoneInput.value.trim();
		const locId = toPositiveInt(requiredNodes.modalLocation.value, 0);
		const serviceId = toPositiveInt(requiredNodes.modalService.value, 0);
		const professionalId = this.getSelectedProfessionalId();
		const statusRaw = String(requiredNodes.statusInput.value || '').trim().toUpperCase();
		const startIso = toIsoWithOffset(requiredNodes.startInput.value);
		const endIso = toIsoWithOffset(requiredNodes.endInput.value);
		const startDate = new Date(requiredNodes.startInput.value);
		const endDate = new Date(requiredNodes.endInput.value);

		if (!customerName) return { error: 'El nombre del cliente es obligatorio.' };

		let customerPhone = '';
		if (rawCustomerPhone) {
			const parsedPhone = parseParaguayMobilePhone(rawCustomerPhone);
			if (!parsedPhone.isValid) {
				this.setFieldError('customer_phone', PARAGUAY_MOBILE_PHONE_ERROR);
				return { error: 'Revisa los campos marcados.' };
			}
			customerPhone = parsedPhone.e164;
			requiredNodes.customerPhoneInput.value = this.formatParaguayPhoneLocal(parsedPhone.e164);
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
		if (!isAppointmentStatus(statusRaw)) {
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
				status: statusRaw,
			},
		};
	}

	handlePhoneInput = () => {
		if (!this.customerPhoneInput) return;
		this.customerPhoneInput.value = this.formatParaguayPhoneLocal(this.customerPhoneInput.value);
		this.setFieldError('customer_phone', '');
	};

	handlePhoneBlur = () => {
		const rawCustomerPhone = this.customerPhoneInput?.value.trim() || '';
		if (!rawCustomerPhone) {
			this.setFieldError('customer_phone', '');
			return;
		}
		const parsedPhone = parseParaguayMobilePhone(rawCustomerPhone);
		if (!parsedPhone.isValid) {
			this.setFieldError('customer_phone', PARAGUAY_MOBILE_PHONE_ERROR);
			return;
		}
		if (this.customerPhoneInput) {
			this.customerPhoneInput.value = this.formatParaguayPhoneLocal(parsedPhone.e164);
		}
		this.setFieldError('customer_phone', '');
	};

	handleBackdropClick = (event: MouseEvent) => {
		if (event.target instanceof HTMLDialogElement) {
			this.closeModal();
		}
	};

	handleSubmit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (!this.client || this.isSubmitting || this.isLoading) return;

		this.clearFormErrors();
		const result = this.buildPayloadFromForm();
		if ('error' in result) {
			this.showFormError(result.error);
			return;
		}

		const payload = result.payload;
		this.setSubmittingState(true, this.mode === 'edit' ? 'Guardando...' : 'Creando...');

		try {
			const response =
				this.mode === 'edit' && this.editingAppointmentId > 0
					? await this.client.updateAppointment(this.editingAppointmentId, payload)
					: await this.client.createAppointment({
							loc_id_location: payload.loc_id_location,
							pro_id_professional: payload.pro_id_professional,
							ser_id_service: payload.ser_id_service,
							customer_name: payload.customer_name,
							customer_phone: payload.customer_phone,
							start_time: payload.start_time,
							end_time: payload.end_time,
						});

			this.closeModal();
			this.dispatchEvent(
				new CustomEvent('appointment:changed', {
					bubbles: true,
					detail: {
						mode: this.mode,
						message: response.message,
					},
				})
			);
		} catch (error) {
			this.handleApiError(
				error,
				this.mode === 'edit'
					? 'No fue posible actualizar la cita.'
					: 'No fue posible crear la cita.'
			);
			this.setSubmittingState(false);
		}
	};

	handleDelete = async () => {
		if (!this.client || this.mode !== 'edit' || !this.editingAppointmentId) return;
		if (this.isSubmitting || this.isLoading) return;

		const confirmMessage = 'Esta acción eliminará la cita de forma permanente. ¿Deseas continuar?';
		const confirmed = window.BookmateAlert?.confirm
			? await window.BookmateAlert.confirm({
					type: 'error',
					title: 'Eliminar cita',
					message: confirmMessage,
					confirmText: 'Eliminar',
					cancelText: 'Cancelar',
				})
			: window.confirm(confirmMessage);
		if (!confirmed) return;

		this.clearFormErrors();
		this.setSubmittingState(true, 'Eliminando...');

		try {
			const response = await this.client.deleteAppointment(this.editingAppointmentId);
			this.closeModal();
			this.dispatchEvent(
				new CustomEvent('appointment:changed', {
					bubbles: true,
					detail: {
						mode: 'delete',
						message: response.message,
					},
				})
			);
		} catch (error) {
			this.handleApiError(error, 'No fue posible eliminar la cita.');
			this.setSubmittingState(false);
		}
	};
}

if (!customElements.get('appointment-modal')) {
	customElements.define('appointment-modal', AppointmentModal);
}

export { AppointmentModal };
