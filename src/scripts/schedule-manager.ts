import { showFlashMessage } from '../lib/flash';
import { showScheduleExceptionModalTour } from '../lib/schedule-exception-modal-tour';
import {
	maybeShowScheduleExceptionsTour,
	showScheduleExceptionsTour,
} from '../lib/schedule-exceptions-tour';
import { ROLES } from '../config/roles';
import type { ScheduleExceptionType } from '../lib/schedules';
import {
	buildExceptionSummaryMap,
	EXCEPTION_NOTE_HELP_TEXT,
	formatDateKey,
	formatMonthLabel,
	getIsoDayOfWeek,
	getMonthRangeKeys,
	isPastDateKey,
	parseDateKey,
	resolveCalendarDayTone,
	type ExceptionSlotDraft,
	type ExceptionSummaryMap,
} from './schedule-exception-ui';
import {
	destroySearchableSelect,
	ensureSearchableSelect,
	setSearchableSelectDisabled,
	setSearchableSelectValue,
} from './searchable-select';

type ProfessionalLov = { id_professional: number; display_name: string };
type LocationLov = { id_location: number; name: string };
type Day = { day_of_week: number; name: string };
type ScheduleItem = {
	id_professional_schedule?: number;
	loc_id_location: number;
	day_of_week: number;
	start_time: string;
	end_time: string;
};
type SlotDraft = {
	uid: string;
	loc_id_location: string;
	start_time: string;
	end_time: string;
	id_professional_schedule?: number;
};
type DayState = {
	day_of_week: number;
	name: string;
	enabled: boolean;
	slots: SlotDraft[];
};
type DayNodeRefs = {
	summaryNode: HTMLElement;
	toggleInput: HTMLInputElement;
	slotSection: HTMLElement;
	slotsContainer: HTMLElement;
	addButton: HTMLButtonElement | null;
};

interface ApiErrorDetail {
	message?: string;
}

interface ApiResponse<T = unknown> {
	status?: string;
	message?: string;
	data?: T;
	errors?: ApiErrorDetail[];
}

class ScheduleManager extends HTMLElement {
	#bound = false;
	#listenerController: AbortController | null = null;

	private canEdit = false;
	private professionalSelect: HTMLSelectElement | null = null;
	private plannerNode: HTMLElement | null = null;
	private saveButton: HTMLButtonElement | null = null;
	private saveLabel: HTMLElement | null = null;
	private hintNode: HTMLElement | null = null;
	private errorNode: HTMLElement | null = null;
	private loadingNode: HTMLElement | null = null;

	private professionals: ProfessionalLov[] = [];
	private locations: LocationLov[] = [];
	private days: Day[] = [];
	private dayStates: DayState[] = [];
	private dayNodes = new Map<number, DayNodeRefs>();

	private roleId = 0;
	private currentProfessionalId = 0;
	private selectedProfessionalId = 0;
	private slotCounter = 0;
	private isMetaLoading = false;
	private isScheduleLoading = false;
	private isSaving = false;
	private isDirty = false;

	private activeView: 'template' | 'exceptions' = 'template';
	private exceptionCalendarCursor = new Date();
	private exceptionSummaryMap: ExceptionSummaryMap = new Map();
	private isExceptionsLoading = false;
	private exceptionModalDateKey = '';
	private exceptionModalReadOnly = false;
	private exceptionModalType: ScheduleExceptionType | 'INHERIT' = 'INHERIT';
	private exceptionModalNote = '';
	private exceptionModalSlots: ExceptionSlotDraft[] = [];
	private exceptionModalDirty = false;
	private exceptionModalLoading = false;
	private exceptionModalLoadSeq = 0;

	private templateViewNode: HTMLElement | null = null;
	private exceptionsViewNode: HTMLElement | null = null;
	private tabButtons: NodeListOf<HTMLButtonElement> | null = null;
	private exceptionCalMonthNode: HTMLElement | null = null;
	private exceptionCalGridNode: HTMLElement | null = null;
	private exceptionCalPrevButton: HTMLButtonElement | null = null;
	private exceptionCalNextButton: HTMLButtonElement | null = null;
	private exceptionModalNode: HTMLElement | null = null;
	private exceptionModalTitleNode: HTMLElement | null = null;
	private exceptionModalSubtitleNode: HTMLElement | null = null;
	private exceptionModalBodyNode: HTMLElement | null = null;
	private exceptionModalActionsNode: HTMLElement | null = null;
	private exceptionModalCloseButton: HTMLButtonElement | null = null;
	private exceptionModalErrorNode: HTMLElement | null = null;
	private exceptionModalErrorMessageNode: HTMLElement | null = null;
	private exceptionModalErrorFeedbackNode: HTMLElement | null = null;
	private exceptionsHelpButton: HTMLButtonElement | null = null;
	private exceptionModalTourHelpButton: HTMLButtonElement | null = null;

	connectedCallback() {
		if (this.#bound) return;
		this.#bound = true;
		this.canEdit = this.dataset.canEdit === 'true';

		this.professionalSelect = this.querySelector<HTMLSelectElement>('[data-professional-select]');
		this.plannerNode = this.querySelector<HTMLElement>('[data-weekly-planner]');
		this.saveButton = this.querySelector<HTMLButtonElement>('[data-save-schedule]');
		this.saveLabel = this.querySelector<HTMLElement>('[data-save-schedule-label]');
		this.hintNode = this.querySelector<HTMLElement>('[data-professional-hint]');
		this.errorNode = this.querySelector<HTMLElement>('[data-schedule-error]');
		this.loadingNode = this.querySelector<HTMLElement>('[data-schedule-loading]');
		this.templateViewNode = this.querySelector<HTMLElement>('[data-schedule-view-template]');
		this.exceptionsViewNode = this.querySelector<HTMLElement>('[data-schedule-view-exceptions]');
		this.tabButtons = this.querySelectorAll<HTMLButtonElement>('[data-schedule-tab]');
		this.exceptionCalMonthNode = this.querySelector<HTMLElement>('[data-exception-cal-month]');
		this.exceptionCalGridNode = this.querySelector<HTMLElement>('[data-exception-cal-grid]');
		this.exceptionCalPrevButton = this.querySelector<HTMLButtonElement>('[data-exception-cal-prev]');
		this.exceptionCalNextButton = this.querySelector<HTMLButtonElement>('[data-exception-cal-next]');
		this.exceptionModalNode = this.querySelector<HTMLElement>('[data-exception-modal]');
		this.exceptionModalTitleNode = this.querySelector<HTMLElement>('[data-exception-modal-title]');
		this.exceptionModalSubtitleNode = this.querySelector<HTMLElement>('[data-exception-modal-subtitle]');
		this.exceptionModalBodyNode = this.querySelector<HTMLElement>('[data-exception-modal-body]');
		this.exceptionModalActionsNode = this.querySelector<HTMLElement>('[data-exception-modal-actions]');
		this.exceptionModalCloseButton = this.querySelector<HTMLButtonElement>('[data-exception-modal-close]');
		this.exceptionModalErrorNode = this.querySelector<HTMLElement>('[data-exception-modal-error]');
		this.exceptionModalErrorMessageNode = this.querySelector<HTMLElement>(
			'[data-exception-modal-error-message]'
		);
		this.exceptionModalErrorFeedbackNode = this.querySelector<HTMLElement>(
			'[data-exception-modal-feedback]'
		);
		this.exceptionsHelpButton = this.querySelector<HTMLButtonElement>(
			'[data-schedule-exceptions-help]'
		);
		this.exceptionModalTourHelpButton = this.querySelector<HTMLButtonElement>(
			'[data-exception-modal-tour-help]'
		);

		if (!this.professionalSelect || !this.plannerNode) {
			this.#bound = false;
			return;
		}

		this.#listenerController = new AbortController();
		const signal = this.#listenerController.signal;

		this.professionalSelect.addEventListener('change', this.handleProfessionalChange, { signal });
		this.plannerNode.addEventListener('change', this.handlePlannerChange, { signal });
		this.plannerNode.addEventListener('click', this.handlePlannerClick, { signal });
		if (this.saveButton && this.canEdit) {
			this.saveButton.addEventListener('click', this.handleSaveClick, { signal });
		}

		for (const tabButton of this.tabButtons ?? []) {
			tabButton.addEventListener('click', this.handleTabClick, { signal });
		}
		this.exceptionsHelpButton?.addEventListener(
			'click',
			() => showScheduleExceptionsTour({ force: true }),
			{ signal }
		);
		this.exceptionModalTourHelpButton?.addEventListener(
			'click',
			() => showScheduleExceptionModalTour(),
			{ signal }
		);
		this.exceptionCalPrevButton?.addEventListener('click', this.handleExceptionMonthPrev, { signal });
		this.exceptionCalNextButton?.addEventListener('click', this.handleExceptionMonthNext, { signal });
		this.exceptionCalGridNode?.addEventListener('click', this.handleExceptionCalendarClick, { signal });
		this.exceptionModalCloseButton?.addEventListener('click', this.closeExceptionModal, { signal });
		this.exceptionModalNode?.addEventListener('click', this.handleExceptionModalClickRoot, { signal });
		this.exceptionModalBodyNode?.addEventListener('change', this.handleExceptionModalChange, { signal });
		this.exceptionModalBodyNode?.addEventListener('click', this.handleExceptionModalClick, { signal });
		this.exceptionModalActionsNode?.addEventListener('click', this.handleExceptionModalActions, { signal });

		this.updateControlsState();
		this.renderPlanner();
		void this.loadMeta();
	}

	disconnectedCallback() {
		this.#bound = false;
		this.#listenerController?.abort();
		this.#listenerController = null;
		destroySearchableSelect(this.professionalSelect);
		this.dayNodes.clear();
	}

	private handleSaveClick = (): void => {
		void this.saveSchedule();
	};

	private handleTabClick = (event: Event): void => {
		const target = event.currentTarget;
		if (!(target instanceof HTMLButtonElement)) return;
		const nextView = target.dataset.scheduleTab === 'exceptions' ? 'exceptions' : 'template';
		void this.switchView(nextView);
	};

	private handleExceptionMonthPrev = (): void => {
		const cursor = this.exceptionCalendarCursor;
		this.exceptionCalendarCursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
		void this.loadExceptionsForVisibleMonth().then(() => this.renderExceptionCalendar());
	};

	private handleExceptionMonthNext = (): void => {
		const cursor = this.exceptionCalendarCursor;
		this.exceptionCalendarCursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
		void this.loadExceptionsForVisibleMonth().then(() => this.renderExceptionCalendar());
	};

	private handleExceptionCalendarClick = (event: MouseEvent): void => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;
		const dayButton = target.closest<HTMLButtonElement>('[data-exception-date]');
		if (!dayButton || dayButton.disabled) return;
		const dateKey = String(dayButton.dataset.exceptionDate || '');
		if (!dateKey) return;
		void this.openExceptionModal(dateKey);
	};

