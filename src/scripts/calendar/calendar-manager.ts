import {
	Calendar,
	type DateSelectArg,
	type EventApi,
	type EventDropArg,
	type EventInput,
} from '@fullcalendar/core';
import esLocale from '@fullcalendar/core/locales/es';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { type EventResizeDoneArg } from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import timeGridPlugin from '@fullcalendar/timegrid';
import { navigate } from 'astro:transitions/client';
import { ROLES } from '../../config/roles';
import { AppointmentsClient } from './appointments-client';
import {
	isAttendanceAwaitingReconfirmation,
	isAttendanceDeclined,
	isAttendanceReconfirmed,
} from '../../lib/attendance';
import type { AppointmentModalConfig, OpenCreateContext } from './appointment-modal';
import {
	destroySearchableSelect,
	ensureSearchableSelect,
	setSearchableSelectDisabled,
	setSearchableSelectValue,
	syncSearchableSelect,
} from '../searchable-select';
import { maybeShowCalendarTour, showCalendarTour } from '../../lib/calendar-tour';
import {
	APPOINTMENT_AI_DRAFT_STORAGE_KEY,
	type StoredAppointmentAiDraft,
} from '../../lib/appointment-ai-types';
import { showFlashMessage } from '../../lib/flash';
import {
	getScheduleMisalignedBannerAction,
	getScheduleMisalignedBannerCaption,
	getScheduleMisalignedBannerReasonLabel,
	getScheduleMisalignedBannerTitle,
	getScheduleMisalignedConfirmMessage,
	getScheduleMisalignedConfirmTitle,
	isScheduleMisalignedConflictError,
	isScheduleMisalignedFlag,
	normalizeScheduleMisalignedReason,
} from '../../lib/schedule-misaligned';
import type { AppointmentFormPayload, Option, ProfessionalOption } from './types';
import {
	ApiClientError,
	formatDateTimeLocal,
	isAppointmentStatus,
	showErrorAlert,
	toInt,
	toIsoWithOffset,
	toPositiveInt,
} from './utils';

type RequiredNodes = {
	calendarEl: HTMLElement;
	loadingNode: HTMLElement | null;
	pageErrorNode: HTMLElement | null;
	openModalButton: HTMLButtonElement;
	professionalFilterWrap: HTMLElement | null;
	professionalFilter: HTMLSelectElement;
	locationFilter: HTMLSelectElement;
	appointmentModal: AppointmentModalApi;
};

type AppointmentModalApi = {
	setClient: (client: AppointmentsClient) => void;
	configure: (config: AppointmentModalConfig) => void;
	openCreate: (context?: OpenCreateContext) => void;
	openCreateWithAiDraft: (draft: import('../../lib/appointment-ai-types').AppointmentAiDraft, context?: OpenCreateContext) => void;
	fillFormFromAiDraft: (draft: import('../../lib/appointment-ai-types').AppointmentAiDraft) => void;
	openEdit: (appointmentId: number) => Promise<void> | void;
};

interface ApiCalendarEvent {
	id?: string | number;
	extendedProps?: Record<string, unknown> & {
		pro_id_professional?: string | number;
		source?: string;
		description?: string;
	};
	resourceId?: string | number;
	[key: string]: unknown;
}

const DESKTOP_DEFAULT_VIEW = 'timeGridWeek';
const MOBILE_DEFAULT_VIEW = 'timeGridThreeDay';
const MOBILE_ALLOWED_VIEWS = new Set(['timeGridDay', 'timeGridThreeDay', 'listWeek']);
const MOBILE_SWIPE_MIN_DISTANCE_PX = 48;
const MOBILE_SWIPE_HORIZONTAL_RATIO = 1.25;

const hasAppointmentModalApi = (value: unknown): value is AppointmentModalApi => {
	if (!value || typeof value !== 'object') return false;
	const source = value as AppointmentModalApi;
	return (
		typeof source.setClient === 'function' &&
		typeof source.configure === 'function' &&
		typeof source.openCreate === 'function' &&
		typeof source.openCreateWithAiDraft === 'function' &&
		typeof source.fillFormFromAiDraft === 'function' &&
		typeof source.openEdit === 'function'
	);
};

const isGoogleEvent = (event: ApiCalendarEvent) =>
	String(event?.extendedProps?.source || '').trim().toLowerCase() === 'google';

const isScheduleMisalignedEvent = (event: ApiCalendarEvent | EventApi) =>
	isScheduleMisalignedFlag(event?.extendedProps?.schedule_misaligned);

const getEventScheduleMisalignedReason = (event: ApiCalendarEvent | EventApi) =>
	normalizeScheduleMisalignedReason(event?.extendedProps?.schedule_misaligned_reason);

const SCHEDULE_REVIEW_STORAGE_PREFIX = 'bookmate:schedule-review:';
const MISALIGNED_TITLE_PREFIX = '⚠ ';

const formatMisalignedWhenLabelCompact = (startRaw: unknown) => {
	const startText = String(startRaw || '').trim();
	if (!startText) return 'fecha por confirmar';

	const startDate = new Date(startText);
	if (Number.isNaN(startDate.getTime())) return startText;

	const datePart = new Intl.DateTimeFormat('es-ES', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
	}).format(startDate);
	const startTime = new Intl.DateTimeFormat('es-ES', {
		hour: '2-digit',
		minute: '2-digit',
	}).format(startDate);

	return `${datePart} ${startTime}`;
};

const getAppointmentStatus = (event: {
	extendedProps?: Record<string, unknown>;
	status?: unknown;
	[key: string]: unknown;
}) => {
	const fromExtended = String(event?.extendedProps?.status ?? '').trim().toUpperCase();
	if (fromExtended) return fromExtended;
	return String(event?.status ?? '').trim().toUpperCase();
};

const isImmutableAppointmentStatus = (status: string) =>
	status === 'CANCELADO' || status === 'COMPLETADO';

const isImmutableAppointmentEvent = (event: ApiCalendarEvent | EventApi) =>
	isImmutableAppointmentStatus(getAppointmentStatus(event));

const immutableAppointmentMoveMessage = (event: ApiCalendarEvent | EventApi) => {
	const status = getAppointmentStatus(event);
	if (status === 'CANCELADO') return 'Las citas canceladas no se pueden mover ni reprogramar.';
	if (status === 'COMPLETADO') return 'Las citas completadas no se pueden mover ni reprogramar.';
	return 'Esta cita no se puede mover ni reprogramar.';
};

const immutableAppointmentResizeMessage = (event: ApiCalendarEvent | EventApi) => {
	const status = getAppointmentStatus(event);
	if (status === 'CANCELADO') return 'Las citas canceladas no se pueden redimensionar.';
	if (status === 'COMPLETADO') return 'Las citas completadas no se pueden redimensionar.';
	return 'Esta cita no se puede redimensionar.';
};

const isCalendarEventLocked = (event: ApiCalendarEvent | EventApi) =>
	isGoogleEvent(event) || isImmutableAppointmentEvent(event);

class CalendarManager extends HTMLElement {
	#bound = false;
	#listeners: AbortController | null = null;
	#bindRetryTimer: number | null = null;
	#bindRetryAttempts = 0;

	private client = new AppointmentsClient();
	private calendar: Calendar | null = null;

	private roleId = 0;
	private currentProfessionalId = 0;
	private professionals: ProfessionalOption[] = [];
	private locations: Option[] = [];
	private services: Option[] = [];
	private isMobileLayout = false;
	private isGoogleConnected = false;
	private swipeTouchStart: { x: number; y: number } | null = null;
	private pendingFocusAppointmentId: number | null = null;
	private pendingFocusScrollTime: { hours: number; minutes: number } | null = null;
	private pendingFocusRetryTimer: number | null = null;
	private syncingDayHeadersOption = false;
	private stickyChromeScrollBound = false;
	private stickyChromeScrollRaf = 0;

	private calendarEl: HTMLElement | null = null;
	private calendarStageNode: HTMLElement | null = null;
	private loadingNode: HTMLElement | null = null;
	private pageErrorNode: HTMLElement | null = null;
	private openModalButton: HTMLButtonElement | null = null;
	private refreshCalendarButton: HTMLButtonElement | null = null;
	private calendarTourHelpButton: HTMLButtonElement | null = null;
	private filtersOpenButton: HTMLButtonElement | null = null;
	private filtersSheet: HTMLElement | null = null;
	private filtersSheetHome: HTMLElement | null = null;
	private helpSheet: HTMLElement | null = null;
	private filtersCountNode: HTMLElement | null = null;
	private professionalFilterWrap: HTMLElement | null = null;
	private professionalFilter: HTMLSelectElement | null = null;
	private locationFilter: HTMLSelectElement | null = null;
	private scheduleMisalignedBanner: HTMLElement | null = null;
	private appointmentModal: HTMLElement | null = null;

