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
import { showFlashMessage } from '../../lib/flash';
import {
	getScheduleMisalignedListSuffix,
	isScheduleMisalignedFlag,
	normalizeScheduleMisalignedReason,
} from '../../lib/schedule-misaligned';
import type { AppointmentFormPayload, Option } from './types';
import {
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

const formatMisalignedWhenLabel = (startRaw: unknown, endRaw: unknown) => {
	const startText = String(startRaw || '').trim();
	if (!startText) return 'fecha por confirmar';

	const startDate = new Date(startText);
	if (Number.isNaN(startDate.getTime())) return startText;

	const endText = String(endRaw || '').trim();
	const endDate = endText ? new Date(endText) : null;
	const datePart = new Intl.DateTimeFormat('es-ES', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
	}).format(startDate);
	const startTime = new Intl.DateTimeFormat('es-ES', {
		hour: '2-digit',
		minute: '2-digit',
	}).format(startDate);
	if (!endDate || Number.isNaN(endDate.getTime())) return `${datePart} ${startTime}`;

	const endTime = new Intl.DateTimeFormat('es-ES', {
		hour: '2-digit',
		minute: '2-digit',
	}).format(endDate);
	return `${datePart} ${startTime}–${endTime}`;
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
	private professionals: Option[] = [];
	private locations: Option[] = [];
	private services: Option[] = [];
	private isMobileLayout = false;
	private isGoogleConnected = false;
	private swipeTouchStart: { x: number; y: number } | null = null;
	private pendingFocusAppointmentId: number | null = null;
	private pendingFocusScrollTime: { hours: number; minutes: number } | null = null;
	private pendingFocusRetryTimer: number | null = null;

	private calendarEl: HTMLElement | null = null;
	private loadingNode: HTMLElement | null = null;
	private pageErrorNode: HTMLElement | null = null;
	private openModalButton: HTMLButtonElement | null = null;
	private refreshCalendarButton: HTMLButtonElement | null = null;
	private calendarTourHelpButton: HTMLButtonElement | null = null;
	private professionalFilterWrap: HTMLElement | null = null;
	private professionalFilter: HTMLSelectElement | null = null;
	private locationFilter: HTMLSelectElement | null = null;
	private scheduleMisalignedBanner: HTMLElement | null = null;
	private appointmentModal: HTMLElement | null = null;

	connectedCallback() {
		if (this.#bound) return;
		this.isGoogleConnected = this.dataset.googleConnected === 'true';

		this.calendarEl = this.querySelector<HTMLElement>('[data-calendar-el]');
		this.loadingNode = this.querySelector<HTMLElement>('[data-calendar-loading]');
		this.pageErrorNode = this.querySelector<HTMLElement>('[data-calendar-error]');
		this.openModalButton = this.querySelector<HTMLButtonElement>('[data-open-appointment-modal]');
		this.refreshCalendarButton = this.querySelector<HTMLButtonElement>('[data-refresh-calendar]');
		this.calendarTourHelpButton = this.querySelector<HTMLButtonElement>('[data-calendar-tour-help]');
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
		});
		ensureSearchableSelect(requiredNodes.locationFilter, {
			placeholder: 'Buscar sucursal...',
		});

		requiredNodes.appointmentModal.setClient(this.client);
		requiredNodes.openModalButton.addEventListener('click', this.handleOpenCreateModal, { signal });
		this.refreshCalendarButton?.addEventListener('click', this.handleRefreshCalendar, { signal });
		this.calendarTourHelpButton?.addEventListener(
			'click',
			() => showCalendarTour({ force: true }),
			{ signal }
		);
		requiredNodes.professionalFilter.addEventListener('change', this.handleProfessionalFilterChange, {
			signal,
		});
		requiredNodes.locationFilter.addEventListener('change', this.handleLocationFilterChange, { signal });
		window.addEventListener('resize', this.handleViewportResize, { signal });
		this.addEventListener('appointment:changed', this.handleAppointmentChanged as EventListener, {
			signal,
		});

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
		if (this.loadingNode) this.loadingNode.classList.toggle('hidden', !value);
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
					left: 'prev,next today',
					center: 'title',
					right: 'timeGridThreeDay,timeGridDay,listWeek',
				}
			: {
					left: 'prev,next today',
					center: 'title',
					right: 'timeGridDay,timeGridWeek,dayGridMonth,listWeek',
				};
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
		this.calendar.setOption('titleFormat',
			isMobile
				? {
						year: 'numeric',
						month: 'short',
						day: 'numeric',
					}
				: {
						year: 'numeric',
						month: 'long',
					}
		);

		if (isMobile) {
			const currentView = this.calendar.view.type;
			if (!MOBILE_ALLOWED_VIEWS.has(currentView)) {
				this.calendar.changeView(MOBILE_DEFAULT_VIEW);
			}
		} else if (this.calendar.view.type === 'timeGridThreeDay') {
			this.calendar.changeView(DESKTOP_DEFAULT_VIEW);
		}

		this.calendar.updateSize();
		window.requestAnimationFrame(() => this.syncToolbarButtonGroupClasses());
	}

	private syncToolbarButtonGroupClasses() {
		if (!this.calendarEl) return;
		const toolbar = this.calendarEl.querySelector<HTMLElement>('.fc-header-toolbar');
		if (!toolbar) return;

		const chunks = Array.from(toolbar.querySelectorAll<HTMLElement>('.fc-toolbar-chunk'));
		for (const chunk of chunks) {
			chunk.classList.remove('fc-toolbar-chunk--view-switch');
			chunk.removeAttribute('data-calendar-nav');
			chunk.removeAttribute('data-calendar-view-switch');
			for (const group of chunk.querySelectorAll<HTMLElement>('.fc-button-group')) {
				group.classList.remove('fc-button-group--segmented');
			}
		}

		const navChunk = chunks.find((chunk) =>
			chunk.querySelector('.fc-prev-button, .fc-next-button, .fc-today-button')
		);
		navChunk?.setAttribute('data-calendar-nav', 'true');

		const viewChunk = chunks[chunks.length - 1];
		if (!viewChunk) return;
		viewChunk.classList.add('fc-toolbar-chunk--view-switch');
		viewChunk.setAttribute('data-calendar-view-switch', 'true');
		for (const group of viewChunk.querySelectorAll<HTMLElement>('.fc-button-group')) {
			group.classList.add('fc-button-group--segmented');
		}
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
			height: 'auto',
			scrollTimeReset: false,
			slotMinTime: '06:00:00',
			slotMaxTime: '22:00:00',
			headerToolbar: this.getHeaderToolbar(isMobile),
			views: {
				timeGridThreeDay: {
					type: 'timeGrid',
					duration: { days: 3 },
					buttonText: '3 dias',
				},
			},
			titleFormat: isMobile
				? {
						year: 'numeric',
						month: 'short',
						day: 'numeric',
				  }
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

			await this.client.updateAppointment(appointmentId, payload);
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
						.map((item) => ({
							id: toPositiveInt(item?.id_professional, 0),
							name: String(item?.display_name || '').trim(),
						}))
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
		if (this.roleId === ROLES.PROFESIONAL) return;
		this.reloadCalendarEvents();
	};

	private handleLocationFilterChange = () => {
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
				const whenLabel = formatMisalignedWhenLabel(event.start, event.end);
				const reasonSuffix = getScheduleMisalignedListSuffix(
					getEventScheduleMisalignedReason(event)
				);
				const coreLabel = rawTitle ? `${rawTitle} (${whenLabel})` : whenLabel;
				return {
					id: appointmentId,
					label: `${coreLabel} ${reasonSuffix}`,
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

		const label = misaligned.length === 1 ? 'cita' : 'citas';
		this.scheduleMisalignedBanner.classList.remove('hidden');
		this.scheduleMisalignedBanner.replaceChildren();

		const intro = document.createElement('p');
		intro.className = 'calendar-misaligned-banner__intro';
		intro.textContent = `${misaligned.length} ${label} en este rango no coinciden con la agenda actual. Cada una indica el motivo (día bloqueado, horario o sucursal). Están marcadas con ⚠ en el calendario:`;

		const list = document.createElement('ul');
		list.className = 'calendar-misaligned-banner__list';

		for (const item of misaligned) {
			const listItem = document.createElement('li');
			const labelNode = document.createElement('span');
			labelNode.className = 'calendar-misaligned-banner__item';
			labelNode.textContent = item.label;
			listItem.appendChild(labelNode);
			list.appendChild(listItem);
		}

		const hint = document.createElement('p');
		hint.className = 'calendar-misaligned-banner__hint';
		hint.textContent =
			'Reprograma manualmente y avisa al cliente si cambias fecha u hora. En el calendario, búscalas por el prefijo ⚠ y el borde naranja.';

		this.scheduleMisalignedBanner.append(intro, list, hint);
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
		maybeShowCalendarTour();
	}
}

if (!customElements.get('calendar-manager')) {
	customElements.define('calendar-manager', CalendarManager);
}
