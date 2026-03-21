import { navigate } from 'astro:transitions/client';

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

class ScheduleManager extends HTMLElement {
	#bound = false;
	#listenerController: AbortController | null = null;

	canEdit = false;
	professionalSelect: HTMLSelectElement | null = null;
	plannerNode: HTMLElement | null = null;
	saveButton: HTMLButtonElement | null = null;
	saveLabel: HTMLElement | null = null;
	hintNode: HTMLElement | null = null;
	errorNode: HTMLElement | null = null;
	loadingNode: HTMLElement | null = null;

	professionals: ProfessionalLov[] = [];
	locations: LocationLov[] = [];
	days: Day[] = [];
	dayStates: DayState[] = [];
	dayNodes = new Map<number, DayNodeRefs>();

	selectedProfessionalId = 0;
	slotCounter = 0;
	isMetaLoading = false;
	isScheduleLoading = false;
	isSaving = false;
	isDirty = false;

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

		if (!this.professionalSelect || !this.plannerNode) {
			this.#bound = false;
			return;
		}

		this.#listenerController = new AbortController();
		const signal = this.#listenerController.signal;

		this.cleanFlashUrl();
		this.professionalSelect.addEventListener('change', this.handleProfessionalChange, { signal });
		this.plannerNode.addEventListener('change', this.handlePlannerChange, { signal });
		this.plannerNode.addEventListener('click', this.handlePlannerClick, { signal });
		if (this.saveButton && this.canEdit) {
			this.saveButton.addEventListener('click', this.handleSaveClick, { signal });
		}