	connectedCallback() {
		if (this.#bound) return;
		this.isGoogleConnected = this.dataset.googleConnected === 'true';

		this.calendarEl = this.querySelector<HTMLElement>('[data-calendar-el]');
		this.calendarStageNode = this.querySelector<HTMLElement>('[data-calendar-stage]');
		this.loadingNode = this.querySelector<HTMLElement>('[data-calendar-loading]');
		this.pageErrorNode = this.querySelector<HTMLElement>('[data-calendar-error]');
		this.openModalButton = this.querySelector<HTMLButtonElement>('[data-open-appointment-modal]');
		this.refreshCalendarButton = this.querySelector<HTMLButtonElement>('[data-refresh-calendar]');
		this.calendarTourHelpButton = this.querySelector<HTMLButtonElement>('[data-calendar-tour-help]');
		this.filtersOpenButton = this.querySelector<HTMLButtonElement>('[data-calendar-filters-open]');
		this.filtersSheet = this.querySelector<HTMLElement>('[data-calendar-filters-sheet]');
		this.helpSheet = this.querySelector<HTMLElement>('[data-calendar-help-sheet]');
		this.filtersCountNode = this.querySelector<HTMLElement>('[data-calendar-filters-count]');
		this.professionalFilterWrap = this.querySelector<HTMLElement>('[data-professional-filter-wrap]');
		this.professionalFilter = this.querySelector<HTMLSelectElement>('[data-professional-filter]');
		this.locationFilter = this.querySelector<HTMLSelectElement>('[data-location-filter]');
		this.scheduleMisalignedBanner = this.querySelector<HTMLElement>(
			'[data-schedule-misaligned-banner]'
		);
		this.appointmentModal =
			this.querySelector<HTMLElement>('appointment-modal') ??
			document.querySelector<HTMLElement>('appointment-modal');

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

		ensureSearchableSelect(requiredNodes.professionalFilter, {
			placeholder: 'Buscar profesional...',
			dropdownParent: 'body',
		});
		ensureSearchableSelect(requiredNodes.locationFilter, {
			placeholder: 'Buscar sucursal...',
			dropdownParent: 'body',
		});

		requiredNodes.appointmentModal.setClient(this.client);
		requiredNodes.openModalButton.addEventListener('click', this.handleOpenCreateModal, { signal });
		this.refreshCalendarButton?.addEventListener('click', this.handleRefreshCalendar, { signal });
		this.calendarTourHelpButton?.addEventListener('click', this.handleCalendarHelpClick, { signal });
		this.filtersOpenButton?.addEventListener('click', this.openFiltersSheet, { signal });
		this.querySelectorAll<HTMLElement>('[data-calendar-filters-close]').forEach((el) => {
			el.addEventListener('click', this.closeFiltersSheet, { signal });
		});
		(this.filtersSheet ?? this)
			.querySelectorAll<HTMLElement>('[data-calendar-view-option]')
			.forEach((el) => {
				el.addEventListener('click', this.handleSheetViewOptionClick, { signal });
			});
		this.querySelectorAll<HTMLElement>('[data-calendar-help-close]').forEach((el) => {
			el.addEventListener('click', this.closeHelpSheet, { signal });
		});
		this.querySelector<HTMLElement>('[data-calendar-tour-start]')?.addEventListener(
			'click',
			this.handleCalendarTourStart,
			{ signal }
		);
		requiredNodes.professionalFilter.addEventListener('change', this.handleProfessionalFilterChange, {
			signal,
		});
		requiredNodes.locationFilter.addEventListener('change', this.handleLocationFilterChange, { signal });
		window.addEventListener('resize', this.handleViewportResize, { signal });
		window.addEventListener('scroll', this.handleFiltersPopoverReposition, { signal, capture: true });
		document.addEventListener('keydown', this.handleSheetKeydown, { signal });
		this.addEventListener('appointment:changed', this.handleAppointmentChanged as EventListener, {
			signal,
		});
		document.addEventListener('appointment-voice:success', this.handleAppointmentVoiceSuccess as EventListener, {
			signal,
		});

		this.syncFiltersSheetMode();
		this.syncFiltersTrigger();
		void this.bootstrap();
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
		this.setSheetOpen(this.filtersSheet, false);
		this.restoreFiltersSheetHome();
		document.body.style.overflow = '';
		destroySearchableSelect(this.professionalFilter);
		destroySearchableSelect(this.locationFilter);
		this.destroyCalendar();
	}

	private getRequiredNodes(): RequiredNodes | null {
		if (!this.calendarEl || !this.openModalButton || !this.professionalFilter || !this.locationFilter) {
			return null;
		}
		if (!hasAppointmentModalApi(this.appointmentModal)) {
			return null;
		}

		return {
			calendarEl: this.calendarEl,
			loadingNode: this.loadingNode,
			pageErrorNode: this.pageErrorNode,
			openModalButton: this.openModalButton,
			professionalFilterWrap: this.professionalFilterWrap,
			professionalFilter: this.professionalFilter,
			locationFilter: this.locationFilter,
			appointmentModal: this.appointmentModal,
		};
	}

	private scheduleBindRetry() {
		if (!this.isConnected) return;
		this.#bindRetryAttempts += 1;
		if (this.#bindRetryAttempts > 10) {
			console.error('[calendar-manager] required DOM nodes were not found during initialization.');
			return;
		}
		if (this.#bindRetryTimer) {
			window.clearTimeout(this.#bindRetryTimer);
		}
		void customElements.whenDefined('appointment-modal').then(() => {
			if (!this.isConnected || this.#bound) return;
			this.connectedCallback();
		});
		this.#bindRetryTimer = window.setTimeout(() => {
			this.connectedCallback();
		}, 50);
	}

	private clearPageError() {
		if (!this.pageErrorNode) return;
		this.pageErrorNode.textContent = '';
		this.pageErrorNode.classList.add('hidden');
	}

	private showPageError(message: string) {
		if (!this.pageErrorNode) return;
		this.pageErrorNode.textContent = message;
		this.pageErrorNode.classList.remove('hidden');
	}

	private setCalendarLoading(value: boolean) {
		this.calendarStageNode?.classList.toggle('is-loading', value);
		if (this.loadingNode) {
			this.loadingNode.classList.toggle('hidden', !value);
			this.loadingNode.setAttribute('aria-hidden', value ? 'false' : 'true');
		}
		setSearchableSelectDisabled(this.professionalFilter, value || this.roleId === ROLES.PROFESIONAL);
		setSearchableSelectDisabled(this.locationFilter, value);
		if (this.openModalButton) this.openModalButton.disabled = value;
		if (this.refreshCalendarButton) this.refreshCalendarButton.disabled = value;
	}

	private renderOptions(
		select: HTMLSelectElement,
		items: Option[],
		emptyLabel: string,
		includeAllOption = false
	) {
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
		syncSearchableSelect(select);
	}

	private destroyCalendar() {
		this.clearPendingFocusState();
		this.teardownMobileStickyChrome();
		if (this.calendar) {
			this.calendar.destroy();
			this.calendar = null;
		}
	}

	private clearPendingFocusRetry() {
		if (this.pendingFocusRetryTimer) {
			window.clearTimeout(this.pendingFocusRetryTimer);
			this.pendingFocusRetryTimer = null;
		}
	}

	private clearPendingFocusState() {
		this.clearPendingFocusRetry();
		this.pendingFocusAppointmentId = null;
		this.pendingFocusScrollTime = null;
	}

	private getFocusTargetViewType(currentViewType: string) {
		if (currentViewType.startsWith('list')) return 'listWeek';
		return this.isMobileLayout ? 'timeGridThreeDay' : 'timeGridWeek';
	}

	private isTimeGridView(viewType: string) {
		return viewType.includes('timeGrid');
	}

	private schedulePendingFocusRetry(attempt: number) {
		this.clearPendingFocusRetry();
		if (this.pendingFocusAppointmentId === null) return;
		if (attempt >= 20) {
			this.clearPendingFocusState();
			return;
		}

		this.pendingFocusRetryTimer = window.setTimeout(() => {
			void this.applyPendingFocus(attempt + 1);
		}, 120);
	}

	private getPendingFocusEvent(): EventApi | null {
		if (!this.calendar || this.pendingFocusAppointmentId === null) return null;

		const eventId = String(this.pendingFocusAppointmentId);
		const byId = this.calendar.getEventById(eventId);
		if (byId) return byId;

		return (
			this.calendar
				.getEvents()
				.find((item) => toPositiveInt(item.id, 0) === this.pendingFocusAppointmentId) ?? null
		);
	}

	private scrollScrollableAncestorsToElement(element: HTMLElement) {
		let parent = element.parentElement;
		while (parent && parent !== document.documentElement) {
			const style = window.getComputedStyle(parent);
			const scrollableY =
				(style.overflowY === 'auto' ||
					style.overflowY === 'scroll' ||
					style.overflowY === 'overlay') &&
				parent.scrollHeight > parent.clientHeight + 2;

			if (scrollableY) {
				const parentRect = parent.getBoundingClientRect();
				const elementRect = element.getBoundingClientRect();
				const delta =
					elementRect.top -
					parentRect.top -
					parentRect.height / 2 +
					elementRect.height / 2;
				parent.scrollBy({ top: delta, behavior: 'smooth' });
			}

			parent = parent.parentElement;
		}
	}

	private scrollEventIntoView(event: EventApi) {
		const element = event.el;
		if (!(element instanceof HTMLElement)) return false;

		const scroller =
			(element.closest('.fc-timegrid-body .fc-scroller') as HTMLElement | null) ??
			(element.closest('.fc-scroller') as HTMLElement | null);

		if (scroller) {
			const scrollerRect = scroller.getBoundingClientRect();
			const elementRect = element.getBoundingClientRect();
			const delta =
				elementRect.top - scrollerRect.top - scrollerRect.height / 2 + elementRect.height / 2;
			scroller.scrollBy({ top: delta, behavior: 'smooth' });
		}

		element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
		this.scrollScrollableAncestorsToElement(element);
		return true;
	}

	private applyPendingFocusScrollTime() {
		if (!this.calendar || !this.pendingFocusScrollTime) return;
		if (!this.isTimeGridView(this.calendar.view.type)) return;

		// Con height: 'auto' scrollToTime suele quedar corto; el scroll real va al elemento del evento.
		this.calendar.scrollToTime({
			hours: this.pendingFocusScrollTime.hours,
			minutes: this.pendingFocusScrollTime.minutes,
		});
	}

	private highlightFocusedEvent(event: EventApi) {
		event.setProp('borderColor', '#d97706');
		if (event.el instanceof HTMLElement) {
			event.el.classList.add('fc-event-focus-highlight');
			window.setTimeout(() => {
				event.el?.classList.remove('fc-event-focus-highlight');
			}, 2400);
		}
	}

	private completePendingFocusForEvent(event: EventApi) {
		if (this.pendingFocusAppointmentId === null) return;
		if (toPositiveInt(event.id, 0) !== this.pendingFocusAppointmentId) return;

		const run = () => {
			const freshEvent = this.getPendingFocusEvent();
			const target = freshEvent?.el ? freshEvent : event;
			if (!(target.el instanceof HTMLElement)) {
				this.schedulePendingFocusRetry(0);
				return;
			}

			if (this.calendar && this.isTimeGridView(this.calendar.view.type)) {
				this.applyPendingFocusScrollTime();
			}

			this.scrollEventIntoView(target);
			this.highlightFocusedEvent(target);
			this.clearPendingFocusState();
		};

		window.requestAnimationFrame(() => {
			window.requestAnimationFrame(() => {
				window.setTimeout(run, 60);
			});
		});
	}

	private tryCompletePendingFocus(event: EventApi) {
		this.completePendingFocusForEvent(event);
	}

	private applyPendingFocus(attempt = 0) {
		if (!this.calendar || this.pendingFocusAppointmentId === null) return;

		const targetEvent = this.getPendingFocusEvent();
		if (!targetEvent?.start) {
			this.schedulePendingFocusRetry(attempt);
			return;
		}

		const viewType = this.calendar.view.type;

		if (viewType.startsWith('list')) {
			if (targetEvent.el) {
				this.completePendingFocusForEvent(targetEvent);
				return;
			}
			this.schedulePendingFocusRetry(attempt);
			return;
		}

		if (this.isTimeGridView(viewType)) {
			if (targetEvent.el) {
				this.completePendingFocusForEvent(targetEvent);
				return;
			}
			this.schedulePendingFocusRetry(attempt);
			return;
		}

		this.schedulePendingFocusRetry(attempt);
	}

	private isMobileViewport() {
		return window.innerWidth < 768;
	}

	private getHeaderToolbar(isMobile: boolean) {
		return isMobile
			? {
					// Vistas viven en el sheet Agenda; toolbar = mes/año + nav + filtros.
					left: 'title prev,goToday,next',
					center: '',
					right: '',
				}
			: {
					left: 'prev,next goToday',
					center: 'title',
					right: 'timeGridDay,timeGridWeek,dayGridMonth,listWeek',
				};
	}

	private getMobileTitleFormat() {
		return {
			year: 'numeric' as const,
			month: 'short' as const,
		};
	}

	private getCalendarHeightOption(isMobile?: boolean) {
		// Mobile: altura natural → scroll del main (no se corta con el bottom bar).
		// Desktop: host fijo → scroll interno del timegrid (headers sticky).
		return (isMobile ?? this.isMobileViewport()) ? 'auto' : '100%';
	}

	/** Mobile timegrid: sin cabecera FC (la reemplaza el chrome sticky). */
	private shouldHideNativeDayHeaders(isMobile?: boolean, viewType?: string) {
		const mobile = isMobile ?? this.isMobileViewport();
		const view = viewType ?? this.calendar?.view.type ?? '';
		return mobile && this.isTimeGridView(view);
	}

	private syncMobileDayHeadersOption() {
		if (!this.calendar || this.syncingDayHeadersOption) return;
		const next = !this.shouldHideNativeDayHeaders();
		if (this.calendar.getOption('dayHeaders') === next) return;
		this.syncingDayHeadersOption = true;
		try {
			this.calendar.setOption('dayHeaders', next);
		} finally {
			this.syncingDayHeadersOption = false;
		}
	}

	private teardownMobileStickyChrome() {
		if (!this.calendarEl) return;
		this.calendarEl.querySelector<HTMLElement>('[data-calendar-sticky-chrome]')?.remove();
	}

	private resolveCalendarScrollRoots(): HTMLElement[] {
		const roots = [
			this.querySelector<HTMLElement>('[data-calendar-main]'),
			document.querySelector<HTMLElement>('[data-calendar-main]'),
			document.querySelector<HTMLElement>('.app-shell > :last-child > main'),
			document.querySelector<HTMLElement>('.app-shell > :last-child'),
		];
		const unique: HTMLElement[] = [];
		for (const root of roots) {
			if (root && !unique.includes(root)) unique.push(root);
		}
		return unique;
	}

	private ensureStickyChromeScrollBinding() {
		if (this.stickyChromeScrollBound || !this.#listeners) return;
		this.stickyChromeScrollBound = true;
		const signal = this.#listeners.signal;

		const onScroll = () => {
			if (this.stickyChromeScrollRaf) return;
			this.stickyChromeScrollRaf = window.requestAnimationFrame(() => {
				this.stickyChromeScrollRaf = 0;
				this.syncStickyChromeScrollState();
			});
		};

		for (const root of this.resolveCalendarScrollRoots()) {
			root.addEventListener('scroll', onScroll, { signal, passive: true });
		}
		window.addEventListener('scroll', onScroll, { signal, passive: true });

		signal.addEventListener('abort', () => {
			this.stickyChromeScrollBound = false;
			if (this.stickyChromeScrollRaf) {
				window.cancelAnimationFrame(this.stickyChromeScrollRaf);
				this.stickyChromeScrollRaf = 0;
			}
		});
	}

	private syncStickyChromeScrollState() {
		const chrome = this.calendarEl?.querySelector<HTMLElement>('[data-calendar-sticky-chrome]');
		if (!chrome) return;
		const stickyTop = Number.parseFloat(window.getComputedStyle(chrome).top) || 0;
		const pinned = chrome.getBoundingClientRect().top <= stickyTop + 1;
		chrome.classList.toggle('is-scrolled', pinned);
	}

	private buildStickyDayCellHtml(date: Date) {
		const dayName = new Intl.DateTimeFormat('es-ES', { weekday: 'short' })
			.format(date)
			.replace('.', '');
		const dayNumber = date.getDate();
		const today = new Date();
		const isToday =
			date.getFullYear() === today.getFullYear() &&
			date.getMonth() === today.getMonth() &&
			date.getDate() === today.getDate();
		return `
			<div class="calendar-sticky-days__cell${isToday ? ' is-today' : ''}">
				<div class="custom-cal-header">
					<span class="cal-day-name">${dayName}</span>
					<span class="cal-day-number">${dayNumber}</span>
				</div>
			</div>
		`;
	}

	private syncStickyDayStrip(chrome: HTMLElement) {
		if (!this.calendar) return;
		let strip = chrome.querySelector<HTMLElement>('[data-calendar-sticky-days]');
		if (!strip) {
			strip = document.createElement('div');
			strip.className = 'calendar-sticky-days';
			strip.setAttribute('data-calendar-sticky-days', '');
			strip.setAttribute('aria-hidden', 'true');
			chrome.appendChild(strip);
		}

		const { activeStart, activeEnd } = this.calendar.view;
		const days: Date[] = [];
		const cursor = new Date(activeStart);
		while (cursor < activeEnd) {
			days.push(new Date(cursor));
			cursor.setDate(cursor.getDate() + 1);
		}

		strip.style.setProperty('--calendar-sticky-day-count', String(Math.max(days.length, 1)));
		strip.innerHTML = `
			<div class="calendar-sticky-days__axis"></div>
			<div class="calendar-sticky-days__cols">
				${days.map((day) => this.buildStickyDayCellHtml(day)).join('')}
			</div>
		`;
	}

	private syncMobileStickyChrome() {
		if (!this.calendarEl || !this.calendar) return;

		const useSticky = this.shouldHideNativeDayHeaders();
		if (!useSticky) {
			this.teardownMobileStickyChrome();
			return;
		}

		let chrome = this.calendarEl.querySelector<HTMLElement>('[data-calendar-sticky-chrome]');
		const harness = this.calendarEl.querySelector<HTMLElement>('.fc-view-harness');
		if (!harness) return;

		if (!chrome) {
			chrome = document.createElement('div');
			chrome.className = 'calendar-sticky-chrome';
			chrome.setAttribute('data-calendar-sticky-chrome', '');
			harness.before(chrome);
		} else if (chrome.nextElementSibling !== harness) {
			harness.before(chrome);
		}

		// El toolbar (mes / Día·3 días·Lista) scrollea; solo la franja de días queda sticky.
		const trappedToolbar = chrome.querySelector<HTMLElement>('.fc-header-toolbar');
		if (trappedToolbar) {
			chrome.before(trappedToolbar);
		}

		this.syncStickyDayStrip(chrome);
		this.ensureStickyChromeScrollBinding();
		this.syncStickyChromeScrollState();
	}

	private isCompactChromeViewport() {
		return window.innerWidth < 640;
	}

	private isDesktopFiltersPopover() {
		return window.matchMedia('(min-width: 768px)').matches;
	}

	private getFiltersPanel() {
		return this.filtersSheet?.querySelector<HTMLElement>('.calendar-filters-sheet__panel') ?? null;
	}

	private clearFiltersPopoverStyles() {
		const panel = this.getFiltersPanel();
		if (!panel) return;
		panel.style.top = '';
		panel.style.left = '';
		panel.style.right = '';
		panel.style.bottom = '';
		panel.style.width = '';
		panel.style.maxWidth = '';
	}

	private positionFiltersPopover() {
		if (!this.filtersSheet || !this.filtersOpenButton) return;
		const panel = this.getFiltersPanel();
		if (!panel) return;

		const buttonRect = this.filtersOpenButton.getBoundingClientRect();
		const gap = 8;
		const width = Math.min(18.5 * 16, window.innerWidth - 24);
		const spaceRight = window.innerWidth - buttonRect.left - 12;
		const spaceLeft = buttonRect.right - 12;

		// Preferir abrir hacia la derecha del botón (no tapar el sidebar).
		let left =
			spaceRight >= width || spaceRight >= spaceLeft
				? buttonRect.left
				: buttonRect.right - width;
		left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
		const top = buttonRect.bottom + gap;

		panel.style.width = `${width}px`;
		panel.style.maxWidth = `${width}px`;
		panel.style.right = 'auto';
		panel.style.bottom = 'auto';
		panel.style.left = `${left}px`;
		panel.style.top = `${top}px`;

		requestAnimationFrame(() => {
			const panelRect = panel.getBoundingClientRect();
			const overflowBottom = panelRect.bottom - window.innerHeight + 12;
			if (overflowBottom <= 0) return;
			const aboveTop = buttonRect.top - gap - panelRect.height;
			if (aboveTop >= 12) {
				panel.style.top = `${aboveTop}px`;
			} else {
				panel.style.top = `${Math.max(12, top - overflowBottom)}px`;
			}
		});
	}

	private mountFiltersSheetToBody() {
		if (!this.filtersSheet) return;
		if (!this.filtersSheetHome) {
			this.filtersSheetHome = this.filtersSheet.parentElement;
		}
		if (this.filtersSheet.parentElement !== document.body) {
			document.body.appendChild(this.filtersSheet);
		}
	}

	private restoreFiltersSheetHome() {
		if (!this.filtersSheet || !this.filtersSheetHome) return;
		if (this.filtersSheet.parentElement !== this.filtersSheetHome) {
			this.filtersSheetHome.appendChild(this.filtersSheet);
		}
	}

	private setSheetOpen(sheet: HTMLElement | null, open: boolean) {
		if (!sheet) return;
		if (sheet === this.filtersSheet) {
			if (open) {
				this.mountFiltersSheetToBody();
				if (this.isDesktopFiltersPopover()) {
					this.filtersSheet.classList.add('is-desktop-popover');
					this.positionFiltersPopover();
				} else {
					this.filtersSheet.classList.remove('is-desktop-popover');
					this.clearFiltersPopoverStyles();
				}
			} else {
				this.restoreFiltersSheetHome();
				this.filtersSheet.classList.remove('is-desktop-popover');
				this.clearFiltersPopoverStyles();
			}
			this.filtersOpenButton?.setAttribute('aria-expanded', open ? 'true' : 'false');
		}
		sheet.classList.toggle('is-open', open);
		sheet.setAttribute('aria-hidden', open ? 'false' : 'true');
		const helpOpen = Boolean(this.helpSheet?.classList.contains('is-open'));
		const filtersOpen = Boolean(this.filtersSheet?.classList.contains('is-open'));
		const filtersLockScroll =
			filtersOpen && !this.filtersSheet?.classList.contains('is-desktop-popover');
		document.body.style.overflow = helpOpen || filtersLockScroll ? 'hidden' : '';
	}

	private syncFiltersSheetTitle = () => {
		const title = this.filtersSheet?.querySelector<HTMLElement>('#calendar-filters-title');
		if (!title) return;
		title.textContent = this.isDesktopFiltersPopover() ? 'Filtros' : 'Agenda';
	};

	private openFiltersSheet = () => {
		this.closeHelpSheet();
		const isOpen = Boolean(this.filtersSheet?.classList.contains('is-open'));
		if (!isOpen) {
			this.syncSheetViewOptions();
			this.syncFiltersSheetTitle();
		}
		this.setSheetOpen(this.filtersSheet, !isOpen);
	};

	private closeFiltersSheet = () => {
		this.setSheetOpen(this.filtersSheet, false);
	};

	private syncSheetViewOptions = () => {
		const currentView = this.calendar?.view.type ?? '';
		const root = this.filtersSheet ?? this;
		root.querySelectorAll<HTMLElement>('[data-calendar-view-option]').forEach((option) => {
			const view = String(option.dataset.view || '').trim();
			const selected = Boolean(view) && view === currentView;
			option.classList.toggle('is-selected', selected);
			option.setAttribute('aria-selected', selected ? 'true' : 'false');
		});
	};

	private handleSheetViewOptionClick = (event: Event) => {
		const target = event.currentTarget;
		if (!(target instanceof HTMLElement)) return;
		const view = String(target.dataset.view || '').trim();
		if (!view || !this.calendar) return;
		if (!MOBILE_ALLOWED_VIEWS.has(view) && this.isMobileViewport()) return;

		if (this.calendar.view.type !== view) {
			this.calendar.changeView(view);
		}
		this.syncSheetViewOptions();
		this.closeFiltersSheet();
		window.requestAnimationFrame(() => {
			this.syncToolbarButtonGroupClasses();
			this.syncMobileDayHeadersOption();
			this.syncMobileStickyChrome();
			this.calendar?.updateSize();
		});
	};

	private openHelpSheet = () => {
		this.closeFiltersSheet();
		this.setSheetOpen(this.helpSheet, true);
	};

	private closeHelpSheet = () => {
		this.setSheetOpen(this.helpSheet, false);
	};

	private syncFiltersSheetMode() {
		// En resize: cerrar el panel para no dejar un sheet “atascado” entre mobile/desktop.
		if (this.filtersSheet?.classList.contains('is-open')) {
			this.closeFiltersSheet();
		} else if (this.filtersSheet) {
			this.filtersSheet.classList.remove('is-desktop-popover');
			this.clearFiltersPopoverStyles();
			this.filtersSheet.setAttribute('aria-hidden', 'true');
			this.filtersOpenButton?.setAttribute('aria-expanded', 'false');
		}
	}

	private syncFiltersTrigger() {
		const professionalActive =
			this.roleId !== ROLES.PROFESIONAL &&
			!(this.professionalFilterWrap?.classList.contains('hidden')) &&
			toPositiveInt(this.professionalFilter?.value, 0) > 0;
		const locationActive = toPositiveInt(this.locationFilter?.value, 0) > 0;
		const activeCount = Number(professionalActive) + Number(locationActive);
		const hasActive = activeCount > 0;

		if (this.filtersCountNode) {
			this.filtersCountNode.textContent = String(activeCount);
		}

		this.filtersOpenButton?.setAttribute('data-has-active', hasActive ? 'true' : 'false');
		this.filtersOpenButton?.classList.toggle('is-active', hasActive);

		const badge = this.querySelector<HTMLElement>('[data-calendar-filters-badge]');
		if (badge) {
			badge.classList.toggle('hidden', !hasActive);
			badge.classList.toggle('is-dot', activeCount === 1);
			badge.textContent = activeCount > 1 ? String(activeCount) : '';
			badge.setAttribute('aria-hidden', hasActive ? 'false' : 'true');
		}

		const mobile = this.isMobileViewport();
		const label = mobile
			? hasActive
				? `Vistas y filtros, ${activeCount} activo${activeCount === 1 ? '' : 's'}`
				: 'Vistas y filtros del calendario'
			: hasActive
				? `Filtros del calendario, ${activeCount} activo${activeCount === 1 ? '' : 's'}`
				: 'Filtros del calendario';
		this.filtersOpenButton?.setAttribute('aria-label', label);
	}

	private handleCalendarHelpClick = () => {
		this.openHelpSheet();
	};

	private handleCalendarTourStart = () => {
		this.closeHelpSheet();
		showCalendarTour({ force: true });
	};

	private handleSheetKeydown = (event: KeyboardEvent) => {
		if (event.key !== 'Escape') return;
		if (this.helpSheet?.classList.contains('is-open')) {
			this.closeHelpSheet();
			return;
		}
		if (this.filtersSheet?.classList.contains('is-open')) {
			this.closeFiltersSheet();
		}
	};

	private handleGoToday = () => {
		if (!this.calendar) return;
		this.calendar.today();
		window.requestAnimationFrame(() => {
			this.scrollCalendarToNow();
		});
	};

	private scrollCalendarToNow() {
		if (!this.calendar || !this.calendarEl) return;
		if (!this.isTimeGridView(this.calendar.view.type)) return;

		const now = new Date();
		this.calendar.scrollToTime({
			hours: now.getHours(),
			minutes: Math.max(0, now.getMinutes() - 20),
		});

		const indicator =
			this.calendarEl.querySelector<HTMLElement>('.fc-timegrid-now-indicator-line') ??
			this.calendarEl.querySelector<HTMLElement>('.fc-timegrid-now-indicator-arrow');
		if (!indicator) return;

		window.setTimeout(() => {
			indicator.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
		}, 40);
	}

	private applyResponsiveCalendarLayout(force = false) {
		if (!this.calendar) return;

		const isMobile = this.isMobileViewport();
		if (!force && this.isMobileLayout === isMobile) {
			this.calendar.updateSize();
			return;
		}

		this.isMobileLayout = isMobile;
		this.calendar.setOption('headerToolbar', this.getHeaderToolbar(isMobile));
		this.calendar.setOption('height', this.getCalendarHeightOption(isMobile));
		this.calendar.setOption(
			'titleFormat',
			isMobile
				? this.getMobileTitleFormat()
				: {
						year: 'numeric',
						month: 'long',
					}
		);
		this.syncFiltersSheetMode();

		if (isMobile) {
			const currentView = this.calendar.view.type;
			if (!MOBILE_ALLOWED_VIEWS.has(currentView)) {
				this.calendar.changeView(MOBILE_DEFAULT_VIEW);
			}
		} else if (this.calendar.view.type === 'timeGridThreeDay') {
			this.calendar.changeView(DESKTOP_DEFAULT_VIEW);
		}

		this.calendar.updateSize();
		window.requestAnimationFrame(() => {
			this.syncToolbarButtonGroupClasses();
			this.syncSheetViewOptions();
			this.syncMobileDayHeadersOption();
			this.syncMobileStickyChrome();
		});
	}

	private syncToolbarButtonGroupClasses() {
		if (!this.calendarEl) return;
		const toolbar = this.calendarEl.querySelector<HTMLElement>('.fc-header-toolbar');
		if (!toolbar) return;

		const chunks = Array.from(toolbar.querySelectorAll<HTMLElement>('.fc-toolbar-chunk'));
		for (const chunk of chunks) {
			chunk.classList.remove('fc-toolbar-chunk--view-switch');
			chunk.classList.remove('fc-toolbar-chunk--time-nav');
			chunk.removeAttribute('data-calendar-nav');
			chunk.removeAttribute('data-calendar-view-switch');
			chunk.removeAttribute('data-calendar-title');
			for (const group of chunk.querySelectorAll<HTMLElement>('.fc-button-group')) {
				group.classList.remove('fc-button-group--segmented');
			}
		}

		const timeNavChunk =
			chunks.find(
				(chunk) =>
					chunk.querySelector('.fc-prev-button, .fc-next-button, .fc-goToday-button, .fc-today-button') &&
					!chunk.querySelector(
						'.fc-timeGridDay-button, .fc-timeGridThreeDay-button, .fc-timeGridWeek-button, .fc-dayGridMonth-button, .fc-listWeek-button'
					)
			) ?? null;
		if (timeNavChunk) {
			timeNavChunk.classList.add('fc-toolbar-chunk--time-nav');
			timeNavChunk.setAttribute('data-calendar-nav', 'true');
		}

		const viewChunk =
			chunks.find((chunk) =>
				chunk.querySelector(
					'.fc-timeGridDay-button, .fc-timeGridThreeDay-button, .fc-timeGridWeek-button, .fc-dayGridMonth-button, .fc-listWeek-button'
				)
			) ?? null;
		if (viewChunk) {
			viewChunk.classList.add('fc-toolbar-chunk--view-switch');
			viewChunk.setAttribute('data-calendar-view-switch', 'true');
			for (const group of viewChunk.querySelectorAll<HTMLElement>('.fc-button-group')) {
				group.classList.add('fc-button-group--segmented');
			}
		}

		// Título: chunk propio (puede estar vacío en mobile si el h2 vive dentro de time-nav).
		const titleChunk =
			chunks.find(
				(chunk) =>
					chunk !== timeNavChunk &&
					chunk !== viewChunk &&
					(Boolean(chunk.querySelector('.fc-toolbar-title')) || chunk.childElementCount === 0)
			) ??
			chunks.find((chunk) => chunk !== timeNavChunk && chunk.querySelector('.fc-toolbar-title')) ??
			null;
		titleChunk?.setAttribute('data-calendar-title', 'true');

		this.ensureTourToolbarTargets(timeNavChunk, viewChunk);
		this.syncChromeToolbarPlacement(timeNavChunk, viewChunk, titleChunk);
		this.syncSheetViewOptions();
		this.syncMobileStickyChrome();
	}

	/** Targets compactos para la guía (evita resaltar todo el chunk del toolbar). */
	private ensureTourToolbarTargets(
		navChunk: HTMLElement | null | undefined,
		viewChunk: HTMLElement | null | undefined
	) {
		if (navChunk) {
			let navTour = navChunk.querySelector<HTMLElement>('[data-calendar-tour-nav]');
			if (!navTour) {
				navTour = document.createElement('div');
				navTour.className = 'calendar-tour-target';
				navTour.setAttribute('data-calendar-tour-nav', '');
				navChunk.insertBefore(navTour, navChunk.firstChild);
			}
			for (const child of Array.from(navChunk.children)) {
				if (child === navTour) continue;
				if (!(child instanceof HTMLElement)) continue;
				if (child.hasAttribute('data-calendar-filters-control')) continue;
				if (child.hasAttribute('data-calendar-tour-help')) continue;
				if (child.hasAttribute('data-calendar-time-nav-end')) continue;
				// En mobile el título vive fuera del tour (mes/año · flechas · filtro · guía).
				if (child.classList.contains('fc-toolbar-title')) continue;
				navTour.appendChild(child);
			}
		}

		if (viewChunk) {
			const segmented = viewChunk.querySelector<HTMLElement>('.fc-button-group--segmented');
			if (segmented) {
				let viewsTour = viewChunk.querySelector<HTMLElement>('[data-calendar-tour-views]');
				if (!viewsTour) {
					viewsTour = document.createElement('div');
					viewsTour.className = 'calendar-tour-target';
					viewsTour.setAttribute('data-calendar-tour-views', '');
					segmented.before(viewsTour);
				}
				if (segmented.parentElement !== viewsTour) {
					viewsTour.appendChild(segmented);
				}
			}
		}
	}

	/**
	 * Mobile: mes/año + flechas + filtro + guía en toolbar FC; refresh encima del FAB.
	 * Desktop: una fila — nav+filtros | título | vistas+acciones.
	 */
	private syncChromeToolbarPlacement(
		navChunk: HTMLElement | null | undefined,
		viewChunk: HTMLElement | null | undefined,
		titleChunk: HTMLElement | null | undefined = null
	) {
		const home = this.querySelector<HTMLElement>('[data-calendar-chrome-home]');
		const filters = this.querySelector<HTMLElement>('[data-calendar-filters-control]');
		const refresh = this.querySelector<HTMLElement>('[data-refresh-calendar]');
		const guide = this.querySelector<HTMLElement>('[data-calendar-tour-help]');
		const create = this.querySelector<HTMLElement>('[data-open-appointment-modal]');
		const titleEl =
			titleChunk?.querySelector<HTMLElement>('.fc-toolbar-title') ||
			navChunk?.querySelector<HTMLElement>('.fc-toolbar-title') ||
			this.calendarEl?.querySelector<HTMLElement>('.fc-toolbar-title') ||
			null;
		if (!home) return;

		const clearEmptyChromeWraps = () => {
			this.querySelectorAll('[data-calendar-chrome-actions], [data-calendar-fab-stack]').forEach((node) => {
				if (!node.childElementCount) node.remove();
			});
		};

		const unwrapFabStack = () => {
			const fabStack = this.querySelector<HTMLElement>('[data-calendar-fab-stack]');
			if (!fabStack) return;
			while (fabStack.firstChild) {
				home.appendChild(fabStack.firstChild);
			}
			fabStack.remove();
		};

		/** Mobile: mes/año · flechas · filtro · guía, todos pegados a la derecha. */
		const dockMobileChromeRow = () => {
			if (!navChunk) return;
			const navTour = navChunk.querySelector<HTMLElement>('[data-calendar-tour-nav]');

			// Sacá el título si quedó dentro del tour/flechas.
			if (titleEl && titleEl.parentElement !== navChunk) {
				navChunk.appendChild(titleEl);
			}
			if (navTour) {
				navTour.querySelectorAll('.fc-toolbar-title').forEach((node) => {
					navChunk.appendChild(node);
				});
			}

			const titleNode =
				(titleEl && navChunk.contains(titleEl) ? titleEl : null) ||
				navChunk.querySelector<HTMLElement>('.fc-toolbar-title');

			// Orden estricto: título → flechas → filtro → guía
			if (titleNode) navChunk.appendChild(titleNode);
			if (navTour) navChunk.appendChild(navTour);
			if (filters) navChunk.appendChild(filters);
			if (guide) navChunk.appendChild(guide);
		};

		const restoreTitleToChunk = () => {
			if (!titleChunk || !titleEl || titleEl.parentElement === titleChunk) return;
			titleChunk.appendChild(titleEl);
		};

		const dockFiltersToNav = () => {
			if (!navChunk || !filters) return;
			const navTour = navChunk.querySelector<HTMLElement>('[data-calendar-tour-nav]');
			if (navTour) {
				if (filters.parentElement !== navChunk || filters.nextElementSibling !== navTour) {
					navChunk.insertBefore(filters, navTour);
				}
				return;
			}
			if (filters.parentElement !== navChunk || filters !== navChunk.firstElementChild) {
				navChunk.insertBefore(filters, navChunk.firstChild);
			}
		};

		if (this.isMobileViewport()) {
			dockMobileChromeRow();
			// Refresh encima del FAB Agendar.
			let fabStack = this.querySelector<HTMLElement>('[data-calendar-fab-stack]');
			if (!fabStack) {
				fabStack = document.createElement('div');
				fabStack.className = 'calendar-fab-stack';
				fabStack.setAttribute('data-calendar-fab-stack', '');
			}
			if (fabStack.parentElement !== home) home.appendChild(fabStack);
			if (refresh && refresh.parentElement !== fabStack) fabStack.appendChild(refresh);
			if (create && create.parentElement !== fabStack) fabStack.appendChild(create);
			this.querySelectorAll('[data-calendar-chrome-actions]').forEach((node) => {
				if (!node.childElementCount) node.remove();
			});
			this.querySelector('.calendar-page-header')?.classList.add('calendar-page-header--chrome-docked');
			return;
		}

		unwrapFabStack();
		restoreTitleToChunk();
		dockFiltersToNav();

		if (viewChunk) {
			let actionsWrap = viewChunk.querySelector<HTMLElement>('[data-calendar-chrome-actions]');
			if (!actionsWrap) {
				actionsWrap = document.createElement('div');
				actionsWrap.className = 'calendar-chrome-actions';
				actionsWrap.setAttribute('data-calendar-chrome-actions', '');
				viewChunk.appendChild(actionsWrap);
			}
			if (refresh && refresh.parentElement !== actionsWrap) actionsWrap.appendChild(refresh);
			if (guide && guide.parentElement !== actionsWrap) actionsWrap.appendChild(guide);
			if (create && create.parentElement !== actionsWrap) actionsWrap.appendChild(create);
			if (actionsWrap.parentElement !== viewChunk) viewChunk.appendChild(actionsWrap);
		}

		clearEmptyChromeWraps();
		this.querySelector('.calendar-page-header')?.classList.add('calendar-page-header--chrome-docked');
	}

	private buildEventSource = (
		info: { startStr: string; endStr: string },
		successCallback: (eventInputs: EventInput[]) => void,
		failureCallback: (error: Error) => void
	) => {
		void (async () => {
			this.setCalendarLoading(true);
			this.clearPageError();

			try {
				const filterProfessionalId = toPositiveInt(this.professionalFilter?.value, 0);
				const professionalId =
					this.roleId === ROLES.PROFESIONAL && this.currentProfessionalId > 0
						? this.currentProfessionalId
						: filterProfessionalId;
				const locationId = toPositiveInt(this.locationFilter?.value, 0);
				const appointmentEvents = (await this.client.getCalendarEvents({
					start: info.startStr,
					end: info.endStr,
					pro_id: professionalId > 0 ? professionalId : undefined,
					loc_id: locationId > 0 ? locationId : undefined,
				})) as ApiCalendarEvent[];

				let googleEvents: ApiCalendarEvent[] = [];
				if (this.isGoogleConnected) {
					try {
						const googlePayload = await this.client.getGoogleCalendarEvents({
							start: info.startStr,
							end: info.endStr,
						});
						googleEvents = googlePayload.connected
							? (googlePayload.events as ApiCalendarEvent[])
							: [];
					} catch (error) {
						console.error('[calendar-manager] google events error', error);
					}
				}

				const allEvents = [...appointmentEvents, ...googleEvents];
				const normalizedEvents: EventInput[] = allEvents.map((event) => {
					const appointmentStatus = getAppointmentStatus(event);
					const locked = isCalendarEventLocked(event);
					const misaligned = isScheduleMisalignedEvent(event);
					const baseTitle = String(event?.title || '').trim();
					const displayTitle =
						misaligned && !baseTitle.startsWith(MISALIGNED_TITLE_PREFIX)
							? `${MISALIGNED_TITLE_PREFIX}${baseTitle}`
							: baseTitle;

					return {
						...event,
						id: String(event?.id ?? ''),
						title: displayTitle,
						classNames: misaligned ? ['fc-event-schedule-misaligned'] : undefined,
						extendedProps: {
							...(event?.extendedProps ?? {}),
							...(appointmentStatus ? { status: appointmentStatus } : {}),
							pro_id_professional: toPositiveInt(
								event?.extendedProps?.pro_id_professional ?? event?.resourceId,
								0
							),
						},
						...(locked
							? {
									editable: false,
									startEditable: false,
									durationEditable: false,
								}
							: {}),
					};
				});
				this.updateScheduleMisalignedBanner(appointmentEvents);
				successCallback(normalizedEvents);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : 'No fue posible cargar el calendario.';
				this.showPageError(message);
				failureCallback(error instanceof Error ? error : new Error(message));
			} finally {
				this.setCalendarLoading(false);
			}
		})();
	};

	private initializeCalendar(requiredNodes: RequiredNodes) {
		this.destroyCalendar();

		const savedDate = localStorage.getItem('bookmate-calendar-default-date');
		if (savedDate) localStorage.removeItem('bookmate-calendar-default-date');

		const isMobile = this.isMobileViewport();
		this.isMobileLayout = isMobile;

		this.calendar = new Calendar(requiredNodes.calendarEl, {
			plugins: [interactionPlugin, dayGridPlugin, timeGridPlugin, listPlugin],
			locale: esLocale,
			initialView: isMobile ? MOBILE_DEFAULT_VIEW : DESKTOP_DEFAULT_VIEW,
			initialDate: savedDate || undefined,
			editable: true,
			eventStartEditable: (info) => !isCalendarEventLocked(info.event),
			eventDurationEditable: (info) => !isCalendarEventLocked(info.event),
			selectable: true,
			selectMirror: true,
			nowIndicator: true,
			allDaySlot: false,
			height: this.getCalendarHeightOption(isMobile),
			dayHeaders: !this.shouldHideNativeDayHeaders(isMobile, isMobile ? MOBILE_DEFAULT_VIEW : DESKTOP_DEFAULT_VIEW),
			scrollTimeReset: false,
			slotMinTime: '06:00:00',
			slotMaxTime: '22:00:00',
			headerToolbar: this.getHeaderToolbar(isMobile),
			customButtons: {
				goToday: {
					text: 'Hoy',
					hint: 'Ir a hoy y a la hora actual',
					click: this.handleGoToday,
				},
			},
			views: {
				timeGridThreeDay: {
					type: 'timeGrid',
					duration: { days: 3 },
					buttonText: '3 días',
				},
			},
			titleFormat: isMobile
				? this.getMobileTitleFormat()
				: {
						year: 'numeric',
						month: 'long',
				  },
			buttonText: {
				today: 'Hoy',
				month: 'Mes',
				week: 'Semana',
				day: 'Dia',
				list: 'Lista',
			},
			dayHeaderContent: (args) => {
				const dayName = new Intl.DateTimeFormat('es-ES', { weekday: 'short' })
					.format(args.date)
					.replace('.', '');

				// En vista mes solo hace falta el nombre del día; el número vive en cada celda.
				if (args.view.type.startsWith('dayGrid')) {
					return {
						html: `<div class="custom-cal-header custom-cal-header--month"><span class="cal-day-name">${dayName}</span></div>`,
					};
				}

				const dayNumber = args.date.getDate();
				return {
					html: `
						<div class="custom-cal-header">
							<span class="cal-day-name">${dayName}</span>
							<span class="cal-day-number">${dayNumber}</span>
						</div>
					`,
				};
			},
			events: this.buildEventSource,
			datesSet: () => {
				this.syncMobileDayHeadersOption();
				window.requestAnimationFrame(() => {
					this.syncToolbarButtonGroupClasses();
					this.syncMobileStickyChrome();
				});
				void this.applyPendingFocus(0);
			},
			eventsSet: () => {
				void this.applyPendingFocus(0);
			},
			select: (info: DateSelectArg) => {
				const modal = hasAppointmentModalApi(this.appointmentModal) ? this.appointmentModal : null;
				modal?.openCreate({
					start: info.start,
					end: info.end,
					professionalId: this.getScheduleProfessionalId(),
					locationId: toPositiveInt(this.locationFilter?.value, 0),
				});
			},
			eventClick: (info) => {
				const appointmentId = toPositiveInt(info.event.id, 0);
				if (appointmentId > 0) {
					const modal = hasAppointmentModalApi(this.appointmentModal) ? this.appointmentModal : null;
					void modal?.openEdit(appointmentId);
				}
			},
			eventDrop: (info) => {
				if (isImmutableAppointmentEvent(info.event)) {
					info.revert();
					void showErrorAlert(immutableAppointmentMoveMessage(info.event));
					return;
				}
				void this.handleEventReschedule(info);
			},
			eventResize: (info) => {
				if (isImmutableAppointmentEvent(info.event)) {
					info.revert();
					void showErrorAlert(immutableAppointmentResizeMessage(info.event));
					return;
				}
				void this.handleEventReschedule(info);
			},
			eventDidMount: (arg) => {
				const source = String(arg.event.extendedProps?.source || '').trim().toLowerCase();

				this.tryCompletePendingFocus(arg.event);

				if (isImmutableAppointmentEvent(arg.event)) {
					arg.el.classList.add('fc-event-locked');
				}

				if (source === 'google') {
					const originExists = arg.el.querySelector('.fc-event-google-origin');
					if (!originExists) {
						const originContainer =
							arg.el.querySelector('.fc-event-main-frame') ??
							arg.el.querySelector('.fc-event-title-container') ??
							arg.el.querySelector('.fc-event-main') ??
							arg.el.querySelector('.fc-list-event-title') ??
							arg.el;

						if (originContainer instanceof HTMLElement) {
							const originNode = document.createElement('span');
							originNode.className = 'fc-event-google-origin';
							originNode.title = 'Google Calendar';
							originNode.setAttribute('aria-hidden', 'true');
							originContainer.prepend(originNode);
						}
					}

					const description = String(arg.event.extendedProps?.description || '').trim();
					if (!description) return;

					const existing = arg.el.querySelector('.fc-event-description');
					if (existing) return;

					const container =
						arg.el.querySelector('.fc-event-title-container') ??
						arg.el.querySelector('.fc-event-main-frame') ??
						arg.el.querySelector('.fc-event-main');
					if (!(container instanceof HTMLElement)) return;

					const descriptionNode = document.createElement('div');
					descriptionNode.className = 'fc-event-description';
					descriptionNode.textContent = description;
					container.appendChild(descriptionNode);
					return;
				}

				const badgeContainer =
					arg.el.querySelector('.fc-event-main-frame') ??
					arg.el.querySelector('.fc-event-title-container') ??
					arg.el.querySelector('.fc-event-main') ??
					arg.el.querySelector('.fc-list-event-title') ??
					arg.el;

				if (!(badgeContainer instanceof HTMLElement)) return;

				this.mountScheduleMisalignedVisual(arg);

				if (isAttendanceReconfirmed(arg.event.extendedProps)) {
					arg.el.classList.add('fc-event-attendance-confirmed');
					if (!arg.el.querySelector('.fc-event-attendance-badge')) {
						const badgeNode = document.createElement('span');
						badgeNode.className = 'fc-event-attendance-badge fc-event-attendance-badge--confirmed';
						badgeNode.title = 'Asistencia reconfirmada';
						badgeNode.setAttribute('aria-hidden', 'true');
						badgeContainer.prepend(badgeNode);
					}
				} else if (isAttendanceAwaitingReconfirmation(arg.event.extendedProps)) {
					arg.el.classList.add('fc-event-attendance-pending');
					if (!arg.el.querySelector('.fc-event-attendance-badge')) {
						const badgeNode = document.createElement('span');
						badgeNode.className = 'fc-event-attendance-badge fc-event-attendance-badge--pending';
						badgeNode.title = 'Pendiente de reconfirmación';
						badgeNode.setAttribute('aria-hidden', 'true');
						badgeContainer.prepend(badgeNode);
					}
				} else if (isAttendanceDeclined(arg.event.extendedProps)) {
					arg.el.classList.add('fc-event-attendance-declined');
					if (!arg.el.querySelector('.fc-event-attendance-badge')) {
						const badgeNode = document.createElement('span');
						badgeNode.className = 'fc-event-attendance-badge fc-event-attendance-badge--declined';
						badgeNode.title = 'Asistencia rechazada';
						badgeNode.setAttribute('aria-hidden', 'true');
						badgeContainer.prepend(badgeNode);
					}
				}
			},
		});

		this.calendar.render();
		this.syncToolbarButtonGroupClasses();
		this.applyResponsiveCalendarLayout(true);
		this.syncMobileStickyChrome();
		this.bindMobileThreeDaySwipe(requiredNodes.calendarEl, this.#listeners?.signal);
	}

	private isMobileSwipeEnabled() {
		return this.isMobileViewport();
	}

	private canSwipeThreeDayView() {
		return (
			this.isMobileSwipeEnabled() &&
			Boolean(this.calendar) &&
			this.calendar.view.type === 'timeGridThreeDay'
		);
	}

	private bindMobileThreeDaySwipe(calendarEl: HTMLElement, signal?: AbortSignal) {
		if (!signal || !this.isMobileSwipeEnabled()) return;

		const swipeSurface =
			calendarEl.querySelector<HTMLElement>('.fc-view-harness') ?? calendarEl;

		const resetSwipe = () => {
			this.swipeTouchStart = null;
		};

		const handleTouchStart = (event: TouchEvent) => {
			if (!this.canSwipeThreeDayView() || event.touches.length !== 1) {
				resetSwipe();
				return;
			}

			const touch = event.touches[0];
			this.swipeTouchStart = { x: touch.clientX, y: touch.clientY };
		};

		const handleTouchEnd = (event: TouchEvent) => {
			if (!this.swipeTouchStart || !this.canSwipeThreeDayView()) {
				resetSwipe();
				return;
			}

			const touch = event.changedTouches[0];
			const deltaX = touch.clientX - this.swipeTouchStart.x;
			const deltaY = touch.clientY - this.swipeTouchStart.y;
			resetSwipe();

			if (Math.abs(deltaX) < MOBILE_SWIPE_MIN_DISTANCE_PX) return;
			if (Math.abs(deltaY) * MOBILE_SWIPE_HORIZONTAL_RATIO > Math.abs(deltaX)) return;

			if (deltaX < 0) {
				this.calendar?.next();
			} else {
				this.calendar?.prev();
			}
		};

		swipeSurface.addEventListener('touchstart', handleTouchStart, {
			signal,
			passive: true,
		});
		swipeSurface.addEventListener('touchcancel', resetSwipe, { signal, passive: true });
		swipeSurface.addEventListener('touchend', handleTouchEnd, { signal, passive: true });
	}

	private handleViewportResize = () => {
		this.applyResponsiveCalendarLayout();
		this.handleFiltersPopoverReposition();
	};

	private handleFiltersPopoverReposition = () => {
		if (!this.filtersSheet?.classList.contains('is-open')) return;
		if (!this.filtersSheet.classList.contains('is-desktop-popover')) return;
		if (!this.isDesktopFiltersPopover()) return;
		this.positionFiltersPopover();
	};

	private reloadCalendarEvents() {
		if (this.calendar) {
			this.calendar.refetchEvents();
		}
	}

	private async handleEventReschedule(info: EventDropArg | EventResizeDoneArg) {
		const appointmentId = toPositiveInt(info.event.id, 0);
		if (!appointmentId) {
			info.revert();
			return;
		}

		if (isImmutableAppointmentEvent(info.event)) {
			info.revert();
			await showErrorAlert(immutableAppointmentMoveMessage(info.event));
			return;
		}

		const eventStart = info.event.start;
		const eventEnd = info.event.end ?? (eventStart ? new Date(eventStart.getTime() + 60 * 60 * 1000) : null);
		if (!eventStart || !eventEnd) {
			info.revert();
			return;
		}

		this.setCalendarLoading(true);
		this.clearPageError();

		try {
			const detail = await this.client.getAppointment(appointmentId);
			const statusRaw = String(detail.status || 'CONFIRMADO').trim().toUpperCase();
			const status = isAppointmentStatus(statusRaw) ? statusRaw : 'CONFIRMADO';

			if (isImmutableAppointmentStatus(status)) {
				info.revert();
				await showErrorAlert(
					status === 'CANCELADO'
						? 'Las citas canceladas no se pueden mover ni reprogramar.'
						: 'Las citas completadas no se pueden mover ni reprogramar.'
				);
				return;
			}

			const payload: AppointmentFormPayload = {
				id_customer: toPositiveInt(detail.id_customer, 0) || undefined,
				loc_id_location: toPositiveInt(detail.loc_id_location, 0),
				pro_id_professional:
					this.roleId === ROLES.PROFESIONAL && this.currentProfessionalId > 0
						? this.currentProfessionalId
						: toPositiveInt(detail.pro_id_professional, 0),
				ser_id_service: toPositiveInt(detail.ser_id_service, 0),
				customer_name: String(detail.customer_name || '').trim(),
				customer_phone: String(detail.customer_phone || '').trim(),
				start_time: toIsoWithOffset(formatDateTimeLocal(eventStart)),
				end_time: toIsoWithOffset(formatDateTimeLocal(eventEnd)),
				status,
			};

			try {
				await this.client.updateAppointment(appointmentId, payload);
			} catch (error) {
				if (!isScheduleMisalignedConflictError(error)) throw error;

				const reason = normalizeScheduleMisalignedReason(
					(error as ApiClientError).scheduleMisalignedReason
				);
				const title = getScheduleMisalignedConfirmTitle(reason);
				const message = getScheduleMisalignedConfirmMessage(reason, {
					locationName: String(detail.location_name || '').trim(),
				});
				const confirmed = window.BookmateAlert?.confirm
					? await window.BookmateAlert.confirm({
							type: 'warning',
							title,
							message,
							confirmText: 'Guardar de todos modos',
							cancelText: 'Cancelar',
						})
					: window.confirm(`${title}\n\n${message}`);

				if (!confirmed) {
					info.revert();
					return;
				}

				await this.client.updateAppointment(appointmentId, {
					...payload,
					acknowledge_schedule_misalignment: true,
				});
			}
		} catch (error) {
			info.revert();
			const message =
				error instanceof Error
					? error.message
					: 'No fue posible reprogramar la cita seleccionada.';
			this.showPageError(message);
			await showErrorAlert(message);
		} finally {
			this.setCalendarLoading(false);
		}
	}

	private async loadMeta(requiredNodes: RequiredNodes) {
		this.setCalendarLoading(true);
		this.clearPageError();

		try {
			const data = await this.client.getMeta();
			this.roleId = toInt(data.session?.role_id, 0);
			this.currentProfessionalId = toPositiveInt(data.session?.professional_id, 0);

			this.professionals = Array.isArray(data.professionals)
				? data.professionals
						.map((item) => {
							const serviceIds = Array.isArray(item?.services)
								? item.services
										.map((serviceId) => toPositiveInt(serviceId, 0))
										.filter((serviceId) => serviceId > 0)
								: [];
							return {
								id: toPositiveInt(item?.id_professional, 0),
								name: String(item?.display_name || '').trim(),
								services: [...new Set(serviceIds)],
							};
						})
						.filter((item) => item.id > 0 && item.name)
				: [];

			this.locations = Array.isArray(data.locations)
				? data.locations
						.map((item) => ({
							id: toPositiveInt(item?.id_location, 0),
							name: String(item?.name || '').trim(),
						}))
						.filter((item) => item.id > 0 && item.name)
				: [];

			this.services = Array.isArray(data.services)
				? data.services
						.map((item) => ({
							id: toPositiveInt(item?.id_service, 0),
							name: String(item?.name || '').trim(),
						}))
						.filter((item) => item.id > 0 && item.name)
				: [];

			this.renderOptions(requiredNodes.professionalFilter, this.professionals, 'Todos los profesionales', true);
			this.renderOptions(requiredNodes.locationFilter, this.locations, 'Todas las sucursales', true);

			if (this.roleId === ROLES.PROFESIONAL) {
				requiredNodes.professionalFilterWrap?.classList.add('hidden');
				setSearchableSelectDisabled(requiredNodes.professionalFilter, true);

				if (this.currentProfessionalId <= 0 && this.professionals.length === 1) {
					this.currentProfessionalId = this.professionals[0].id;
				}

				if (this.currentProfessionalId > 0) {
					setSearchableSelectValue(requiredNodes.professionalFilter, this.currentProfessionalId);
				} else {
					this.showPageError(
						'No fue posible determinar el perfil profesional de tu sesion. Contacta al administrador.'
					);
				}
			} else {
				requiredNodes.professionalFilterWrap?.classList.remove('hidden');
				setSearchableSelectDisabled(requiredNodes.professionalFilter, false);
			}

			this.syncFiltersTrigger();

			requiredNodes.appointmentModal.configure({
				roleId: this.roleId,
				currentProfessionalId: this.currentProfessionalId,
				professionals: this.professionals,
				locations: this.locations,
				services: this.services,
			});
		} catch (error) {
			this.showPageError(
				error instanceof Error
					? error.message
					: 'No fue posible cargar los catalogos del calendario.'
			);
		} finally {
			this.setCalendarLoading(false);
		}
	}

	private handleOpenCreateModal = () => {
		const now = new Date();
		now.setSeconds(0, 0);
		const next = new Date(now.getTime() + 60 * 60 * 1000);
		const modal = hasAppointmentModalApi(this.appointmentModal) ? this.appointmentModal : null;
		modal?.openCreate({
			start: now,
			end: next,
			professionalId: this.getScheduleProfessionalId(),
			locationId: toPositiveInt(this.locationFilter?.value, 0),
		});
	};

	private getScheduleProfessionalId() {
		if (this.roleId === ROLES.PROFESIONAL && this.currentProfessionalId > 0) {
			return this.currentProfessionalId;
		}
		return toPositiveInt(this.professionalFilter?.value, 0);
	}

	private handleProfessionalFilterChange = () => {
		this.syncFiltersTrigger();
		if (this.roleId === ROLES.PROFESIONAL) return;
		this.reloadCalendarEvents();
	};

	private handleLocationFilterChange = () => {
		this.syncFiltersTrigger();
		this.reloadCalendarEvents();
	};

	private handleRefreshCalendar = () => {
		if (!this.calendar) return;
		this.clearPageError();
		this.reloadCalendarEvents();
	};

	private handleAppointmentChanged = (event: Event) => {
		const customEvent = event as CustomEvent<{ message?: string }>;
		if (customEvent.detail?.message) {
			showFlashMessage({ message: customEvent.detail.message, type: 'success' });
		}
		this.reloadCalendarEvents();
	};

	private getMisalignedAppointments(events: ApiCalendarEvent[]) {
		return events
			.filter((event) => !isGoogleEvent(event) && isScheduleMisalignedEvent(event))
			.map((event) => {
				const appointmentId = toPositiveInt(event.id, 0);
				const rawTitle = String(event.title || '')
					.trim()
					.replace(/^⚠\s*/, '');
				const reason = getEventScheduleMisalignedReason(event);
				const whenLabel = formatMisalignedWhenLabelCompact(event.start);
				const reasonLabel = getScheduleMisalignedBannerReasonLabel(reason);
				const appointmentLabel = rawTitle || 'Cita sin título';

				return {
					id: appointmentId,
					appointmentLabel,
					whenLabel,
					reasonLabel,
				};
			})
			.filter((item) => item.id > 0);
	}

	private mountScheduleMisalignedVisual(arg: { el: HTMLElement; event: EventApi }) {
		if (isGoogleEvent(arg.event)) return;
		if (!isScheduleMisalignedEvent(arg.event)) return;

		arg.el.classList.add('fc-event-schedule-misaligned');
		if (arg.el.querySelector('.fc-event-schedule-misaligned-badge')) return;

		const badgeNode = document.createElement('span');
		badgeNode.className = 'fc-event-schedule-misaligned-badge';
		badgeNode.title =
			'Cita fuera del horario o sucursal actual. Reprograma manualmente y avisa al cliente.';
		badgeNode.setAttribute('aria-label', 'Fuera de horario');
		arg.el.appendChild(badgeNode);
	}

	private focusMisalignedAppointment(appointmentId: number) {
		if (!this.calendar || appointmentId <= 0) return;

		this.calendarEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

		const targetEvent = this.calendar
			.getEvents()
			.find((item) => toPositiveInt(item.id, 0) === appointmentId);
		if (!targetEvent?.start) return;

		this.clearPendingFocusState();
		this.pendingFocusAppointmentId = appointmentId;
		this.pendingFocusScrollTime = {
			hours: targetEvent.start.getHours(),
			minutes: Math.max(0, targetEvent.start.getMinutes() - 15),
		};

		const viewType = this.calendar.view.type;
		const targetViewType = this.getFocusTargetViewType(viewType);
		const alreadyOnTargetView =
			viewType === targetViewType ||
			(this.isTimeGridView(viewType) && this.isTimeGridView(targetViewType));

		if (!alreadyOnTargetView || viewType === 'dayGridMonth' || viewType === 'dayGridDay') {
			this.calendar.changeView(targetViewType, targetEvent.start);
			return;
		}

		void this.applyPendingFocus(0);
	}

	private updateScheduleMisalignedBanner(events: ApiCalendarEvent[]) {
		if (!this.scheduleMisalignedBanner) return;

		const misaligned = this.getMisalignedAppointments(events);

		if (misaligned.length <= 0) {
			this.scheduleMisalignedBanner.classList.add('hidden');
			this.scheduleMisalignedBanner.replaceChildren();
			return;
		}

		this.scheduleMisalignedBanner.classList.remove('hidden');
		this.scheduleMisalignedBanner.replaceChildren();

		const title = document.createElement('p');
		title.className = 'calendar-misaligned-banner__title';
		title.textContent = getScheduleMisalignedBannerTitle(misaligned.length);

		const caption = document.createElement('p');
		caption.className = 'calendar-misaligned-banner__caption';
		caption.textContent = getScheduleMisalignedBannerCaption(misaligned.length);

		const list = document.createElement('ul');
		list.className = 'calendar-misaligned-banner__list';

		for (const item of misaligned) {
			const listItem = document.createElement('li');
			listItem.className = 'calendar-misaligned-banner__item';
			listItem.textContent = `${item.appointmentLabel} (${item.whenLabel}) · ${item.reasonLabel}`;
			list.appendChild(listItem);
		}

		const action = document.createElement('p');
		action.className = 'calendar-misaligned-banner__action';
		action.textContent = getScheduleMisalignedBannerAction(misaligned.length);

		this.scheduleMisalignedBanner.append(title, caption, list, action);
	}

	private applyScheduleReviewFromUrl(requiredNodes: RequiredNodes) {
		if (typeof window === 'undefined') return;

		const params = new URLSearchParams(window.location.search);
		const scheduleReview = params.get('schedule_review') === '1';
		const reviewProfessionalId = toPositiveInt(params.get('pro_id'), 0);

		if (reviewProfessionalId > 0 && this.roleId !== ROLES.PROFESIONAL) {
			setSearchableSelectValue(requiredNodes.professionalFilter, reviewProfessionalId);
		}

		if (scheduleReview) {
			showFlashMessage({
				message:
					'Revisa las citas marcadas como fuera de horario: no se actualizan solas al cambiar la plantilla.',
				type: 'warning',
			});
		}

		if (!scheduleReview && reviewProfessionalId <= 0) return;

		params.delete('schedule_review');
		params.delete('pro_id');
		const nextQuery = params.toString();
		const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
		window.history.replaceState({}, '', nextUrl);
	}

	private consumeScheduleReviewStorageFlag(professionalId: number) {
		if (professionalId <= 0 || typeof window === 'undefined') return false;
		const storageKey = `${SCHEDULE_REVIEW_STORAGE_PREFIX}${professionalId}`;
		const hasFlag = sessionStorage.getItem(storageKey) === '1';
		if (hasFlag) sessionStorage.removeItem(storageKey);
		return hasFlag;
	}

	private async bootstrap() {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return;

		await this.loadMeta(requiredNodes);
		if (!this.isConnected) return;

		this.applyScheduleReviewFromUrl(requiredNodes);

		const reviewProfessionalId =
			this.roleId === ROLES.PROFESIONAL && this.currentProfessionalId > 0
				? this.currentProfessionalId
				: toPositiveInt(requiredNodes.professionalFilter.value, 0);
		if (this.consumeScheduleReviewStorageFlag(reviewProfessionalId)) {
			showFlashMessage({
				message:
					'Acabas de guardar una plantilla con citas afectadas. Revisa las marcadas como fuera de horario.',
				type: 'warning',
			});
		}

		this.initializeCalendar(requiredNodes);
		this.applyAiDraftFromStorage(requiredNodes);
		maybeShowCalendarTour();
	}

	private handleAppointmentVoiceSuccess = (event: Event) => {
		const customEvent = event as CustomEvent<StoredAppointmentAiDraft>;
		const stored = customEvent.detail;
		if (!stored?.draft) return;

		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return;

		if (stored.inlineFill && Boolean(document.querySelector<HTMLDialogElement>('[data-appointment-modal]')?.open)) {
			requiredNodes.appointmentModal.fillFormFromAiDraft(stored.draft);
			return;
		}

		requiredNodes.appointmentModal.openCreateWithAiDraft(stored.draft, {
			professionalId: this.getScheduleProfessionalId(),
			locationId: toPositiveInt(this.locationFilter?.value, 0),
		});
	};

	private consumeAiDraftFromStorage(): StoredAppointmentAiDraft | null {
		const raw = sessionStorage.getItem(APPOINTMENT_AI_DRAFT_STORAGE_KEY);
		sessionStorage.removeItem(APPOINTMENT_AI_DRAFT_STORAGE_KEY);
		if (!raw) return null;

		try {
			const parsed = JSON.parse(raw) as StoredAppointmentAiDraft;
			if (!parsed?.draft || typeof parsed.draft !== 'object') return null;
			return parsed;
		} catch {
			return null;
		}
	}

	private applyAiDraftFromStorage(requiredNodes: RequiredNodes) {
		const params = new URLSearchParams(window.location.search);
		if (params.get('ai_draft') !== '1') return;

		params.delete('ai_draft');
		const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash}`;
		window.history.replaceState({}, '', nextUrl);

		const stored = this.consumeAiDraftFromStorage();
		if (!stored?.draft) return;

		requiredNodes.appointmentModal.openCreateWithAiDraft(stored.draft, {
			professionalId: this.getScheduleProfessionalId(),
			locationId: toPositiveInt(requiredNodes.locationFilter.value, 0),
		});

		if (stored.transcript) {
			showFlashMessage({
				type: 'info',
				message: `Cita detectada: “${stored.transcript}”. Revisa los datos antes de guardar.`,
			});
		}
	}
}

if (!customElements.get('calendar-manager')) {
	customElements.define('calendar-manager', CalendarManager);
}
