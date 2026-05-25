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
import { formatDateKey } from '../schedule-exception-ui';
import type { AppointmentModalConfig, OpenCreateContext } from './appointment-modal';
import {
	destroySearchableSelect,
	ensureSearchableSelect,
	setSearchableSelectDisabled,
	setSearchableSelectValue,
	syncSearchableSelect,
} from '../searchable-select';
import type { AppointmentFormPayload, Option } from './types';
import {
	cleanFlashUrl,
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
	private blockedDays = new Set<string>();
	private swipeTouchStart: { x: number; y: number } | null = null;

	private calendarEl: HTMLElement | null = null;
	private loadingNode: HTMLElement | null = null;
	private pageErrorNode: HTMLElement | null = null;
	private openModalButton: HTMLButtonElement | null = null;
	private refreshCalendarButton: HTMLButtonElement | null = null;
	private professionalFilterWrap: HTMLElement | null = null;
	private professionalFilter: HTMLSelectElement | null = null;
	private locationFilter: HTMLSelectElement | null = null;
	private appointmentModal: HTMLElement | null = null;

	connectedCallback() {
		if (this.#bound) return;
		this.isGoogleConnected = this.dataset.googleConnected === 'true';

		this.calendarEl = this.querySelector<HTMLElement>('[data-calendar-el]');
		this.loadingNode = this.querySelector<HTMLElement>('[data-calendar-loading]');
		this.pageErrorNode = this.querySelector<HTMLElement>('[data-calendar-error]');
		this.openModalButton = this.querySelector<HTMLButtonElement>('[data-open-appointment-modal]');
		this.refreshCalendarButton = this.querySelector<HTMLButtonElement>('[data-refresh-calendar]');
		this.professionalFilterWrap = this.querySelector<HTMLElement>('[data-professional-filter-wrap]');
		this.professionalFilter = this.querySelector<HTMLSelectElement>('[data-professional-filter]');
		this.locationFilter = this.querySelector<HTMLSelectElement>('[data-location-filter]');
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
		requiredNodes.professionalFilter.addEventListener('change', this.handleProfessionalFilterChange, {
			signal,
		});
		requiredNodes.locationFilter.addEventListener('change', this.handleLocationFilterChange, { signal });
		window.addEventListener('resize', this.handleViewportResize, { signal });
		this.addEventListener('appointment:changed', this.handleAppointmentChanged as EventListener, {
			signal,
		});

		cleanFlashUrl();
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
		if (this.calendar) {
			this.calendar.destroy();
			this.calendar = null;
		}
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
			for (const group of chunk.querySelectorAll<HTMLElement>('.fc-button-group')) {
				group.classList.remove('fc-button-group--segmented');
			}
		}

		const viewChunk = chunks[chunks.length - 1];
		if (!viewChunk) return;
		viewChunk.classList.add('fc-toolbar-chunk--view-switch');
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

					return {
						...event,
						id: String(event?.id ?? ''),
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
			datesSet: (arg) => {
				void this.loadBlockedDays(arg.start, arg.end);
			},
			dayCellClassNames: (arg) => (this.isDateBlocked(arg.date) ? ['fc-day-blocked'] : []),
			dayHeaderClassNames: (arg) => (this.isDateBlocked(arg.date) ? ['fc-day-blocked'] : []),
			selectAllow: (selectInfo) =>
				!this.isSelectionOnBlockedDays(selectInfo.start, selectInfo.end),
			select: (info: DateSelectArg) => {
				if (this.isSelectionOnBlockedDays(info.start, info.end)) {
					this.warnBlockedDaySelection();
					return;
				}
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

				if (isAttendanceReconfirmed(arg.event.extendedProps)) {
					arg.el.classList.add('fc-event-attendance-confirmed');
					if (arg.el.querySelector('.fc-event-attendance-badge')) return;

					const badgeNode = document.createElement('span');
					badgeNode.className = 'fc-event-attendance-badge fc-event-attendance-badge--confirmed';
					badgeNode.title = 'Asistencia reconfirmada';
					badgeNode.setAttribute('aria-hidden', 'true');
					badgeContainer.prepend(badgeNode);
					return;
				}

				if (isAttendanceAwaitingReconfirmation(arg.event.extendedProps)) {
					arg.el.classList.add('fc-event-attendance-pending');
					if (arg.el.querySelector('.fc-event-attendance-badge')) return;

					const badgeNode = document.createElement('span');
					badgeNode.className = 'fc-event-attendance-badge fc-event-attendance-badge--pending';
					badgeNode.title = 'Pendiente de reconfirmación';
					badgeNode.setAttribute('aria-hidden', 'true');
					badgeContainer.prepend(badgeNode);
					return;
				}

				if (isAttendanceDeclined(arg.event.extendedProps)) {
					arg.el.classList.add('fc-event-attendance-declined');
					if (arg.el.querySelector('.fc-event-attendance-badge')) return;

					const badgeNode = document.createElement('span');
					badgeNode.className = 'fc-event-attendance-badge fc-event-attendance-badge--declined';
					badgeNode.title = 'Asistencia rechazada';
					badgeNode.setAttribute('aria-hidden', 'true');
					badgeContainer.prepend(badgeNode);
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
		if (this.isSelectionOnBlockedDays(now, next)) {
			this.warnBlockedDaySelection();
			return;
		}
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

	private isDateBlocked(date: Date) {
		return this.blockedDays.has(formatDateKey(date));
	}

	private isSelectionOnBlockedDays(start: Date, end: Date) {
		const cursor = new Date(start);
		cursor.setHours(0, 0, 0, 0);

		const lastDay = new Date(end);
		if (
			end.getHours() === 0 &&
			end.getMinutes() === 0 &&
			end.getSeconds() === 0 &&
			end.getMilliseconds() === 0 &&
			end > start
		) {
			lastDay.setDate(lastDay.getDate() - 1);
		}
		lastDay.setHours(0, 0, 0, 0);

		while (cursor <= lastDay) {
			if (this.isDateBlocked(cursor)) return true;
			cursor.setDate(cursor.getDate() + 1);
		}
		return false;
	}

	private async loadBlockedDays(rangeStart: Date, rangeEnd: Date) {
		const professionalId = this.getScheduleProfessionalId();
		this.blockedDays.clear();

		if (professionalId <= 0 || !this.calendar) return;

		const from = formatDateKey(rangeStart);
		const inclusiveEnd = new Date(rangeEnd);
		inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);
		const to = formatDateKey(inclusiveEnd);

		try {
			const response = await fetch(
				`/api/schedules/${professionalId}/exceptions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
				{ headers: { Accept: 'application/json' } }
			);
			const data = (await response.json()) as {
				status?: string;
				data?: Array<{ exception_date?: string; exception_type?: string }>;
			};
			if (!response.ok || data.status !== 'success' || !Array.isArray(data.data)) return;

			for (const item of data.data) {
				if (String(item.exception_type || '').toUpperCase() === 'BLOCKED' && item.exception_date) {
					this.blockedDays.add(item.exception_date);
				}
			}
		} catch (error) {
			console.error('[calendar-manager] blocked days load error', error);
		} finally {
			this.calendar?.render();
		}
	}

	private warnBlockedDaySelection() {
		void showErrorAlert(
			'Este día está bloqueado para el profesional seleccionado. No puedes agendar citas nuevas; reprograma o cancela las existentes desde el calendario.'
		);
	}

	private handleProfessionalFilterChange = () => {
		if (this.roleId === ROLES.PROFESIONAL) return;
		this.reloadCalendarEvents();
		if (this.calendar) {
			const view = this.calendar.view;
			void this.loadBlockedDays(view.activeStart, view.activeEnd);
		}
	};

	private handleLocationFilterChange = () => {
		this.reloadCalendarEvents();
	};

	private handleRefreshCalendar = () => {
		if (!this.calendar) return;
		this.clearPageError();
		this.reloadCalendarEvents();
	};

	private navigateWithFlash(message: string, type = 'success') {
		const nextUrl = new URL(window.location.href);
		nextUrl.searchParams.set('flash_message', message);
		nextUrl.searchParams.set('flash_type', type);
		if (this.calendar) {
			localStorage.setItem('bookmate-calendar-default-date', this.calendar.getDate().toISOString());
		}
		void navigate(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
	}

	private handleAppointmentChanged = (event: Event) => {
		const customEvent = event as CustomEvent<{ message?: string }>;
		if (customEvent.detail?.message) {
			this.navigateWithFlash(customEvent.detail.message, 'success');
		} else {
			this.reloadCalendarEvents();
		}
	};

	private async bootstrap() {
		const requiredNodes = this.getRequiredNodes();
		if (!requiredNodes) return;

		await this.loadMeta(requiredNodes);
		if (!this.isConnected) return;
		this.initializeCalendar(requiredNodes);
	}
}

if (!customElements.get('calendar-manager')) {
	customElements.define('calendar-manager', CalendarManager);
}