	private handleExceptionModalClickRoot = (event: MouseEvent): void => {
		const target = event.target;
		if (!(target instanceof Element)) return;

		if (target.closest('[data-dismiss-exception-modal-error]')) {
			this.clearExceptionModalError();
			return;
		}

		if (event.target === this.exceptionModalNode) {
			this.closeExceptionModal();
		}
	};

	private handleExceptionModalChange = (event: Event): void => {
		if (this.exceptionModalLoading || this.exceptionModalReadOnly) return;
		this.clearExceptionModalError();
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;

		if (target instanceof HTMLSelectElement && target.matches('[data-exc-slot-location]')) {
			const uid = String(target.dataset.slotUid || '');
			const slot = this.exceptionModalSlots.find((item) => item.uid === uid);
			if (!slot) return;
			slot.loc_id_location = String(target.value || '');
			this.exceptionModalDirty = true;
			return;
		}

		if (target instanceof HTMLInputElement && target.matches('[data-exc-slot-start], [data-exc-slot-end]')) {
			const uid = String(target.dataset.slotUid || '');
			const slot = this.exceptionModalSlots.find((item) => item.uid === uid);
			if (!slot) return;
			if (target.matches('[data-exc-slot-start]')) {
				slot.start_time = this.normalizeTime(target.value);
			} else {
				slot.end_time = this.normalizeTime(target.value);
			}
			this.exceptionModalDirty = true;
			return;
		}

		if (target instanceof HTMLInputElement && target.matches('[data-exc-note]')) {
			this.exceptionModalNote = String(target.value || '');
			this.exceptionModalDirty = true;
			return;
		}

		if (target instanceof HTMLInputElement && target.type === 'radio' && target.matches('[data-exc-type]')) {
			this.exceptionModalType = (target.value as ScheduleExceptionType | 'INHERIT') || 'INHERIT';
			this.exceptionModalDirty = true;
			this.renderExceptionModalBody();
		}
	};

	private handleExceptionModalClick = (event: MouseEvent): void => {
		if (this.exceptionModalLoading || this.exceptionModalReadOnly) return;
		this.clearExceptionModalError();
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;

		const addButton = target.closest<HTMLButtonElement>('[data-exc-slot-add]');
		if (addButton) {
			this.exceptionModalSlots.push(this.createDefaultExceptionSlot());
			this.exceptionModalDirty = true;
			this.renderExceptionModalBody();
			return;
		}

		const removeButton = target.closest<HTMLButtonElement>('[data-exc-slot-remove]');
		if (removeButton) {
			const uid = String(removeButton.dataset.slotUid || '');
			this.exceptionModalSlots = this.exceptionModalSlots.filter((slot) => slot.uid !== uid);
			this.exceptionModalDirty = true;
			this.renderExceptionModalBody();
		}
	};

	private handleExceptionModalActions = (event: MouseEvent): void => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;

