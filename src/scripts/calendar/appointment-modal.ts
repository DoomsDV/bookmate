import { ROLES } from '../../config/roles';
import type { AppointmentAiDraft } from '../../lib/appointment-ai-types';
import { formatPersonName } from '../../lib/format-person-name';
import {
	PARAGUAY_MOBILE_PHONE_ERROR,
	parseParaguayMobilePhone,
} from '../../lib/paraguay-phone';
import { createAttachmentListItem } from '../../lib/attachment-list-item';
import { bindFileViewer, type FileViewerHandle } from '../../lib/file-viewer';
import {
	buildSessionNotesPayload,
	hasAnySessionNote,
	normalizeSessionNotesHistory,
	type SessionNotes,
} from '../../lib/session-notes';
import {
	getScheduleMisalignedConfirmMessage,
	getScheduleMisalignedConfirmTitle,
	SCHEDULE_MISALIGNED_CONFIRM_ACTION,
	getScheduleMisalignedMessage,
	getScheduleMisalignedTitle,
	isScheduleMisalignedConflictError,
	isScheduleMisalignedFlag,
	normalizeScheduleMisalignedReason,
} from '../../lib/schedule-misaligned';
import {
	destroySearchableSelect,
	ensureSearchableSelect,
	setSearchableSelectDisabled,
	setSearchableSelectValue,
	syncSearchableSelect,
} from '../searchable-select';
import { AppointmentsClient } from './appointments-client';
import type {
	ApiFieldError,
	AppointmentAttachment,
	AppointmentDetail,
	AppointmentFormPayload,
	CustomerOption,
	Option,
	ProfessionalOption,
} from './types';
import {
	ApiClientError,
	formatAttendanceReplyAt,
	formatDateTimeDisplay,
	formatDateTimeLocal,
	getAttendanceReminderLabel,
	getAttendanceStatusFromValue,
	isAppointmentStatus,
	isAttendanceAwaitingReconfirmation,
	isAttendanceReconfirmed,
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
	professionals: ProfessionalOption[];
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
	paymentStatusInput: HTMLInputElement;
	modalProfessionalWrap: HTMLElement;
	modalProfessional: HTMLSelectElement;
	modalLocation: HTMLSelectElement;
	modalService: HTMLSelectElement;
	modalServiceHint: HTMLElement | null;
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
	professionals: ProfessionalOption[] = [];
	locations: Option[] = [];
	services: Option[] = [];
	customers: CustomerOption[] = [];

	mode: ModalMode = 'create';
	isSubmitting = false;
	isLoading = false;
	isLoadingCustomers = false;
	editingAppointmentId = 0;
	editingPaymentStatus: string | null = null;
	editingDepositAmount: number | null = null;
	isImmutableReadOnly = false;
	/** Estado bloqueado en solo lectura (cancelada o completada). */
	immutableReadOnlyStatus: 'CANCELADO' | 'COMPLETADO' | null = null;
	selectedCustomer: CustomerOption | null = null;
	lastLoadedCustomerProfessionalId: number | null = null;
	closeTimer: number | null = null;
	#settleOpenHandler: ((event: AnimationEvent) => void) | null = null;

	modal: HTMLDialogElement | null = null;
	modalTitle: HTMLElement | null = null;
	modalDescription: HTMLElement | null = null;
	form: HTMLFormElement | null = null;
	formErrorNode: HTMLElement | null = null;
	formErrorMessage: HTMLElement | null = null;
	formErrorFeedback: HTMLElement | null = null;
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
	paymentStatusInput: HTMLInputElement | null = null;
	modalStatusWrap: HTMLElement | null = null;
	modalStatusReadonlyWrap: HTMLElement | null = null;
	modalStatusReadonlyBadge: HTMLElement | null = null;
	modalStatusReadonlyIcon: HTMLElement | null = null;
	modalStatusReadonlyLabel: HTMLElement | null = null;
	modalFooter: HTMLElement | null = null;
	modalFooterWrap: HTMLElement | null = null;
	waReminder: HTMLElement | null = null;
	waReminderIcon: HTMLElement | null = null;
	waReminderLabel: HTMLElement | null = null;
	attendanceLabelSource: AppointmentDetail | null = null;
	attendanceReplyRow: HTMLElement | null = null;
	attendanceReplyAt: HTMLElement | null = null;
	scheduleMisalignedWrap: HTMLElement | null = null;
	scheduleMisalignedTitle: HTMLElement | null = null;
	scheduleMisalignedMessage: HTMLElement | null = null;
	scheduleMisalignedLink: HTMLAnchorElement | null = null;
	tabsBar: HTMLElement | null = null;
	tabButtons: NodeListOf<HTMLButtonElement> | null = null;
	tabPanels: NodeListOf<HTMLElement> | null = null;
	activeTab: 'details' | 'notes' = 'details';
	historySection: HTMLElement | null = null;
	historyBody: HTMLElement | null = null;
	notesLock: HTMLElement | null = null;
	notesLockText: HTMLElement | null = null;
	dropzone: HTMLElement | null = null;
	notesEditWrap: HTMLElement | null = null;
	sessionConsultationReasonInput: HTMLTextAreaElement | null = null;
	sessionProcedureNotesInput: HTMLTextAreaElement | null = null;
	sessionRecommendationsInput: HTMLTextAreaElement | null = null;
	notesHint: HTMLElement | null = null;
	notesReadonlyWrap: HTMLElement | null = null;
	historyConsultationWrap: HTMLElement | null = null;
	historyConsultationReason: HTMLElement | null = null;
	historyProcedureWrap: HTMLElement | null = null;
	historyProcedureNotes: HTMLElement | null = null;
	historyRecommendationsWrap: HTMLElement | null = null;
	historyRecommendations: HTMLElement | null = null;
	historyLegacyWrap: HTMLElement | null = null;
	historyNotes: HTMLElement | null = null;
	attachmentsList: HTMLElement | null = null;
	attachmentEmpty: HTMLElement | null = null;
	attachmentError: HTMLElement | null = null;
	attachmentAddButton: HTMLButtonElement | null = null;
	attachmentAddLabel: HTMLElement | null = null;
	attachmentInput: HTMLInputElement | null = null;
	historyEnabled = false;
	currentAttachments: AppointmentAttachment[] = [];
	isUploadingAttachment = false;
	fileViewer: FileViewerHandle | null = null;
	modalProfessionalWrap: HTMLElement | null = null;
	modalProfessional: HTMLSelectElement | null = null;
	modalLocation: HTMLSelectElement | null = null;
	modalService: HTMLSelectElement | null = null;
	modalServiceHint: HTMLElement | null = null;
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
		this.formErrorMessage =
			this.form?.querySelector<HTMLElement>('[data-form-error-message]') ?? null;
		this.formErrorFeedback =
			this.form?.querySelector<HTMLElement>('[data-appointment-form-feedback]') ?? null;
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
		this.paymentStatusInput =
			this.form?.querySelector<HTMLInputElement>('[data-modal-payment-status]') ?? null;
		this.modalStatusWrap =
			this.form?.querySelector<HTMLElement>('[data-modal-status-wrap]') ?? null;
		this.modalStatusReadonlyWrap =
			this.form?.querySelector<HTMLElement>('[data-modal-status-readonly-wrap]') ?? null;
		this.modalStatusReadonlyBadge =
			this.form?.querySelector<HTMLElement>('[data-modal-status-readonly-badge]') ?? null;
		this.modalStatusReadonlyIcon =
			this.form?.querySelector<HTMLElement>('[data-modal-status-readonly-icon]') ?? null;
		this.modalStatusReadonlyLabel =
			this.form?.querySelector<HTMLElement>('[data-modal-status-readonly-label]') ?? null;
		this.modalFooter = this.querySelector<HTMLElement>('[data-appointment-modal-footer]') ?? null;
		this.modalFooterWrap =
			this.querySelector<HTMLElement>('[data-appointment-modal-footer-wrap]') ?? null;
		this.waReminder =
			this.form?.querySelector<HTMLElement>('[data-appointment-wa-reminder]') ?? null;
		this.waReminderIcon =
			this.form?.querySelector<HTMLElement>('[data-appointment-wa-reminder-icon]') ?? null;
		this.waReminderLabel =
			this.form?.querySelector<HTMLElement>('[data-appointment-wa-reminder-label]') ?? null;
		this.attendanceReplyRow =
			this.form?.querySelector<HTMLElement>('[data-appointment-attendance-reply]') ?? null;
		this.attendanceReplyAt =
			this.form?.querySelector<HTMLElement>('[data-appointment-attendance-reply-at]') ?? null;
		this.scheduleMisalignedWrap =
			this.form?.querySelector<HTMLElement>('[data-appointment-schedule-misaligned-wrap]') ??
			null;
		this.scheduleMisalignedTitle =
			this.form?.querySelector<HTMLElement>('[data-appointment-schedule-misaligned-title]') ??
			null;
		this.scheduleMisalignedMessage =
			this.form?.querySelector<HTMLElement>('[data-appointment-schedule-misaligned-message]') ??
			null;
		this.scheduleMisalignedLink =
			this.form?.querySelector<HTMLAnchorElement>('[data-appointment-schedule-misaligned-link]') ??
			null;
		this.tabsBar = this.form?.querySelector<HTMLElement>('[data-appointment-tabs]') ?? null;
		this.tabButtons = this.form?.querySelectorAll<HTMLButtonElement>('[data-appointment-tab]') ?? null;
		this.tabPanels =
			this.form?.querySelectorAll<HTMLElement>('[data-appointment-tab-panel]') ?? null;
		this.historySection =
			this.form?.querySelector<HTMLElement>('[data-appointment-history-section]') ?? null;
		this.historyBody =
			this.form?.querySelector<HTMLElement>('[data-appointment-history-body]') ?? null;
		this.notesLock =
			this.form?.querySelector<HTMLElement>('[data-appointment-notes-lock]') ?? null;
		this.notesLockText =
			this.notesLock?.querySelector<HTMLElement>('.appointment-history-lock__text') ?? null;
		this.dropzone =
			this.form?.querySelector<HTMLElement>('[data-appointment-dropzone]') ?? null;
		this.notesEditWrap =
			this.form?.querySelector<HTMLElement>('[data-appointment-notes-edit-wrap]') ?? null;
		this.sessionConsultationReasonInput =
			this.form?.querySelector<HTMLTextAreaElement>(
				'[data-appointment-session-consultation-reason]'
			) ?? null;
		this.sessionProcedureNotesInput =
			this.form?.querySelector<HTMLTextAreaElement>('[data-appointment-session-procedure-notes]') ??
			null;
		this.sessionRecommendationsInput =
			this.form?.querySelector<HTMLTextAreaElement>(
				'[data-appointment-session-recommendations]'
			) ?? null;
		this.notesHint = null;
		this.notesReadonlyWrap =
			this.form?.querySelector<HTMLElement>('[data-appointment-notes-readonly-wrap]') ?? null;
		this.historyConsultationWrap =
			this.form?.querySelector<HTMLElement>('[data-appointment-history-consultation-wrap]') ?? null;
		this.historyConsultationReason =
			this.form?.querySelector<HTMLElement>('[data-appointment-history-consultation-reason]') ??
			null;
		this.historyProcedureWrap =
			this.form?.querySelector<HTMLElement>('[data-appointment-history-procedure-wrap]') ?? null;
		this.historyProcedureNotes =
			this.form?.querySelector<HTMLElement>('[data-appointment-history-procedure-notes]') ?? null;
		this.historyRecommendationsWrap =
			this.form?.querySelector<HTMLElement>('[data-appointment-history-recommendations-wrap]') ??
			null;
		this.historyRecommendations =
			this.form?.querySelector<HTMLElement>('[data-appointment-history-recommendations]') ?? null;
		this.historyLegacyWrap =
			this.form?.querySelector<HTMLElement>('[data-appointment-history-legacy-wrap]') ?? null;
		this.historyNotes =
			this.form?.querySelector<HTMLElement>('[data-appointment-history-notes]') ?? null;
		this.attachmentsList =
			this.form?.querySelector<HTMLElement>('[data-appointment-attachments]') ?? null;
		this.attachmentEmpty =
			this.form?.querySelector<HTMLElement>('[data-appointment-attachment-empty]') ?? null;
		this.attachmentError =
			this.form?.querySelector<HTMLElement>('[data-appointment-attachment-error]') ?? null;
		this.attachmentAddButton =
			this.form?.querySelector<HTMLButtonElement>('[data-appointment-attachment-add]') ?? null;
		this.attachmentAddLabel =
			this.form?.querySelector<HTMLElement>('[data-appointment-attachment-add-label]') ?? null;
		this.attachmentInput =
			this.form?.querySelector<HTMLInputElement>('[data-appointment-attachment-input]') ?? null;
		this.modalProfessionalWrap =
			this.form?.querySelector<HTMLElement>('[data-modal-professional-wrap]') ?? null;
		this.modalProfessional =
			this.form?.querySelector<HTMLSelectElement>('[data-modal-professional]') ?? null;
		this.modalLocation = this.form?.querySelector<HTMLSelectElement>('[data-modal-location]') ?? null;
		this.modalService = this.form?.querySelector<HTMLSelectElement>('[data-modal-service]') ?? null;
		this.modalServiceHint = this.form?.querySelector<HTMLElement>('[data-modal-service-hint]') ?? null;
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
		this.fileViewer = bindFileViewer(this, signal);

		ensureSearchableSelect(requiredNodes.modalProfessional, {
			placeholder: 'Buscar profesional...',
			dropdownParent: requiredNodes.modal,
		});
		ensureSearchableSelect(requiredNodes.statusInput, {
			placeholder: 'Estado',
			dropdownParent: requiredNodes.modal,
			searchable: false,
		});

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

		this.attachmentAddButton?.addEventListener('click', this.handleAttachmentAddClick, { signal });
		this.attachmentInput?.addEventListener('change', this.handleAttachmentInputChange, { signal });
		this.dropzone?.addEventListener('dragenter', this.handleDropzoneDragEnter, { signal });
		this.dropzone?.addEventListener('dragover', this.handleDropzoneDragOver, { signal });
		this.dropzone?.addEventListener('dragleave', this.handleDropzoneDragLeave, { signal });
		this.dropzone?.addEventListener('drop', this.handleDropzoneDrop, { signal });
		this.statusInput?.addEventListener('change', this.handleStatusChange, { signal });
		for (const tab of this.tabButtons ?? []) {
			tab.addEventListener('click', this.handleTabClick, { signal });
		}

		this.setCreateMode();
		this.resetFormValues();
	}

	disconnectedCallback() {
		this.#bound = false;
		this.fileViewer?.close();
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
		destroySearchableSelect(this.modalProfessional);
		destroySearchableSelect(this.statusInput);
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

		if (this.roleId === ROLES.PROFESIONAL) {
			requiredNodes.modalProfessionalWrap.classList.add('hidden');
			setSearchableSelectDisabled(requiredNodes.modalProfessional, true);
			if (this.currentProfessionalId > 0) {
				setSearchableSelectValue(requiredNodes.modalProfessional, this.currentProfessionalId);
			}
		} else {
			requiredNodes.modalProfessionalWrap.classList.remove('hidden');
			setSearchableSelectDisabled(requiredNodes.modalProfessional, false);
		}

		const selectedProId = this.getSelectedProfessionalId();
		this.refreshServicesForProfessional(selectedProId);
	}

	openCreate(context: OpenCreateContext = {}) {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return;

		// Reset liviano síncrono (evita flash del formulario anterior) y abrir shell de inmediato.
		this.clearFormErrors();
		this.setCreateMode();
		this.resetFormValues();
		this.openModalShell();

		const prepareForm = () => {
			if (!this.isConnected) return;

			const initialStart = context.start ?? new Date();
			const initialEnd = context.end ?? new Date(initialStart.getTime() + 60 * 60 * 1000);
			requiredNodes.startInput.value = formatDateTimeLocal(initialStart);
			requiredNodes.endInput.value = formatDateTimeLocal(initialEnd);
			this.syncDateBounds();
			this.syncDateDisplayInputs();

			if (this.roleId === ROLES.PROFESIONAL && this.currentProfessionalId > 0) {
				setSearchableSelectValue(requiredNodes.modalProfessional, this.currentProfessionalId);
			} else if (context.professionalId && context.professionalId > 0) {
				setSearchableSelectValue(requiredNodes.modalProfessional, context.professionalId);
			} else if (this.professionals.length > 0) {
				setSearchableSelectValue(requiredNodes.modalProfessional, this.professionals[0].id);
			}

			if (context.locationId && context.locationId > 0) {
				requiredNodes.modalLocation.value = String(context.locationId);
			} else if (this.locations.length > 0) {
				requiredNodes.modalLocation.value = String(this.locations[0].id);
			}

			this.ensureModalProfessionalValue();
			this.refreshServicesForProfessional(this.getSelectedProfessionalId());
			void this.loadCustomersForCurrentProfessional(true);
		};

		// Diferir selects/carga de clientes al siguiente frame para no bloquear el primer paint.
		requestAnimationFrame(prepareForm);
	}

	async openEdit(appointmentId: number) {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes || !this.client || appointmentId <= 0) return;

		this.clearFormErrors();
		this.setEditMode(appointmentId);
		this.setModalLoading(true);
		this.openModalShell();

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
			!this.paymentStatusInput ||
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
			paymentStatusInput: this.paymentStatusInput,
			modalProfessionalWrap: this.modalProfessionalWrap,
			modalProfessional: this.modalProfessional,
			modalLocation: this.modalLocation,
			modalService: this.modalService,
			modalServiceHint: this.modalServiceHint,
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
		syncSearchableSelect(select);
	}

	private syncModalProfessionalDisabledState() {
		if (!this.modalProfessional) return;
		setSearchableSelectDisabled(this.modalProfessional, this.modalProfessional.disabled);
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
				: this.roleId === ROLES.PROFESIONAL
					? 'No hay clientes para este profesional.'
					: 'No hay clientes registrados en la organización.';
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
		const shouldFilterByProfessional = this.roleId === ROLES.PROFESIONAL;
		const professionalId = shouldFilterByProfessional ? this.getSelectedProfessionalId() : 0;
		if (shouldFilterByProfessional && !professionalId) {
			this.customers = [];
			this.lastLoadedCustomerProfessionalId = null;
			if (shouldShowResults()) this.renderCustomerResults();
			else this.hideCustomerResults();
			return;
		}

		if (
			!force &&
			this.lastLoadedCustomerProfessionalId !== null &&
			this.lastLoadedCustomerProfessionalId === professionalId
		) {
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
		if (this.formErrorMessage) this.formErrorMessage.textContent = '';
		this.formErrorNode?.classList.add('hidden');
		this.formErrorFeedback?.classList.remove('is-visible');
		for (const node of this.fieldErrorNodes ?? []) {
			node.textContent = '';
			node.classList.add('hidden');
		}
	}

	showFormError(message: string) {
		if (!this.formErrorNode || !this.formErrorMessage) return;
		this.formErrorMessage.textContent = message;
		this.formErrorNode.classList.remove('hidden');
		this.formErrorFeedback?.classList.add('is-visible');
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

	setModalFooterVisible(value: boolean) {
		if (!this.modalFooterWrap) return;
		this.modalFooterWrap.classList.toggle('hidden', !value);
	}

	setModalLoading(value: boolean) {
		this.isLoading = value;
		this.modalLoadingNode?.classList.toggle('hidden', !value);
		this.modalLoadingNode?.classList.toggle('flex', value);
		this.setModalFooterVisible(!value);

		for (const field of this.formFields ?? []) {
			field.disabled = value;
		}
		this.syncModalProfessionalDisabledState();
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

		if (!this.isImmutableReadOnly) {
			this.submitButton.disabled = false;
			this.submitIcon.textContent = this.mode === 'edit' ? 'save' : 'check';
			this.syncSubmitLabel();
		}
		if (this.mode === 'edit' && this.deleteButton && !this.isImmutableReadOnly) {
			this.deleteButton.disabled = false;
		}
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
		setSearchableSelectValue(requiredNodes.statusInput, 'CONFIRMADO');
		setSearchableSelectDisabled(requiredNodes.statusInput, true);
		if (requiredNodes.paymentStatusInput) requiredNodes.paymentStatusInput.value = 'NONE';
		this.selectedCustomer = null;
		this.customers = [];
		this.lastLoadedCustomerProfessionalId = null;
		this.hideCustomerResults();
		this.closeDateTimePicker();
		this.hideAttendanceBlock();
		this.hideScheduleMisalignedBlock();
		this.hideHistorySection();
		this.clearImmutableReadOnlyMode();
	}

	hideAttendanceBlock() {
		this.attendanceLabelSource = null;
		this.waReminder?.setAttribute('hidden', '');
		this.waReminder?.classList.add('hidden');
		this.waReminder?.classList.remove('is-confirmed', 'is-pending');
		this.attendanceReplyRow?.setAttribute('hidden', '');
		this.attendanceReplyRow?.classList.add('hidden');
		if (this.attendanceReplyAt) this.attendanceReplyAt.textContent = '';
		if (this.waReminderIcon) this.waReminderIcon.textContent = 'schedule';
		this.syncWaReminderLabel();
	}

	private syncWaReminderLabel() {
		if (!this.waReminderLabel) return;
		this.waReminderLabel.textContent = getAttendanceReminderLabel(
			this.attendanceLabelSource,
			this.getCurrentAppointmentStatus()
		);
	}

	hideScheduleMisalignedBlock() {
		this.scheduleMisalignedWrap?.setAttribute('hidden', '');
		this.scheduleMisalignedWrap?.classList.add('hidden');
		if (this.scheduleMisalignedTitle) {
			this.scheduleMisalignedTitle.textContent = 'Cita fuera de la agenda actual';
		}
		if (this.scheduleMisalignedMessage) this.scheduleMisalignedMessage.textContent = '';
		if (this.scheduleMisalignedLink) {
			this.scheduleMisalignedLink.href = '/panel/schedules';
		}
	}

	showScheduleMisalignedBlock(appointment: AppointmentDetail) {
		this.hideScheduleMisalignedBlock();

		const misaligned =
			isScheduleMisalignedFlag(appointment.schedule_misaligned) ||
			Boolean(appointment.schedule_misaligned_reason);
		if (!misaligned) return;

		const reason = normalizeScheduleMisalignedReason(appointment.schedule_misaligned_reason);
		if (this.scheduleMisalignedTitle) {
			this.scheduleMisalignedTitle.textContent = getScheduleMisalignedTitle(reason);
		}
		if (this.scheduleMisalignedMessage) {
			this.scheduleMisalignedMessage.textContent = getScheduleMisalignedMessage(reason, {
				locationName: appointment.location_name,
			});
		}
		if (this.scheduleMisalignedLink && appointment.pro_id_professional > 0) {
			const schedulesUrl = new URL('/panel/schedules', window.location.origin);
			schedulesUrl.searchParams.set('pro_id', String(appointment.pro_id_professional));
			this.scheduleMisalignedLink.href = `${schedulesUrl.pathname}${schedulesUrl.search}`;
		}

		this.scheduleMisalignedWrap?.removeAttribute('hidden');
		this.scheduleMisalignedWrap?.classList.remove('hidden');
	}

	showAttendanceBlock(appointment: AppointmentDetail) {
		this.hideAttendanceBlock();
		this.attendanceLabelSource = appointment;

		if (isAttendanceReconfirmed(appointment)) {
			if (this.waReminderIcon) this.waReminderIcon.textContent = 'check_circle';
			this.syncWaReminderLabel();
			this.waReminder?.classList.add('is-confirmed');
			this.waReminder?.removeAttribute('hidden');
			this.waReminder?.classList.remove('hidden');

			const replyLabel = formatAttendanceReplyAt(appointment.attendance_reply_at);
			if (replyLabel && this.attendanceReplyAt) {
				this.attendanceReplyAt.textContent = `Confirmado el ${replyLabel}`;
				this.attendanceReplyRow?.removeAttribute('hidden');
				this.attendanceReplyRow?.classList.remove('hidden');
			}
			return;
		}

		if (isAttendanceAwaitingReconfirmation(appointment)) {
			const status = getAttendanceStatusFromValue(appointment);
			if (this.waReminderIcon) {
				this.waReminderIcon.textContent =
					status === 'NOT_REQUESTED' ? 'schedule_send' : 'schedule';
			}
			this.syncWaReminderLabel();
			this.waReminder?.classList.add('is-pending');
			this.waReminder?.removeAttribute('hidden');
			this.waReminder?.classList.remove('hidden');
		}
	}

	handleTabClick = (event: Event) => {
		const button = event.currentTarget as HTMLButtonElement | null;
		const tab = button?.dataset.appointmentTab;
		if (tab !== 'details' && tab !== 'notes') return;
		this.setActiveTab(tab);
	};

	private setActiveTab(tab: 'details' | 'notes') {
		this.activeTab = tab;

		for (const button of this.tabButtons ?? []) {
			const isActive = button.dataset.appointmentTab === tab;
			button.classList.toggle('is-active', isActive);
			button.setAttribute('aria-selected', isActive ? 'true' : 'false');
			button.tabIndex = isActive ? 0 : -1;
		}

		for (const panel of this.tabPanels ?? []) {
			const isActive = panel.dataset.appointmentTabPanel === tab;
			panel.classList.toggle('hidden', !isActive);
			if (isActive) panel.removeAttribute('hidden');
			else panel.setAttribute('hidden', '');
		}

		const scroll = this.form?.querySelector<HTMLElement>('[data-appointment-form-scroll]');
		if (scroll) scroll.scrollTop = 0;
		this.syncSubmitLabel();
	}

	private syncSubmitLabel() {
		if (!this.submitLabel || this.isSubmitting) return;
		if (this.mode === 'create') {
			this.submitLabel.textContent = 'Crear cita';
			return;
		}
		if (this.isImmutableReadOnly) return;
		this.submitLabel.textContent =
			this.activeTab === 'notes' ? 'Guardar ficha' : 'Guardar cambios';
	}

	private getCurrentAppointmentStatus() {
		if (this.immutableReadOnlyStatus) return this.immutableReadOnlyStatus;
		return String(this.statusInput?.value || '').trim().toUpperCase();
	}

	private isCancelledStatus() {
		return this.getCurrentAppointmentStatus() === 'CANCELADO';
	}

	private canEditSessionNotes() {
		return !this.isImmutableReadOnly && !this.isCancelledStatus();
	}

	private hasSessionTabContent() {
		return (
			hasAnySessionNote(this.readSessionNotesFromInputs()) || this.currentAttachments.length > 0
		);
	}

	private syncNotesLockState() {
		if (!this.historyEnabled) {
			this.historyBody?.classList.remove('is-locked');
			this.notesLock?.setAttribute('hidden', '');
			this.notesLock?.classList.add('hidden');
			return;
		}

		const cancelled = this.isCancelledStatus();
		const editable = this.canEditSessionNotes();

		this.historyBody?.classList.toggle('is-locked', cancelled);
		if (this.notesLock) {
			if (cancelled) {
				this.notesLock.removeAttribute('hidden');
				this.notesLock.classList.remove('hidden');
			} else {
				this.notesLock.setAttribute('hidden', '');
				this.notesLock.classList.add('hidden');
			}
		}
		if (this.notesLockText) {
			this.notesLockText.textContent =
				'Las notas y archivos no están disponibles en citas canceladas';
		}

		for (const input of this.getSessionNoteInputs()) {
			input.readOnly = !editable;
			input.disabled = !editable;
		}
		if (this.attachmentAddButton) {
			this.attachmentAddButton.disabled = !editable || this.isUploadingAttachment;
			this.attachmentAddButton.setAttribute('aria-disabled', editable ? 'false' : 'true');
		}
		if (this.attachmentInput) {
			this.attachmentInput.disabled = !editable || this.isUploadingAttachment;
		}
		this.syncAttachmentEmptyVisibility();
		this.syncDropzoneVisibility();
	}

	private getSessionNoteInputs() {
		return [
			this.sessionConsultationReasonInput,
			this.sessionProcedureNotesInput,
			this.sessionRecommendationsInput,
		].filter((input): input is HTMLTextAreaElement => input instanceof HTMLTextAreaElement);
	}

	private readSessionNotesFromInputs(): SessionNotes {
		return {
			consultation_reason: this.sessionConsultationReasonInput?.value ?? '',
			procedure_notes: this.sessionProcedureNotesInput?.value ?? '',
			recommendations: this.sessionRecommendationsInput?.value ?? '',
		};
	}

	private setSessionNotesOnInputs(notes: SessionNotes) {
		if (this.sessionConsultationReasonInput) {
			this.sessionConsultationReasonInput.value = notes.consultation_reason ?? '';
		}
		if (this.sessionProcedureNotesInput) {
			this.sessionProcedureNotesInput.value = notes.procedure_notes ?? '';
		}
		if (this.sessionRecommendationsInput) {
			this.sessionRecommendationsInput.value = notes.recommendations ?? '';
		}
	}

	private clearSessionNotesInputs() {
		for (const input of this.getSessionNoteInputs()) {
			input.value = '';
			input.readOnly = false;
			input.disabled = false;
		}
	}

	private renderReadonlySessionNotes(notes: ReturnType<typeof normalizeSessionNotesHistory>) {
		const showBlock = (
			wrap: HTMLElement | null,
			node: HTMLElement | null,
			value: string | null | undefined
		) => {
			const text = String(value ?? '').trim();
			if (!wrap || !node) return;
			if (!text) {
				wrap.classList.add('hidden');
				wrap.setAttribute('hidden', '');
				node.textContent = '';
				return;
			}
			node.textContent = text;
			wrap.classList.remove('hidden');
			wrap.removeAttribute('hidden');
		};

		const structured = Boolean(
			String(notes.consultation_reason ?? '').trim() ||
				String(notes.procedure_notes ?? '').trim() ||
				String(notes.recommendations ?? '').trim()
		);

		if (structured) {
			showBlock(
				this.historyConsultationWrap,
				this.historyConsultationReason,
				notes.consultation_reason
			);
			showBlock(this.historyProcedureWrap, this.historyProcedureNotes, notes.procedure_notes);
			showBlock(
				this.historyRecommendationsWrap,
				this.historyRecommendations,
				notes.recommendations
			);
			this.historyLegacyWrap?.classList.add('hidden');
			this.historyLegacyWrap?.setAttribute('hidden', '');
			if (this.historyNotes) this.historyNotes.textContent = '';
			return;
		}

		this.historyConsultationWrap?.classList.add('hidden');
		this.historyConsultationWrap?.setAttribute('hidden', '');
		this.historyProcedureWrap?.classList.add('hidden');
		this.historyProcedureWrap?.setAttribute('hidden', '');
		this.historyRecommendationsWrap?.classList.add('hidden');
		this.historyRecommendationsWrap?.setAttribute('hidden', '');

		const legacy = String(notes.notes ?? '').trim();
		if (legacy && this.historyLegacyWrap && this.historyNotes) {
			this.historyNotes.textContent = legacy;
			this.historyLegacyWrap.classList.remove('hidden');
			this.historyLegacyWrap.removeAttribute('hidden');
		} else {
			this.historyLegacyWrap?.classList.add('hidden');
			this.historyLegacyWrap?.setAttribute('hidden', '');
			if (this.historyNotes) this.historyNotes.textContent = '';
		}
	}

	private static readonly MAX_ATTACHMENTS = 10;

	private syncAttachmentEmptyVisibility() {
		const showHint = this.historyEnabled && this.canEditSessionNotes();
		if (showHint) {
			this.attachmentEmpty?.classList.remove('hidden');
			this.attachmentEmpty?.removeAttribute('hidden');
		} else {
			this.attachmentEmpty?.classList.add('hidden');
			this.attachmentEmpty?.setAttribute('hidden', '');
		}
	}

	private syncDropzoneVisibility() {
		if (!this.attachmentAddButton) return;
		const editable = this.historyEnabled && this.canEditSessionNotes();
		const atLimit = this.currentAttachments.length >= AppointmentModal.MAX_ATTACHMENTS;
		const hide = !editable || atLimit;
		this.attachmentAddButton.classList.toggle('hidden', hide);
		if (hide) this.attachmentAddButton.setAttribute('hidden', '');
		else this.attachmentAddButton.removeAttribute('hidden');
	}

	private showTabsBar() {
		this.tabsBar?.removeAttribute('hidden');
		this.tabsBar?.classList.remove('hidden');
		this.setActiveTab('details');
	}

	private hideTabsBar() {
		this.tabsBar?.setAttribute('hidden', '');
		this.tabsBar?.classList.add('hidden');
		this.setActiveTab('details');
	}

	private hideHistorySection() {
		this.historyEnabled = false;
		this.currentAttachments = [];
		this.isUploadingAttachment = false;
		this.hideTabsBar();
		this.historySection?.setAttribute('hidden', '');
		this.historySection?.classList.add('hidden');
		this.historyBody?.classList.remove('is-locked');
		this.notesLock?.setAttribute('hidden', '');
		this.notesLock?.classList.add('hidden');
		this.notesEditWrap?.setAttribute('hidden', '');
		this.notesEditWrap?.classList.add('hidden');
		this.notesReadonlyWrap?.setAttribute('hidden', '');
		this.notesReadonlyWrap?.classList.add('hidden');
		this.clearSessionNotesInputs();
		this.renderReadonlySessionNotes({
			consultation_reason: null,
			procedure_notes: null,
			recommendations: null,
			notes: null,
		});
		this.attachmentsList?.replaceChildren();
		this.attachmentEmpty?.classList.remove('hidden');
		this.clearAttachmentError();
		this.setUploadingAttachment(false);
		if (this.attachmentInput) this.attachmentInput.value = '';
		this.dropzone?.classList.remove('is-dragover');
	}

	private clearAttachmentError() {
		if (!this.attachmentError) return;
		this.attachmentError.textContent = '';
		this.attachmentError.classList.add('hidden');
	}

	private showAttachmentError(message: string) {
		if (!this.attachmentError) return;
		this.attachmentError.textContent = message;
		this.attachmentError.classList.remove('hidden');
	}

	private setUploadingAttachment(value: boolean) {
		this.isUploadingAttachment = value;
		const locked = this.historyEnabled && !this.canEditSessionNotes();
		if (this.attachmentAddButton) {
			this.attachmentAddButton.disabled = value || locked;
		}
		if (this.attachmentAddLabel) {
			this.attachmentAddLabel.textContent = value
				? 'Subiendo…'
				: 'Arrastrá tus archivos aquí o hacé clic para buscar';
		}
		if (this.attachmentInput) {
			this.attachmentInput.disabled = value || locked;
		}
	}

	private renderAttachments() {
		if (!this.attachmentsList) return;
		this.attachmentsList.replaceChildren();
		this.syncAttachmentEmptyVisibility();
		this.syncDropzoneVisibility();

		if (this.currentAttachments.length === 0) return;

		const canDelete = this.canEditSessionNotes();
		for (const attachment of this.currentAttachments) {
			this.attachmentsList.appendChild(
				createAttachmentListItem(attachment, {
					onPreview: () =>
						this.fileViewer?.open({
							url: attachment.url,
							name: attachment.file_name,
							mimeType: attachment.mime_type,
						}),
					onDelete: canDelete
						? () => void this.handleAttachmentDelete(attachment.id_attachment)
						: undefined,
				})
			);
		}
	}

	private renderHistorySection(appointment: AppointmentDetail) {
		this.hideHistorySection();
		if (!this.historySection || appointment.history_enabled !== true) return;

		this.historyEnabled = true;
		this.showTabsBar();
		this.historySection.removeAttribute('hidden');
		this.historySection.classList.remove('hidden');

		const status = String(appointment.status || '').trim().toUpperCase();
		const savedNotes = normalizeSessionNotesHistory(appointment.history ?? {});
		const showReadonlyNotes = status === 'COMPLETADO' && this.isImmutableReadOnly;

		if (showReadonlyNotes && this.notesReadonlyWrap) {
			this.renderReadonlySessionNotes(savedNotes);
			this.notesReadonlyWrap.removeAttribute('hidden');
			this.notesReadonlyWrap.classList.remove('hidden');
			this.notesEditWrap?.setAttribute('hidden', '');
			this.notesEditWrap?.classList.add('hidden');
		} else if (this.notesEditWrap) {
			this.setSessionNotesOnInputs(savedNotes);
			this.notesEditWrap.removeAttribute('hidden');
			this.notesEditWrap.classList.remove('hidden');
			this.notesReadonlyWrap?.setAttribute('hidden', '');
			this.notesReadonlyWrap?.classList.add('hidden');
		}

		this.currentAttachments = Array.isArray(appointment.history?.attachments)
			? [...(appointment.history?.attachments ?? [])]
			: [];
		this.renderAttachments();
		this.syncNotesLockState();
	}

	handleStatusChange = () => {
		this.syncWaReminderLabel();
		if (!this.historyEnabled) return;
		const status = this.getCurrentAppointmentStatus();
		if (status === 'CANCELADO') {
			this.notesEditWrap?.setAttribute('hidden', '');
			this.notesEditWrap?.classList.add('hidden');
		} else if (this.notesEditWrap) {
			this.notesEditWrap.classList.remove('hidden');
			this.notesEditWrap.removeAttribute('hidden');
			this.notesReadonlyWrap?.setAttribute('hidden', '');
			this.notesReadonlyWrap?.classList.add('hidden');
		}
		this.syncNotesLockState();
	};

	private syncPaymentStatusLabel(status: string | null, depositAmount: number | null) {
		const label = this.form?.querySelector<HTMLElement>('[data-modal-payment-status-label]');
		if (!label) return;
		const pay = String(status || 'NONE').toUpperCase();
		const amount =
			depositAmount != null && depositAmount > 0
				? new Intl.NumberFormat('es-PY', {
						style: 'currency',
						currency: 'PYG',
						maximumFractionDigits: 0,
					}).format(depositAmount)
				: '';
		if (pay === 'PAID' || pay === 'PAID_TRANSFER') {
			label.textContent = amount ? `Seña pagada · ${amount}` : 'Seña pagada';
		} else if (pay === 'PENDING') {
			label.textContent = amount ? `Seña pendiente · ${amount}` : 'Seña pendiente';
		} else if (pay === 'PAID_CASH' || pay === 'EXEMPT') {
			label.textContent = 'Pagado / exento';
		} else {
			label.textContent = 'No aplica';
		}
	}

	private hasPaidDepositForRefund(): boolean {
		const pay = String(this.editingPaymentStatus || '').toUpperCase();
		return (
			(pay === 'PAID' || pay === 'PAID_TRANSFER') &&
			this.editingDepositAmount != null &&
			this.editingDepositAmount > 0
		);
	}

	private async confirmBusinessCancelWithDeposit(): Promise<'refund' | 'reschedule'> {
		const amount = new Intl.NumberFormat('es-PY', {
			style: 'currency',
			currency: 'PYG',
			maximumFractionDigits: 0,
		}).format(this.editingDepositAmount || 0);

		const message =
			`Este cliente ya pagó una seña de ${amount}.\n\n` +
			`Si cancelás, le pediremos su alias SIPAP por WhatsApp para que le reintegres el 100%.\n\n` +
			`Si preferís que cambie la fecha, no cancelés: pedile que reprogramen desde su enlace de reserva (la seña se mantiene).`;

		const confirmed = window.BookmateAlert?.confirm
			? await window.BookmateAlert.confirm({
					type: 'warning',
					title: 'Seña pagada — ¿cancelar y reembolsar?',
					message,
					confirmText: 'Cancelar y reembolsar',
					cancelText: 'No cancelar (que reprogramen)',
				})
			: window.confirm(
					`${message}\n\nAceptar = cancelar y reembolsar. Cancelar = no cancelar la cita.`
				);

		return confirmed ? 'refund' : 'reschedule';
	}

	handleAttachmentAddClick = () => {
		if (this.isUploadingAttachment || !this.canEditSessionNotes()) return;
		this.clearAttachmentError();
		this.attachmentInput?.click();
	};

	handleDropzoneDragEnter = (event: DragEvent) => {
		event.preventDefault();
		if (!this.canEditSessionNotes() || this.isUploadingAttachment) return;
		this.dropzone?.classList.add('is-dragover');
	};

	handleDropzoneDragOver = (event: DragEvent) => {
		event.preventDefault();
		if (!this.canEditSessionNotes() || this.isUploadingAttachment) return;
		this.dropzone?.classList.add('is-dragover');
	};

	handleDropzoneDragLeave = (event: DragEvent) => {
		event.preventDefault();
		const related = event.relatedTarget as Node | null;
		if (related && this.dropzone?.contains(related)) return;
		this.dropzone?.classList.remove('is-dragover');
	};

	handleDropzoneDrop = (event: DragEvent) => {
		event.preventDefault();
		this.dropzone?.classList.remove('is-dragover');
		if (!this.canEditSessionNotes() || this.isUploadingAttachment) return;
		const files = event.dataTransfer?.files;
		if (!files?.length) return;
		void this.uploadAttachmentFiles(Array.from(files));
	};

	handleAttachmentInputChange = async () => {
		const input = this.attachmentInput;
		if (!input) return;
		const files = input.files ? Array.from(input.files) : [];
		input.value = '';
		if (!files.length) return;
		await this.uploadAttachmentFiles(files);
	};

	private isAllowedAttachmentFile(file: File) {
		const mime = String(file.type || '').toLowerCase();
		const name = String(file.name || '').toLowerCase();
		if (
			mime === 'image/jpeg' ||
			mime === 'image/png' ||
			mime === 'image/heic' ||
			mime === 'image/heif' ||
			mime === 'image/avif' ||
			mime === 'application/pdf'
		) {
			return true;
		}
		return /\.(jpe?g|png|pdf|heic|heif|avif)$/.test(name);
	}

	private async uploadAttachmentFiles(files: File[]) {
		if (!this.client || this.editingAppointmentId <= 0 || this.isUploadingAttachment) return;
		if (!this.canEditSessionNotes()) {
			this.showAttachmentError(
				this.isCancelledStatus()
					? 'Las notas y archivos no están disponibles en citas canceladas.'
					: 'Esta cita ya finalizó y no se puede modificar.'
			);
			return;
		}

		const maxBytes = 20 * 1024 * 1024;
		const maxFiles = AppointmentModal.MAX_ATTACHMENTS;
		const queue = files.filter(Boolean);
		if (!queue.length) return;

		const remaining = maxFiles - this.currentAttachments.length;
		if (remaining <= 0) {
			this.showAttachmentError('Ya alcanzaste el máximo de 10 archivos.');
			return;
		}
		if (queue.length > remaining) {
			this.showAttachmentError(
				remaining === 1
					? 'Solo podés subir 1 archivo más (máximo 10).'
					: `Solo podés subir ${remaining} archivos más (máximo 10).`
			);
			return;
		}

		for (const file of queue) {
			if (!this.isAllowedAttachmentFile(file)) {
				this.showAttachmentError(
					'Solo se permiten archivos JPG, PNG, PDF, HEIC o AVIF.'
				);
				return;
			}
			if (file.size > maxBytes) {
				this.showAttachmentError('El archivo supera el límite de 20 MB.');
				return;
			}
		}

		this.clearAttachmentError();
		this.setUploadingAttachment(true);
		try {
			for (const file of queue) {
				const base64 = await this.fileToBase64(file);
				const { attachment } = await this.client.uploadAttachment(this.editingAppointmentId, {
					file_base64: base64,
					filename: file.name,
					mime_type: file.type || 'application/octet-stream',
				});
				if (attachment) {
					this.currentAttachments = [...this.currentAttachments, attachment];
					this.renderAttachments();
				}
			}
		} catch (error) {
			this.showAttachmentError(
				error instanceof Error ? error.message : 'No fue posible subir el archivo adjunto.'
			);
		} finally {
			this.setUploadingAttachment(false);
		}
	}

	private async handleAttachmentDelete(attachmentId: number) {
		if (!this.client || this.editingAppointmentId <= 0 || this.isUploadingAttachment) return;
		if (!this.canEditSessionNotes()) return;

		const confirmMessage = '¿Eliminar este archivo adjunto? Esta acción no se puede deshacer.';
		const confirmed = window.BookmateAlert?.confirm
			? await window.BookmateAlert.confirm({
					type: 'error',
					title: 'Eliminar adjunto',
					message: confirmMessage,
					confirmText: 'Eliminar',
					cancelText: 'Cancelar',
				})
			: window.confirm(confirmMessage);
		if (!confirmed) return;

		this.clearAttachmentError();
		this.setUploadingAttachment(true);
		try {
			await this.client.deleteAttachment(this.editingAppointmentId, attachmentId);
			this.currentAttachments = this.currentAttachments.filter(
				(item) => item.id_attachment !== attachmentId
			);
			this.renderAttachments();
		} catch (error) {
			this.showAttachmentError(
				error instanceof Error ? error.message : 'No fue posible eliminar el archivo adjunto.'
			);
		} finally {
			this.setUploadingAttachment(false);
		}
	}

	private fileToBase64(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onerror = () => reject(new Error('No fue posible leer el archivo seleccionado.'));
			reader.onload = () => {
				const result = String(reader.result || '');
				const commaIndex = result.indexOf(',');
				resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
			};
			reader.readAsDataURL(file);
		});
	}

	openModalShell() {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return;

		const modal = requiredNodes.modal;
		modal.classList.remove('is-closing', 'is-settled');
		if (this.closeTimer) {
			window.clearTimeout(this.closeTimer);
			this.closeTimer = null;
		}

		if (this.#settleOpenHandler) {
			modal.removeEventListener('animationend', this.#settleOpenHandler);
			this.#settleOpenHandler = null;
		}
		this.#settleOpenHandler = (event: AnimationEvent) => {
			if (event.target !== modal) return;
			modal.classList.add('is-settled');
			if (this.#settleOpenHandler) {
				modal.removeEventListener('animationend', this.#settleOpenHandler);
				this.#settleOpenHandler = null;
			}
		};
		modal.addEventListener('animationend', this.#settleOpenHandler);

		if (!modal.open) modal.showModal();
	}

	closeModal = () => {
		this.fileViewer?.close();
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes || !requiredNodes.modal.open) return;

		requiredNodes.modal.classList.add('is-closing');
		requiredNodes.modal.classList.remove('is-settled');

		this.closeTimer = window.setTimeout(() => {
			if (!this.isConnected) return;
			requiredNodes.modal.close();
			requiredNodes.modal.classList.remove('is-closing', 'is-settled');
			this.closeTimer = null;
			this.clearFormErrors();
			this.setModalLoading(false);
			this.setModalFooterVisible(true);
			this.setSubmittingState(false);
			this.resetFormValues();
			this.mode = 'create';
			this.editingAppointmentId = 0;
			this.syncDeleteButtonVisibility();
		}, 140);
	};

	getSelectedProfessionalId() {
		if (this.roleId === ROLES.PROFESIONAL && this.currentProfessionalId > 0) return this.currentProfessionalId;
		return toPositiveInt(this.modalProfessional?.value, 0);
	}

	ensureModalProfessionalValue() {
		if (this.roleId === ROLES.PROFESIONAL && this.currentProfessionalId > 0 && this.modalProfessional) {
			setSearchableSelectValue(this.modalProfessional, this.currentProfessionalId);
		}
	}

	clearImmutableReadOnlyMode() {
		this.isImmutableReadOnly = false;
		this.immutableReadOnlyStatus = null;
		this.modalFooter?.classList.remove('appointment-modal-footer--readonly');
		this.modalStatusReadonlyWrap?.setAttribute('hidden', '');
		this.modalStatusReadonlyWrap?.classList.add('hidden');
		this.submitButton?.classList.remove('hidden');
		if (this.submitButton) this.submitButton.disabled = false;

		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return;

		for (const field of this.formFields ?? []) {
			field.disabled = false;
		}
		this.syncModalProfessionalDisabledState();
		if (this.roleId === ROLES.PROFESIONAL) {
			setSearchableSelectDisabled(this.modalProfessional, true);
		}
		requiredNodes.customerPhoneInput.readOnly = Number(requiredNodes.customerIdInput.value || 0) > 0;
		requiredNodes.openStartPickerButton.disabled = false;
		requiredNodes.openEndPickerButton.disabled = false;
		requiredNodes.clearCustomerButton.disabled = false;
	}

	private applyImmutableStatusBadge(status: 'CANCELADO' | 'COMPLETADO') {
		const isCancelled = status === 'CANCELADO';

		if (this.modalTitle) {
			this.modalTitle.textContent = isCancelled ? 'Cita cancelada' : 'Cita completada';
		}
		if (this.modalDescription) {
			this.modalDescription.textContent = isCancelled
				? 'Registro histórico: no se puede modificar esta reserva.'
				: 'Esta cita ya finalizó y no se puede modificar.';
		}

		if (this.modalStatusReadonlyIcon) {
			this.modalStatusReadonlyIcon.textContent = isCancelled ? 'cancel' : 'task_alt';
		}
		if (this.modalStatusReadonlyLabel) {
			this.modalStatusReadonlyLabel.textContent = isCancelled ? 'Cancelado' : 'Completado';
		}
		if (this.modalStatusReadonlyBadge) {
			this.modalStatusReadonlyBadge.className = [
				'flex w-full min-h-[3.25rem] items-center gap-2 rounded-xl border px-4 py-3 text-[0.95rem] font-bold',
				isCancelled
					? 'border-rose-200/80 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300'
					: 'border-blue-200/80 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/50 dark:text-blue-300',
			].join(' ');
		}
	}

	setImmutableReadOnlyMode(status: 'CANCELADO' | 'COMPLETADO') {
		this.isImmutableReadOnly = true;
		this.immutableReadOnlyStatus = status;
		this.applyImmutableStatusBadge(status);
		this.modalFooter?.classList.add('appointment-modal-footer--readonly');
		this.modalStatusWrap?.setAttribute('hidden', '');
		this.modalStatusWrap?.classList.add('hidden');
		this.modalStatusReadonlyWrap?.removeAttribute('hidden');
		this.modalStatusReadonlyWrap?.classList.remove('hidden');
		this.submitButton?.classList.add('hidden');
		if (this.submitButton) this.submitButton.disabled = true;
		this.syncDeleteButtonVisibility();

		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return;

		for (const field of this.formFields ?? []) {
			field.disabled = true;
		}
		this.syncModalProfessionalDisabledState();
		requiredNodes.customerPhoneInput.readOnly = true;
		requiredNodes.openStartPickerButton.disabled = true;
		requiredNodes.openEndPickerButton.disabled = true;
		requiredNodes.clearCustomerButton.disabled = true;
		this.hideAttendanceBlock();
		this.hideScheduleMisalignedBlock();
	}

	private syncDeleteButtonVisibility() {
		if (!this.deleteButton) return;

		const showDelete = this.mode === 'edit' && !this.isImmutableReadOnly;
		this.deleteButton.classList.toggle('hidden', !showDelete);
		this.deleteButton.disabled = !showDelete;
		this.modalFooter?.setAttribute('data-mode', this.mode);
	}

	setCreateMode() {
		this.clearImmutableReadOnlyMode();
		this.mode = 'create';
		this.editingAppointmentId = 0;
		this.editingPaymentStatus = null;
		this.editingDepositAmount = null;
		if (this.modalTitle) this.modalTitle.textContent = 'Crear cita';
		if (this.modalDescription) {
			this.modalDescription.textContent = 'Completa los datos para registrar una nueva reserva.';
		}
		if (this.submitIcon) this.submitIcon.textContent = 'check';
		this.syncSubmitLabel();
		this.syncDeleteButtonVisibility();
		if (this.statusInput) {
			setSearchableSelectValue(this.statusInput, 'CONFIRMADO');
			setSearchableSelectDisabled(this.statusInput, true);
		}
		if (this.paymentStatusInput) this.paymentStatusInput.value = 'NONE';
		this.syncPaymentStatusLabel('NONE', null);
		this.modalStatusWrap?.setAttribute('hidden', '');
		this.hideAttendanceBlock();
		this.hideScheduleMisalignedBlock();
	}

	setEditMode(appointmentId: number) {
		this.clearImmutableReadOnlyMode();
		this.mode = 'edit';
		this.editingAppointmentId = appointmentId;
		if (this.modalTitle) this.modalTitle.textContent = 'Editar cita';
		if (this.modalDescription) {
			this.modalDescription.textContent = 'Actualiza los datos de la reserva seleccionada.';
		}
		if (this.submitIcon) this.submitIcon.textContent = 'save';
		this.activeTab = 'details';
		this.syncSubmitLabel();
		this.syncDeleteButtonVisibility();
		if (this.statusInput) setSearchableSelectDisabled(this.statusInput, false);
		this.modalStatusWrap?.removeAttribute('hidden');
		this.modalStatusWrap?.classList.remove('hidden');
		this.hideAttendanceBlock();
		this.hideScheduleMisalignedBlock();
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
		setSearchableSelectValue(requiredNodes.modalProfessional, appointment.pro_id_professional || '');
		requiredNodes.modalLocation.value = String(appointment.loc_id_location || '');
		this.ensureModalProfessionalValue();
		this.refreshServicesForProfessional(this.getSelectedProfessionalId(), {
			preferredServiceId: toPositiveInt(appointment.ser_id_service, 0),
			includePreferredIfMissing: true,
		});
		setSearchableSelectValue(requiredNodes.statusInput, String(appointment.status || 'CONFIRMADO'));
		this.editingPaymentStatus = String(appointment.payment_status || 'NONE').trim().toUpperCase() || 'NONE';
		this.editingDepositAmount =
			appointment.deposit_amount != null && Number(appointment.deposit_amount) > 0
				? Number(appointment.deposit_amount)
				: null;
		if (requiredNodes.paymentStatusInput) {
			requiredNodes.paymentStatusInput.value = this.editingPaymentStatus;
		}
		this.syncPaymentStatusLabel(this.editingPaymentStatus, this.editingDepositAmount);
		requiredNodes.startInput.value = parseIsoToLocalInput(String(appointment.start_time || ''));
		requiredNodes.endInput.value = parseIsoToLocalInput(String(appointment.end_time || ''));
		this.syncDateBounds();
		this.syncDateDisplayInputs();
		this.ensureModalProfessionalValue();
		void this.loadCustomersForCurrentProfessional(true);
		this.showAttendanceBlock(appointment);
		this.showScheduleMisalignedBlock(appointment);

		const status = String(appointment.status || '').trim().toUpperCase();
		if (status === 'CANCELADO' || status === 'COMPLETADO') {
			this.setImmutableReadOnlyMode(status);
		}

		this.renderHistorySection(appointment);
	}

	fillFormFromAiDraft(draft: AppointmentAiDraft) {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return;

		const customerId = toPositiveInt(draft.id_customer, 0);
		const customerNameRaw = String(draft.customer_name || '').trim();
		const customerName = customerId > 0 ? customerNameRaw : formatPersonName(customerNameRaw);
		const customerPhone = String(draft.customer_phone || '').trim();

		requiredNodes.customerIdInput.value = customerId > 0 ? String(customerId) : '';
		requiredNodes.customerNameInput.value = customerName;
		requiredNodes.customerPhoneInput.value = customerPhone
			? this.formatParaguayPhoneLocal(customerPhone)
			: '';
		requiredNodes.customerPhoneInput.readOnly = customerId > 0;
		requiredNodes.clearCustomerButton.classList.toggle('hidden', customerId <= 0);
		this.selectedCustomer =
			customerId > 0
				? {
						id_customer: customerId,
						full_name: customerName,
						phone_number: customerPhone,
					}
				: null;

		if (toPositiveInt(draft.pro_id_professional, 0) > 0) {
			setSearchableSelectValue(requiredNodes.modalProfessional, draft.pro_id_professional);
		}
		if (toPositiveInt(draft.loc_id_location, 0) > 0) {
			requiredNodes.modalLocation.value = String(draft.loc_id_location);
		}

		this.ensureModalProfessionalValue();
		this.refreshServicesForProfessional(this.getSelectedProfessionalId(), {
			preferredServiceId: toPositiveInt(draft.ser_id_service, 0),
			includePreferredIfMissing: true,
		});

		const startLocal = draft.start_time ? parseIsoToLocalInput(String(draft.start_time)) : '';
		const endLocal = draft.end_time ? parseIsoToLocalInput(String(draft.end_time)) : '';

		if (startLocal) requiredNodes.startInput.value = startLocal;
		if (endLocal) requiredNodes.endInput.value = endLocal;

		if (!startLocal) {
			const initialStart = new Date();
			const initialEnd = new Date(initialStart.getTime() + 60 * 60 * 1000);
			requiredNodes.startInput.value = formatDateTimeLocal(initialStart);
			requiredNodes.endInput.value = formatDateTimeLocal(initialEnd);
		} else if (!endLocal) {
			const startDate = parseLocalDateTime(startLocal);
			if (startDate) {
				requiredNodes.endInput.value = formatDateTimeLocal(
					new Date(startDate.getTime() + 60 * 60 * 1000)
				);
			}
		}

		this.syncDateBounds();
		this.syncDateDisplayInputs();
		void this.loadCustomersForCurrentProfessional(true);

		this.form?.querySelectorAll('[data-ai-draft-highlight]').forEach((node) => {
			node.removeAttribute('data-ai-draft-highlight');
		});
		this.form
			?.querySelectorAll('input:not([type="hidden"]), select, textarea')
			.forEach((node) => {
				if (!(node instanceof HTMLElement)) return;
				node.setAttribute('data-ai-draft-highlight', 'true');
				window.setTimeout(() => node.removeAttribute('data-ai-draft-highlight'), 2400);
			});
	}

	openCreateWithAiDraft(draft: AppointmentAiDraft, _context: OpenCreateContext = {}) {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return;

		this.clearFormErrors();
		this.setCreateMode();
		this.resetFormValues();
		this.openModalShell();
		requestAnimationFrame(() => {
			if (!this.isConnected) return;
			this.fillFormFromAiDraft(draft);
		});
	}

	buildPayloadFromForm(): BuildPayloadResult {
		if (this.isImmutableReadOnly) {
			return {
				error:
					this.immutableReadOnlyStatus === 'COMPLETADO'
						? 'Las citas completadas no se pueden modificar.'
						: 'Las citas canceladas no se pueden modificar.',
			};
		}
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

		const includeSessionNotes =
			this.historyEnabled &&
			!!this.notesEditWrap &&
			!this.notesEditWrap.hasAttribute('hidden') &&
			this.getSessionNoteInputs().length > 0;
		const sessionNotes = includeSessionNotes
			? buildSessionNotesPayload(this.readSessionNotesFromInputs())
			: undefined;

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
				payment_status: 'NONE',
				...(sessionNotes !== undefined ? { session_notes: sessionNotes } : {}),
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
		void this.loadCustomersForCurrentProfessional(true);
	};

	handleProfessionalChange = () => {
		this.refreshServicesForProfessional(this.getSelectedProfessionalId());

		if (this.roleId === ROLES.PROFESIONAL) {
			if (this.selectedCustomer) this.clearSelectedCustomer({ clearFields: true });
			this.customers = [];
			this.lastLoadedCustomerProfessionalId = null;
			void this.loadCustomersForCurrentProfessional(true);
			return;
		}

		if (this.roleId === ROLES.RECEPCIONISTA) {
			void this.loadCustomersForCurrentProfessional(true);
		}
	};

	private getServiceIdsForProfessional(professionalId: number): number[] | null {
		if (professionalId <= 0) return null;
		const professional = this.professionals.find((item) => item.id === professionalId);
		if (!professional) return null;
		return Array.isArray(professional.services) ? professional.services : [];
	}

	private refreshServicesForProfessional(
		professionalId: number,
		options: { preferredServiceId?: number; includePreferredIfMissing?: boolean } = {}
	) {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return;

		const preferredServiceId = toPositiveInt(options.preferredServiceId, 0);
		const assignedIds = this.getServiceIdsForProfessional(professionalId);
		let filtered =
			assignedIds === null
				? [...this.services]
				: this.services.filter((service) => assignedIds.includes(service.id));

		if (
			options.includePreferredIfMissing &&
			preferredServiceId > 0 &&
			!filtered.some((service) => service.id === preferredServiceId)
		) {
			const preferred = this.services.find((service) => service.id === preferredServiceId);
			if (preferred) filtered = [preferred, ...filtered];
		}

		const emptyLabel =
			professionalId > 0 && assignedIds !== null && assignedIds.length === 0
				? 'Sin servicios asignados'
				: 'Selecciona un servicio';

		this.renderOptions(requiredNodes.modalService, filtered, emptyLabel);

		const nextServiceId =
			preferredServiceId > 0 && filtered.some((service) => service.id === preferredServiceId)
				? preferredServiceId
				: filtered[0]?.id || 0;
		requiredNodes.modalService.value = nextServiceId > 0 ? String(nextServiceId) : '';

		const hint = requiredNodes.modalServiceHint;
		if (hint) {
			const showEmptyHint = professionalId > 0 && assignedIds !== null && assignedIds.length === 0;
			hint.textContent = showEmptyHint
				? 'Este profesional no tiene servicios asignados. Asignalos desde Personal.'
				: '';
			hint.classList.toggle('hidden', !showEmptyHint);
		}
	}

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
			const isPast = date.getTime() < today.getTime();

			const button = document.createElement('button');
			button.type = 'button';
			button.textContent = String(date.getDate());
			button.className = [
				'dtp-day',
				!inCurrentMonth ? 'dtp-day--out' : '',
				isToday ? 'dtp-day--today' : '',
				isSelected ? 'dtp-day--selected' : '',
				isPast ? 'dtp-day--disabled' : '',
			]
				.filter(Boolean)
				.join(' ');

			if (isPast) {
				button.disabled = true;
				button.setAttribute('aria-disabled', 'true');
			} else {
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
			}

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
		const target = event.target;
		if (target instanceof Element && target.closest('[data-dismiss-form-error]')) {
			event.preventDefault();
			this.clearFormErrors();
			return;
		}
		if (event.target === this.modal) {
			this.closeModal();
		}
	};

	handleSubmit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (!this.client || this.isSubmitting || this.isLoading || this.isImmutableReadOnly) return;

		this.clearFormErrors();
		const result = this.buildPayloadFromForm();
		if ('error' in result) {
			this.showFormError(result.error);
			return;
		}

		const payload = result.payload;

		if (this.mode === 'edit' && this.activeTab === 'notes' && this.historyEnabled) {
			const currentStatus = this.getCurrentAppointmentStatus();
			if (
				this.hasSessionTabContent() &&
				currentStatus !== 'COMPLETADO' &&
				currentStatus !== 'CANCELADO'
			) {
				const confirmed = await this.confirmCompleteOnSessionSave();
				if (!confirmed) return;
				payload.status = 'COMPLETADO';
				if (this.statusInput) setSearchableSelectValue(this.statusInput, 'COMPLETADO');
			}
		}

		// Fase C2: cancelar con seña pagada → confirmar reembolso vs pedir reprogramar.
		if (
			this.mode === 'edit' &&
			payload.status === 'CANCELADO' &&
			this.hasPaidDepositForRefund()
		) {
			const decision = await this.confirmBusinessCancelWithDeposit();
			if (decision === 'reschedule') {
				if (this.statusInput) setSearchableSelectValue(this.statusInput, 'CONFIRMADO');
				this.handleStatusChange();
				if (window.BookmateAlert?.alert) {
					await window.BookmateAlert.alert({
						type: 'info',
						title: 'Cita sin cancelar',
						message:
							'Pedile al cliente que reprogramen desde el enlace de su reserva. Así mantiene la seña sin reembolso.',
					});
				} else {
					window.alert(
						'Pedile al cliente que reprogramen desde el enlace de su reserva. Así mantiene la seña sin reembolso.'
					);
				}
				return;
			}
		} else if (payload.status !== 'CANCELADO') {
			if (this.activeTab === 'notes') {
				payload.notify_customer = false;
			} else {
				const notifyDecision = await this.confirmNotifyCustomerOnSave();
				if (!notifyDecision) return;
				payload.notify_customer = notifyDecision.notifyCustomer;
			}
		}

		this.setSubmittingState(true, this.mode === 'edit' ? 'Guardando...' : 'Creando...');

		try {
			const response = await this.persistAppointment(payload);
			if (!response) return;

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
		} finally {
			this.setSubmittingState(false);
		}
	};

	private getSelectedLocationName() {
		const locationId = toPositiveInt(this.modalLocation?.value, 0);
		if (locationId <= 0) return '';
		return this.locations.find((item) => item.id === locationId)?.name || '';
	}

	private async confirmCompleteOnSessionSave(): Promise<boolean> {
		const message =
			'Al guardar la ficha, esta sesión se marcará como Completada en el sistema.';

		if (window.BookmateAlert?.confirm) {
			return window.BookmateAlert.confirm({
				type: 'info',
				title: 'Marcar sesión como completada',
				message,
				confirmText: 'Guardar ficha',
				cancelText: 'Volver',
			});
		}

		return window.confirm(`${message}\n\n¿Continuar?`);
	}

	private async confirmNotifyCustomerOnSave(): Promise<
		{ notifyCustomer: boolean } | null
	> {
		const isEdit = this.mode === 'edit';
		const title = isEdit ? 'Guardar cambios' : 'Crear cita';
		const lead = isEdit
			? '¿Confirmás guardar los cambios de esta cita?'
			: '¿Confirmás crear esta cita?';
		const confirmText = isEdit ? 'Guardar' : 'Crear cita';
		const messageHtml = `
			<p class="app-alert-notify-lead">${lead}</p>
			<label class="app-alert-notify-row">
				<span class="app-alert-notify-copy">
					<span class="app-alert-notify-title">Notificar al cliente por WhatsApp</span>
					<span class="app-alert-notify-hint">Desactivalo si estás regularizando o corrigiendo un error.</span>
				</span>
				<span class="app-alert-notify-switch">
					<input
						type="checkbox"
						class="app-alert-notify-switch__input sr-only"
						data-app-alert-notify-customer
						checked
					/>
					<span class="app-alert-notify-switch__track" aria-hidden="true"></span>
				</span>
			</label>
		`;

		if (window.BookmateAlert?.confirm) {
			const confirmed = await window.BookmateAlert.confirm({
				type: 'info',
				title,
				messageHtml,
				confirmText,
				cancelText: 'Volver',
				icon: 'notifications',
			});
			if (!confirmed) return null;
			const toggle = document.querySelector<HTMLInputElement>(
				'[data-app-alert-dialog] [data-app-alert-notify-customer]'
			);
			return { notifyCustomer: toggle?.checked ?? true };
		}

		const notifyCustomer = window.confirm(
			`${lead}\n\nNotificar al cliente por WhatsApp?\nAceptar = sí, Cancelar = no notificar y no guardar.`
		);
		// Native confirm cannot separate "cancel save" vs "save without notify".
		// Keep save + notify when accepted; abort when cancelled.
		return notifyCustomer ? { notifyCustomer: true } : null;
	}

	private async confirmScheduleMisalignment(error: unknown): Promise<boolean> {
		const reason = normalizeScheduleMisalignedReason(
			(error as { scheduleMisalignedReason?: unknown })?.scheduleMisalignedReason
		);
		const title = getScheduleMisalignedConfirmTitle(reason);
		const message = getScheduleMisalignedConfirmMessage(reason, {
			locationName: this.getSelectedLocationName(),
		});

		if (window.BookmateAlert?.confirm) {
			return window.BookmateAlert.confirm({
				type: 'warning',
				title,
				message,
				confirmText: SCHEDULE_MISALIGNED_CONFIRM_ACTION,
				cancelText: 'Cancelar',
			});
		}

		return window.confirm(`${title}\n\n${message}`);
	}

	private async persistAppointment(payload: AppointmentFormPayload) {
		const run = async (body: AppointmentFormPayload) => {
			if (this.mode === 'edit' && this.editingAppointmentId > 0) {
				return this.client!.updateAppointment(this.editingAppointmentId, body);
			}
			return this.client!.createAppointment({
				id_customer: body.id_customer,
				loc_id_location: body.loc_id_location,
				pro_id_professional: body.pro_id_professional,
				ser_id_service: body.ser_id_service,
				customer_name: body.customer_name,
				customer_phone: body.customer_phone,
				start_time: body.start_time,
				end_time: body.end_time,
				payment_status: (body as { payment_status?: string }).payment_status as
					| 'NONE'
					| 'PENDING'
					| 'PAID'
					| 'PAID_TRANSFER'
					| 'PAID_CASH'
					| 'EXEMPT'
					| undefined,
				acknowledge_schedule_misalignment: body.acknowledge_schedule_misalignment,
				notify_customer: body.notify_customer,
			});
		};

		try {
			return await run(payload);
		} catch (error) {
			if (!isScheduleMisalignedConflictError(error)) throw error;
			const confirmed = await this.confirmScheduleMisalignment(error);
			if (!confirmed) return null;
			return run({ ...payload, acknowledge_schedule_misalignment: true });
		}
	}

	handleDelete = async () => {
		if (!this.client || this.mode !== 'edit' || !this.editingAppointmentId) return;
		if (this.isSubmitting || this.isLoading || this.isImmutableReadOnly) return;

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