		this.updateControlsState();
		this.renderPlanner();
		void this.loadMeta();
	}

	disconnectedCallback() {
		this.#bound = false;
		this.#listenerController?.abort();
		this.#listenerController = null;
		this.dayNodes.clear();
	}

	handleSaveClick = () => {
		void this.saveSchedule();
	};

	handleProfessionalChange = async () => {
		if (!this.professionalSelect) return;

		const nextProfessionalId = Number(this.professionalSelect.value || 0);
		if (!Number.isInteger(nextProfessionalId) || nextProfessionalId <= 0) {
			this.professionalSelect.value =
				this.selectedProfessionalId > 0 ? String(this.selectedProfessionalId) : '';
			return;
		}
		if (nextProfessionalId === this.selectedProfessionalId) return;

		if (this.isDirty) {
			const canContinue = await this.confirmDiscardChanges();
			if (!canContinue) {
				this.professionalSelect.value =
					this.selectedProfessionalId > 0 ? String(this.selectedProfessionalId) : '';
				return;
			}
		}

		this.selectedProfessionalId = nextProfessionalId;
		this.dayStates = this.buildEmptyDayStates();
		this.renderPlanner();
		this.setDirty(false);
		await this.loadScheduleByProfessional(this.selectedProfessionalId);
	};

	handlePlannerChange = (event: Event) => {
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

	handlePlannerClick = (event: MouseEvent) => {
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

	cleanFlashUrl() {
		const currentUrl = new URL(window.location.href);
		if (!currentUrl.searchParams.has('flash_message')) return;
		currentUrl.searchParams.delete('flash_message');
		currentUrl.searchParams.delete('flash_type');
		window.history.replaceState({}, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
	}

	navigateWithFlash(message: string, type = 'success') {
		const nextUrl = new URL(window.location.href);
		nextUrl.searchParams.set('flash_message', message);
		nextUrl.searchParams.set('flash_type', type);
		void navigate(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
	}

	toBackendErrorMessage(data: any, fallbackMessage: string) {
		const mainMessage = typeof data?.message === 'string' ? data.message.trim() : '';
		if (mainMessage) return mainMessage;

		if (Array.isArray(data?.errors)) {
			const detailMessages = data.errors
				.filter((item: any) => item && typeof item === 'object')
				.map((item: any) => String(item.message || '').trim())
				.filter((message: string) => message.length > 0);
			if (detailMessages.length > 0) {
				return detailMessages.join(' | ');
			}
		}

		return fallbackMessage;
	}

	clearNode(node: Element) {
		while (node.firstChild) {
			node.removeChild(node.firstChild);
		}
	}

	createOption(value: string, label: string) {
		const option = document.createElement('option');
		option.value = value;
		option.textContent = label;
		return option;
	}

	renderProfessionalOptions() {
		if (!this.professionalSelect) return;
		this.clearNode(this.professionalSelect);
		this.professionalSelect.appendChild(this.createOption('', 'Selecciona un profesional'));

		for (const professional of this.professionals) {
			this.professionalSelect.appendChild(
				this.createOption(String(professional.id_professional), professional.display_name)
			);
		}

		if (this.selectedProfessionalId > 0) {
			this.professionalSelect.value = String(this.selectedProfessionalId);
		}
	}

	renderPlannerMessage(message: string, tone: 'info' | 'error') {
		if (!this.plannerNode) return;
		this.dayNodes.clear();
		this.clearNode(this.plannerNode);

		const messageNode = document.createElement('div');
		messageNode.className =
			tone === 'error'
				? 'rounded-[1.2rem] border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700'
				: 'rounded-[1.2rem] border border-[color:var(--shell-border)] bg-[color:var(--card-surface)] px-4 py-5 text-sm text-[color:var(--on-surface-variant)]';
		messageNode.textContent = message;
		this.plannerNode.appendChild(messageNode);
	}

	renderPlanner() {
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

	renderAllDays() {
		if (!this.plannerNode) return;
		this.dayNodes.clear();
		this.clearNode(this.plannerNode);

		for (const dayState of this.dayStates) {
			const article = document.createElement('article');
			article.className =
				'rounded-[1.1rem] border border-[color:var(--shell-border)] bg-[color:var(--card-surface)] px-4 py-4';
			article.dataset.dayCard = String(dayState.day_of_week);

			const topRow = document.createElement('div');
			topRow.className = 'flex flex-wrap items-center justify-between gap-3';

			const titleWrap = document.createElement('div');
			const title = document.createElement('h3');
			title.className = 'text-sm font-bold text-[color:var(--on-surface)]';
			title.textContent = dayState.name;

			const summary = document.createElement('p');
			summary.className = 'text-xs text-[color:var(--on-surface-variant)]';
			titleWrap.append(title, summary);

			const toggleLabel = document.createElement('label');
			toggleLabel.className =
				'inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--on-surface-variant)]';
			const toggleInput = document.createElement('input');
			toggleInput.type = 'checkbox';
			toggleInput.dataset.dayToggle = 'true';
			toggleInput.dataset.dayOfWeek = String(dayState.day_of_week);
			toggleInput.className = 'size-4 accent-[color:var(--primary)] disabled:cursor-not-allowed';
			const toggleText = document.createElement('span');
			toggleText.textContent = 'Habilitado';
			toggleLabel.append(toggleInput, toggleText);

			topRow.append(titleWrap, toggleLabel);

			const slotSection = document.createElement('div');
			slotSection.className = 'mt-4 grid gap-3';

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
					'rounded-xl border border-[color:var(--primary-container)] bg-[color:var(--primary-soft)] px-3 py-1.5 text-xs font-semibold text-[color:var(--primary)] transition hover:bg-[color:var(--primary-soft-hover)] disabled:cursor-not-allowed disabled:opacity-60';
				addButton.textContent = '+ Agregar turno';
				addWrap.appendChild(addButton);
				slotSection.appendChild(addWrap);
			}

			article.append(topRow, slotSection);
			this.plannerNode.appendChild(article);

			this.dayNodes.set(dayState.day_of_week, {
				summaryNode: summary,
				toggleInput,
				slotSection,
				slotsContainer,
				addButton,
			});

			this.renderDayState(dayState.day_of_week);
		}
	}

	renderDayState(dayOfWeek: number) {
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

	renderSlots(dayState: DayState, container: HTMLElement) {
		this.clearNode(container);

		for (let index = 0; index < dayState.slots.length; index += 1) {
			const slot = dayState.slots[index];
			const row = document.createElement('div');
			row.className = 'grid gap-2 lg:grid-cols-[minmax(0,1fr)_9rem_9rem_auto] lg:items-end';
			row.dataset.slotRow = 'true';

			const locationLabel = document.createElement('label');
			locationLabel.className = 'grid gap-1 text-xs font-semibold text-[color:var(--on-surface-variant)]';
			locationLabel.append('Sucursal');

			const locationSelect = document.createElement('select');
			locationSelect.dataset.slotLocation = 'true';
			locationSelect.dataset.dayOfWeek = String(dayState.day_of_week);
			locationSelect.dataset.slotUid = slot.uid;
			locationSelect.className =
				'rounded-xl border border-[color:var(--shell-border)] bg-[color:var(--card-surface)] px-3 py-2.5 text-sm font-semibold text-[color:var(--on-surface)] outline-none transition focus:border-[color:var(--primary)] disabled:cursor-not-allowed disabled:opacity-60';
			locationSelect.appendChild(this.createOption('', 'Selecciona sucursal'));
			for (const location of this.locations) {
				locationSelect.appendChild(
					this.createOption(String(location.id_location), String(location.name || ''))
				);
			}
			locationSelect.value = slot.loc_id_location || '';
			locationLabel.appendChild(locationSelect);

			const startLabel = document.createElement('label');
			startLabel.className = 'grid gap-1 text-xs font-semibold text-[color:var(--on-surface-variant)]';
			startLabel.append('Inicio');

			const startInput = document.createElement('input');
			startInput.type = 'time';
			startInput.value = slot.start_time;
			startInput.dataset.slotStart = 'true';
			startInput.dataset.dayOfWeek = String(dayState.day_of_week);
			startInput.dataset.slotUid = slot.uid;
			startInput.className =
				'rounded-xl border border-[color:var(--shell-border)] bg-[color:var(--card-surface)] px-3 py-2.5 text-sm font-semibold text-[color:var(--on-surface)] outline-none transition focus:border-[color:var(--primary)] disabled:cursor-not-allowed disabled:opacity-60';
			startLabel.appendChild(startInput);

			const endLabel = document.createElement('label');
			endLabel.className = 'grid gap-1 text-xs font-semibold text-[color:var(--on-surface-variant)]';
			endLabel.append('Fin');

			const endInput = document.createElement('input');
			endInput.type = 'time';
			endInput.value = slot.end_time;
			endInput.dataset.slotEnd = 'true';
			endInput.dataset.dayOfWeek = String(dayState.day_of_week);
			endInput.dataset.slotUid = slot.uid;
			endInput.className =
				'rounded-xl border border-[color:var(--shell-border)] bg-[color:var(--card-surface)] px-3 py-2.5 text-sm font-semibold text-[color:var(--on-surface)] outline-none transition focus:border-[color:var(--primary)] disabled:cursor-not-allowed disabled:opacity-60';
			endLabel.appendChild(endInput);

			const removeWrap = document.createElement('div');
			removeWrap.className = 'flex justify-end lg:justify-start';

			const removeButton = document.createElement('button');
			removeButton.type = 'button';
			removeButton.dataset.slotRemove = 'true';
			removeButton.dataset.dayOfWeek = String(dayState.day_of_week);
			removeButton.dataset.slotUid = slot.uid;
			removeButton.className =
				'rounded-xl border border-[color:var(--shell-border)] px-3 py-2 text-xs font-semibold text-[color:var(--on-surface-variant)] transition hover:bg-[color:var(--control-surface)] disabled:cursor-not-allowed disabled:opacity-50';
			removeButton.setAttribute('aria-label', `Eliminar turno ${index + 1} de ${dayState.name}`);
			removeButton.textContent = 'Quitar';
			removeWrap.appendChild(removeButton);

			row.append(locationLabel, startLabel, endLabel, removeWrap);
			container.appendChild(row);
		}
	}

	updatePlannerInteractivity() {
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

	updateControlsState() {
		if (!this.professionalSelect) return;
		const blocked = this.isMetaLoading || this.isScheduleLoading || this.isSaving || !this.canEdit;

		if (this.saveButton) {
			this.saveButton.disabled = blocked || this.selectedProfessionalId <= 0;
		}
		this.professionalSelect.disabled = blocked || this.professionals.length === 0;

		if (this.saveLabel) {
			this.saveLabel.textContent = this.isSaving
				? 'Guardando...'
				: this.isDirty
					? 'Guardar cambios'
					: 'Guardar horarios';
		}

		if (this.loadingNode) {
			const showLoading = this.isMetaLoading || this.isScheduleLoading;
			this.loadingNode.classList.toggle('hidden', !showLoading);
			this.loadingNode.textContent = this.isMetaLoading
				? 'Cargando configuracion de horarios...'
				: 'Cargando agenda del profesional...';
		}

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

	clearMessages() {
		if (!this.errorNode) return;
		this.errorNode.textContent = '';
		this.errorNode.classList.add('hidden');
	}

	showError(message: string) {
		if (!this.errorNode) return;
		this.errorNode.textContent = message;
		this.errorNode.classList.remove('hidden');
	}

	setDirty(value: boolean) {
		this.isDirty = value;
		this.updateControlsState();
	}

	normalizeTime(value: unknown) {
		const text = String(value || '').trim();
		const match = text.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
		return match ? `${match[1]}:${match[2]}` : '';
	}

	toMinutes(timeValue: string) {
		const [hours, minutes] = timeValue.split(':').map((part) => Number(part));
		return hours * 60 + minutes;
	}

	makeSlotUid() {
		this.slotCounter += 1;
		return `slot-${Date.now()}-${this.slotCounter}`;
	}

	getDefaultLocationId() {
		return this.locations.length > 0 ? String(this.locations[0].id_location) : '';
	}

	createDefaultSlot(): SlotDraft {
		return {
			uid: this.makeSlotUid(),
			loc_id_location: this.getDefaultLocationId(),
			start_time: '08:00',
			end_time: '12:00',
		};
	}

	buildEmptyDayStates() {
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

	findDayState(dayOfWeek: number) {
		return this.dayStates.find((day) => day.day_of_week === dayOfWeek) || null;
	}

	findSlot(dayOfWeek: number, slotUid: string) {
		const dayState = this.findDayState(dayOfWeek);
		if (!dayState) return null;
		return dayState.slots.find((slot) => slot.uid === slotUid) || null;
	}

	applySchedule(scheduleItems: ScheduleItem[]) {
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

	async parseJson(response: Response) {
		try {
			return await response.json();
		} catch {
			throw new Error('No fue posible interpretar la respuesta del servidor.');
		}
	}

	async confirmDiscardChanges() {
		const message = 'Tienes cambios sin guardar. Deseas descartarlos y continuar?';
		const alertApi = (window as Window & { BookmateAlert?: { confirm?: (config: Record<string, unknown>) => Promise<boolean> } })
			.BookmateAlert;
		if (alertApi?.confirm) {
			return alertApi.confirm({
				type: 'warning',
				title: 'Cambios sin guardar',
				message,
				confirmText: 'Descartar',
				cancelText: 'Cancelar',
			});
		}
		return window.confirm(message);
	}

	async loadScheduleByProfessional(professionalId: number) {
		this.isScheduleLoading = true;
		this.updateControlsState();
		this.clearMessages();

		try {
			const response = await fetch(`/api/schedules/${professionalId}`, {
				method: 'GET',
				headers: { Accept: 'application/json' },
			});
			const data = await this.parseJson(response);

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

	validateAndBuildPayload() {
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

	async saveSchedule() {
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

		try {
			const response = await fetch(`/api/schedules/${this.selectedProfessionalId}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
				},
				body: JSON.stringify({ schedules: result.payload }),
			});
			const data = await this.parseJson(response);

			if (!response.ok || !data || data.status !== 'success') {
				throw new Error(this.toBackendErrorMessage(data, 'No fue posible guardar los horarios.'));
			}

			const successMessage =
				typeof data.message === 'string' && data.message.trim()
					? data.message
					: 'Horarios guardados correctamente.';
			this.setDirty(false);
			this.navigateWithFlash(successMessage, 'success');
		} catch (error) {
			this.showError(error instanceof Error ? error.message : 'No fue posible guardar los horarios.');
		} finally {
			this.isSaving = false;
			this.updateControlsState();
		}
	}

	async loadMeta() {
		this.isMetaLoading = true;
		this.updateControlsState();

		try {
			const response = await fetch('/api/schedules/meta', {
				method: 'GET',
				headers: { Accept: 'application/json' },
			});
			const data = await this.parseJson(response);

			if (!response.ok || !data || data.status !== 'success' || !data.data) {
				throw new Error(this.toBackendErrorMessage(data, 'No fue posible obtener catalogos de horarios.'));
			}

			this.professionals = Array.isArray(data.data.professionals) ? data.data.professionals : [];
			this.locations = Array.isArray(data.data.locations) ? data.data.locations : [];
			this.days = Array.isArray(data.data.days) ? data.data.days : [];

			this.dayStates = this.buildEmptyDayStates();
			this.renderProfessionalOptions();

			if (this.professionals.length === 0) {
				this.selectedProfessionalId = 0;
				this.renderPlanner();
				this.showError('No hay profesionales disponibles para configurar horarios.');
				return;
			}

			this.selectedProfessionalId = Number(this.professionals[0]?.id_professional || 0);
			if (this.professionalSelect) {
				this.professionalSelect.value = String(this.selectedProfessionalId);
			}
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
		}
	}
}

if (!customElements.get('schedule-manager')) {
	customElements.define('schedule-manager', ScheduleManager);
}