		if (target.closest('[data-exc-action="close"]')) {
			this.closeExceptionModal();
			return;
		}
		if (this.exceptionModalLoading) return;
		if (target.closest('[data-exc-action="delete"]')) {
			void this.deleteExceptionFromModal();
			return;
		}
		if (target.closest('[data-exc-action="save"]')) {
			void this.saveExceptionFromModal();
		}
	};

	private handleProfessionalChange = async (): Promise<void> => {
		if (!this.professionalSelect || this.roleId === ROLES.PROFESIONAL) return;

		const nextProfessionalId = Number(this.professionalSelect.value || 0);
		if (!Number.isInteger(nextProfessionalId) || nextProfessionalId <= 0) {
			setSearchableSelectValue(
				this.professionalSelect,
				this.selectedProfessionalId > 0 ? this.selectedProfessionalId : ''
			);
			return;
		}
		if (nextProfessionalId === this.selectedProfessionalId) return;

		if (this.isDirty) {
			const canContinue = await this.confirmDiscardChanges();
			if (!canContinue) {
				setSearchableSelectValue(
					this.professionalSelect,
					this.selectedProfessionalId > 0 ? this.selectedProfessionalId : ''
				);
				return;
			}
		}

		this.selectedProfessionalId = nextProfessionalId;
		this.dayStates = this.buildEmptyDayStates();
		this.exceptionSummaryMap = new Map();
		this.renderPlanner();
		this.setDirty(false);
		await this.loadScheduleByProfessional(this.selectedProfessionalId);
		if (this.activeView === 'exceptions') {
			await this.loadExceptionsForVisibleMonth();
			this.renderExceptionCalendar();
		}
	};

	private handlePlannerChange = (event: Event): void => {
		if (!this.canEdit) return;
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;

		if (target instanceof HTMLInputElement && target.matches('[data-day-toggle]')) {
			const dayOfWeek = Number(target.dataset.dayOfWeek || '0');
			const dayState = this.findDayState(dayOfWeek);
			if (!dayState) return;

			dayState.enabled = target.checked;
			if (dayState.enabled && dayState.slots.length === 0) {
				dayState.slots.push(this.createDefaultSlot());
			}
			if (!dayState.enabled) {
				dayState.slots = [];
			}
			this.setDirty(true);
			this.renderDayState(dayOfWeek);
			this.updatePlannerInteractivity();
			return;
		}

		if (target instanceof HTMLSelectElement && target.matches('[data-slot-location]')) {
			const dayOfWeek = Number(target.dataset.dayOfWeek || '0');
			const slotUid = String(target.dataset.slotUid || '');
			const slot = this.findSlot(dayOfWeek, slotUid);
			if (!slot) return;
			slot.loc_id_location = String(target.value || '');
			this.setDirty(true);
			return;
		}

		if (target instanceof HTMLInputElement && target.matches('[data-slot-start]')) {
			const dayOfWeek = Number(target.dataset.dayOfWeek || '0');
			const slotUid = String(target.dataset.slotUid || '');
			const slot = this.findSlot(dayOfWeek, slotUid);
			if (!slot) return;
			slot.start_time = this.normalizeTime(target.value);
			this.setDirty(true);
			return;
		}

		if (target instanceof HTMLInputElement && target.matches('[data-slot-end]')) {
			const dayOfWeek = Number(target.dataset.dayOfWeek || '0');
			const slotUid = String(target.dataset.slotUid || '');
			const slot = this.findSlot(dayOfWeek, slotUid);
			if (!slot) return;
			slot.end_time = this.normalizeTime(target.value);
			this.setDirty(true);
		}
	};

	private handlePlannerClick = (event: MouseEvent): void => {
		if (!this.canEdit) return;
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;

		const addButton = target.closest<HTMLButtonElement>('[data-slot-add]');
		if (addButton) {
			const dayOfWeek = Number(addButton.dataset.dayOfWeek || '0');
			const dayState = this.findDayState(dayOfWeek);
			if (!dayState) return;
			dayState.enabled = true;
			dayState.slots.push(this.createDefaultSlot());
			this.setDirty(true);
			this.renderDayState(dayOfWeek);
			this.updatePlannerInteractivity();
			return;
		}

		const removeButton = target.closest<HTMLButtonElement>('[data-slot-remove]');
		if (removeButton) {
			const dayOfWeek = Number(removeButton.dataset.dayOfWeek || '0');
			const slotUid = String(removeButton.dataset.slotUid || '');
			const dayState = this.findDayState(dayOfWeek);
			if (!dayState) return;
			dayState.slots = dayState.slots.filter((slot) => slot.uid !== slotUid);
			if (dayState.slots.length === 0) {
				dayState.enabled = false;
			}
			this.setDirty(true);
			this.renderDayState(dayOfWeek);
			this.updatePlannerInteractivity();
		}
	};

	private toBackendErrorMessage(data: ApiResponse, fallbackMessage: string): string {
		const mainMessage = typeof data?.message === 'string' ? data.message.trim() : '';
		if (mainMessage) return mainMessage;

		if (Array.isArray(data?.errors)) {
			const detailMessages = data.errors
				.filter((item): item is ApiErrorDetail => item !== null && typeof item === 'object')
				.map((item) => item.message?.trim() ?? '')
				.filter((message) => message.length > 0);
			if (detailMessages.length > 0) {
				return detailMessages.join(' | ');
			}
		}

		return fallbackMessage;
	}

	private clearNode(node: Element): void {
		while (node.firstChild) {
			node.removeChild(node.firstChild);
		}
	}

	private createOption(value: string, label: string): HTMLOptionElement {
		const option = document.createElement('option');
		option.value = value;
		option.textContent = label;
		return option;
	}

	private renderProfessionalOptions(): void {
		if (!this.professionalSelect) return;

		destroySearchableSelect(this.professionalSelect);
		this.clearNode(this.professionalSelect);

		if (this.roleId !== ROLES.PROFESIONAL) {
			this.professionalSelect.appendChild(this.createOption('', 'Selecciona un profesional'));
		}

		for (const professional of this.professionals) {
			this.professionalSelect.appendChild(
				this.createOption(String(professional.id_professional), professional.display_name)
			);
		}

		if (this.selectedProfessionalId > 0) {
			this.professionalSelect.value = String(this.selectedProfessionalId);
		}

		if (this.roleId === ROLES.PROFESIONAL) {
			return;
		}

		ensureSearchableSelect(this.professionalSelect, {
			placeholder: 'Buscar profesional...',
		});

		if (this.selectedProfessionalId > 0) {
			setSearchableSelectValue(this.professionalSelect, this.selectedProfessionalId);
		}

		setSearchableSelectDisabled(
			this.professionalSelect,
			this.isMetaLoading ||
				this.isScheduleLoading ||
				this.isSaving ||
				!this.canEdit ||
				this.professionals.length === 0
		);
	}

	private renderPlannerMessage(message: string, tone: 'info' | 'error'): void {
		if (!this.plannerNode) return;
		this.dayNodes.clear();
		this.clearNode(this.plannerNode);

		const messageNode = document.createElement('div');
		messageNode.className =
			tone === 'error'
				? 'rounded-[1rem] border border-rose-200 bg-rose-50 px-3.5 py-4 text-sm text-rose-700'
				: 'rounded-[1rem] border border-[color:var(--shell-border)] bg-[color:var(--card-surface)] px-3.5 py-4 text-sm text-[color:var(--on-surface-variant)]';
		messageNode.textContent = message;
		this.plannerNode.appendChild(messageNode);
	}

	private renderPlanner(): void {
		if (!this.plannerNode) return;

		if (this.selectedProfessionalId <= 0) {
			this.renderPlannerMessage('Selecciona un profesional para configurar sus horarios.', 'info');
			return;
		}

		if (this.days.length === 0) {
			this.renderPlannerMessage('No hay dias disponibles para construir la agenda semanal.', 'error');
			return;
		}

		this.renderAllDays();
		this.updatePlannerInteractivity();
	}

	private renderAllDays(): void {
		if (!this.plannerNode) return;
		this.dayNodes.clear();
		this.clearNode(this.plannerNode);

		const fragment = document.createDocumentFragment();

		for (const dayState of this.dayStates) {
			const article = document.createElement('article');
			article.className =
				'schedule-day-card px-3.5 py-3.5 sm:px-4 sm:py-4';
			article.dataset.dayCard = String(dayState.day_of_week);

			const topRow = document.createElement('div');
			topRow.className = 'flex items-start justify-between gap-3';

			const titleWrap = document.createElement('div');
			const title = document.createElement('h3');
			title.className = 'text-[1.08rem] font-extrabold leading-tight text-[color:var(--on-surface)]';
			title.textContent = dayState.name;

			const summary = document.createElement('p');
			summary.className = 'mt-0.5 text-xs font-medium text-[color:var(--on-surface-variant)]';
			titleWrap.append(title, summary);

			const toggleLabel = document.createElement('label');
			toggleLabel.className =
				'inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--on-surface-variant)]';
			const toggleInput = document.createElement('input');
			toggleInput.type = 'checkbox';
			toggleInput.dataset.dayToggle = 'true';
			toggleInput.dataset.dayOfWeek = String(dayState.day_of_week);
			toggleInput.className = 'schedule-day-toggle disabled:cursor-not-allowed';
			const toggleText = document.createElement('span');
			toggleText.textContent = 'Habilitado';
			toggleLabel.append(toggleInput, toggleText);

			topRow.append(titleWrap, toggleLabel);

			const slotSection = document.createElement('div');
			slotSection.className = 'mt-3 grid gap-3';

			const slotsContainer = document.createElement('div');
			slotsContainer.className = 'grid gap-3';
			slotSection.appendChild(slotsContainer);

			let addButton: HTMLButtonElement | null = null;
			if (this.canEdit) {
				const addWrap = document.createElement('div');
				addButton = document.createElement('button');
				addButton.type = 'button';
				addButton.dataset.slotAdd = 'true';
				addButton.dataset.dayOfWeek = String(dayState.day_of_week);
				addButton.className =
					'inline-flex h-9 items-center justify-center rounded-xl border border-[color:var(--primary-container)] bg-[color:var(--primary-soft)] px-3.5 py-1.5 text-[0.9rem] font-bold text-[color:var(--primary)] transition hover:bg-[color:var(--primary-soft-hover)] disabled:cursor-not-allowed disabled:opacity-60';
				addButton.textContent = '+ Agregar turno';
				addWrap.appendChild(addButton);
				slotSection.appendChild(addWrap);
			}

			article.append(topRow, slotSection);
			fragment.appendChild(article);

			this.dayNodes.set(dayState.day_of_week, {
				summaryNode: summary,
				toggleInput,
				slotSection,
				slotsContainer,
				addButton,
			});
		}

		this.plannerNode.appendChild(fragment);

		for (const dayState of this.dayStates) {
			this.renderDayState(dayState.day_of_week);
		}
	}

	private renderDayState(dayOfWeek: number): void {
		const dayState = this.findDayState(dayOfWeek);
		const refs = this.dayNodes.get(dayOfWeek);
		if (!dayState || !refs) return;

		refs.toggleInput.checked = dayState.enabled;
		refs.summaryNode.textContent = dayState.enabled
			? `${dayState.slots.length} turno(s) configurado(s)`
			: 'Dia libre';

		if (!dayState.enabled) {
			refs.slotSection.classList.add('hidden');
			this.clearNode(refs.slotsContainer);
			return;
		}

		refs.slotSection.classList.remove('hidden');
		this.renderSlots(dayState, refs.slotsContainer);
	}

	private renderSlots(dayState: DayState, container: HTMLElement): void {
		this.clearNode(container);
		const fragment = document.createDocumentFragment();

		for (let index = 0; index < dayState.slots.length; index += 1) {
			const slot = dayState.slots[index];
			const row = document.createElement('div');
			row.className = 'schedule-slot-row';
			row.dataset.slotRow = 'true';

			const locationLabel = document.createElement('label');
			locationLabel.className =
				'schedule-slot-field schedule-slot-field--location';
			locationLabel.append('Sucursal');

			const locationSelect = document.createElement('select');
			locationSelect.dataset.slotLocation = 'true';
			locationSelect.dataset.dayOfWeek = String(dayState.day_of_week);
			locationSelect.dataset.slotUid = slot.uid;
			locationSelect.className =
				'rounded-xl border border-[color:var(--shell-border)] bg-[color:var(--surface-bright)] px-3 py-2 text-sm font-semibold text-[color:var(--on-surface)] shadow-sm outline-none transition focus:border-[color:var(--primary)] disabled:cursor-not-allowed disabled:opacity-60';
			locationSelect.appendChild(this.createOption('', 'Selecciona sucursal'));
			for (const location of this.locations) {
				locationSelect.appendChild(
					this.createOption(String(location.id_location), String(location.name || ''))
				);
			}
			locationSelect.value = slot.loc_id_location || '';
			locationLabel.appendChild(locationSelect);

			const startLabel = document.createElement('label');
			startLabel.className = 'schedule-slot-field schedule-slot-field--start';
			startLabel.append('Inicio');

			const startInput = document.createElement('input');
			startInput.type = 'time';
			startInput.value = slot.start_time;
			startInput.dataset.slotStart = 'true';
			startInput.dataset.dayOfWeek = String(dayState.day_of_week);
			startInput.dataset.slotUid = slot.uid;
			startInput.className =
				'rounded-xl border border-[color:var(--shell-border)] bg-[color:var(--surface-bright)] px-3 py-2 text-sm font-semibold text-[color:var(--on-surface)] shadow-sm outline-none transition focus:border-[color:var(--primary)] disabled:cursor-not-allowed disabled:opacity-60';
			startLabel.appendChild(startInput);

			const endLabel = document.createElement('label');
			endLabel.className = 'schedule-slot-field schedule-slot-field--end';
			endLabel.append('Fin');

			const endInput = document.createElement('input');
			endInput.type = 'time';
			endInput.value = slot.end_time;
			endInput.dataset.slotEnd = 'true';
			endInput.dataset.dayOfWeek = String(dayState.day_of_week);
			endInput.dataset.slotUid = slot.uid;
			endInput.className =
				'rounded-xl border border-[color:var(--shell-border)] bg-[color:var(--surface-bright)] px-3 py-2 text-sm font-semibold text-[color:var(--on-surface)] shadow-sm outline-none transition focus:border-[color:var(--primary)] disabled:cursor-not-allowed disabled:opacity-60';
			endLabel.appendChild(endInput);

			const removeWrap = document.createElement('div');
			removeWrap.className = 'schedule-slot-remove-wrap';

			const removeButton = document.createElement('button');
			removeButton.type = 'button';
			removeButton.dataset.slotRemove = 'true';
			removeButton.dataset.dayOfWeek = String(dayState.day_of_week);
			removeButton.dataset.slotUid = slot.uid;
			removeButton.className = 'schedule-slot-remove-btn';
			removeButton.setAttribute('aria-label', `Eliminar turno ${index + 1} de ${dayState.name}`);
			removeButton.innerHTML =
				'<span class="material-symbols-rounded text-[1.1rem]" aria-hidden="true">close</span><span class="sr-only">Quitar</span>';
			removeWrap.appendChild(removeButton);

			row.append(locationLabel, startLabel, endLabel, removeWrap);
			fragment.appendChild(row);
		}
		
		container.appendChild(fragment);
	}

	private updatePlannerInteractivity(): void {
		if (!this.plannerNode) return;
		const blocked = this.isMetaLoading || this.isScheduleLoading || this.isSaving || !this.canEdit;

		for (const toggleInput of this.plannerNode.querySelectorAll<HTMLInputElement>('[data-day-toggle]')) {
			toggleInput.disabled = blocked;
		}

		for (const select of this.plannerNode.querySelectorAll<HTMLSelectElement>('[data-slot-location]')) {
			select.disabled = blocked;
		}

		for (const input of this.plannerNode.querySelectorAll<HTMLInputElement>('[data-slot-start], [data-slot-end]')) {
			input.disabled = blocked;
		}

		for (const addButton of this.plannerNode.querySelectorAll<HTMLButtonElement>('[data-slot-add]')) {
			addButton.disabled = blocked;
		}

		for (const removeButton of this.plannerNode.querySelectorAll<HTMLButtonElement>('[data-slot-remove]')) {
			const dayOfWeek = Number(removeButton.dataset.dayOfWeek || '0');
			const dayState = this.findDayState(dayOfWeek);
			const isOnlySlot = !dayState || dayState.slots.length <= 1;
			removeButton.disabled = blocked || isOnlySlot;
		}
	}

	private updateControlsState(): void {
		if (!this.professionalSelect) return;
		const blocked =
			this.isMetaLoading ||
			this.isScheduleLoading ||
			this.isExceptionsLoading ||
			this.isSaving ||
			!this.canEdit;

		if (this.saveButton) {
			this.saveButton.disabled = blocked || this.selectedProfessionalId <= 0;
		}
		if (this.roleId !== ROLES.PROFESIONAL) {
			setSearchableSelectDisabled(
				this.professionalSelect,
				blocked || this.professionals.length === 0
			);
		}

		if (this.saveLabel) {
			this.saveLabel.textContent = this.isSaving
				? 'Guardando...'
				: this.isDirty
					? 'Guardar cambios'
					: 'Guardar horarios';
		}

		this.updateViewVisibility();

		if (this.hintNode) {
			if (!this.canEdit) {
				this.hintNode.textContent = '';
				this.hintNode.classList.add('hidden');
			} else {
				this.hintNode.classList.remove('hidden');
				this.hintNode.textContent =
					this.selectedProfessionalId > 0
						? this.isDirty
							? 'Hay cambios pendientes por guardar.'
							: 'Selecciona turnos por dia y guarda para sincronizar.'
						: 'Selecciona una persona para ver o editar su agenda semanal.';
			}
		}

		this.updatePlannerInteractivity();
	}

	private clearMessages(): void {
		if (!this.errorNode) return;
		this.errorNode.textContent = '';
		this.errorNode.classList.add('hidden');
	}

	private showError(message: string): void {
		if (!this.errorNode) return;
		this.errorNode.textContent = message;
		this.errorNode.classList.remove('hidden');
	}

	private clearExceptionModalError(): void {
		if (this.exceptionModalErrorMessageNode) {
			this.exceptionModalErrorMessageNode.textContent = '';
		}
		this.exceptionModalErrorNode?.classList.add('hidden');
		this.exceptionModalErrorFeedbackNode?.classList.remove('is-visible');
	}

	private showExceptionModalError(message: string): void {
		if (!this.exceptionModalErrorNode || !this.exceptionModalErrorMessageNode) return;
		this.clearMessages();
		this.exceptionModalErrorMessageNode.textContent = message;
		this.exceptionModalErrorNode.classList.remove('hidden');
		this.exceptionModalErrorFeedbackNode?.classList.add('is-visible');
	}

	private setDirty(value: boolean): void {
		this.isDirty = value;
		this.updateControlsState();
	}

	private normalizeTime(value: unknown): string {
		const text = String(value || '').trim();
		const match = text.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
		return match ? `${match[1]}:${match[2]}` : '';
	}

	private toMinutes(timeValue: string): number {
		const [hours, minutes] = timeValue.split(':').map((part) => Number(part));
		return hours * 60 + minutes;
	}

	private makeSlotUid(): string {
		this.slotCounter += 1;
		return `slot-${Date.now()}-${this.slotCounter}`;
	}

	private getDefaultLocationId(): string {
		return this.locations.length > 0 ? String(this.locations[0].id_location) : '';
	}

	private createDefaultSlot(): SlotDraft {
		return {
			uid: this.makeSlotUid(),
			loc_id_location: this.getDefaultLocationId(),
			start_time: '08:00',
			end_time: '12:00',
		};
	}

	private buildEmptyDayStates(): DayState[] {
		return this.days
			.slice()
			.sort((a, b) => a.day_of_week - b.day_of_week)
			.map((day) => ({
				day_of_week: day.day_of_week,
				name: day.name,
				enabled: false,
				slots: [],
			}));
	}

	private findDayState(dayOfWeek: number): DayState | null {
		return this.dayStates.find((day) => day.day_of_week === dayOfWeek) || null;
	}

	private findSlot(dayOfWeek: number, slotUid: string): SlotDraft | null {
		const dayState = this.findDayState(dayOfWeek);
		if (!dayState) return null;
		return dayState.slots.find((slot) => slot.uid === slotUid) || null;
	}

	private applySchedule(scheduleItems: ScheduleItem[]): void {
		const nextDayStates = this.buildEmptyDayStates();
		const rowsByDay = new Map<number, DayState>(nextDayStates.map((row) => [row.day_of_week, row]));

		for (const item of scheduleItems) {
			const dayState = rowsByDay.get(Number(item.day_of_week));
			if (!dayState) continue;
			dayState.enabled = true;
			dayState.slots.push({
				uid: this.makeSlotUid(),
				loc_id_location: String(item.loc_id_location || ''),
				start_time: this.normalizeTime(item.start_time),
				end_time: this.normalizeTime(item.end_time),
				id_professional_schedule: Number(item.id_professional_schedule || 0),
			});
		}

		for (const dayState of nextDayStates) {
			if (dayState.enabled && dayState.slots.length === 0) {
				dayState.slots.push(this.createDefaultSlot());
			}
		}

		this.dayStates = nextDayStates;
	}

	private async parseJson<T = unknown>(response: Response): Promise<ApiResponse<T>> {
		try {
			return (await response.json()) as ApiResponse<T>;
		} catch {
			throw new Error('No fue posible interpretar la respuesta del servidor.');
		}
	}

	private async confirmDiscardChanges(): Promise<boolean> {
		const message = 'Tienes cambios sin guardar. Deseas descartarlos y continuar?';
		if (window.BookmateAlert?.confirm) {
			return window.BookmateAlert.confirm({
				type: 'warning',
				title: 'Cambios sin guardar',
				message,
				confirmText: 'Descartar',
				cancelText: 'Cancelar',
			});
		}
		return window.confirm(message);
	}

	private async loadScheduleByProfessional(professionalId: number): Promise<void> {
		this.isScheduleLoading = true;
		this.updateControlsState();
		this.clearMessages();

		try {
			const response = await fetch(`/api/schedules/${professionalId}`, {
				method: 'GET',
				headers: { Accept: 'application/json' },
			});
			const data = await this.parseJson<ScheduleItem[]>(response);

			if (!response.ok || !data || data.status !== 'success' || !Array.isArray(data.data)) {
				throw new Error(this.toBackendErrorMessage(data, 'No fue posible cargar la agenda del profesional.'));
			}

			this.applySchedule(data.data);
			this.renderPlanner();
			this.setDirty(false);
		} catch (error) {
			this.applySchedule([]);
			this.renderPlanner();
			this.showError(error instanceof Error ? error.message : 'No fue posible cargar la agenda.');
		} finally {
			this.isScheduleLoading = false;
			this.updateControlsState();
		}
	}

	private validateAndBuildPayload(): { payload?: ScheduleItem[]; error?: string } {
		const payload: Array<{
			loc_id_location: number;
			day_of_week: number;
			start_time: string;
			end_time: string;
		}> = [];
		const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

		for (const dayState of this.dayStates) {
			if (!dayState.enabled) continue;
			if (dayState.slots.length === 0) {
				return { error: `Debes agregar al menos un turno para ${dayState.name}.` };
			}

			const intervals: Array<{ start: number; end: number }> = [];
			for (const slot of dayState.slots) {
				const locationId = Number(slot.loc_id_location);
				if (!Number.isInteger(locationId) || locationId <= 0) {
					return { error: `Selecciona una sucursal valida para ${dayState.name}.` };
				}

				const startTime = this.normalizeTime(slot.start_time);
				const endTime = this.normalizeTime(slot.end_time);
				if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
					return { error: `Las horas en ${dayState.name} deben tener formato HH:MM.` };
				}

				const startMinutes = this.toMinutes(startTime);
				const endMinutes = this.toMinutes(endTime);
				if (startMinutes >= endMinutes) {
					return { error: `En ${dayState.name}, la hora de inicio debe ser menor que la hora de fin.` };
				}

				intervals.push({ start: startMinutes, end: endMinutes });
				payload.push({
					loc_id_location: locationId,
					day_of_week: dayState.day_of_week,
					start_time: startTime,
					end_time: endTime,
				});
			}

			intervals.sort((a, b) => a.start - b.start);
			for (let index = 1; index < intervals.length; index += 1) {
				if (intervals[index].start < intervals[index - 1].end) {
					return { error: `Hay turnos solapados en ${dayState.name}.` };
				}
			}
		}

		return { payload };
	}

	private async saveSchedule(): Promise<void> {
		if (!this.canEdit) {
			this.showError('No tienes permisos para guardar horarios.');
			return;
		}

		if (this.selectedProfessionalId <= 0) {
			this.showError('Selecciona un profesional antes de guardar.');
			return;
		}

		const result = this.validateAndBuildPayload();
		if ('error' in result) {
			this.showError(result.error ?? 'No fue posible validar los horarios.');
			return;
		}

		this.isSaving = true;
		this.updateControlsState();
		this.clearMessages();

		let acknowledgeScheduleImpact = false;
		let savedWithScheduleImpact = false;

		try {
			for (;;) {
				const response = await fetch(`/api/schedules/${this.selectedProfessionalId}`, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						Accept: 'application/json',
					},
					body: JSON.stringify({
						schedules: result.payload,
						...(acknowledgeScheduleImpact
							? { acknowledge_schedule_impact: true }
							: {}),
					}),
				});
				const data = await this.parseJson(response);

				if (
					response.status === 409 &&
					data &&
					typeof data === 'object' &&
					String((data as Record<string, unknown>).code || '') ===
						'SCHEDULE_IMPACT_APPOINTMENTS'
				) {
					const appointmentCount = Number(
						(data as Record<string, unknown>).appointment_count ?? 0
					);
					const confirmed = await this.confirmTemplateImpactWithAppointments(appointmentCount);
					if (!confirmed) return;
					acknowledgeScheduleImpact = true;
					savedWithScheduleImpact = true;
					continue;
				}

				if (!response.ok || !data || data.status !== 'success') {
					throw new Error(this.toBackendErrorMessage(data, 'No fue posible guardar los horarios.'));
				}

				const successMessage =
					typeof data.message === 'string' && data.message.trim()
						? data.message
						: 'Horarios guardados correctamente.';
				this.setDirty(false);
				showFlashMessage({ message: successMessage, type: 'success' });

				if (savedWithScheduleImpact && this.selectedProfessionalId > 0) {
					sessionStorage.setItem(
						`bookmate:schedule-review:${this.selectedProfessionalId}`,
						'1'
					);
					showFlashMessage({
						message:
							'Revisa el calendario: hay citas que no coinciden con la nueva plantilla. Debes reprogramarlas manualmente.',
						type: 'warning',
					});
					const reviewUrl = this.buildCalendarReviewUrl(this.selectedProfessionalId);
					if (window.BookmateAlert?.confirm) {
						const openCalendar = await window.BookmateAlert.confirm({
							type: 'info',
							title: 'Ir al calendario',
							message:
								'¿Quieres abrir el calendario ahora para revisar las citas afectadas?',
							confirmText: 'Abrir calendario',
							cancelText: 'Quedarme aquí',
						});
						if (openCalendar) {
							window.location.assign(reviewUrl);
						}
					}
				}
				return;
			}
		} catch (error) {
			this.showError(error instanceof Error ? error.message : 'No fue posible guardar los horarios.');
		} finally {
			this.isSaving = false;
			this.updateControlsState();
		}
	}

	private switchView = async (view: 'template' | 'exceptions'): Promise<void> => {
		if (view === this.activeView) return;

		if (view === 'exceptions' && this.isDirty) {
			const canContinue = await this.confirmDiscardChanges();
			if (!canContinue) return;
			this.setDirty(false);
		}

		this.activeView = view;
		this.updateViewVisibility();

		if (view === 'exceptions' && this.selectedProfessionalId > 0) {
			await this.loadExceptionsForVisibleMonth();
			this.renderExceptionCalendar();
		}
	};

	private updateViewVisibility(): void {
		for (const tabButton of this.tabButtons ?? []) {
			const isActive = tabButton.dataset.scheduleTab === this.activeView;
			tabButton.classList.toggle('schedule-tab--active', isActive);
			tabButton.setAttribute('aria-selected', isActive ? 'true' : 'false');
		}

		this.templateViewNode?.classList.toggle('hidden', this.activeView !== 'template');
		this.exceptionsViewNode?.classList.toggle('hidden', this.activeView !== 'exceptions');
		this.saveButton?.classList.toggle('hidden', this.activeView !== 'template');

		if (this.loadingNode) {
			const showLoading =
				this.activeView === 'template'
					? this.isMetaLoading || this.isScheduleLoading
					: this.isMetaLoading || this.isExceptionsLoading;
			this.loadingNode.classList.toggle('hidden', !showLoading);
			this.loadingNode.textContent =
				this.activeView === 'template'
					? this.isMetaLoading
						? 'Cargando configuracion de horarios...'
						: 'Cargando agenda del profesional...'
					: this.isExceptionsLoading
						? 'Cargando excepciones del calendario...'
						: 'Cargando configuracion de horarios...';
		}
	}

	private createDefaultExceptionSlot(): ExceptionSlotDraft {
		return {
			uid: this.makeSlotUid(),
			loc_id_location: this.getDefaultLocationId(),
			start_time: '08:00',
			end_time: '12:00',
		};
	};

	private buildTemplateSlotsForDate(dateKey: string): ExceptionSlotDraft[] {
		const date = parseDateKey(dateKey);
		const dayOfWeek = getIsoDayOfWeek(date);
		const dayState = this.dayStates.find((day) => day.day_of_week === dayOfWeek);
		if (!dayState?.enabled || dayState.slots.length === 0) return [];

		return dayState.slots.map((slot) => ({
			uid: this.makeSlotUid(),
			loc_id_location: slot.loc_id_location,
			start_time: this.normalizeTime(slot.start_time),
			end_time: this.normalizeTime(slot.end_time),
		}));
	};

	private async loadExceptionsForVisibleMonth(): Promise<void> {
		if (this.selectedProfessionalId <= 0) {
			this.exceptionSummaryMap = new Map();
			return;
		}

		const { from, to } = getMonthRangeKeys(this.exceptionCalendarCursor);
		this.isExceptionsLoading = true;
		this.updateViewVisibility();

		try {
			const response = await fetch(
				`/api/schedules/${this.selectedProfessionalId}/exceptions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
				{
					method: 'GET',
					headers: { Accept: 'application/json' },
				}
			);
			const data = await this.parseJson<
				Array<{
					exception_date: string;
					exception_type: ScheduleExceptionType;
					is_past: boolean;
				}>
			>(response);

			if (!response.ok || !data || data.status !== 'success' || !Array.isArray(data.data)) {
				throw new Error(
					this.toBackendErrorMessage(data, 'No fue posible cargar las excepciones del calendario.')
				);
			}

			this.exceptionSummaryMap = buildExceptionSummaryMap(data.data);
		} catch (error) {
			this.exceptionSummaryMap = new Map();
			this.showError(
				error instanceof Error ? error.message : 'No fue posible cargar las excepciones.'
			);
		} finally {
			this.isExceptionsLoading = false;
			this.updateViewVisibility();
		}
	}

	private renderExceptionCalendar(): void {
		if (!this.exceptionCalGridNode || !this.exceptionCalMonthNode) return;

		if (this.selectedProfessionalId <= 0) {
			this.exceptionCalGridNode.innerHTML = '';
			this.exceptionCalMonthNode.textContent = formatMonthLabel(this.exceptionCalendarCursor);
			return;
		}

		this.exceptionCalMonthNode.textContent = formatMonthLabel(this.exceptionCalendarCursor);
		this.exceptionCalGridNode.innerHTML = '';

		const cursor = this.exceptionCalendarCursor;
		const year = cursor.getFullYear();
		const month = cursor.getMonth();
		const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
		const daysInMonth = new Date(year, month + 1, 0).getDate();

		for (let index = 0; index < firstWeekday; index += 1) {
			const placeholder = document.createElement('span');
			placeholder.className = 'schedule-cal-day schedule-cal-day--empty';
			this.exceptionCalGridNode.appendChild(placeholder);
		}

		for (let day = 1; day <= daysInMonth; day += 1) {
			const date = new Date(year, month, day);
			const dateKey = formatDateKey(date);
			const tone = resolveCalendarDayTone(dateKey, this.exceptionSummaryMap);
			const isPast = isPastDateKey(dateKey);
			const dayButton = document.createElement('button');
			dayButton.type = 'button';
			dayButton.dataset.exceptionDate = dateKey;
			dayButton.textContent = String(day);
			dayButton.className = `schedule-cal-day schedule-cal-day--${tone}${isPast ? ' schedule-cal-day--past' : ''}`;
			this.exceptionCalGridNode.appendChild(dayButton);
		}
	}

	private showExceptionModalShell(dateKey: string): void {
		if (!this.exceptionModalNode) return;

		this.exceptionModalDateKey = dateKey;
		this.exceptionModalReadOnly = isPastDateKey(dateKey) || !this.canEdit;
		this.exceptionModalDirty = false;
		this.exceptionModalLoading = true;
		this.exceptionModalType = 'OVERRIDE';
		this.exceptionModalNote = '';
		this.exceptionModalSlots = [];

		if (this.exceptionModalTitleNode) {
			this.exceptionModalTitleNode.textContent = this.exceptionModalReadOnly
				? 'Detalle del día'
				: 'Excepción de horario';
		}
		if (this.exceptionModalSubtitleNode) {
			const label = new Intl.DateTimeFormat('es-PY', {
				weekday: 'long',
				day: 'numeric',
				month: 'long',
				year: 'numeric',
			}).format(parseDateKey(dateKey));
			this.exceptionModalSubtitleNode.textContent = label;
		}

		this.clearExceptionModalError();
		this.renderExceptionModalLoading();
		this.renderExceptionModalLoadingActions();
		this.updateExceptionModalTourHelpVisibility();
		this.exceptionModalNode.classList.remove('hidden');
		this.exceptionModalNode.classList.add('flex');
	}

	private renderExceptionModalLoading(): void {
		if (!this.exceptionModalBodyNode) return;
		this.clearNode(this.exceptionModalBodyNode);

		const loading = document.createElement('div');
		loading.className = 'schedule-exception-modal-loading';
		loading.setAttribute('aria-live', 'polite');
		loading.setAttribute('aria-busy', 'true');

		const spinner = document.createElement('span');
		spinner.className = 'material-symbols-rounded animate-spin';
		spinner.textContent = 'progress_activity';

		const label = document.createElement('span');
		label.textContent = 'Cargando excepción del día...';

		loading.append(spinner, label);
		this.exceptionModalBodyNode.appendChild(loading);
	}

	private renderExceptionModalLoadingActions(): void {
		if (!this.exceptionModalActionsNode) return;
		this.clearNode(this.exceptionModalActionsNode);
		this.exceptionModalActionsNode.classList.remove('max-sm:hidden');

		const primaryActions = document.createElement('div');
		primaryActions.className =
			'modal-footer-actions schedule-exception-modal-footer__primary';

		const cancelButton = document.createElement('button');
		cancelButton.type = 'button';
		cancelButton.dataset.excAction = 'close';
		cancelButton.className = 'modal-action-secondary';
		cancelButton.textContent = 'Cancelar';
		primaryActions.appendChild(cancelButton);

		this.exceptionModalActionsNode.appendChild(primaryActions);
	}

	private applyExceptionModalDetail(
		dateKey: string,
		detail: {
			exception_type: ScheduleExceptionType | null;
			note: string | null;
			slots: Array<{
				loc_id_location: number;
				start_time: string;
				end_time: string;
			}>;
			inherits_template: boolean;
			is_past: boolean;
		}
	): void {
		this.exceptionModalReadOnly = Boolean(detail.is_past) || !this.canEdit;

		if (detail.inherits_template || !detail.exception_type) {
			this.exceptionModalType = 'OVERRIDE';
			this.exceptionModalNote = '';
			this.exceptionModalSlots = this.buildTemplateSlotsForDate(dateKey);
		} else if (detail.exception_type === 'BLOCKED') {
			this.exceptionModalType = 'BLOCKED';
			this.exceptionModalNote = detail.note || '';
			this.exceptionModalSlots = [];
		} else {
			this.exceptionModalType = 'OVERRIDE';
			this.exceptionModalNote = detail.note || '';
			this.exceptionModalSlots = detail.slots.map((slot) => ({
				uid: this.makeSlotUid(),
				loc_id_location: String(slot.loc_id_location || ''),
				start_time: this.normalizeTime(slot.start_time),
				end_time: this.normalizeTime(slot.end_time),
			}));
		}

		if (this.exceptionModalTitleNode) {
			this.exceptionModalTitleNode.textContent = this.exceptionModalReadOnly
				? 'Detalle del día'
				: 'Excepción de horario';
		}
	}

	private async loadExceptionModalDetail(dateKey: string, loadSeq: number): Promise<void> {
		try {
			const response = await fetch(
				`/api/schedules/${this.selectedProfessionalId}/exceptions/${dateKey}`,
				{
					method: 'GET',
					headers: { Accept: 'application/json' },
				}
			);
			const data = await this.parseJson<{
				exception_type: ScheduleExceptionType | null;
				note: string | null;
				slots: Array<{
					loc_id_location: number;
					start_time: string;
					end_time: string;
				}>;
				inherits_template: boolean;
				is_past: boolean;
			}>(response);

			if (loadSeq !== this.exceptionModalLoadSeq) return;

			if (!response.ok || !data || data.status !== 'success' || !data.data) {
				throw new Error(this.toBackendErrorMessage(data, 'No fue posible cargar la excepción.'));
			}

			this.applyExceptionModalDetail(dateKey, data.data);
			this.exceptionModalLoading = false;
			this.clearExceptionModalError();
			this.renderExceptionModalBody();
			this.renderExceptionModalActions();
			this.updateExceptionModalTourHelpVisibility();
		} catch (error) {
			if (loadSeq !== this.exceptionModalLoadSeq) return;
			this.exceptionModalLoading = false;
			const message =
				error instanceof Error ? error.message : 'No fue posible abrir la excepción.';
			this.showExceptionModalError(message);
			this.renderExceptionModalLoadingActions();
		}
	}

	private async openExceptionModal(dateKey: string): Promise<void> {
		if (!this.exceptionModalNode || this.selectedProfessionalId <= 0) return;

		const loadSeq = ++this.exceptionModalLoadSeq;
		this.showExceptionModalShell(dateKey);
		await this.loadExceptionModalDetail(dateKey, loadSeq);
	}

	private updateExceptionModalTourHelpVisibility(): void {
		if (!this.exceptionModalTourHelpButton) return;
		const showHelp = !this.exceptionModalReadOnly && this.canEdit;
		this.exceptionModalTourHelpButton.classList.toggle('hidden', !showHelp);
		this.exceptionModalTourHelpButton.classList.toggle('inline-flex', showHelp);
	}

	private closeExceptionModal = (): void => {
		if (!this.exceptionModalNode) return;
		this.exceptionModalLoadSeq += 1;
		this.exceptionModalLoading = false;
		this.clearExceptionModalError();
		this.exceptionModalNode.classList.add('hidden');
		this.exceptionModalNode.classList.remove('flex');
		this.exceptionModalDateKey = '';
		this.updateExceptionModalTourHelpVisibility();
	};

	private renderExceptionModalBody(): void {
		if (!this.exceptionModalBodyNode) return;
		this.clearNode(this.exceptionModalBodyNode);

		if (this.exceptionModalReadOnly) {
			const readOnly = document.createElement('div');
			readOnly.className = 'grid gap-2 text-[0.9rem] text-(--on-surface-variant)';
			if (this.exceptionModalType === 'BLOCKED') {
				readOnly.textContent = 'Este día está bloqueado (sin turnos disponibles).';
			} else if (this.exceptionModalSlots.length === 0) {
				readOnly.textContent = 'Sin turnos configurados para este día.';
			} else {
				const list = document.createElement('ul');
				list.className = 'grid gap-1';
				for (const slot of this.exceptionModalSlots) {
					const item = document.createElement('li');
					const location = this.locations.find(
						(loc) => loc.id_location === Number(slot.loc_id_location)
					);
					item.textContent = `${location?.name || 'Sucursal'}: ${slot.start_time} - ${slot.end_time}`;
					list.appendChild(item);
				}
				readOnly.appendChild(list);
			}
			this.exceptionModalBodyNode.appendChild(readOnly);
			return;
		}

		const typeFieldset = document.createElement('fieldset');
		typeFieldset.className = 'grid gap-2';
		const typeLegend = document.createElement('legend');
		typeLegend.className = 'text-[0.88rem] font-bold text-(--on-surface)';
		typeLegend.textContent = 'Tipo de excepción';
		typeFieldset.appendChild(typeLegend);

		const typeOptions: Array<{ value: ScheduleExceptionType | 'INHERIT'; label: string }> = [
			{ value: 'OVERRIDE', label: 'Horario especial (reemplaza la plantilla)' },
			{ value: 'BLOCKED', label: 'Bloquear día completo' },
		];

		for (const option of typeOptions) {
			const label = document.createElement('label');
			label.className =
				'inline-flex items-center gap-2 rounded-xl border border-(--shell-border) px-3 py-2 text-[0.88rem] font-semibold';
			label.dataset.excTypeOption = option.value;
			const input = document.createElement('input');
			input.type = 'radio';
			input.name = 'exception_type';
			input.value = option.value;
			input.dataset.excType = 'true';
			input.checked = this.exceptionModalType === option.value;
			label.append(input, document.createTextNode(option.label));
			typeFieldset.appendChild(label);
		}
		this.exceptionModalBodyNode.appendChild(typeFieldset);

		const noteField = document.createElement('div');
		noteField.className = 'grid gap-1';

		const noteLabel = document.createElement('label');
		noteLabel.className = 'grid gap-1 text-[0.88rem] font-bold text-(--on-surface)';
		noteLabel.append('Nota (opcional)');

		const noteInput = document.createElement('input');
		noteInput.type = 'text';
		noteInput.maxLength = 500;
		noteInput.value = this.exceptionModalNote;
		noteInput.dataset.excNote = 'true';
		noteInput.id = 'exception-modal-note';
		noteInput.className =
			'rounded-xl border border-(--shell-border) bg-(--surface-bright) px-3 py-2 text-[0.9rem] font-medium';
		noteInput.setAttribute('aria-describedby', 'exception-modal-note-help');
		noteLabel.appendChild(noteInput);

		const noteHelp = document.createElement('p');
		noteHelp.id = 'exception-modal-note-help';
		noteHelp.className = 'schedule-field-hint';
		noteHelp.textContent = EXCEPTION_NOTE_HELP_TEXT;

		noteField.append(noteLabel, noteHelp);
		this.exceptionModalBodyNode.appendChild(noteField);

		if (this.exceptionModalType === 'BLOCKED') {
			const blockedHint = document.createElement('p');
			blockedHint.className = 'text-[0.85rem] font-medium text-(--on-surface-variant)';
			blockedHint.textContent = 'No se ofrecerán turnos este día.';
			this.exceptionModalBodyNode.appendChild(blockedHint);
			return;
		}

		const slotsWrap = document.createElement('div');
		slotsWrap.className = 'grid gap-3';
		const slotsTitle = document.createElement('p');
		slotsTitle.className = 'text-[0.88rem] font-bold text-(--on-surface)';
		slotsTitle.textContent = 'Turnos del día';
		slotsWrap.appendChild(slotsTitle);

		if (this.exceptionModalSlots.length === 0) {
			const empty = document.createElement('p');
			empty.className = 'text-[0.85rem] text-(--on-surface-variant)';
			empty.textContent = 'Sin turnos. Agrega al menos uno o bloquea el día.';
			slotsWrap.appendChild(empty);
		}

		for (const slot of this.exceptionModalSlots) {
			const row = document.createElement('div');
			row.className = 'schedule-slot-row';

			const locationLabel = document.createElement('label');
			locationLabel.className = 'schedule-slot-field schedule-slot-field--location';
			locationLabel.append('Sucursal');
			const locationSelect = document.createElement('select');
			locationSelect.dataset.excSlotLocation = 'true';
			locationSelect.dataset.slotUid = slot.uid;
			locationSelect.className =
				'rounded-xl border border-(--shell-border) bg-(--surface-bright) px-3 py-2 text-sm font-semibold';
			locationSelect.appendChild(this.createOption('', 'Selecciona sucursal'));
			for (const location of this.locations) {
				locationSelect.appendChild(
					this.createOption(String(location.id_location), String(location.name || ''))
				);
			}
			locationSelect.value = slot.loc_id_location || '';
			locationLabel.appendChild(locationSelect);

			const startLabel = document.createElement('label');
			startLabel.className = 'schedule-slot-field schedule-slot-field--start';
			startLabel.append('Inicio');
			const startInput = document.createElement('input');
			startInput.type = 'time';
			startInput.value = slot.start_time;
			startInput.dataset.excSlotStart = 'true';
			startInput.dataset.slotUid = slot.uid;
			startInput.className =
				'rounded-xl border border-(--shell-border) bg-(--surface-bright) px-3 py-2 text-sm font-semibold';
			startLabel.appendChild(startInput);

			const endLabel = document.createElement('label');
			endLabel.className = 'schedule-slot-field schedule-slot-field--end';
			endLabel.append('Fin');
			const endInput = document.createElement('input');
			endInput.type = 'time';
			endInput.value = slot.end_time;
			endInput.dataset.excSlotEnd = 'true';
			endInput.dataset.slotUid = slot.uid;
			endInput.className =
				'rounded-xl border border-(--shell-border) bg-(--surface-bright) px-3 py-2 text-sm font-semibold';
			endLabel.appendChild(endInput);

			const removeWrap = document.createElement('div');
			removeWrap.className = 'schedule-slot-remove-wrap';
			const removeButton = document.createElement('button');
			removeButton.type = 'button';
			removeButton.dataset.excSlotRemove = 'true';
			removeButton.dataset.slotUid = slot.uid;
			removeButton.className = 'schedule-slot-remove-btn';
			removeButton.innerHTML =
				'<span class="material-symbols-rounded text-[1.1rem]" aria-hidden="true">close</span>';
			removeWrap.appendChild(removeButton);

			row.append(locationLabel, startLabel, endLabel, removeWrap);
			slotsWrap.appendChild(row);
		}

		const addButton = document.createElement('button');
		addButton.type = 'button';
		addButton.dataset.excSlotAdd = 'true';
		addButton.className =
			'inline-flex h-9 items-center justify-center rounded-xl border border-(--primary-container) bg-(--primary-soft) px-3.5 text-[0.9rem] font-bold text-(--primary)';
		addButton.textContent = '+ Agregar turno';
		slotsWrap.appendChild(addButton);

		this.exceptionModalBodyNode.appendChild(slotsWrap);
	}

	private renderExceptionModalActions(): void {
		if (!this.exceptionModalActionsNode) return;
		this.clearNode(this.exceptionModalActionsNode);
		this.exceptionModalActionsNode.classList.remove('max-sm:hidden');

		if (!this.exceptionModalReadOnly && this.exceptionSummaryMap.has(this.exceptionModalDateKey)) {
			const startActions = document.createElement('div');
			startActions.className = 'schedule-exception-modal-footer__start';

			const deleteButton = document.createElement('button');
			deleteButton.type = 'button';
			deleteButton.dataset.excAction = 'delete';
			deleteButton.dataset.excUseTemplate = 'true';
			deleteButton.className = 'modal-action-danger';
			deleteButton.textContent = 'Usar plantilla';
			startActions.appendChild(deleteButton);

			this.exceptionModalActionsNode.appendChild(startActions);
		}

		const primaryActions = document.createElement('div');
		primaryActions.className =
			'modal-footer-actions schedule-exception-modal-footer__primary';

		const cancelButton = document.createElement('button');
		cancelButton.type = 'button';
		cancelButton.dataset.excAction = 'close';
		cancelButton.className = 'modal-action-secondary';
		cancelButton.textContent = 'Cancelar';
		primaryActions.appendChild(cancelButton);

		if (!this.exceptionModalReadOnly) {
			const saveButton = document.createElement('button');
			saveButton.type = 'button';
			saveButton.dataset.excAction = 'save';
			saveButton.className = 'modal-action-primary';
			saveButton.textContent = 'Guardar excepción';
			primaryActions.appendChild(saveButton);
		}

		this.exceptionModalActionsNode.appendChild(primaryActions);

		if (this.exceptionModalReadOnly) {
			this.exceptionModalActionsNode.classList.add('max-sm:hidden');
		}
	}

	private validateExceptionModalPayload(): {
		payload?: {
			exception_type: ScheduleExceptionType;
			note: string | null;
			slots: Array<{ loc_id_location: number; start_time: string; end_time: string }>;
		};
		error?: string;
	} {
		if (this.exceptionModalType === 'BLOCKED') {
			return {
				payload: {
					exception_type: 'BLOCKED',
					note: this.exceptionModalNote.trim() || null,
					slots: [],
				},
			};
		}

		const slots: Array<{ loc_id_location: number; start_time: string; end_time: string }> = [];
		const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
		const intervals: Array<{ start: number; end: number }> = [];

		for (const slot of this.exceptionModalSlots) {
			const locationId = Number(slot.loc_id_location);
			const startTime = this.normalizeTime(slot.start_time);
			const endTime = this.normalizeTime(slot.end_time);

			if (!Number.isInteger(locationId) || locationId <= 0) {
				return { error: 'Selecciona una sucursal válida en cada turno.' };
			}
			if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
				return { error: 'Las horas deben tener formato HH:MM.' };
			}

			const startMinutes = this.toMinutes(startTime);
			const endMinutes = this.toMinutes(endTime);
			if (startMinutes >= endMinutes) {
				return { error: 'La hora de inicio debe ser menor que la hora de fin.' };
			}

			intervals.push({ start: startMinutes, end: endMinutes });
			slots.push({
				loc_id_location: locationId,
				start_time: startTime,
				end_time: endTime,
			});
		}

		intervals.sort((a, b) => a.start - b.start);
		for (let index = 1; index < intervals.length; index += 1) {
			if (intervals[index].start < intervals[index - 1].end) {
				return { error: 'Hay turnos solapados en la excepción.' };
			}
		}

		return {
			payload: {
				exception_type: 'OVERRIDE',
				note: this.exceptionModalNote.trim() || null,
				slots,
			},
		};
	}

	private buildBlockDayConfirmMessage(appointmentCount: number) {
		const label = appointmentCount === 1 ? 'cita agendada' : 'citas agendadas';
		return `Atención: Tienes ${appointmentCount} ${label} para este día. Si bloqueas el día, no se recibirán reservas nuevas, pero deberás reprogramar o cancelar las citas existentes manualmente para no perjudicar a tus clientes. ¿Deseas continuar?`;
	}

	private buildTemplateImpactConfirmMessage(appointmentCount: number) {
		const label = appointmentCount === 1 ? 'cita futura' : 'citas futuras';
		return `Hay ${appointmentCount} ${label} que no coinciden con la nueva plantilla (horario o sucursal). Las citas no se mueven solas: deberás revisarlas en el calendario y reprogramarlas manualmente, avisando al cliente si cambias fecha u hora. ¿Deseas guardar la plantilla de todos modos?`;
	}

	private async confirmTemplateImpactWithAppointments(appointmentCount: number) {
		const message = this.buildTemplateImpactConfirmMessage(appointmentCount);
		if (window.BookmateAlert?.confirm) {
			return window.BookmateAlert.confirm({
				type: 'warning',
				title: 'Citas afectadas por el cambio de horario',
				message,
				confirmText: 'Sí, guardar plantilla',
				cancelText: 'Cancelar',
			});
		}
		return window.confirm(message);
	}

	private buildCalendarReviewUrl(professionalId: number) {
		const url = new URL('/panel/calendar', window.location.origin);
		url.searchParams.set('schedule_review', '1');
		url.searchParams.set('pro_id', String(professionalId));
		return `${url.pathname}${url.search}`;
	}

	private async confirmBlockDayWithAppointments(appointmentCount: number) {
		const message = this.buildBlockDayConfirmMessage(appointmentCount);
		if (window.BookmateAlert?.confirm) {
			return window.BookmateAlert.confirm({
				type: 'warning',
				title: 'Bloquear día con citas existentes',
				message,
				confirmText: 'Sí, bloquear día',
				cancelText: 'Cancelar',
			});
		}
		return window.confirm(message);
	}

	private async saveExceptionFromModal(): Promise<void> {
		if (!this.canEdit || !this.exceptionModalDateKey || this.exceptionModalReadOnly) return;

		const result = this.validateExceptionModalPayload();
		if ('error' in result) {
			this.showExceptionModalError(result.error ?? 'No fue posible validar la excepción.');
			return;
		}

		let acknowledgeExistingAppointments = false;

		try {
			for (;;) {
				const response = await fetch(
					`/api/schedules/${this.selectedProfessionalId}/exceptions/${this.exceptionModalDateKey}`,
					{
						method: 'PUT',
						headers: {
							'Content-Type': 'application/json',
							Accept: 'application/json',
						},
						body: JSON.stringify({
							...result.payload,
							...(acknowledgeExistingAppointments
								? { acknowledge_existing_appointments: true }
								: {}),
						}),
					}
				);
				const data = await this.parseJson(response);

				if (
					response.status === 409 &&
					data &&
					typeof data === 'object' &&
					String((data as Record<string, unknown>).code || '') === 'EXISTING_APPOINTMENTS'
				) {
					const appointmentCount = Number(
						(data as Record<string, unknown>).appointment_count ?? 0
					);
					const confirmed = await this.confirmBlockDayWithAppointments(appointmentCount);
					if (!confirmed) return;
					acknowledgeExistingAppointments = true;
					continue;
				}

				if (!response.ok || !data || data.status !== 'success') {
					throw new Error(this.toBackendErrorMessage(data, 'No fue posible guardar la excepción.'));
				}

				this.closeExceptionModal();
				await this.loadExceptionsForVisibleMonth();
				this.renderExceptionCalendar();
				showFlashMessage({
					message:
						typeof data.message === 'string' && data.message.trim()
							? data.message
							: 'Excepción guardada correctamente.',
					type: 'success',
				});
				return;
			}
		} catch (error) {
			this.showExceptionModalError(
				error instanceof Error ? error.message : 'No fue posible guardar la excepción.'
			);
		}
	}

	private async deleteExceptionFromModal(): Promise<void> {
		if (!this.canEdit || !this.exceptionModalDateKey || this.exceptionModalReadOnly) return;

		const confirmed = window.BookmateAlert?.confirm
			? await window.BookmateAlert.confirm({
					type: 'warning',
					title: 'Volver a plantilla',
					message: 'Este día volverá a usar el horario semanal habitual.',
					confirmText: 'Confirmar',
					cancelText: 'Cancelar',
				})
			: window.confirm('Este día volverá a usar el horario semanal habitual.');

		if (!confirmed) return;

		try {
			const response = await fetch(
				`/api/schedules/${this.selectedProfessionalId}/exceptions/${this.exceptionModalDateKey}`,
				{
					method: 'DELETE',
					headers: { Accept: 'application/json' },
				}
			);
			const data = await this.parseJson(response);
			if (!response.ok || !data || data.status !== 'success') {
				throw new Error(this.toBackendErrorMessage(data, 'No fue posible eliminar la excepción.'));
			}

			this.closeExceptionModal();
			await this.loadExceptionsForVisibleMonth();
			this.renderExceptionCalendar();
			showFlashMessage({
				message:
					typeof data.message === 'string' && data.message.trim()
						? data.message
						: 'Excepción eliminada.',
				type: 'success',
			});
		} catch (error) {
			this.showExceptionModalError(
				error instanceof Error ? error.message : 'No fue posible eliminar la excepción.'
			);
		}
	}

	private async loadMeta(): Promise<void> {
		this.isMetaLoading = true;
		this.updateControlsState();

		try {
			const response = await fetch('/api/schedules/meta', {
				method: 'GET',
				headers: { Accept: 'application/json' },
			});
			const data = await this.parseJson<{
				professionals: ProfessionalLov[];
				locations: LocationLov[];
				days: Day[];
				session?: { role_id?: number; professional_id?: number };
			}>(response);

			if (!response.ok || !data || data.status !== 'success' || !data.data) {
				throw new Error(this.toBackendErrorMessage(data, 'No fue posible obtener catalogos de horarios.'));
			}

			const sessionRoleId = Number(data.data.session?.role_id || 0);
			const datasetRoleId = Number(this.dataset.roleId || 0);
			this.roleId =
				sessionRoleId === ROLES.PROFESIONAL || sessionRoleId === ROLES.RECEPCIONISTA
					? sessionRoleId
					: datasetRoleId;
			this.currentProfessionalId = Number(data.data.session?.professional_id || 0);
			this.professionals = Array.isArray(data.data.professionals) ? data.data.professionals : [];
			this.locations = Array.isArray(data.data.locations) ? data.data.locations : [];
			this.days = Array.isArray(data.data.days) ? data.data.days : [];

			this.dayStates = this.buildEmptyDayStates();

			if (this.professionals.length === 0) {
				this.selectedProfessionalId = 0;
				this.renderProfessionalOptions();
				this.renderPlanner();
				this.showError('No hay profesionales disponibles para configurar horarios.');
				return;
			}

			if (this.roleId === ROLES.PROFESIONAL) {
				this.selectedProfessionalId =
					this.currentProfessionalId > 0
						? this.currentProfessionalId
						: Number(this.professionals[0]?.id_professional || 0);
			} else {
				this.selectedProfessionalId = Number(this.professionals[0]?.id_professional || 0);
			}

			this.renderProfessionalOptions();
			this.renderPlanner();
			await this.loadScheduleByProfessional(this.selectedProfessionalId);
		} catch (error) {
			this.showError(
				error instanceof Error
					? error.message
					: 'No fue posible obtener la configuracion inicial de horarios.'
			);
			this.selectedProfessionalId = 0;
			this.dayStates = [];
			this.renderPlanner();
		} finally {
			this.isMetaLoading = false;
			this.updateControlsState();
			if (this.professionals.length > 0) {
				maybeShowScheduleExceptionsTour();
			}
		}
	}
}

if (!customElements.get('schedule-manager')) {
	customElements.define('schedule-manager', ScheduleManager);
}
