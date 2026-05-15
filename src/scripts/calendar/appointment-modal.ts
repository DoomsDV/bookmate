import {
	PARAGUAY_MOBILE_PHONE_ERROR,
	parseParaguayMobilePhone,
} from '../../lib/paraguay-phone';
import { AppointmentsClient } from './appointments-client';
import type {
	ApiFieldError,
	AppointmentDetail,
	AppointmentFormPayload,
	CustomerOption,
	Option,
} from './types';
import {
	ApiClientError,
	formatDateTimeDisplay,
	formatDateTimeLocal,
	isAppointmentStatus,
	normalizeDateTimeInput,
	parseIsoToLocalInput,
	parseLocalDateTime,
	toIsoWithOffset,
	toPositiveInt,
} from './utils';

type ModalMode = 'create' | 'edit';
type PickerField = 'start' | 'end';

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
	customerIdInput: HTMLInputElement;
	customerNameInput: HTMLInputElement;
	customerPhoneInput: HTMLInputElement;
	customerLov: HTMLElement;
	customerResults: HTMLElement;
	clearCustomerButton: HTMLButtonElement;
	startInput: HTMLInputElement;
	startDisplayInput: HTMLInputElement;
	openStartPickerButton: HTMLButtonElement;
	endInput: HTMLInputElement;
	endDisplayInput: HTMLInputElement;
	openEndPickerButton: HTMLButtonElement;
	statusInput: HTMLSelectElement;
	modalProfessionalWrap: HTMLElement;
	modalProfessional: HTMLSelectElement;
	modalLocation: HTMLSelectElement;
	modalService: HTMLSelectElement;
	dateTimePicker: HTMLDialogElement;
	pickerTargetLabel: HTMLElement;
	pickerMonthSelect: HTMLSelectElement;
	pickerYearSelect: HTMLSelectElement;
	pickerPrevMonthButton: HTMLButtonElement;
	pickerNextMonthButton: HTMLButtonElement;
	pickerCloseButton: HTMLButtonElement;
	pickerDaysGrid: HTMLElement;
	pickerHourSelect: HTMLSelectElement;
	pickerMinuteSelect: HTMLSelectElement;
	pickerCancelButton: HTMLButtonElement;
	pickerApplyButton: HTMLButtonElement;
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
	customers: CustomerOption[] = [];

	mode: ModalMode = 'create';
	isSubmitting = false;
	isLoading = false;
	isLoadingCustomers = false;
	editingAppointmentId = 0;
	selectedCustomer: CustomerOption | null = null;
	lastLoadedCustomerProfessionalId = 0;
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
	customerIdInput: HTMLInputElement | null = null;
	customerNameInput: HTMLInputElement | null = null;
	customerPhoneInput: HTMLInputElement | null = null;
	customerLov: HTMLElement | null = null;
	customerResults: HTMLElement | null = null;
	clearCustomerButton: HTMLButtonElement | null = null;
	startInput: HTMLInputElement | null = null;
	startDisplayInput: HTMLInputElement | null = null;
	openStartPickerButton: HTMLButtonElement | null = null;
	endInput: HTMLInputElement | null = null;
	endDisplayInput: HTMLInputElement | null = null;
	openEndPickerButton: HTMLButtonElement | null = null;
	statusInput: HTMLSelectElement | null = null;
	modalStatusWrap: HTMLElement | null = null;
	modalProfessionalWrap: HTMLElement | null = null;
	modalProfessional: HTMLSelectElement | null = null;
	modalLocation: HTMLSelectElement | null = null;
	modalService: HTMLSelectElement | null = null;
	dateTimePicker: HTMLDialogElement | null = null;
	pickerTargetLabel: HTMLElement | null = null;
	pickerMonthSelect: HTMLSelectElement | null = null;
	pickerYearSelect: HTMLSelectElement | null = null;
	pickerPrevMonthButton: HTMLButtonElement | null = null;
	pickerNextMonthButton: HTMLButtonElement | null = null;
	pickerCloseButton: HTMLButtonElement | null = null;
	pickerDaysGrid: HTMLElement | null = null;
	pickerHourSelect: HTMLSelectElement | null = null;
	pickerMinuteSelect: HTMLSelectElement | null = null;
	pickerCancelButton: HTMLButtonElement | null = null;
	pickerApplyButton: HTMLButtonElement | null = null;
	formFields: NodeListOf<HTMLInputElement | HTMLSelectElement> | null = null;
	fieldErrorNodes: NodeListOf<HTMLElement> | null = null;
	activePickerField: PickerField | null = null;
	pickerViewDate: Date = new Date();
	pickerDraftDate: Date | null = null;
	readonly pickerMinuteOptions = [0, 15, 30, 45];

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
		this.customerIdInput = this.form?.querySelector<HTMLInputElement>('[data-customer-id]') ?? null;
		this.customerNameInput = this.form?.querySelector<HTMLInputElement>('[name="customer_name"]') ?? null;
		this.customerPhoneInput =
			this.form?.querySelector<HTMLInputElement>('[name="customer_phone"]') ?? null;
		this.customerLov = this.form?.querySelector<HTMLElement>('[data-customer-lov]') ?? null;
		this.customerResults = this.form?.querySelector<HTMLElement>('[data-customer-results]') ?? null;
		this.clearCustomerButton =
			this.form?.querySelector<HTMLButtonElement>('[data-clear-customer]') ?? null;
		this.startInput = this.form?.querySelector<HTMLInputElement>('[name="start_time"]') ?? null;
		this.startDisplayInput = this.form?.querySelector<HTMLInputElement>('[data-start-display]') ?? null;
		this.openStartPickerButton =
			this.form?.querySelector<HTMLButtonElement>('[data-open-start-picker]') ?? null;
		this.endInput = this.form?.querySelector<HTMLInputElement>('[name="end_time"]') ?? null;
		this.endDisplayInput = this.form?.querySelector<HTMLInputElement>('[data-end-display]') ?? null;
		this.openEndPickerButton =
			this.form?.querySelector<HTMLButtonElement>('[data-open-end-picker]') ?? null;
		this.statusInput = this.form?.querySelector<HTMLSelectElement>('[data-modal-status]') ?? null;
		this.modalStatusWrap =
			this.form?.querySelector<HTMLElement>('[data-modal-status-wrap]') ?? null;
		this.modalProfessionalWrap =
			this.form?.querySelector<HTMLElement>('[data-modal-professional-wrap]') ?? null;
		this.modalProfessional =
			this.form?.querySelector<HTMLSelectElement>('[data-modal-professional]') ?? null;
		this.modalLocation = this.form?.querySelector<HTMLSelectElement>('[data-modal-location]') ?? null;
		this.modalService = this.form?.querySelector<HTMLSelectElement>('[data-modal-service]') ?? null;
		this.dateTimePicker =
			this.form?.querySelector<HTMLDialogElement>('[data-datetime-picker]') ?? null;
		this.pickerTargetLabel =
			this.form?.querySelector<HTMLElement>('[data-picker-target-label]') ?? null;
		this.pickerMonthSelect =
			this.form?.querySelector<HTMLSelectElement>('[data-picker-month-select]') ?? null;
		this.pickerYearSelect =
			this.form?.querySelector<HTMLSelectElement>('[data-picker-year-select]') ?? null;
		this.pickerPrevMonthButton =
			this.form?.querySelector<HTMLButtonElement>('[data-picker-prev-month]') ?? null;
		this.pickerNextMonthButton =
			this.form?.querySelector<HTMLButtonElement>('[data-picker-next-month]') ?? null;
		this.pickerCloseButton =
			this.form?.querySelector<HTMLButtonElement>('[data-picker-close]') ?? null;
		this.pickerDaysGrid = this.form?.querySelector<HTMLElement>('[data-picker-days-grid]') ?? null;
		this.pickerHourSelect =
			this.form?.querySelector<HTMLSelectElement>('[data-picker-hour-select]') ?? null;
		this.pickerMinuteSelect =
			this.form?.querySelector<HTMLSelectElement>('[data-picker-minute-select]') ?? null;
		this.pickerCancelButton =
			this.form?.querySelector<HTMLButtonElement>('[data-picker-cancel]') ?? null;
		this.pickerApplyButton =
			this.form?.querySelector<HTMLButtonElement>('[data-picker-apply]') ?? null;
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
		requiredNodes.customerNameInput.addEventListener('focus', this.handleCustomerFocus, { signal });
		requiredNodes.customerNameInput.addEventListener('input', this.handleCustomerInput, { signal });
		requiredNodes.customerNameInput.addEventListener('blur', this.handleCustomerBlur, { signal });
		requiredNodes.clearCustomerButton.addEventListener('click', this.handleCustomerClear, { signal });
		requiredNodes.customerPhoneInput.addEventListener('input', this.handlePhoneInput, { signal });
		requiredNodes.customerPhoneInput.addEventListener('blur', this.handlePhoneBlur, { signal });
		requiredNodes.modalProfessional.addEventListener('change', this.handleProfessionalChange, { signal });
		requiredNodes.openStartPickerButton.addEventListener('click', this.handleOpenStartPicker, {
			signal,
		});
		requiredNodes.openEndPickerButton.addEventListener('click', this.handleOpenEndPicker, {
			signal,
		});
		requiredNodes.startDisplayInput.addEventListener('click', this.handleOpenStartPicker, { signal });
		requiredNodes.endDisplayInput.addEventListener('click', this.handleOpenEndPicker, { signal });
		requiredNodes.pickerMonthSelect.addEventListener('change', this.handlePickerMonthChange, { signal });
		requiredNodes.pickerYearSelect.addEventListener('change', this.handlePickerYearChange, { signal });
		requiredNodes.pickerPrevMonthButton.addEventListener('click', this.handlePrevMonth, { signal });
		requiredNodes.pickerNextMonthButton.addEventListener('click', this.handleNextMonth, { signal });
		requiredNodes.pickerCloseButton.addEventListener('click', this.closeDateTimePicker, { signal });
		requiredNodes.pickerHourSelect.addEventListener('change', this.handlePickerTimeChange, { signal });
		requiredNodes.pickerMinuteSelect.addEventListener('change', this.handlePickerTimeChange, { signal });
		requiredNodes.pickerCancelButton.addEventListener('click', this.handlePickerToday, { signal });
		requiredNodes.pickerApplyButton.addEventListener('click', this.applyDateTimePickerSelection, {
			signal,
		});
		requiredNodes.dateTimePicker.addEventListener('click', this.handlePickerBackdropClick, { signal });
		requiredNodes.dateTimePicker.addEventListener('close', this.handleNativePickerClose, { signal });

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
		this.syncDateBounds();
		this.syncDateDisplayInputs();

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
		void this.loadCustomersForCurrentProfessional(true);
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
			!this.customerIdInput ||
			!this.customerNameInput ||
			!this.customerPhoneInput ||
			!this.customerLov ||
			!this.customerResults ||
			!this.clearCustomerButton ||
			!this.startInput ||
			!this.startDisplayInput ||
			!this.openStartPickerButton ||
			!this.endInput ||
			!this.endDisplayInput ||
			!this.openEndPickerButton ||
			!this.statusInput ||
			!this.modalProfessionalWrap ||
			!this.modalProfessional ||
			!this.modalLocation ||
			!this.modalService ||
			!this.dateTimePicker ||
			!this.pickerTargetLabel ||
			!this.pickerMonthSelect ||
			!this.pickerYearSelect ||
			!this.pickerPrevMonthButton ||
			!this.pickerNextMonthButton ||
			!this.pickerCloseButton ||
			!this.pickerDaysGrid ||
			!this.pickerHourSelect ||
			!this.pickerMinuteSelect ||
			!this.pickerCancelButton ||
			!this.pickerApplyButton
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
			customerIdInput: this.customerIdInput,
			customerNameInput: this.customerNameInput,
			customerPhoneInput: this.customerPhoneInput,
			customerLov: this.customerLov,
			customerResults: this.customerResults,
			clearCustomerButton: this.clearCustomerButton,
			startInput: this.startInput,
			startDisplayInput: this.startDisplayInput,
			openStartPickerButton: this.openStartPickerButton,
			endInput: this.endInput,
			endDisplayInput: this.endDisplayInput,
			openEndPickerButton: this.openEndPickerButton,
			statusInput: this.statusInput,
			modalProfessionalWrap: this.modalProfessionalWrap,
			modalProfessional: this.modalProfessional,
			modalLocation: this.modalLocation,
			modalService: this.modalService,
			dateTimePicker: this.dateTimePicker,
			pickerTargetLabel: this.pickerTargetLabel,
			pickerMonthSelect: this.pickerMonthSelect,
			pickerYearSelect: this.pickerYearSelect,
			pickerPrevMonthButton: this.pickerPrevMonthButton,
			pickerNextMonthButton: this.pickerNextMonthButton,
			pickerCloseButton: this.pickerCloseButton,
			pickerDaysGrid: this.pickerDaysGrid,
			pickerHourSelect: this.pickerHourSelect,
			pickerMinuteSelect: this.pickerMinuteSelect,
			pickerCancelButton: this.pickerCancelButton,
			pickerApplyButton: this.pickerApplyButton,
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

	private hideCustomerResults() {
		this.customerResults?.classList.add('hidden');
	}

	private showCustomerResults() {
		this.customerResults?.classList.remove('hidden');
	}

	private setSelectedCustomer(customer: CustomerOption) {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return;

		this.selectedCustomer = customer;
		requiredNodes.customerIdInput.value = String(customer.id_customer);
		requiredNodes.customerNameInput.value = customer.full_name;
		requiredNodes.customerPhoneInput.value = this.formatParaguayPhoneLocal(customer.phone_number);
		requiredNodes.customerPhoneInput.readOnly = true;
		requiredNodes.clearCustomerButton.classList.remove('hidden');
		this.setFieldError('customer_name', '');
		this.setFieldError('customer_phone', '');
		this.hideCustomerResults();
	}

	private clearSelectedCustomer(options: { clearFields?: boolean } = {}) {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return;

		this.selectedCustomer = null;
		requiredNodes.customerIdInput.value = '';
		requiredNodes.customerPhoneInput.readOnly = false;
		requiredNodes.clearCustomerButton.classList.add('hidden');
		if (options.clearFields) {
			requiredNodes.customerNameInput.value = '';
			requiredNodes.customerPhoneInput.value = '';
		}
	}

	private renderCustomerResults() {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return;

		const query = requiredNodes.customerNameInput.value.trim().toLowerCase();
		const matches = this.customers
			.filter((customer) => {
				if (!query) return true;
				return `${customer.full_name} ${customer.phone_number}`.toLowerCase().includes(query);
			})
			.slice(0, 8);

		requiredNodes.customerResults.replaceChildren();

		if (matches.length === 0) {
			const empty = document.createElement('div');
			empty.className = 'appointment-customer-empty';
			empty.textContent = query
				? 'No existe. Completa el teléfono para crear este cliente.'
				: 'No hay clientes para este profesional.';
			requiredNodes.customerResults.appendChild(empty);
			this.showCustomerResults();
			return;
		}

		for (const customer of matches) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'appointment-customer-option';
			button.innerHTML = `
				<span class="appointment-customer-option-name"></span>
				<span class="appointment-customer-option-phone"></span>
			`;
			button.querySelector('.appointment-customer-option-name')!.textContent = customer.full_name;
			button.querySelector('.appointment-customer-option-phone')!.textContent =
				this.formatParaguayPhoneLocal(customer.phone_number) || customer.phone_number || 'Sin teléfono';
			button.addEventListener('mousedown', (event) => event.preventDefault());
			button.addEventListener('click', () => this.setSelectedCustomer(customer));
			requiredNodes.customerResults.appendChild(button);
		}

		this.showCustomerResults();
	}

	private async loadCustomersForCurrentProfessional(force = false) {
		if (!this.client || this.isLoadingCustomers) return;
		const shouldShowResults = () => document.activeElement === this.customerNameInput;
		const shouldFilterByProfessional = this.roleId === 3;
		const professionalId = shouldFilterByProfessional ? this.getSelectedProfessionalId() : 0;
		if (shouldFilterByProfessional && !professionalId) {
			this.customers = [];
			this.lastLoadedCustomerProfessionalId = 0;
			if (shouldShowResults()) this.renderCustomerResults();
			else this.hideCustomerResults();
			return;
		}

		if (!force && this.lastLoadedCustomerProfessionalId === professionalId) {
			if (shouldShowResults()) this.renderCustomerResults();
			return;
		}

		this.isLoadingCustomers = true;
		try {
			this.customers = await this.client.getCustomers({
				...(shouldFilterByProfessional ? { pro_id: professionalId } : {}),
				limit: 50,
			});
			this.lastLoadedCustomerProfessionalId = professionalId;
			if (shouldShowResults()) this.renderCustomerResults();
			else this.hideCustomerResults();
		} catch {
			this.customers = [];
			this.lastLoadedCustomerProfessionalId = professionalId;
			if (shouldShowResults()) this.renderCustomerResults();
			else this.hideCustomerResults();
		} finally {
			this.isLoadingCustomers = false;
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
		this.openStartPickerButton && (this.openStartPickerButton.disabled = value);
		this.openEndPickerButton && (this.openEndPickerButton.disabled = value);
		this.pickerMonthSelect && (this.pickerMonthSelect.disabled = value);
		this.pickerYearSelect && (this.pickerYearSelect.disabled = value);
		this.pickerPrevMonthButton && (this.pickerPrevMonthButton.disabled = value);
		this.pickerNextMonthButton && (this.pickerNextMonthButton.disabled = value);
		this.pickerCancelButton && (this.pickerCancelButton.disabled = value);
		this.pickerApplyButton && (this.pickerApplyButton.disabled = value);
		if (value) this.closeDateTimePicker();
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
		requiredNodes.customerIdInput.value = '';
		requiredNodes.customerNameInput.value = '';
		requiredNodes.customerPhoneInput.value = '';
		requiredNodes.customerPhoneInput.readOnly = false;
		requiredNodes.clearCustomerButton.classList.add('hidden');
		requiredNodes.startInput.value = '';
		requiredNodes.startDisplayInput.value = '';
		requiredNodes.endInput.value = '';
		requiredNodes.endDisplayInput.value = '';
		requiredNodes.startInput.min = '';
		requiredNodes.endInput.min = '';
		requiredNodes.statusInput.value = 'CONFIRMADO';
		requiredNodes.statusInput.disabled = true;
		this.selectedCustomer = null;
		this.hideCustomerResults();
		this.closeDateTimePicker();
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

		requiredNodes.customerIdInput.value = String(appointment.id_customer || '');
		requiredNodes.customerNameInput.value = String(appointment.customer_name || '');
		requiredNodes.customerPhoneInput.value = this.formatParaguayPhoneLocal(
			String(appointment.customer_phone || '')
		);
		requiredNodes.customerPhoneInput.readOnly = Number(appointment.id_customer || 0) > 0;
		requiredNodes.clearCustomerButton.classList.toggle(
			'hidden',
			Number(appointment.id_customer || 0) <= 0
		);
		this.selectedCustomer = Number(appointment.id_customer || 0) > 0
			? {
					id_customer: Number(appointment.id_customer),
					full_name: String(appointment.customer_name || ''),
					phone_number: String(appointment.customer_phone || ''),
				}
			: null;
		requiredNodes.modalProfessional.value = String(appointment.pro_id_professional || '');
		requiredNodes.modalLocation.value = String(appointment.loc_id_location || '');
		requiredNodes.modalService.value = String(appointment.ser_id_service || '');
		requiredNodes.statusInput.value = String(appointment.status || 'CONFIRMADO');
		requiredNodes.startInput.value = parseIsoToLocalInput(String(appointment.start_time || ''));
		requiredNodes.endInput.value = parseIsoToLocalInput(String(appointment.end_time || ''));
		this.syncDateBounds();
		this.syncDateDisplayInputs();
		this.ensureModalProfessionalValue();
		void this.loadCustomersForCurrentProfessional();
	}

	buildPayloadFromForm(): BuildPayloadResult {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return { error: 'No fue posible acceder al formulario de citas.' };

		const customerName = requiredNodes.customerNameInput.value.trim();
		const customerId = toPositiveInt(requiredNodes.customerIdInput.value, 0);
		const rawCustomerPhone = requiredNodes.customerPhoneInput.value.trim();
		const locId = toPositiveInt(requiredNodes.modalLocation.value, 0);
		const serviceId = toPositiveInt(requiredNodes.modalService.value, 0);
		const professionalId = this.getSelectedProfessionalId();
		const statusRaw = String(requiredNodes.statusInput.value || '').trim().toUpperCase();
		const startRaw = normalizeDateTimeInput(requiredNodes.startInput.value).trim();
		const endRaw = normalizeDateTimeInput(requiredNodes.endInput.value).trim();
		requiredNodes.startInput.value = startRaw;
		requiredNodes.endInput.value = endRaw;

		const startDate = parseLocalDateTime(startRaw);
		const endDate = parseLocalDateTime(endRaw);
		if (startDate) requiredNodes.startInput.value = formatDateTimeLocal(startDate);
		if (endDate) requiredNodes.endInput.value = formatDateTimeLocal(endDate);
		this.syncDateDisplayInputs();
		const startIso = startDate ? toIsoWithOffset(startDate) : '';
		const endIso = endDate ? toIsoWithOffset(endDate) : '';

		if (!customerId && !customerName) return { error: 'El nombre del cliente es obligatorio.' };

		let customerPhone = '';
		if (!customerId && !rawCustomerPhone) {
			this.setFieldError('customer_phone', 'El teléfono del cliente es obligatorio.');
			return { error: 'Revisa los campos marcados.' };
		}

		if (rawCustomerPhone) {
			const parsedPhone = parseParaguayMobilePhone(rawCustomerPhone);
			if (!parsedPhone.isValid) {
				if (!customerId) {
					this.setFieldError('customer_phone', PARAGUAY_MOBILE_PHONE_ERROR);
					return { error: 'Revisa los campos marcados.' };
				}
			} else {
				customerPhone = parsedPhone.e164;
				requiredNodes.customerPhoneInput.value = this.formatParaguayPhoneLocal(parsedPhone.e164);
			}
		}

		if (!locId || !serviceId || !professionalId) {
			return { error: 'Profesional, sucursal y servicio son obligatorios.' };
		}
		if (!startDate || !endDate || !startIso || !endIso) {
			if (!startDate || !startIso) {
				this.setFieldError('start_time', 'Selecciona fecha y hora de inicio.');
			}
			if (!endDate || !endIso) {
				this.setFieldError('end_time', 'Selecciona fecha y hora de fin.');
			}
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
				...(customerId > 0 ? { id_customer: customerId } : {}),
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

	handleCustomerFocus = () => {
		void this.loadCustomersForCurrentProfessional();
	};

	handleCustomerInput = () => {
		if (
			this.selectedCustomer &&
			this.customerNameInput?.value.trim() !== this.selectedCustomer.full_name
		) {
			this.clearSelectedCustomer();
		}
		this.setFieldError('customer_name', '');
		this.renderCustomerResults();
	};

	handleCustomerBlur = () => {
		window.setTimeout(() => this.hideCustomerResults(), 120);
	};

	handleCustomerClear = () => {
		this.clearSelectedCustomer({ clearFields: true });
		this.customerNameInput?.focus();
		void this.loadCustomersForCurrentProfessional();
	};

	handleProfessionalChange = () => {
		if (this.roleId !== 3) return;
		if (this.selectedCustomer) this.clearSelectedCustomer({ clearFields: true });
		this.customers = [];
		this.lastLoadedCustomerProfessionalId = 0;
		void this.loadCustomersForCurrentProfessional(true);
	};

	syncDateBounds() {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return;

		const startValue = String(requiredNodes.startInput.value || '').trim();
		requiredNodes.endInput.min = startValue || '';

		const startDate = parseLocalDateTime(startValue);
		const endDate = parseLocalDateTime(requiredNodes.endInput.value);
		if (startDate && endDate && endDate <= startDate) {
			const safeEnd = new Date(startDate.getTime() + 60 * 60 * 1000);
			requiredNodes.endInput.value = formatDateTimeLocal(safeEnd);
		}
	}

	syncDateDisplayInputs() {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return;

		const startDate = parseLocalDateTime(requiredNodes.startInput.value);
		const endDate = parseLocalDateTime(requiredNodes.endInput.value);
		requiredNodes.startDisplayInput.value = startDate ? formatDateTimeDisplay(startDate) : '';
		requiredNodes.endDisplayInput.value = endDate ? formatDateTimeDisplay(endDate) : '';
	}

	private getRoundedNowDate(stepMinutes = 5) {
		const now = new Date();
		now.setSeconds(0, 0);
		const roundedMinute = Math.ceil(now.getMinutes() / stepMinutes) * stepMinutes;
		now.setMinutes(roundedMinute, 0, 0);
		return now;
	}

	private getPickerFieldDate(field: PickerField, fallbackToStart = false) {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return this.getRoundedNowDate();

		const fieldValue = field === 'start' ? requiredNodes.startInput.value : requiredNodes.endInput.value;
		const parsedFieldDate = parseLocalDateTime(fieldValue);
		if (parsedFieldDate) return parsedFieldDate;

		if (field === 'end' && fallbackToStart) {
			const startDate = parseLocalDateTime(requiredNodes.startInput.value);
			if (startDate) return new Date(startDate.getTime() + 60 * 60 * 1000);
		}

		return this.getRoundedNowDate();
	}

	private openDateTimePicker(field: PickerField) {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes || this.isLoading || this.isSubmitting) return;

		this.activePickerField = field;
		this.pickerDraftDate = this.getPickerFieldDate(field, true);
		this.pickerViewDate = new Date(
			this.pickerDraftDate.getFullYear(),
			this.pickerDraftDate.getMonth(),
			1,
			0,
			0,
			0,
			0
		);

		if (!requiredNodes.dateTimePicker.open) {
			requiredNodes.dateTimePicker.showModal();
		}
		requiredNodes.pickerTargetLabel.textContent =
			field === 'start' ? 'Seleccionando inicio' : 'Seleccionando fin';
		this.renderDateTimePicker();
		this.setFieldError(field === 'start' ? 'start_time' : 'end_time', '');
	}

	closeDateTimePicker = () => {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return;
		if (requiredNodes.dateTimePicker.open) {
			requiredNodes.dateTimePicker.close();
		}
		this.activePickerField = null;
		this.pickerDraftDate = null;
	};

	private renderDateTimePicker() {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes || !this.pickerDraftDate) return;

		this.renderPickerMonthYearControls(requiredNodes);
		this.renderPickerDays(requiredNodes);
		this.renderPickerTimeSelects(requiredNodes);
	}

	private renderPickerMonthYearControls(requiredNodes: RequiredNodes) {
		const monthSelect = requiredNodes.pickerMonthSelect;
		if (monthSelect.options.length === 0) {
			const monthFormatter = new Intl.DateTimeFormat('es-ES', { month: 'long' });
			for (let month = 0; month < 12; month += 1) {
				const option = document.createElement('option');
				option.value = String(month);
				const monthName = monthFormatter.format(new Date(2020, month, 1));
				option.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
				monthSelect.appendChild(option);
			}
		}
		monthSelect.value = String(this.pickerViewDate.getMonth());

		const yearSelect = requiredNodes.pickerYearSelect;
		const viewYear = this.pickerViewDate.getFullYear();
		const minYear = viewYear - 12;
		const maxYear = viewYear + 12;
		const firstYear = Number(yearSelect.options[0]?.value ?? Number.NaN);
		const lastYear = Number(
			yearSelect.options[yearSelect.options.length - 1]?.value ?? Number.NaN
		);

		if (yearSelect.options.length === 0 || firstYear !== minYear || lastYear !== maxYear) {
			yearSelect.innerHTML = '';
			for (let year = minYear; year <= maxYear; year += 1) {
				const option = document.createElement('option');
				option.value = String(year);
				option.textContent = String(year);
				yearSelect.appendChild(option);
			}
		}

		yearSelect.value = String(viewYear);
	}

	private renderPickerDays(requiredNodes: RequiredNodes) {
		const selectedDate = this.pickerDraftDate;
		if (!selectedDate) return;

		const grid = requiredNodes.pickerDaysGrid;
		grid.innerHTML = '';

		const viewYear = this.pickerViewDate.getFullYear();
		const viewMonth = this.pickerViewDate.getMonth();
		const firstDay = new Date(viewYear, viewMonth, 1);
		const firstWeekdayMondayBased = (firstDay.getDay() + 6) % 7;

		const gridStart = new Date(viewYear, viewMonth, 1 - firstWeekdayMondayBased);
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		for (let index = 0; index < 42; index += 1) {
			const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
			const inCurrentMonth = date.getMonth() === viewMonth;
			const isSelected =
				date.getFullYear() === selectedDate.getFullYear() &&
				date.getMonth() === selectedDate.getMonth() &&
				date.getDate() === selectedDate.getDate();
			const isToday = date.getTime() === today.getTime();

			const button = document.createElement('button');
			button.type = 'button';
			button.textContent = String(date.getDate());
			button.className = [
				'inline-flex h-10 w-10 items-center justify-center rounded-full text-[1.02rem] font-semibold transition',
				inCurrentMonth
					? 'text-stone-700 hover:bg-stone-200'
					: 'text-stone-400 hover:bg-stone-200/70',
				isToday ? 'ring-1 ring-stone-400/70' : '',
				isSelected
					? 'bg-stone-300 text-stone-900 hover:bg-stone-400'
					: '',
			]
				.filter(Boolean)
				.join(' ');

			button.addEventListener('click', () => {
				if (!this.pickerDraftDate) return;
				this.pickerDraftDate = new Date(
					date.getFullYear(),
					date.getMonth(),
					date.getDate(),
					this.pickerDraftDate.getHours(),
					this.pickerDraftDate.getMinutes(),
					0,
					0
				);
				this.renderDateTimePicker();
			});

			grid.appendChild(button);
		}
	}

	private renderPickerTimeSelects(requiredNodes: RequiredNodes) {
		const selectedDate = this.pickerDraftDate;
		if (!selectedDate) return;

		const hourSelect = requiredNodes.pickerHourSelect;
		if (hourSelect.options.length === 0) {
			for (let hour = 0; hour < 24; hour += 1) {
				const option = document.createElement('option');
				option.value = String(hour).padStart(2, '0');
				option.textContent = String(hour).padStart(2, '0');
				hourSelect.appendChild(option);
			}
		}

		const minuteSelect = requiredNodes.pickerMinuteSelect;
		if (minuteSelect.options.length === 0) {
			for (const minute of this.pickerMinuteOptions) {
				const option = document.createElement('option');
				option.value = String(minute).padStart(2, '0');
				option.textContent = String(minute).padStart(2, '0');
				minuteSelect.appendChild(option);
			}
		}

		hourSelect.value = String(selectedDate.getHours()).padStart(2, '0');

		let minuteToUse = selectedDate.getMinutes();
		if (!this.pickerMinuteOptions.includes(minuteToUse)) {
			minuteToUse = this.pickerMinuteOptions.reduce((closest, current) =>
				Math.abs(current - selectedDate.getMinutes()) < Math.abs(closest - selectedDate.getMinutes())
					? current
					: closest
			);
			selectedDate.setMinutes(minuteToUse, 0, 0);
		}
		minuteSelect.value = String(minuteToUse).padStart(2, '0');
	}

	handlePickerBackdropClick = (event: MouseEvent) => {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes || !this.activePickerField) return;

		if (event.target === requiredNodes.dateTimePicker) this.closeDateTimePicker();
	};

	handleNativePickerClose = () => {
		this.activePickerField = null;
		this.pickerDraftDate = null;
	};

	handlePickerTimeChange = () => {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes || !this.pickerDraftDate) return;

		const selectedHour = Number(requiredNodes.pickerHourSelect.value);
		const selectedMinute = Number(requiredNodes.pickerMinuteSelect.value);
		if (!Number.isFinite(selectedHour) || !Number.isFinite(selectedMinute)) return;

		this.pickerDraftDate.setHours(selectedHour, selectedMinute, 0, 0);
	};

	handlePickerMonthChange = () => {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return;

		const selectedMonth = Number(requiredNodes.pickerMonthSelect.value);
		if (!Number.isInteger(selectedMonth) || selectedMonth < 0 || selectedMonth > 11) return;

		this.pickerViewDate = new Date(
			this.pickerViewDate.getFullYear(),
			selectedMonth,
			1,
			0,
			0,
			0,
			0
		);
		this.renderDateTimePicker();
	};

	handlePickerYearChange = () => {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return;

		const selectedYear = Number(requiredNodes.pickerYearSelect.value);
		if (!Number.isInteger(selectedYear)) return;

		this.pickerViewDate = new Date(
			selectedYear,
			this.pickerViewDate.getMonth(),
			1,
			0,
			0,
			0,
			0
		);
		this.renderDateTimePicker();
	};

	handlePickerToday = () => {
		const now = this.getRoundedNowDate(15);
		this.pickerDraftDate = now;
		this.pickerViewDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
		this.renderDateTimePicker();
	};

	handleOpenStartPicker = (event?: Event) => {
		void event;
		this.openDateTimePicker('start');
	};

	handleOpenEndPicker = (event?: Event) => {
		void event;
		this.openDateTimePicker('end');
	};

	handlePrevMonth = () => {
		this.pickerViewDate = new Date(
			this.pickerViewDate.getFullYear(),
			this.pickerViewDate.getMonth() - 1,
			1,
			0,
			0,
			0,
			0
		);
		this.renderDateTimePicker();
	};

	handleNextMonth = () => {
		this.pickerViewDate = new Date(
			this.pickerViewDate.getFullYear(),
			this.pickerViewDate.getMonth() + 1,
			1,
			0,
			0,
			0,
			0
		);
		this.renderDateTimePicker();
	};

	applyDateTimePickerSelection = () => {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes || !this.activePickerField || !this.pickerDraftDate) {
			this.closeDateTimePicker();
			return;
		}

		const pickedDate = new Date(this.pickerDraftDate.getTime());
		if (this.activePickerField === 'start') {
			requiredNodes.startInput.value = formatDateTimeLocal(pickedDate);
		} else {
			requiredNodes.endInput.value = formatDateTimeLocal(pickedDate);
		}

		this.syncDateBounds();
		this.syncDateDisplayInputs();
		this.setFieldError(this.activePickerField === 'start' ? 'start_time' : 'end_time', '');
		this.closeDateTimePicker();
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
							id_customer: payload.id_customer,
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
