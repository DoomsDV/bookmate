import {
	formatApiDate,
	formatLongDateFromApiDate,
	getTodayStart,
	toDateStart,
} from '../../lib/booking-datetime';
import { appendLocationSlotHeader } from '../../lib/public-booking-locations';
import { forEachSlotPeriod, formatSlotLabel24h, wrapSlotPillGrid } from '../../lib/public-booking-slots-ui';
import {
	formatParaguayMobilePhoneInput,
	PARAGUAY_MOBILE_PHONE_ERROR,
	parseParaguayMobilePhone,
	toParaguayMobileE164FromInput,
} from '../../lib/paraguay-phone';
import {
	clearSipapHold,
	createDraftPersister,
	readPublicBookingDraft,
	readSipapHold,
	SLOT_UNAVAILABLE_RESTORE_MESSAGE,
	userBookingDraftKey,
	userBookingHoldKey,
	writeSipapHold,
	type PublicBookingDraft,
	type PublicBookingDraftStep,
} from '../../lib/public-booking-draft';
import { fillPublicBookingSuccessTicket } from '../../lib/public-booking-success-ticket';
import { bindPublicBookingStepIndicator, BOOKING_PHASE_LABELS, phaseProgressPercent, wizardStepToPhase, type BookingPhase } from '../../lib/public-booking-stepper';
import { createIdempotencyKey } from '../../lib/idempotency';
import {
	buildApiAppointmentTimes,
	createPublicAppointment,
	fetchAvailableDates,
	fetchAvailableSlots,
	validateCustomerPhone,
} from './api-client';
import {
	calculateDepositAmount,
	formatCurrency,
	formatDuration,
	formatBranchLabel,
} from './formatters';
import { createPublicUserMapController, type MapLocation } from './map';
import {
	buildOrganizationGroups,
	findOrganizationGroup,
	type LocationSlotGroup,
	type OrganizationBookingGroup,
} from './org-groups';
import {
	parseProfileFromDom,
	type UserBookingContext,
	type UserBookingService,
	type UserBookingWizardStep,
} from './types';
import {
	bindMapImageLifecycle,
	bindPickerUserGesture,
	bindVerticalStackGestures,
	buildPublicLocationCardContent,
	createContinueButton,
	escapeHtml,
	getOrgGridInitialPageIndex,
	getServiceGridInitialPageIndex,
	isMobileStack,
	mountPaginatedOrgGrid,
	mountPaginatedServiceGrid,
	setContinueButtonContent,
	syncStackLayers,
	triggerPickerHaptic,
	setPickerContinueEnabled,
	syncPublicBookingMobileActions,
} from './picker-ui';
import {
	bindSipapCopyButtons,
	bindSipapReceiptUpload,
	fillSipapDepositPanel,
	isDepositsEnabled,
	POLICY_SUMMARIES,
	normalizePolicyCode,
	stopSipapHoldCountdown,
	unwrapSipapHold,
} from '../public-deposit-sipap';

const toPositiveInt = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const pageControllers = new WeakMap<HTMLElement, AbortController>();

const getBookingRoot = () => {
	const match = window.location.pathname.match(/\/u\/([^/?#]+)/);
	const slug = match?.[1]?.trim();
	if (!slug) return null;

	const escapeAttr = (value: string) =>
		typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
			? CSS.escape(value)
			: value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

	return document.querySelector<HTMLElement>(
		`[data-public-user-booking-root][data-public-slug="${escapeAttr(slug)}"]`
	);
};

export const initializePublicUserBookingPage = () => {
	const root = getBookingRoot();
	if (!root) return;

	pageControllers.get(root)?.abort();
	const controller = new AbortController();
	pageControllers.set(root, controller);
	const { signal } = controller;
	bindPickerUserGesture(root, signal);

	const profile = parseProfileFromDom(root);
	if (!profile) return;

	const locationsRoot = root.querySelector<HTMLElement>('[data-user-locations-root]');
	const servicesGrid = root.querySelector<HTMLElement>('[data-services-grid]');
	const step1Title = root.querySelector<HTMLElement>('[data-step1-title]');
	const step1Subtitle = root.querySelector<HTMLElement>('[data-step1-subtitle]');
	const backToOrgsWrap = root.querySelector<HTMLElement>('[data-back-to-orgs-wrap]');
	const backToOrgsButton = root.querySelector<HTMLButtonElement>('[data-back-to-orgs]');
	const backToServices = root.querySelector<HTMLButtonElement>('[data-back-to-services]');
	const calendarMonth = root.querySelector<HTMLElement>('[data-calendar-month]');
	const calendarGrid = root.querySelector<HTMLElement>('[data-calendar-grid]');
	const slotsContainer = root.querySelector<HTMLElement>('[data-slots-container]');
	const noSlotsNode = root.querySelector<HTMLElement>('[data-no-slots]');
	const slotsLoadingNode = root.querySelector<HTMLElement>('[data-slots-loading]');
	const customerForm = root.querySelector<HTMLFormElement>('[data-customer-form]');
	const customerNameWrapper = customerForm?.querySelector<HTMLElement>('[data-customer-name-wrapper]');
	const customerNameInput = customerForm?.querySelector<HTMLInputElement>('[name="customer_name"]');
	const customerPhoneInput = customerForm?.querySelector<HTMLInputElement>('[name="customer_phone"]');
	const submitButton = root.querySelector<HTMLButtonElement>('[data-submit-booking]');
	const payDepositButton = root.querySelector<HTMLButtonElement>('[data-pay-deposit-submit]');
	const depositPolicyWrap = root.querySelector<HTMLElement>('[data-deposit-policy-wrap]');
	const depositPolicyAccept = root.querySelector<HTMLInputElement>('[data-deposit-policy-accept]');
	const depositPolicySummary = root.querySelector<HTMLElement>('[data-deposit-policy-summary]');
	const submitErrorNode = root.querySelector<HTMLElement>('[data-submit-error]');
	const toastNode = root.querySelector<HTMLElement>('[data-booking-toast]');
	const stepCompactLabel = root.querySelector<HTMLElement>('[data-step-compact-label]');
	const stepProgressBar = root.querySelector<HTMLElement>('[data-step-progress-bar]');
	const stepItems = root.querySelectorAll<HTMLElement>('[data-step-item]');
	const stepPanels = root.querySelectorAll<HTMLElement>('[data-step-panel]');
	const prevMonthButton = root.querySelector<HTMLButtonElement>('[data-calendar-prev]');
	const nextMonthButton = root.querySelector<HTMLButtonElement>('[data-calendar-next]');
	const backToLocations = root.querySelector<HTMLButtonElement>('[data-back-to-locations]');
	const backToCalendarButtons = root.querySelectorAll<HTMLButtonElement>('[data-back-to-calendar]');
	const backToSlots = root.querySelector<HTMLButtonElement>('[data-back-to-slots]');
	const datetimeContinueButton = root.querySelector<HTMLButtonElement>('[data-datetime-continue]');
	const headerBackButton = root.querySelector<HTMLButtonElement>('[data-booking-header-back]');
	const selectionSummary = root.querySelector<HTMLElement>('[data-selection-summary]');
	const selectionSummaryValue = root.querySelector<HTMLElement>('[data-selection-summary-value]');
	const selectionSummaryChange = root.querySelector<HTMLButtonElement>('[data-selection-summary-change]');
	const slotsHint = root.querySelector<HTMLElement>('[data-slots-hint]');
	const restartButtons = root.querySelectorAll<HTMLButtonElement>('[data-restart-booking]');
	const summaryServiceInline = root.querySelector<HTMLElement>('[data-summary-service-inline]');
	const summaryDateInline = root.querySelector<HTMLElement>('[data-summary-date-inline]');
	const summaryProfessional = root.querySelector<HTMLElement>('[data-summary-professional]');
	const summaryService = root.querySelector<HTMLElement>('[data-summary-service]');
	const summaryDepositWrap = root.querySelector<HTMLElement>('[data-summary-deposit-wrap]');
	const summaryDeposit = root.querySelector<HTMLElement>('[data-summary-deposit]');
	const summaryDate = root.querySelector<HTMLElement>('[data-summary-date]');
	const summaryTime = root.querySelector<HTMLElement>('[data-summary-time]');
	const summaryLocation = root.querySelector<HTMLButtonElement>('[data-summary-location]');

	if (
		!locationsRoot ||
		!servicesGrid ||
		!calendarMonth ||
		!calendarGrid ||
		!slotsContainer ||
		!noSlotsNode ||
		!slotsLoadingNode ||
		!customerForm ||
		!customerNameWrapper ||
		!customerNameInput ||
		!customerPhoneInput ||
		!submitButton ||
		!payDepositButton ||
		!summaryDateInline ||
		!summaryService ||
		!summaryDepositWrap ||
		!summaryDeposit ||
		!summaryDate ||
		!summaryTime ||
		!summaryLocation ||
		!prevMonthButton ||
		!nextMonthButton ||
		!backToLocations ||
		!backToServices ||
		!backToSlots ||
		!datetimeContinueButton ||
		restartButtons.length === 0
	) {
		return;
	}

	const stadiaKey = String(root.dataset.stadiaKey || '').trim();

	let locationStackFocusIndex = 0;
	let orgStackFocusIndex = 0;
	let serviceStackFocusIndex = 0;
	let orgGridPageIndex = 0;
	let serviceGridPageIndex = 0;

	const applyLocationUpdate = (updated: MapLocation) => {
		const locationId = toPositiveInt(updated.id_location, 0);
		if (!locationId) return;

		profile.locations = profile.locations.map((location) =>
			location.id_location === locationId ? { ...location, ...updated } : location
		);

		const selectedOrgId = selectedOrgGroup?.org_id_organization ?? 0;
		orgGroups = buildOrganizationGroups(profile.locations);
		if (selectedOrgId > 0) {
			selectedOrgGroup = findOrganizationGroup(orgGroups, selectedOrgId);
		}

		if (selectedContext?.id_location === locationId) {
			selectedContext =
				profile.locations.find((location) => location.id_location === locationId) ?? selectedContext;
			refreshSummary();
		}

		for (const group of availableSlotGroups) {
			if (group.location.id_location === locationId) {
				group.location =
					profile.locations.find((location) => location.id_location === locationId) ??
					group.location;
			}
		}

		renderSucursalStep();
		renderServices();
	};

	const mapController = createPublicUserMapController({
		root,
		signal,
		onLocationUpdated: applyLocationUpdate,
	});

	const formatLocationLabel = (location: UserBookingContext | null) => {
		if (!location) return 'Ubicación no disponible';
		const name = String(location.name || '').trim();
		const address = String(location.address || '').trim();
		if (address && name && address.toLowerCase() !== name.toLowerCase()) return address;
		return address || name || formatBranchLabel(location) || 'Ubicación no disponible';
	};

	const refreshSummaryLocation = (location: UserBookingContext | null) => {
		const label = formatLocationLabel(location);
		const canOpen = Boolean(mapController?.canShowLocationMap(location));
		summaryLocation.className =
			'public-location-link public-booking-summary__value cursor-pointer text-right font-normal disabled:cursor-not-allowed disabled:text-[var(--on-surface-variant)]';
		summaryLocation.disabled = !canOpen;
		summaryLocation.replaceChildren();
		if (!location || label === 'Ubicación no disponible') {
			summaryLocation.textContent = label;
			return;
		}
		const icon = document.createElement('span');
		icon.className = 'material-symbols-rounded';
		icon.setAttribute('aria-hidden', 'true');
		icon.textContent = 'location_on';
		const text = document.createElement('span');
		text.className = 'public-location-link__label';
		text.textContent = label;
		summaryLocation.append(icon, text);
	};

	const today = getTodayStart();
	let orgGroups = buildOrganizationGroups(profile.locations);
	let step: UserBookingWizardStep = 1;
	let selectedOrgGroup: OrganizationBookingGroup | null = null;
	let selectedContext: UserBookingContext | null = null;
	let selectedService: UserBookingService | null = null;
	let selectedDate = '';
	let selectedTime = '';
	let availableSlotGroups: LocationSlotGroup[] = [];
	let visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
	const availableDatesCache = new Map<string, Set<string>>();
	let availableDatesLoadingKey: string | null = null;
	let availableDatesRequestSeq = 0;
	let renderCalendar = () => {};

	const syncCalendarSelectionHint = (
		calendarRoot: Element | null,
		message: string | null,
	) => {
		if (!calendarRoot) return;
		calendarRoot.classList.toggle('is-waiting-selection', Boolean(message));
		let hint = calendarRoot.querySelector<HTMLParagraphElement>('[data-calendar-selection-hint]');
		if (!message) {
			if (hint) hint.hidden = true;
			return;
		}
		if (!hint) {
			hint = document.createElement('p');
			hint.className = 'public-booking-calendar__hint';
			hint.dataset.calendarSelectionHint = '';
			calendarRoot.appendChild(hint);
		}
		hint.textContent = message;
		hint.hidden = false;
	};
	let isLoadingSlots = false;
	let isSubmitting = false;
	let isValidatingCustomer = false;
	let pendingAppointmentId = 0;
	// Idempotency-Key: se reutiliza mientras el reintento sea sobre el MISMO payload (retry
	// por fallo de red); si el usuario cambia de selección (otro horario, otro servicio, etc.)
	// se genera una key nueva junto con el nuevo payload.
	let bookingIdemKey: string | null = null;
	let bookingIdemPayloadJson: string | null = null;
	let validatedCustomerPhoneE164 = '';
	let toastTimer: number | null = null;

	const publicSlug = String(root.dataset.publicSlug || '').trim();
	const draftStorageKey = userBookingDraftKey(publicSlug || 'unknown');
	const holdStorageKey = userBookingHoldKey(publicSlug || 'unknown');
	const draftPersister = createDraftPersister(draftStorageKey, () => {
		if (step >= 5 || !selectedService) return null;
		const rawStep = (step <= 5 ? step : 5) as PublicBookingDraftStep;
		const draftStep = (rawStep === 4 ? 3 : rawStep) as PublicBookingDraftStep;
		return {
			v: 1 as const,
			step: draftStep,
			serviceId: selectedService.id_service,
			orgId: selectedOrgGroup?.org_id_organization ?? null,
			locationId: selectedContext?.id_location ?? null,
			date: selectedDate,
			time: selectedTime,
			phone: customerPhoneInput.value,
			name: customerNameInput.value,
			policyAccepted: Boolean(depositPolicyAccept?.checked),
			savedAt: Date.now(),
		} satisfies PublicBookingDraft;
	});

	const showToast = (message: string, kind: 'success' | 'error' = 'error', durationMs = 3600) => {
		if (!toastNode) return;
		toastNode.textContent = message;
		toastNode.classList.remove('hidden', 'is-success', 'is-error');
		toastNode.classList.add(kind === 'success' ? 'is-success' : 'is-error');
		if (toastTimer) window.clearTimeout(toastTimer);
		toastTimer = window.setTimeout(() => {
			toastNode.classList.add('hidden');
			toastNode.classList.remove('is-success', 'is-error');
		}, durationMs);
	};

	const invalidateAvailableDatesCache = () => {
		availableDatesCache.clear();
		availableDatesLoadingKey = null;
		availableDatesRequestSeq += 1;
	};

	const availableDatesMonthKey = (year: number, monthIndex: number) => {
		const org = selectedOrgGroup?.org_id_organization ?? 0;
		const ser = selectedService?.id_service ?? 0;
		const loc = selectedContext?.id_location ?? 0;
		const ym = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
		return `${org}|${ser}|${loc}|${ym}`;
	};

	const locationTargetsForAvailability = () => {
		const orgGroup = selectedOrgGroup;
		if (!orgGroup) return [] as UserBookingContext[];
		const lockedLocationId = selectedContext?.id_location ?? 0;
		return lockedLocationId > 0
			? orgGroup.locations.filter((location) => location.id_location === lockedLocationId)
			: orgGroup.locations;
	};

	const clearSelectedDateTime = () => {
		selectedDate = '';
		selectedTime = '';
		availableSlotGroups = [];
		isLoadingSlots = false;
		refreshSummary();
		draftPersister.schedule();
		renderSlots();
	};

	const loadAvailableDatesForVisibleMonth = async () => {
		if (!selectedService || !selectedOrgGroup) {
			renderCalendar();
			return;
		}

		const year = visibleMonth.getFullYear();
		const month = visibleMonth.getMonth();
		const cacheKey = availableDatesMonthKey(year, month);
		const ymPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

		if (availableDatesCache.has(cacheKey)) {
			const dates = availableDatesCache.get(cacheKey)!;
			if (selectedDate.startsWith(ymPrefix) && !dates.has(selectedDate)) {
				clearSelectedDateTime();
			}
			renderCalendar();
			return;
		}

		const targets = locationTargetsForAvailability();
		if (targets.length === 0) {
			renderCalendar();
			return;
		}

		const reqId = ++availableDatesRequestSeq;
		availableDatesLoadingKey = cacheKey;
		renderCalendar();

		try {
			const fromDate = formatApiDate(new Date(year, month, 1));
			const toDate = formatApiDate(new Date(year, month + 1, 0));
			const results = await Promise.allSettled(
				targets.map((location) =>
					fetchAvailableDates({
						pro_id: location.id_professional,
						loc_id: location.id_location,
						ser_id: selectedService!.id_service,
						from_date: fromDate,
						to_date: toDate,
					})
				)
			);
			if (reqId !== availableDatesRequestSeq) return;

			const merged = new Set<string>();
			let anyOk = false;
			for (const result of results) {
				if (result.status !== 'fulfilled') continue;
				anyOk = true;
				for (const date of result.value) merged.add(date);
			}
			if (anyOk) {
				availableDatesCache.set(cacheKey, merged);
				if (selectedDate.startsWith(ymPrefix) && !merged.has(selectedDate)) {
					clearSelectedDateTime();
				}
			}
		} catch {
			if (reqId !== availableDatesRequestSeq) return;
		} finally {
			if (reqId === availableDatesRequestSeq) {
				availableDatesLoadingKey = null;
				renderCalendar();
			}
		}
	};

	let refreshStepIndicatorClickable = () => {};

	const populateSuccessTicket = () => {
		fillPublicBookingSuccessTicket(root, {
			professionalName: profile.full_name,
			organizationName: selectedOrgGroup?.organization_name,
			serviceName: selectedService?.name || '—',
			durationMinutes: selectedService?.duration_minutes,
			dateYmd: selectedDate,
			time: selectedTime,
			locationName: selectedContext?.name,
			locationAddress: selectedContext?.address,
			imageUrl: profile.image_url,
		});
	};

	const setStep = (nextStep: UserBookingWizardStep) => {
		step = nextStep === 4 ? 3 : nextStep;
		for (const panel of stepPanels) {
			const panelStep = Number(panel.dataset.stepPanel || '0');
			panel.classList.toggle('hidden', panelStep !== step);
		}

		const phase = wizardStepToPhase(step);
		for (const item of stepItems) {
			const itemPhase = Number(item.dataset.stepItem || '0') as BookingPhase;
			item.classList.remove('step-item-default', 'step-item-current', 'step-item-done');
			if (itemPhase === phase && step <= 5) {
				item.classList.add('step-item-current');
				continue;
			}
			if (itemPhase < phase || step >= 6) {
				item.classList.add('step-item-done');
				continue;
			}
			item.classList.add('step-item-default');
		}

		if (stepCompactLabel) {
			stepCompactLabel.textContent =
				step === 7
					? 'Transferí la seña'
					: step === 6
						? 'Reserva confirmada'
						: `Paso ${phase} de 3: ${BOOKING_PHASE_LABELS[phase]}`;
		}
		if (stepProgressBar) {
			stepProgressBar.style.width = `${step >= 6 ? 100 : phaseProgressPercent(phase)}%`;
		}

		root.classList.toggle('is-booking-success', step === 6);

		if (step === 3) {
			queueMicrotask(() => {
				void loadAvailableDatesForVisibleMonth();
				if (selectedDate && availableSlotGroups.length === 0 && !isLoadingSlots) {
					void loadSlots(selectedDate, {
						skipStepChange: true,
						preserveSelection: Boolean(selectedTime),
					});
				} else {
					renderSlots();
				}
			});
		}

		if (step <= 5) draftPersister.flush();

		refreshStepIndicatorClickable();
		syncDatetimeContinue();
		syncHeaderBack();
		syncSelectionSummary();
		syncPublicBookingMobileActions(root);
	};

	const canNavigateBack = () => {
		if (step >= 6) return false;
		if (step === 1) {
			return servicePickerPhase === 'locations' && orgGroups.length > 1;
		}
		return step >= 2 && step <= 5;
	};

	const goBackOneStep = () => {
		if (!canNavigateBack()) return;
		if (step === 1) {
			backToOrganizationPicker();
			return;
		}
		if (step === 2) {
			goBackToLocationsStep();
			return;
		}
		if (step === 3) {
			goBackToServicesStep();
			return;
		}
		if (step === 5) {
			setStep(3);
		}
	};

	const syncHeaderBack = () => {
		if (!headerBackButton) return;
		const show = canNavigateBack();
		headerBackButton.hidden = !show;
		headerBackButton.toggleAttribute('hidden', !show);
	};

	const syncSelectionSummary = () => {
		if (!selectionSummary || !selectionSummaryValue) return;
		const label = selectedContext ? formatBranchLabel(selectedContext) : '';
		const show = step === 2 && Boolean(label);
		selectionSummary.hidden = !show;
		selectionSummary.toggleAttribute('hidden', !show);
		if (show) {
			selectionSummaryValue.textContent = label;
		}
	};

	const syncDatetimeContinue = () => {
		if (!datetimeContinueButton) return;
		datetimeContinueButton.disabled = !selectedDate || !selectedTime || isLoadingSlots;
	};

	const refreshSummary = () => {
		const formattedDate = selectedDate ? formatLongDateFromApiDate(selectedDate) : '-';
		const serviceLabel = selectedService?.name || '-';
		const timeLabel = selectedTime || '-';

		if (summaryServiceInline) summaryServiceInline.textContent = serviceLabel;
		summaryDateInline.textContent = formattedDate;
		if (summaryProfessional) summaryProfessional.textContent = profile.full_name;
		summaryService.textContent = serviceLabel;
		summaryDate.textContent = formattedDate;
		summaryTime.textContent = timeLabel;
		refreshSummaryLocation(selectedContext);

		const depositAmount = calculateDepositAmount(selectedService);
		summaryDepositWrap.classList.toggle('hidden', depositAmount <= 0);
		summaryDeposit.textContent = depositAmount > 0 ? formatCurrency(depositAmount) : '';
		submitButton.classList.toggle('is-hidden', depositAmount > 0);
		payDepositButton.classList.toggle('is-hidden', depositAmount <= 0);

		if (depositPolicyWrap && depositPolicySummary) {
			const settings = selectedContext?.deposit_settings;
			const policyCode = normalizePolicyCode(settings?.refund_policy);
			const summary =
				String(settings?.refund_policy_summary || '').trim() ||
				(policyCode ? POLICY_SUMMARIES[policyCode] : '');
			depositPolicyWrap.classList.toggle('hidden', depositAmount <= 0);
			depositPolicySummary.textContent = summary || 'Consultá la política con el comercio.';
			if (depositAmount <= 0 && depositPolicyAccept) depositPolicyAccept.checked = false;
			if (depositAmount <= 0) setPolicyFieldError('');
		}
	};

	let servicePickerPhase: 'orgs' | 'locations' = 'orgs';

	const formatLocationCountLabel = (count: number) =>
		count === 1 ? '1 ubicación disponible' : `${count} ubicaciones disponibles`;

	const updateStep1Copy = () => {
		const showBack = servicePickerPhase === 'locations' && orgGroups.length > 1;
		if (backToOrgsWrap) backToOrgsWrap.classList.toggle('hidden', !showBack);
		syncHeaderBack();
		syncPublicBookingMobileActions(root);

		if (servicePickerPhase === 'orgs') {
			if (step1Title) step1Title.textContent = 'Seleccioná un negocio';
			if (step1Subtitle) {
				step1Subtitle.innerHTML = `
					<span class="public-locations-hint__desktop">Elegí el negocio para ver sucursales y servicios.</span>
					<span class="public-locations-hint__mobile">Deslizá para elegir un negocio</span>
				`;
			}
			return;
		}

		if (step1Title) step1Title.textContent = '¿Dónde querés atenderte?';
		if (step1Subtitle && selectedOrgGroup) {
			step1Subtitle.innerHTML = `
				<span class="public-locations-hint__desktop">Elegí la sucursal de ${escapeHtml(selectedOrgGroup.organization_name)}</span>
				<span class="public-locations-hint__mobile">Deslizá para elegir una sucursal</span>
			`;
		}
	};

	const clearBookingSelection = (options?: { keepOrg?: boolean; keepLocation?: boolean }) => {
		if (!options?.keepOrg) selectedOrgGroup = null;
		if (!options?.keepLocation) selectedContext = null;
		selectedService = null;
		selectedDate = '';
		selectedTime = '';
		availableSlotGroups = [];
		pendingAppointmentId = 0;
		clearSipapHold(holdStorageKey);
		invalidateAvailableDatesCache();
	};

	const buildLocationCardContent = (location: UserBookingContext) =>
		buildPublicLocationCardContent(location, {
			stadiaKey,
			mapTheme: 'dark',
			canShowMap: Boolean(mapController?.canShowLocationMap(location)),
		});

	const buildServiceCardInnerHtml = (service: UserBookingService, depositsEnabled: boolean) => {
		const showDepositBadge = depositsEnabled && calculateDepositAmount(service) > 0;
		const depositBadgeCover = showDepositBadge
			? `<span class="public-service-card__deposit-badge public-service-card__deposit-badge--cover">Seña requerida</span>`
			: '';
		const depositBadgeInline = showDepositBadge
			? `<span class="public-service-card__deposit-badge public-service-card__deposit-badge--inline">Seña requerida</span>`
			: '';
		const cover = service.image_url
			? `<span class="public-service-card__cover"><img src="${escapeHtml(String(service.image_url))}" alt="" loading="lazy" />${depositBadgeCover}</span>`
			: `<span class="public-service-card__cover public-service-card__cover--brand"${
					showDepositBadge ? '' : ' aria-hidden="true"'
				}>${depositBadgeCover}</span>`;
		return `
		${cover}
		<span class="public-service-card__body">
			<span class="public-service-card__title-row">
				<span class="public-service-card__title text-lg font-medium text-(--on-surface)">${escapeHtml(service.name)}</span>
				${depositBadgeInline}
			</span>
			<div class="public-service-card__meta flex items-center justify-between gap-2 text-sm font-medium text-(--on-surface-variant)">
				<span>${formatDuration(service.duration_minutes)}</span>
				<span>${
					service.hide_public_price === 1
						? escapeHtml(service.hidden_price_label || 'A evaluar')
						: formatCurrency(service.price)
				}</span>
			</div>
		</span>
		<span class="material-symbols-rounded public-service-card__check" aria-hidden="true">check_circle</span>
	`;
	};

	const selectServiceAndAdvance = (service: UserBookingService) => {
		selectedService = service;
		selectedDate = '';
		selectedTime = '';
		availableSlotGroups = [];
		pendingAppointmentId = 0;
		invalidateAvailableDatesCache();
		refreshSummary();
		renderServices();
		renderCalendar();
		draftPersister.schedule();
		setStep(3);
	};

	const softSelectService = (service: UserBookingService) => {
		const changed = selectedService?.id_service !== service.id_service;
		if (changed) {
			selectedService = service;
			selectedDate = '';
			selectedTime = '';
			availableSlotGroups = [];
			pendingAppointmentId = 0;
			invalidateAvailableDatesCache();
			refreshSummary();
			draftPersister.schedule();
		}
		for (const card of servicesGrid.querySelectorAll<HTMLElement>('.public-service-card[data-service-id]')) {
			const id = Number(card.dataset.serviceId ?? 0);
			card.classList.toggle('is-selected', id === service.id_service);
		}
		setPickerContinueEnabled(servicesGrid, true);
	};

	const selectLocationAndAdvance = (location: UserBookingContext) => {
		if (!selectedOrgGroup) return;
		selectedContext = location;
		selectedService = null;
		selectedDate = '';
		selectedTime = '';
		availableSlotGroups = [];
		pendingAppointmentId = 0;
		invalidateAvailableDatesCache();
		refreshSummary();
		renderSucursalStep();
		renderServices();
		renderCalendar();
		draftPersister.schedule();
		setStep(2);
	};

	const softSelectLocation = (location: UserBookingContext, stack?: HTMLElement) => {
		const changed = selectedContext?.id_location !== location.id_location;
		if (changed) {
			selectedContext = location;
			selectedService = null;
			selectedDate = '';
			selectedTime = '';
			availableSlotGroups = [];
			pendingAppointmentId = 0;
			invalidateAvailableDatesCache();
			refreshSummary();
			draftPersister.schedule();
		}
		const rootEl = stack || locationsRoot;
		for (const card of rootEl.querySelectorAll<HTMLElement>('.public-location-card[data-location-id]')) {
			const id = Number(card.dataset.locationId ?? 0);
			card.classList.toggle('is-selected', id === location.id_location);
		}
		if (stack) {
			for (const card of stack.querySelectorAll<HTMLElement>('[data-location-stack-index]')) {
				const index = Number(card.dataset.locationStackIndex ?? -1);
				card.classList.toggle('is-selected', index === locationStackFocusIndex);
			}
		}
		setPickerContinueEnabled(locationsRoot, true);
	};

	const selectOrganizationGroup = (group: OrganizationBookingGroup) => {
		selectedOrgGroup = group;
		clearBookingSelection({ keepOrg: true });
		if (group.locations.length === 1) {
			selectedContext = group.locations[0];
			servicePickerPhase = 'locations';
			refreshSummary();
			renderSucursalStep();
			renderServices();
			renderCalendar();
			draftPersister.schedule();
			setStep(2);
			return;
		}
		servicePickerPhase = 'locations';
		refreshSummary();
		renderSucursalStep();
		renderCalendar();
		draftPersister.schedule();
	};

	const backToOrganizationPicker = () => {
		clearBookingSelection();
		servicePickerPhase = 'orgs';
		refreshSummary();
		renderSucursalStep();
		renderServices();
		renderCalendar();
		draftPersister.schedule();
		setStep(1);
	};

	const renderLocationsStack = (locations: UserBookingContext[]) => {
		const grid = document.createElement('div');
		grid.className = 'public-locations-grid is-location-stack';

		const selectedIndex = selectedContext
			? locations.findIndex((location) => location.id_location === selectedContext?.id_location)
			: -1;
		locationStackFocusIndex =
			selectedIndex >= 0
				? selectedIndex
				: Math.min(Math.max(0, locationStackFocusIndex), Math.max(0, locations.length - 1));

		const stackShell = document.createElement('div');
		stackShell.className = 'public-location-stack-shell';
		const stack = document.createElement('div');
		stack.className = 'public-location-stack';
		stack.setAttribute('role', 'listbox');
		stack.setAttribute('aria-label', 'Sucursales disponibles');
		stack.tabIndex = 0;

		const continueWithFocused = () => {
			const location = locations[locationStackFocusIndex];
			if (location) selectLocationAndAdvance(location);
		};

		let shouldSuppressClick = () => false;

		for (const [index, location] of locations.entries()) {
			const card = document.createElement('div');
			card.setAttribute('role', 'option');
			card.dataset.locationStackIndex = String(index);
			card.dataset.locationId = String(location.id_location);
			card.className = `public-location-card${
				selectedContext?.id_location === location.id_location ? ' is-selected' : ''
			}`;
			card.innerHTML = buildLocationCardContent(location);
			const mainButton = card.querySelector<HTMLButtonElement>('.public-location-card__main');
			mainButton?.addEventListener(
				'click',
				() => {
					if (shouldSuppressClick()) return;
					if (index === locationStackFocusIndex) return;
					locationStackFocusIndex = index;
					syncStackLayers(stack, locationStackFocusIndex, 'data-location-stack-index', {
						farLevels: true,
					});
					softSelectLocation(location, stack);
					triggerPickerHaptic();
				},
				{ signal }
			);
			bindMapImageLifecycle(card, {
				signal,
				onOpenMap: () => {
					void mapController?.openLocationMap(location, { fetchCoordinates: true });
				},
			});
			stack.appendChild(card);
		}

		const gestureApi = bindVerticalStackGestures(stack, {
			signal,
			itemCount: locations.length,
			getFocusIndex: () => locationStackFocusIndex,
			setFocusIndex: (index) => {
				locationStackFocusIndex = index;
			},
			onFocusChanged: () => {
				syncStackLayers(stack, locationStackFocusIndex, 'data-location-stack-index', {
					farLevels: true,
				});
				const location = locations[locationStackFocusIndex];
				if (location) softSelectLocation(location, stack);
			},
			onContinue: continueWithFocused,
		});
		shouldSuppressClick = gestureApi.shouldSuppressClick;

		syncStackLayers(stack, locationStackFocusIndex, 'data-location-stack-index', { farLevels: true });
		const focused = locations[locationStackFocusIndex];
		if (focused) softSelectLocation(focused, stack);

		stackShell.appendChild(stack);
		const continueButton = document.createElement('button');
		continueButton.type = 'button';
		continueButton.className = 'public-booking-continue public-location-stack__continue';
		setContinueButtonContent(continueButton);
		continueButton.addEventListener('click', continueWithFocused, { signal });
		grid.append(stackShell, continueButton);
		locationsRoot.appendChild(grid);
		syncPublicBookingMobileActions(root);
	};

	const buildOrgCardInnerHtml = (group: OrganizationBookingGroup) => {
		const logoUrl = String(group.organization_logo_url || '').trim();
		const logo = logoUrl
			? `<span class="public-org-card__logo"><img src="${escapeHtml(logoUrl)}" alt="" loading="lazy" decoding="async" /></span>`
			: `<span class="public-org-card__logo public-org-card__logo--brand" aria-hidden="true"></span>`;
		return `
			${logo}
			<span class="public-org-card__body">
				<span class="public-org-card__title">${escapeHtml(group.organization_name)}</span>
				<span class="public-org-card__meta">${escapeHtml(formatLocationCountLabel(group.locations.length))}</span>
			</span>
			<span class="material-symbols-rounded public-org-card__check" aria-hidden="true">check_circle</span>
		`;
	};

	const softSelectOrganization = (group: OrganizationBookingGroup, stack?: HTMLElement) => {
		const changed = selectedOrgGroup?.org_id_organization !== group.org_id_organization;
		if (changed) {
			selectedOrgGroup = group;
			selectedContext = null;
			selectedService = null;
			selectedDate = '';
			selectedTime = '';
			availableSlotGroups = [];
			pendingAppointmentId = 0;
			invalidateAvailableDatesCache();
			refreshSummary();
			draftPersister.schedule();
		}
		const rootEl = stack || locationsRoot;
		for (const card of rootEl.querySelectorAll<HTMLElement>('.public-org-card--business[data-org-id]')) {
			const id = Number(card.dataset.orgId ?? 0);
			card.classList.toggle('is-selected', id === group.org_id_organization);
		}
		if (stack) {
			for (const card of stack.querySelectorAll<HTMLElement>('[data-org-stack-index]')) {
				const index = Number(card.dataset.orgStackIndex ?? -1);
				card.classList.toggle('is-selected', index === orgStackFocusIndex);
			}
		}
		setPickerContinueEnabled(locationsRoot, true);
	};

	const renderOrgsStack = (groups: OrganizationBookingGroup[]) => {
		const grid = document.createElement('div');
		grid.className = 'public-orgs-grid is-org-stack';

		const selectedIndex = selectedOrgGroup
			? groups.findIndex((group) => group.org_id_organization === selectedOrgGroup?.org_id_organization)
			: -1;
		orgStackFocusIndex =
			selectedIndex >= 0
				? selectedIndex
				: Math.min(Math.max(0, orgStackFocusIndex), Math.max(0, groups.length - 1));

		const stackShell = document.createElement('div');
		stackShell.className = 'public-location-stack-shell';
		const stack = document.createElement('div');
		stack.className = 'public-location-stack public-org-stack';
		stack.setAttribute('role', 'listbox');
		stack.setAttribute('aria-label', 'Negocios disponibles');
		stack.tabIndex = 0;

		const continueWithFocused = () => {
			const group = groups[orgStackFocusIndex];
			if (group) selectOrganizationGroup(group);
		};

		let shouldSuppressClick = () => false;

		for (const [index, group] of groups.entries()) {
			const card = document.createElement('button');
			card.type = 'button';
			card.setAttribute('role', 'option');
			card.dataset.orgStackIndex = String(index);
			card.dataset.orgId = String(group.org_id_organization);
			card.className = `public-org-card public-org-card--business${
				selectedOrgGroup?.org_id_organization === group.org_id_organization ? ' is-selected' : ''
			}`;
			card.innerHTML = buildOrgCardInnerHtml(group);
			card.addEventListener(
				'click',
				() => {
					if (shouldSuppressClick()) return;
					if (index === orgStackFocusIndex) return;
					orgStackFocusIndex = index;
					syncStackLayers(stack, orgStackFocusIndex, 'data-org-stack-index', {
						farLevels: true,
					});
					softSelectOrganization(group, stack);
					triggerPickerHaptic();
				},
				{ signal }
			);
			stack.appendChild(card);
		}

		const gestureApi = bindVerticalStackGestures(stack, {
			signal,
			itemCount: groups.length,
			getFocusIndex: () => orgStackFocusIndex,
			setFocusIndex: (index) => {
				orgStackFocusIndex = index;
			},
			onFocusChanged: () => {
				syncStackLayers(stack, orgStackFocusIndex, 'data-org-stack-index', {
					farLevels: true,
				});
				const group = groups[orgStackFocusIndex];
				if (group) softSelectOrganization(group, stack);
			},
			onContinue: continueWithFocused,
		});
		shouldSuppressClick = gestureApi.shouldSuppressClick;

		syncStackLayers(stack, orgStackFocusIndex, 'data-org-stack-index', { farLevels: true });
		const focused = groups[orgStackFocusIndex];
		if (focused) softSelectOrganization(focused, stack);

		stackShell.appendChild(stack);
		const continueButton = document.createElement('button');
		continueButton.type = 'button';
		continueButton.className = 'public-booking-continue public-location-stack__continue';
		setContinueButtonContent(continueButton);
		continueButton.addEventListener('click', continueWithFocused, { signal });
		grid.append(stackShell, continueButton);
		locationsRoot.appendChild(grid);
		syncPublicBookingMobileActions(root);
	};

	const renderOrgsGrid = (groups: OrganizationBookingGroup[]) => {
		const list = document.createElement('div');
		list.className = 'public-orgs-grid is-org-grid';

		const initialPageIndex = getOrgGridInitialPageIndex(
			groups,
			selectedOrgGroup?.org_id_organization ?? null,
			orgGridPageIndex
		);
		const { pageShell, pagination } = mountPaginatedOrgGrid({
			groups,
			initialPageIndex,
			signal,
			onPageIndexChange: (pageIndex) => {
				orgGridPageIndex = pageIndex;
			},
			renderCard: (group) => {
				const button = document.createElement('button');
				button.type = 'button';
				button.className = `public-org-card public-org-card--business${
					selectedOrgGroup?.org_id_organization === group.org_id_organization ? ' is-selected' : ''
				}`;
				button.dataset.orgId = String(group.org_id_organization);
				button.innerHTML = buildOrgCardInnerHtml(group);
				button.addEventListener('click', () => selectOrganizationGroup(group), { signal });
				return button;
			},
		});

		list.append(pageShell, pagination);
		locationsRoot.appendChild(list);
	};

	const renderSucursalStep = () => {
		orgGroups = buildOrganizationGroups(profile.locations);
		locationsRoot.innerHTML = '';

		if (orgGroups.length === 0) {
			servicePickerPhase = 'orgs';
			updateStep1Copy();
			const empty = document.createElement('p');
			empty.className =
				'rounded-2xl bg-[var(--surface-container-high)] px-5 py-4 text-base font-medium text-[var(--on-surface-variant)]';
			empty.textContent = 'Este profesional no tiene negocios disponibles para reservar.';
			locationsRoot.appendChild(empty);
			syncPublicBookingMobileActions(root);
			return;
		}

		if (orgGroups.length === 1 && !selectedOrgGroup) {
			selectedOrgGroup = orgGroups[0];
			servicePickerPhase = 'locations';
			if (selectedOrgGroup.locations.length === 1) {
				selectedContext = selectedOrgGroup.locations[0];
			}
		}

		if (
			selectedOrgGroup &&
			!orgGroups.some(
				(group) => group.org_id_organization === selectedOrgGroup?.org_id_organization
			)
		) {
			selectedOrgGroup = null;
			selectedContext = null;
			servicePickerPhase = 'orgs';
		}

		updateStep1Copy();

		if (servicePickerPhase === 'orgs') {
			if (isMobileStack()) {
				renderOrgsStack(orgGroups);
			} else {
				renderOrgsGrid(orgGroups);
			}
			syncPublicBookingMobileActions(root);
			return;
		}

		const group = selectedOrgGroup;
		if (!group) {
			servicePickerPhase = 'orgs';
			renderSucursalStep();
			return;
		}

		const locations = group.locations;
		if (locations.length === 0) {
			const empty = document.createElement('p');
			empty.className =
				'rounded-2xl bg-[var(--surface-container-high)] px-5 py-4 text-base font-medium text-[var(--on-surface-variant)]';
			empty.textContent = 'No hay sucursales disponibles en este negocio.';
			locationsRoot.appendChild(empty);
			syncPublicBookingMobileActions(root);
			return;
		}

		if (isMobileStack()) {
			renderLocationsStack(locations);
		} else {
			renderLocationsGrid(locations);
		}
		syncPublicBookingMobileActions(root);
		if (selectedContext) setPickerContinueEnabled(locationsRoot, true);
	};

	const renderLocationsGrid = (locations: UserBookingContext[]) => {
		const grid = document.createElement('div');
		grid.className = 'public-locations-grid is-location-grid';

		for (const location of locations) {
			const card = document.createElement('div');
			card.dataset.locationId = String(location.id_location);
			card.className = `public-location-card${
				selectedContext?.id_location === location.id_location ? ' is-selected' : ''
			}`;
			card.innerHTML = buildLocationCardContent(location);

			const mainButton = card.querySelector<HTMLButtonElement>('.public-location-card__main');
			mainButton?.addEventListener('click', () => softSelectLocation(location), { signal });
			bindMapImageLifecycle(card, {
				signal,
				onOpenMap: () => {
					void mapController?.openLocationMap(location, { fetchCoordinates: true });
				},
			});
			grid.appendChild(card);
		}

		grid.appendChild(
			createContinueButton(
				() => {
					if (!selectedContext) {
						showToast('Seleccioná una sucursal para continuar.');
						return;
					}
					selectLocationAndAdvance(selectedContext);
				},
				{ signal, disabled: !selectedContext }
			)
		);
		locationsRoot.appendChild(grid);
	};

	const renderServicesStack = (services: UserBookingService[], depositsEnabled: boolean) => {
		servicesGrid.classList.add('is-service-stack');
		servicesGrid.classList.remove('is-service-carousel', 'is-service-grid');

		const selectedIndex = selectedService
			? services.findIndex((service) => service.id_service === selectedService?.id_service)
			: -1;
		serviceStackFocusIndex =
			selectedIndex >= 0
				? selectedIndex
				: Math.min(Math.max(0, serviceStackFocusIndex), Math.max(0, services.length - 1));

		const stackShell = document.createElement('div');
		stackShell.className = 'public-service-stack-shell';
		const stack = document.createElement('div');
		stack.className = 'public-service-stack';
		stack.setAttribute('role', 'listbox');
		stack.setAttribute('aria-label', 'Servicios disponibles');
		stack.tabIndex = 0;

		const continueWithFocused = () => {
			const service = services[serviceStackFocusIndex];
			if (service) selectServiceAndAdvance(service);
		};

		let shouldSuppressClick = () => false;

		for (const [index, service] of services.entries()) {
			const button = document.createElement('button');
			button.type = 'button';
			button.setAttribute('role', 'option');
			button.dataset.serviceStackIndex = String(index);
			button.dataset.serviceId = String(service.id_service);
			button.className = `public-service-card${
				selectedService?.id_service === service.id_service ? ' is-selected' : ''
			}`;
			button.innerHTML = buildServiceCardInnerHtml(service, depositsEnabled);
			button.addEventListener(
				'click',
				() => {
					if (shouldSuppressClick()) return;
					if (index === serviceStackFocusIndex) return;
					serviceStackFocusIndex = index;
					syncStackLayers(stack, serviceStackFocusIndex, 'data-service-stack-index');
					softSelectService(service);
					triggerPickerHaptic();
				},
				{ signal }
			);
			stack.appendChild(button);
		}

		const gestureApi = bindVerticalStackGestures(stack, {
			signal,
			itemCount: services.length,
			getFocusIndex: () => serviceStackFocusIndex,
			setFocusIndex: (index) => {
				serviceStackFocusIndex = index;
			},
			onFocusChanged: () => {
				syncStackLayers(stack, serviceStackFocusIndex, 'data-service-stack-index');
				const service = services[serviceStackFocusIndex];
				if (service) softSelectService(service);
			},
			onContinue: continueWithFocused,
		});
		shouldSuppressClick = gestureApi.shouldSuppressClick;

		syncStackLayers(stack, serviceStackFocusIndex, 'data-service-stack-index');
		const focused = services[serviceStackFocusIndex];
		if (focused) softSelectService(focused);

		stackShell.appendChild(stack);
		const continueButton = document.createElement('button');
		continueButton.type = 'button';
		continueButton.className = 'public-booking-continue public-service-stack__continue';
		setContinueButtonContent(continueButton);
		continueButton.addEventListener('click', continueWithFocused, { signal });
		servicesGrid.append(stackShell, continueButton);
	};

	const renderServicesGrid = (services: UserBookingService[], depositsEnabled: boolean) => {
		servicesGrid.classList.add('is-service-grid');
		servicesGrid.classList.remove('is-service-stack', 'is-service-carousel');

		const initialPageIndex = getServiceGridInitialPageIndex(
			services,
			selectedService?.id_service ?? null,
			serviceGridPageIndex
		);
		const { pageShell, pagination } = mountPaginatedServiceGrid({
			services,
			initialPageIndex,
			signal,
			onPageIndexChange: (pageIndex) => {
				serviceGridPageIndex = pageIndex;
			},
			renderCard: (service) => {
				const button = document.createElement('button');
				button.type = 'button';
				button.dataset.serviceId = String(service.id_service);
				button.className = `public-service-card${
					selectedService?.id_service === service.id_service ? ' is-selected' : ''
				}`;
				button.innerHTML = buildServiceCardInnerHtml(service, depositsEnabled);
				button.addEventListener('click', () => softSelectService(service), { signal });
				return button;
			},
		});

		servicesGrid.append(pageShell, pagination);
		servicesGrid.appendChild(
			createContinueButton(
				() => {
					if (!selectedService) {
						showToast('Seleccioná un servicio para continuar.');
						return;
					}
					selectServiceAndAdvance(selectedService);
				},
				{ signal, disabled: !selectedService }
			)
		);
	};

	const renderServices = () => {
		servicesGrid.innerHTML = '';
		servicesGrid.removeAttribute('aria-busy');
		servicesGrid.classList.remove('is-service-stack', 'is-service-carousel', 'is-service-grid');

		const group = selectedOrgGroup;
		if (!group || !selectedContext) {
			const empty = document.createElement('p');
			empty.className =
				'rounded-2xl bg-[var(--surface-container-high)] px-5 py-4 text-base font-medium text-[var(--on-surface-variant)]';
			empty.textContent = 'Seleccioná una sucursal para ver los servicios.';
			servicesGrid.appendChild(empty);
			return;
		}

		const services = group.services;
		if (services.length === 0) {
			const empty = document.createElement('p');
			empty.className =
				'rounded-2xl bg-[var(--surface-container-high)] px-5 py-4 text-base font-medium text-[var(--on-surface-variant)]';
			empty.textContent = 'No hay servicios disponibles en este negocio.';
			servicesGrid.appendChild(empty);
			return;
		}

		const depositsEnabled = group.locations.some((location) =>
			isDepositsEnabled(location.deposit_settings)
		);

		if (isMobileStack()) {
			renderServicesStack(services, depositsEnabled);
		} else {
			renderServicesGrid(services, depositsEnabled);
		}
		syncPublicBookingMobileActions(root);
		if (selectedService) setPickerContinueEnabled(servicesGrid, true);
	};

	const getSelectedSlotKey = () => {
		if (!selectedTime) return '';
		const locationId =
			selectedContext?.id_location ??
			availableSlotGroups.find((group) => group.slots.includes(selectedTime))?.location
				.id_location ??
			0;
		return locationId ? `${locationId}:${selectedTime}` : '';
	};

	const formatSlotLabelAmPm = (slot: string) => {
		const match = String(slot || '')
			.trim()
			.match(/^(\d{1,2}):(\d{2})$/);
		if (!match) return { time: slot, meridiem: '' };
		const hour = Number(match[1]);
		if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
			return { time: slot, meridiem: '' };
		}
		return {
			time: `${String(hour).padStart(2, '0')}:${match[2]}`,
			meridiem: hour < 12 ? 'A.M.' : 'P.M.',
		};
	};

	const slotFocusByLocation = new Map<number, number>();

	const selectSlotAndAdvance = (group: LocationSlotGroup, slot: string) => {
		selectedTime = slot;
		selectedContext = group.location;
		pendingAppointmentId = 0;
		refreshSummary();
		draftPersister.schedule();
		setStep(5);
	};

	const softPickSlot = (group: LocationSlotGroup, slot: string, slotKey: string) => {
		selectedTime = slot;
		selectedContext = group.location;
		pendingAppointmentId = 0;
		refreshSummary();
		draftPersister.schedule();
		for (const btn of slotsContainer.querySelectorAll<HTMLElement>('.public-slot-time')) {
			btn.classList.toggle('is-selected', btn.dataset.slotKey === slotKey);
		}
		syncDatetimeContinue();
	};

	const softSelectSlot = (
		group: LocationSlotGroup,
		slot: string,
		roulette: HTMLElement,
		focusedIndex: number
	) => {
		const changed =
			selectedTime !== slot || selectedContext?.id_location !== group.location.id_location;
		if (changed) {
			selectedTime = slot;
			selectedContext = group.location;
			pendingAppointmentId = 0;
			refreshSummary();
			draftPersister.schedule();
		}
		for (const button of roulette.querySelectorAll<HTMLElement>('[data-slot-roulette-index]')) {
			const index = Number(button.dataset.slotRouletteIndex ?? -1);
			button.classList.toggle('is-selected', index === focusedIndex);
		}
	};

	const syncSlotRouletteLayers = (roulette: HTMLElement, focusedIndex: number) => {
		const buttons = Array.from(
			roulette.querySelectorAll<HTMLElement>('[data-slot-roulette-index]')
		);

		for (const button of buttons) {
			const index = Number(button.dataset.slotRouletteIndex ?? -1);
			const distance = index - focusedIndex;
			button.classList.remove(
				'is-focus',
				'is-near',
				'is-near-up',
				'is-near-down',
				'is-far-up',
				'is-far-down',
				'is-far'
			);

			const role =
				distance === 0
					? 'focus'
					: distance === -1
						? 'near-up'
						: distance === 1
							? 'near-down'
							: distance === -2
								? 'far-up'
								: distance === 2
									? 'far-down'
									: 'far';

			button.setAttribute('aria-selected', role === 'focus' ? 'true' : 'false');
			button.tabIndex = role === 'focus' ? 0 : -1;
			if (role === 'focus') button.classList.add('is-focus');
			else if (role === 'near-up') button.classList.add('is-near', 'is-near-up');
			else if (role === 'near-down') button.classList.add('is-near', 'is-near-down');
			else if (role === 'far-up') button.classList.add('is-far-up');
			else if (role === 'far-down') button.classList.add('is-far-down');
			else button.classList.add('is-far');
		}
	};

	const mountSlotGrid = (
		section: HTMLElement,
		group: LocationSlotGroup,
		selectedSlotKey: string
	) => {
		const periods = document.createElement('div');
		periods.className = 'public-slot-periods';

		forEachSlotPeriod(group.slots, (period) => {
			const block = document.createElement('div');
			block.className = 'public-slot-period';
			block.dataset.slotPeriod = period.key;

			const heading = document.createElement('p');
			heading.className = 'public-slot-period__label';
			heading.textContent = period.label;
			block.appendChild(heading);

			const grid = document.createElement('div');
			grid.className = 'public-slot-pill-grid';

			for (const slot of period.slots) {
				const slotKey = `${group.location.id_location}:${slot}`;
				const isSelected = selectedSlotKey === slotKey;
				const button = document.createElement('button');
				button.type = 'button';
				const time = formatSlotLabel24h(slot);
				button.innerHTML = `<span class="public-slot-time__label">${escapeHtml(time)}</span>`;
				button.setAttribute(
					'aria-label',
					`${time} de la ${period.key === 'morning' ? 'mañana' : 'tarde'}`
				);
				button.dataset.slotKey = slotKey;
				button.className =
					'public-slot-time public-slot-time--pill flex min-h-11 items-center justify-center rounded-xl border px-2 py-3 text-sm font-medium transition' +
					(isSelected ? ' is-selected' : '');
				button.addEventListener(
					'click',
					() => {
						softPickSlot(group, slot, slotKey);
					},
					{ signal }
				);
				grid.appendChild(button);
			}

			block.appendChild(wrapSlotPillGrid(grid, { signal }));
			periods.appendChild(block);
		});

		section.appendChild(periods);
	};

	const mountSlotRoulette = (
		section: HTMLElement,
		group: LocationSlotGroup,
		selectedSlotKey: string
	) => {
		const locationId = group.location.id_location;
		const totalSlots = group.slots.length;
		const selectedIndex = group.slots.findIndex(
			(slot) => `${locationId}:${slot}` === selectedSlotKey
		);
		let focusedIndex =
			selectedIndex >= 0
				? selectedIndex
				: Math.min(
						Math.max(0, slotFocusByLocation.get(locationId) ?? 0),
						Math.max(0, totalSlots - 1)
					);
		slotFocusByLocation.set(locationId, focusedIndex);

		const shell = document.createElement('div');
		shell.className = 'public-slot-roulette-shell';

		const roulette = document.createElement('div');
		roulette.className = 'public-slot-roulette';
		roulette.setAttribute('role', 'listbox');
		roulette.setAttribute(
			'aria-label',
			`Horarios en ${group.location.name || 'sucursal'}`
		);
		roulette.tabIndex = 0;

		let touchStartY: number | null = null;
		let touchMoved = false;
		let lastStepY: number | null = null;
		let wheelLockedUntil = 0;
		let suppressClickUntil = 0;
		let lastFocusAt = 0;
		const STEP_PX = 62;
		const MAX_STEPS_PER_MOVE = 1;
		const MIN_FOCUS_INTERVAL_MS = 70;
		const WHEEL_LOCK_MS = 380;

		const continueWithFocused = () => {
			const slot = group.slots[focusedIndex];
			if (slot) selectSlotAndAdvance(group, slot);
		};

		const applyFocus = (nextIndex: number) => {
			if (nextIndex === focusedIndex) return;
			focusedIndex = nextIndex;
			slotFocusByLocation.set(locationId, focusedIndex);
			syncSlotRouletteLayers(roulette, focusedIndex);
			const slot = group.slots[focusedIndex];
			if (slot) softSelectSlot(group, slot, roulette, focusedIndex);
			triggerPickerHaptic();
		};

		const moveFocus = (delta: number) => {
			if (totalSlots <= 0) return;
			applyFocus(Math.min(Math.max(0, focusedIndex + delta), totalSlots - 1));
		};

		for (const [index, slot] of group.slots.entries()) {
			const button = document.createElement('button');
			button.type = 'button';
			button.setAttribute('role', 'option');
			button.dataset.slotRouletteIndex = String(index);
			const { time, meridiem } = formatSlotLabelAmPm(slot);
			button.innerHTML = meridiem
				? `<span class="public-slot-time__label">${escapeHtml(time)} <span class="public-slot-time__meridiem">${escapeHtml(meridiem)}</span></span>`
				: `<span class="public-slot-time__label">${escapeHtml(slot)}</span>`;
			button.setAttribute('aria-label', meridiem ? `${time} ${meridiem}` : slot);
			button.className =
				'public-slot-time public-slot-time--roulette' +
				(`${locationId}:${slot}` === selectedSlotKey ? ' is-selected' : '');
			button.addEventListener(
				'click',
				() => {
					if (Date.now() < suppressClickUntil) return;
					applyFocus(index);
				},
				{ signal }
			);
			roulette.appendChild(button);
		}

		syncSlotRouletteLayers(roulette, focusedIndex);
		const focusedSlot = group.slots[focusedIndex];
		if (focusedSlot) softSelectSlot(group, focusedSlot, roulette, focusedIndex);

		roulette.addEventListener(
			'touchstart',
			(event) => {
				if (event.touches.length !== 1) return;
				const y = event.touches[0]?.clientY ?? null;
				touchStartY = y;
				lastStepY = y;
				touchMoved = false;
			},
			{ signal, passive: true }
		);

		roulette.addEventListener(
			'touchmove',
			(event) => {
				if (touchStartY == null || lastStepY == null || event.touches.length !== 1) return;
				const currentY = event.touches[0]?.clientY ?? touchStartY;
				const deltaFromStart = currentY - touchStartY;
				if (Math.abs(deltaFromStart) > 8) {
					touchMoved = true;
					event.preventDefault();
				}
				const stepDelta = currentY - lastStepY;
				if (Math.abs(stepDelta) < STEP_PX) return;
				const now = Date.now();
				if (now - lastFocusAt < MIN_FOCUS_INTERVAL_MS) return;
				event.preventDefault();
				let steps = Math.trunc(stepDelta / STEP_PX);
				steps = Math.max(-MAX_STEPS_PER_MOVE, Math.min(MAX_STEPS_PER_MOVE, steps));
				if (steps === 0) return;
				lastStepY += steps * STEP_PX;
				lastFocusAt = now;
				suppressClickUntil = now + 350;
				moveFocus(-steps);
			},
			{ signal, passive: false }
		);

		roulette.addEventListener(
			'touchend',
			() => {
				touchStartY = null;
				lastStepY = null;
				if (touchMoved) suppressClickUntil = Date.now() + 350;
				touchMoved = false;
			},
			{ signal }
		);

		roulette.addEventListener(
			'touchcancel',
			() => {
				touchStartY = null;
				lastStepY = null;
				touchMoved = false;
			},
			{ signal }
		);

		roulette.addEventListener(
			'click',
			(event) => {
				if (Date.now() < suppressClickUntil) {
					event.preventDefault();
					event.stopPropagation();
				}
			},
			{ signal, capture: true }
		);

		roulette.addEventListener(
			'wheel',
			(event) => {
				const now = Date.now();
				if (now < wheelLockedUntil) {
					event.preventDefault();
					return;
				}
				if (Math.abs(event.deltaY) < 8) return;
				event.preventDefault();
				wheelLockedUntil = now + WHEEL_LOCK_MS;
				moveFocus(event.deltaY > 0 ? 1 : -1);
			},
			{ signal, passive: false }
		);

		roulette.addEventListener(
			'keydown',
			(event) => {
				if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
					event.preventDefault();
					moveFocus(1);
				} else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
					event.preventDefault();
					moveFocus(-1);
				} else if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					continueWithFocused();
				}
			},
			{ signal }
		);

		shell.appendChild(roulette);

		const continueButton = document.createElement('button');
		continueButton.type = 'button';
		continueButton.className = 'public-booking-continue public-slot-roulette__continue';
		setContinueButtonContent(continueButton);
		continueButton.addEventListener('click', continueWithFocused, { signal });

		section.appendChild(shell);
		section.appendChild(continueButton);
	};

	const renderSlots = () => {
		slotsContainer.innerHTML = '';
		if (!selectedDate) {
			availableSlotGroups = [];
			isLoadingSlots = false;
			slotsLoadingNode.classList.add('hidden');
			slotsHint?.toggleAttribute('hidden', true);
			noSlotsNode.classList.add('hidden');
			syncDatetimeContinue();
			syncPublicBookingMobileActions(root);
			return;
		}

		slotsLoadingNode.classList.toggle('hidden', !isLoadingSlots);

		const totalSlots = availableSlotGroups.reduce(
			(count, group) => count + group.slots.length,
			0
		);
		slotsHint?.toggleAttribute('hidden', !isLoadingSlots && totalSlots > 0);
		noSlotsNode.classList.toggle('hidden', isLoadingSlots || totalSlots > 0);
		if (isLoadingSlots) {
			syncDatetimeContinue();
			syncPublicBookingMobileActions(root);
			return;
		}

		const selectedSlotKey = getSelectedSlotKey();
		const visibleGroups = availableSlotGroups.filter((group) => group.slots.length > 0);
		const showLocationHeaders = visibleGroups.length > 1;
		let branchToneIndex = 0;

		for (const group of visibleGroups) {
			const section = document.createElement('section');
			section.className = showLocationHeaders
				? `public-slot-branch public-slot-branch--tone-${branchToneIndex % 4}`
				: 'public-slot-branch';
			branchToneIndex += 1;

			if (showLocationHeaders) {
				appendLocationSlotHeader(section, group.location, {
					onAddressClick: (location) => {
						void mapController?.openLocationMap(location as MapLocation, {
							fetchCoordinates: true,
						});
					},
				});
			}

			mountSlotGrid(section, group, selectedSlotKey);
			slotsContainer.appendChild(section);
		}
		syncDatetimeContinue();
		syncPublicBookingMobileActions(root);
	};

	renderCalendar = () => {
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
		const cacheKey = availableDatesMonthKey(year, month);
		const availableDates = availableDatesCache.get(cacheKey);
		const isLoadingAvailability = availableDatesLoadingKey === cacheKey;
		const calendarRoot = calendarGrid.closest('.public-booking-calendar');
		calendarRoot?.classList.toggle('is-loading-availability', isLoadingAvailability);
		calendarGrid.classList.toggle('is-loading', isLoadingAvailability);
		calendarGrid.setAttribute('aria-busy', isLoadingAvailability ? 'true' : 'false');

		for (let blank = 0; blank < firstWeekday; blank += 1) {
			const placeholder = document.createElement('span');
			placeholder.className = 'public-cal-day--empty';
			calendarGrid.appendChild(placeholder);
		}

		for (let day = 1; day <= daysInMonth; day += 1) {
			const dateValue = new Date(year, month, day);
			const dateKey = formatApiDate(dateValue);
			const dateStart = toDateStart(dateValue);
			const isPast = dateStart.getTime() < today.getTime();
			const isToday = dateStart.getTime() === today.getTime();
			const isSelected = selectedDate === dateKey;

			if (isLoadingAvailability && !isPast && selectedService && selectedOrgGroup) {
				const skeleton = document.createElement('span');
				skeleton.className = 'public-cal-day--skeleton';
				skeleton.setAttribute('aria-hidden', 'true');
				calendarGrid.appendChild(skeleton);
				continue;
			}

			const isUnavailable =
				!isPast &&
				Boolean(selectedService && selectedOrgGroup) &&
				(availableDates ? !availableDates.has(dateKey) : false);

			const dayButton = document.createElement('button');
			dayButton.type = 'button';
			dayButton.textContent = String(day);
			dayButton.disabled = isPast || !selectedService || !selectedOrgGroup || isUnavailable;
			dayButton.className = [
				isSelected ? 'is-selected' : '',
				isToday ? 'is-today' : '',
				isPast ? 'is-past' : '',
				isUnavailable ? 'is-unavailable' : '',
			]
				.filter(Boolean)
				.join(' ');
			if (isUnavailable && !isPast) {
				dayButton.title = 'Sin horarios disponibles';
			}

			dayButton.addEventListener(
				'click',
				() => {
					if (!selectedService || !selectedOrgGroup) return;
					selectedDate = dateKey;
					selectedTime = '';
					pendingAppointmentId = 0;
					refreshSummary();
					renderCalendar();
					draftPersister.schedule();
					void loadSlots(dateKey, { skipStepChange: true });
				},
				{ signal }
			);

			calendarGrid.appendChild(dayButton);
		}

		const selectionHint = !selectedService
			? 'Elegí un servicio para ver los días disponibles.'
			: !selectedOrgGroup
				? 'Elegí una sucursal para ver los días disponibles.'
				: null;
		syncCalendarSelectionHint(calendarRoot, selectionHint);
	};

	const loadSlots = async (
		targetDate: string,
		options?: { preserveSelection?: boolean; skipStepChange?: boolean }
	) => {
		const service = selectedService;
		const orgGroup = selectedOrgGroup;
		if (!service || !orgGroup) return;

		const preservedTime = options?.preserveSelection ? selectedTime : '';
		const lockedLocationId = selectedContext?.id_location ?? 0;
		const preservedLocationId = options?.preserveSelection
			? lockedLocationId
			: lockedLocationId;

		isLoadingSlots = true;
		availableSlotGroups = [];
		if (!options?.preserveSelection) {
			selectedTime = '';
		}
		renderSlots();
		if (!options?.skipStepChange && step !== 3) setStep(3);

		try {
			const locationTargets =
				lockedLocationId > 0
					? orgGroup.locations.filter((location) => location.id_location === lockedLocationId)
					: orgGroup.locations;

			const results = await Promise.allSettled(
				locationTargets.map(async (location) => ({
					location,
					slots: await fetchAvailableSlots({
						pro_id: location.id_professional,
						loc_id: location.id_location,
						ser_id: service.id_service,
						target_date: targetDate,
					}),
				}))
			);

			if (results.every((result) => result.status === 'rejected')) {
				const firstError = results.find(
					(result): result is PromiseRejectedResult => result.status === 'rejected'
				);
				throw firstError?.reason;
			}

			availableSlotGroups = results
				.filter(
					(result): result is PromiseFulfilledResult<LocationSlotGroup> =>
						result.status === 'fulfilled'
				)
				.map((result) => result.value)
				.filter((group) => group.slots.length > 0)
				.sort((left, right) =>
					formatBranchLabel(left.location).localeCompare(
						formatBranchLabel(right.location),
						'es',
						{ sensitivity: 'base' }
					)
				);

			if (options?.preserveSelection && preservedTime) {
				const match = availableSlotGroups.find(
					(group) =>
						(!preservedLocationId ||
							group.location.id_location === preservedLocationId) &&
						group.slots.includes(preservedTime)
				);
				if (match) {
					selectedTime = preservedTime;
					selectedContext = match.location;
				} else {
					selectedTime = '';
					if (preservedLocationId > 0) {
						selectedContext =
							orgGroup.locations.find(
								(location) => location.id_location === preservedLocationId
							) ?? selectedContext;
					}
				}
			} else if (lockedLocationId > 0) {
				selectedContext =
					orgGroup.locations.find((location) => location.id_location === lockedLocationId) ??
					selectedContext;
			}
		} catch (error) {
			availableSlotGroups = [];
			showToast(error instanceof Error ? error.message : 'No fue posible consultar horarios.', 'error');
		} finally {
			isLoadingSlots = false;
			if (selectedDate !== targetDate) {
				availableSlotGroups = [];
			}
			renderSlots();
		}
	};

	const setPhoneFieldError = (message: string) => {
		const node = customerForm.querySelector<HTMLElement>('[data-field-error="customer_phone"]');
		if (!node) return;
		node.textContent = message;
		node.classList.toggle('hidden', !message);
	};

	const setNameFieldError = (message: string) => {
		const node = customerForm.querySelector<HTMLElement>('[data-field-error="customer_name"]');
		if (!node) return;
		node.textContent = message;
		node.classList.toggle('hidden', !message);
	};

	const setPolicyFieldError = (message: string) => {
		const node = root.querySelector<HTMLElement>('[data-field-error="policy_accepted"]');
		if (!node) return;
		node.textContent = message;
		node.classList.toggle('hidden', !message);
	};

	const setSubmitError = (message: string) => {
		if (!submitErrorNode) return;
		submitErrorNode.textContent = message;
		submitErrorNode.classList.toggle('hidden', !message);
	};

	const setCustomerNameVisibility = (visible: boolean) => {
		customerNameWrapper.classList.toggle('hidden', !visible);
		customerNameInput.required = visible;
	};

	const setCustomerNameLocked = (locked: boolean) => {
		customerNameInput.disabled = locked;
	};

	const resetCustomerLookupState = () => {
		validatedCustomerPhoneE164 = '';
		customerNameInput.value = '';
		setCustomerNameLocked(false);
		setCustomerNameVisibility(false);
	};

	const runCustomerValidation = async (phoneE164: string) => {
		const orgId =
			selectedContext?.org_id_organization ?? selectedOrgGroup?.org_id_organization ?? 0;
		if (!orgId) return false;
		if (
			validatedCustomerPhoneE164 === phoneE164 &&
			!customerNameWrapper.classList.contains('hidden')
		) {
			return true;
		}

		isValidatingCustomer = true;
		setNameFieldError('');
		setCustomerNameVisibility(false);
		try {
			const result = await validateCustomerPhone(phoneE164, orgId);
			validatedCustomerPhoneE164 = phoneE164;
			setCustomerNameVisibility(true);

			if (result.exists && result.fullName) {
				customerNameInput.value = result.fullName;
				setCustomerNameLocked(true);
			} else {
				customerNameInput.value = '';
				setCustomerNameLocked(false);
			}
			return true;
		} catch (error) {
			resetCustomerLookupState();
			showToast(error instanceof Error ? error.message : 'No fue posible validar el teléfono.', 'error');
			return false;
		} finally {
			isValidatingCustomer = false;
		}
	};

	const buildAppointmentPayload = async (reserveForDeposit: boolean) => {
		if (!selectedService || !selectedContext || !selectedDate || !selectedTime) {
			setSubmitError('Seleccioná servicio, fecha, horario y sucursal.');
			return null;
		}

		const rawPhone = customerPhoneInput.value.trim();
		if (!rawPhone) {
			setPhoneFieldError('El teléfono es obligatorio.');
			return null;
		}

		const parsedPhone = parseParaguayMobilePhone(toParaguayMobileE164FromInput(rawPhone));
		if (!parsedPhone.isValid) {
			setPhoneFieldError(PARAGUAY_MOBILE_PHONE_ERROR);
			return null;
		}

		customerPhoneInput.value = formatParaguayMobilePhoneInput(rawPhone);
		if (validatedCustomerPhoneE164 !== parsedPhone.e164 || customerNameWrapper.classList.contains('hidden')) {
			const ok = await runCustomerValidation(parsedPhone.e164);
			if (!ok) return null;
		}

		const customerName = String(customerNameInput.value || '').trim();
		if (!customerName) {
			setNameFieldError('El nombre completo es obligatorio.');
			return null;
		}

		if (reserveForDeposit && !depositPolicyAccept?.checked) {
			setPolicyFieldError('Debés aceptar la política de cancelación para continuar.');
			return null;
		}

		if (reserveForDeposit && !isDepositsEnabled(selectedContext.deposit_settings)) {
			setSubmitError('Este negocio aún no tiene habilitado el cobro de señas.');
			return null;
		}

		const appointmentTimes = buildApiAppointmentTimes(
			selectedDate,
			selectedTime,
			selectedService.duration_minutes
		);
		if (!appointmentTimes) {
			setSubmitError('No fue posible interpretar la fecha y hora seleccionada.');
			return null;
		}

		return {
			org_id_organization: selectedContext.org_id_organization,
			loc_id_location: selectedContext.id_location,
			pro_id_professional: selectedContext.id_professional,
			ser_id_service: selectedService.id_service,
			customer_name: customerName,
			customer_phone: parsedPhone.e164,
			start_time: appointmentTimes.start_time,
			end_time: appointmentTimes.end_time,
			reserve_for_deposit: reserveForDeposit,
			...(reserveForDeposit ? { policy_accepted: true } : {}),
		};
	};

	const finalizeSuccess = () => {
		draftPersister.clear();
		populateSuccessTicket();
		setStep(6);
	};

	const finalizeDepositHold = (hold: Record<string, unknown>) => {
		draftPersister.clear();
		const unwrapped = unwrapSipapHold(hold as any);
		fillSipapDepositPanel(root, unwrapped, selectedContext?.deposit_settings, {
			serviceName: selectedService?.name,
			professionalName: profile.full_name,
			depositAmount: calculateDepositAmount(selectedService),
		});
		populateSuccessTicket();
		// Persistir el hold para que el paso "Transferí la seña" sobreviva a un F5
		// o al cierre del navegador dentro de la ventana de pago.
		writeSipapHold(holdStorageKey, unwrapped as unknown as Record<string, unknown>, {
			serviceId: selectedService?.id_service ?? 0,
			serviceName: selectedService?.name,
			professionalName: profile.full_name,
			depositAmount: calculateDepositAmount(selectedService),
			date: selectedDate,
			time: selectedTime,
			locationId: selectedContext?.id_location ?? null,
		});
		setStep(7);
	};

	const submitBooking = async (reserveForDeposit: boolean) => {
		if (isSubmitting) return;
		setSubmitError('');
		setPhoneFieldError('');
		setNameFieldError('');
		setPolicyFieldError('');

		const payload = await buildAppointmentPayload(reserveForDeposit);
		if (!payload) return;

		// Misma selección que el intento anterior (retry tras error) -> reusar la key para
		// que el backend haga replay en vez de duplicar la reserva. Selección distinta ->
		// key nueva.
		const payloadJson = JSON.stringify(payload);
		if (bookingIdemKey && bookingIdemPayloadJson === payloadJson) {
			// reusar bookingIdemKey
		} else {
			bookingIdemKey = createIdempotencyKey();
			bookingIdemPayloadJson = payloadJson;
		}

		isSubmitting = true;
		submitButton.disabled = true;
		payDepositButton.disabled = true;

		try {
			const created = await createPublicAppointment(payload, bookingIdemKey);
			bookingIdemKey = null;
			bookingIdemPayloadJson = null;
			if (reserveForDeposit) {
				pendingAppointmentId = created.appointment_id;
				finalizeDepositHold(created.hold);
				showToast('Turno reservado. Completá la transferencia SIPAP.', 'success');
				return;
			}

			finalizeSuccess();
			showToast('Reserva confirmada.', 'success');
		} catch (error) {
			showToast(error instanceof Error ? error.message : 'No fue posible confirmar la reserva.', 'error');
		} finally {
			isSubmitting = false;
			submitButton.disabled = false;
			payDepositButton.disabled = false;
		}
	};

	const resetFlow = () => {
		draftPersister.clear();
		clearSipapHold(holdStorageKey);
		orgGroups = buildOrganizationGroups(profile.locations);
		selectedOrgGroup = null;
		selectedContext = null;
		selectedService = null;
		selectedDate = '';
		selectedTime = '';
		availableSlotGroups = [];
		pendingAppointmentId = 0;
		isLoadingSlots = false;
		servicePickerPhase = 'orgs';
		stopSipapHoldCountdown(root);
		customerForm.reset();
		resetCustomerLookupState();
		setSubmitError('');
		refreshSummary();
		renderSucursalStep();
		renderServices();
		renderCalendar();
		renderSlots();
		setStep(1);
	};

	prevMonthButton.addEventListener('click', () => {
		visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
		void loadAvailableDatesForVisibleMonth();
	}, { signal });

	nextMonthButton.addEventListener('click', () => {
		visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
		void loadAvailableDatesForVisibleMonth();
	}, { signal });

	const goBackToLocationsStep = () => {
		selectedService = null;
		selectedDate = '';
		selectedTime = '';
		availableSlotGroups = [];
		pendingAppointmentId = 0;
		invalidateAvailableDatesCache();
		servicePickerPhase = 'locations';
		if (!selectedOrgGroup && orgGroups.length > 1) {
			servicePickerPhase = 'orgs';
		}
		refreshSummary();
		setStep(1);
		renderSucursalStep();
		renderServices();
		renderCalendar();
	};

	const goBackToServicesStep = () => {
		selectedDate = '';
		selectedTime = '';
		availableSlotGroups = [];
		pendingAppointmentId = 0;
		invalidateAvailableDatesCache();
		refreshSummary();
		renderServices();
		renderCalendar();
		setStep(2);
	};

	const navigateToStepFromIndicator = (targetStep: number) => {
		if (targetStep >= step || step > 5) return;
		if (targetStep <= 1) {
			goBackToLocationsStep();
			return;
		}
		if (targetStep === 2) {
			goBackToServicesStep();
			return;
		}
		if (targetStep === 3 || targetStep === 4) {
			setStep(3);
			return;
		}
		setStep(targetStep as UserBookingWizardStep);
	};

	refreshStepIndicatorClickable = bindPublicBookingStepIndicator({
		stepItems,
		getCurrentStep: () => step,
		onNavigateToStep: navigateToStepFromIndicator,
		signal,
		mode: 'phase',
		phaseToStep: (phase) => {
			if (phase === 1) return 1;
			if (phase === 2) return 3;
			return 5;
		},
	}).refreshClickableState;

	backToLocations.addEventListener(
		'click',
		() => {
			goBackOneStep();
		},
		{ signal }
	);
	backToOrgsButton?.addEventListener('click', () => backToOrganizationPicker(), { signal });
	backToServices.addEventListener(
		'click',
		() => {
			goBackOneStep();
		},
		{ signal }
	);
	backToCalendarButtons.forEach((button) => {
		button.addEventListener('click', () => goBackOneStep(), { signal });
	});
	backToSlots.addEventListener('click', () => goBackOneStep(), { signal });
	headerBackButton?.addEventListener('click', () => goBackOneStep(), { signal });
	selectionSummaryChange?.addEventListener(
		'click',
		() => {
			goBackToLocationsStep();
		},
		{ signal }
	);
	datetimeContinueButton.addEventListener(
		'click',
		() => {
			if (!selectedDate) {
				showToast('Seleccioná una fecha para continuar.', 'error');
				return;
			}
			if (!selectedTime || !selectedContext) {
				showToast('Seleccioná un horario para continuar.', 'error');
				return;
			}
			setStep(5);
		},
		{ signal }
	);
	restartButtons.forEach((button) => {
		button.addEventListener('click', resetFlow, { signal });
	});

	summaryLocation.addEventListener(
		'click',
		(event) => {
			event.preventDefault();
			event.stopPropagation();
			if (!selectedContext) return;
			void mapController?.openLocationMap(selectedContext, { fetchCoordinates: true });
		},
		{ signal }
	);

	customerForm.addEventListener('submit', (event) => {
		event.preventDefault();
		void submitBooking(false);
	}, { signal });

	submitButton.addEventListener('click', (event) => {
		event.preventDefault();
		void submitBooking(false);
	}, { signal });

	payDepositButton.addEventListener('click', (event) => {
		event.preventDefault();
		void submitBooking(true);
	}, { signal });

	bindSipapCopyButtons(root, signal);
	bindSipapReceiptUpload(root, {
		signal,
		onResult: (result) => {
			const ocr = String(result.ocr_status || '').toUpperCase();
			// Seña verificada: la cita quedó confirmada, ya no hace falta persistir el hold.
			if (ocr === 'MATCH') {
				clearSipapHold(holdStorageKey);
			}
			showToast(
				result.message ||
					(ocr === 'MATCH' ? 'Pago verificado. Turno confirmado.' : 'Comprobante recibido.'),
				'success'
			);
		},
		onError: (message) => showToast(message, 'error'),
	});

	customerPhoneInput.addEventListener('input', () => {
		customerPhoneInput.value = formatParaguayMobilePhoneInput(customerPhoneInput.value);
		setPhoneFieldError('');
		setSubmitError('');
		draftPersister.schedule();

		const parsedPhone = parseParaguayMobilePhone(
			toParaguayMobileE164FromInput(customerPhoneInput.value)
		);
		if (!parsedPhone.isValid) {
			if (validatedCustomerPhoneE164 || !customerNameWrapper.classList.contains('hidden')) {
				resetCustomerLookupState();
			}
			return;
		}

		void runCustomerValidation(parsedPhone.e164);
	}, { signal });

	customerPhoneInput.addEventListener('blur', async () => {
		const rawPhone = customerPhoneInput.value.trim();
		if (!rawPhone) {
			setPhoneFieldError('');
			resetCustomerLookupState();
			return;
		}
		const parsedPhone = parseParaguayMobilePhone(toParaguayMobileE164FromInput(rawPhone));
		if (!parsedPhone.isValid) {
			setPhoneFieldError(PARAGUAY_MOBILE_PHONE_ERROR);
			resetCustomerLookupState();
			return;
		}
		customerPhoneInput.value = formatParaguayMobilePhoneInput(rawPhone);
		setPhoneFieldError('');
		await runCustomerValidation(parsedPhone.e164);
	}, { signal });

	customerNameInput.addEventListener('input', () => {
		setNameFieldError('');
		setSubmitError('');
		draftPersister.schedule();
	}, { signal });

	depositPolicyAccept?.addEventListener('change', () => {
		setPolicyFieldError('');
		draftPersister.schedule();
	}, { signal });

	refreshSummary();
	renderSucursalStep();
	renderServices();
	renderCalendar();
	renderSlots();
	syncPublicBookingMobileActions(root);

	const finishBoot = () => {
		root.removeAttribute('data-booting');
	};

	const restoreSipapHold = (): boolean => {
		const stored = readSipapHold(holdStorageKey);
		if (!stored) return false;

		const hold = stored.hold as unknown as ReturnType<typeof unwrapSipapHold>;
		pendingAppointmentId = Number((hold as { appointment_id?: number }).appointment_id || 0);

		// El hold ya trae sipap + política + token, así que el panel se reconstruye aunque
		// no tengamos el contexto/sucursal cargado en memoria tras el reload.
		fillSipapDepositPanel(root, hold, selectedContext?.deposit_settings, {
			serviceName: stored.context.serviceName,
			professionalName: stored.context.professionalName ?? profile.full_name,
			depositAmount: stored.context.depositAmount,
		});
		fillPublicBookingSuccessTicket(root, {
			professionalName: stored.context.professionalName ?? profile.full_name,
			organizationName: selectedOrgGroup?.organization_name,
			serviceName: stored.context.serviceName ?? '—',
			dateYmd: stored.context.date || '',
			time: stored.context.time || '',
			locationName: selectedContext?.name,
			locationAddress: selectedContext?.address,
			imageUrl: profile.image_url,
		});
		setStep(7);
		return true;
	};

	const restoreDraft = async () => {
		if (signal.aborted) return;
		// La seña (hold) tiene prioridad: si hay uno vigente, retomamos "Transferí la seña".
		if (restoreSipapHold()) {
			finishBoot();
			return;
		}

		const draft = readPublicBookingDraft(draftStorageKey, formatApiDate(today));
		if (!draft || draft.serviceId <= 0) {
			servicePickerPhase = 'orgs';
			renderSucursalStep();
			renderServices();
			setStep(1);
			return;
		}

		let matchedGroup: OrganizationBookingGroup | null = null;
		let matchedService: UserBookingService | null = null;
		for (const group of orgGroups) {
			if (draft.orgId && group.org_id_organization !== draft.orgId) continue;
			const service = group.services.find((item) => item.id_service === draft.serviceId) ?? null;
			if (service) {
				matchedGroup = group;
				matchedService = service;
				break;
			}
		}

		if (!matchedGroup || !matchedService) {
			draftPersister.clear();
			servicePickerPhase = 'orgs';
			renderSucursalStep();
			renderServices();
			setStep(1);
			return;
		}

		selectedOrgGroup = matchedGroup;
		selectedService = matchedService;
		servicePickerPhase = 'locations';
		selectedDate = draft.date || '';
		selectedTime = draft.time || '';
		selectedContext =
			(draft.locationId
				? matchedGroup.locations.find((loc) => loc.id_location === draft.locationId) ?? null
				: null) ??
			(matchedGroup.locations.length === 1 ? matchedGroup.locations[0] : null);

		if (draft.phone) {
			customerPhoneInput.value = formatParaguayMobilePhoneInput(draft.phone);
		}
		if (draft.name) {
			customerNameInput.value = draft.name;
			setCustomerNameVisibility(true);
			customerNameInput.disabled = false;
		}
		if (depositPolicyAccept && draft.policyAccepted) {
			depositPolicyAccept.checked = true;
		}

		if (selectedDate) {
			const [y, m] = selectedDate.split('-').map(Number);
			if (y && m) visibleMonth = new Date(y, m - 1, 1);
		}

		// Flujo: 1 Sucursal, 2 Servicio, 3 Fecha y Hora, 5 Datos (4 retirado)
		let targetStep: PublicBookingDraftStep = draft.step === 4 ? 3 : draft.step;
		if (!selectedContext) {
			targetStep = 1;
		} else if (!selectedService) {
			targetStep = 2;
		} else if (!selectedDate) {
			targetStep = Math.min(Math.max(targetStep, 2), 3) as PublicBookingDraftStep;
			if (targetStep < 2) targetStep = 2;
		} else if (!selectedTime) {
			targetStep = 3;
		}

		const expectSlotsSoon = Boolean(selectedDate) && targetStep >= 3;
		if (expectSlotsSoon) {
			isLoadingSlots = true;
		}

		refreshSummary();
		renderSucursalStep();
		renderServices();
		renderCalendar();
		renderSlots();
		setStep(targetStep);
		finishBoot();

		const wantedTime = selectedTime;
		if (selectedDate && targetStep >= 3) {
			await loadSlots(selectedDate, { preserveSelection: true, skipStepChange: true });
			if (signal.aborted) return;

			if (wantedTime && !selectedTime) {
				showToast(SLOT_UNAVAILABLE_RESTORE_MESSAGE, 'error', 4800);
				refreshSummary();
				renderSlots();
				draftPersister.flush();
				setStep(3);
				return;
			}
		} else if (expectSlotsSoon) {
			isLoadingSlots = false;
		}

		refreshSummary();
		renderSlots();
	};

	void restoreDraft()
		.catch(() => {
			servicePickerPhase = 'orgs';
			renderSucursalStep();
			renderServices();
			renderCalendar();
			renderSlots();
			setStep(1);
		})
		.finally(() => {
			finishBoot();
		});
};
