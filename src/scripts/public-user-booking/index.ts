import {
	formatApiDate,
	formatLongDateFromApiDate,
	getTodayStart,
	toDateStart,
} from '../../lib/booking-datetime';
import { appendLocationSlotHeader } from '../../lib/public-booking-locations';
import {
	formatParaguayMobilePhoneInput,
	PARAGUAY_MOBILE_PHONE_ERROR,
	parseParaguayMobilePhone,
	toParaguayMobileE164FromInput,
} from '../../lib/paraguay-phone';
import {
	createDraftPersister,
	readPublicBookingDraft,
	SLOT_UNAVAILABLE_RESTORE_MESSAGE,
	userBookingDraftKey,
	type PublicBookingDraft,
	type PublicBookingDraftStep,
} from '../../lib/public-booking-draft';
import {
	buildApiAppointmentTimes,
	createPublicAppointment,
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
	USER_BOOKING_STEP_LABELS,
	parseProfileFromDom,
	type UserBookingContext,
	type UserBookingService,
	type UserBookingWizardStep,
} from './types';
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

	const profile = parseProfileFromDom(root);
	if (!profile) return;

	const locationsRoot = root.querySelector<HTMLElement>('[data-user-locations-root]');
	const step1Title = root.querySelector<HTMLElement>('[data-step1-title]');
	const step1Subtitle = root.querySelector<HTMLElement>('[data-step1-subtitle]');
	const backToOrgsWrap = root.querySelector<HTMLElement>('[data-back-to-orgs-wrap]');
	const backToOrgsButton = root.querySelector<HTMLButtonElement>('[data-back-to-orgs]');
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
	const ticketProfessional = root.querySelector<HTMLElement>('[data-ticket-professional]');
	const ticketService = root.querySelector<HTMLElement>('[data-ticket-service]');
	const ticketDate = root.querySelector<HTMLElement>('[data-ticket-date]');
	const ticketTime = root.querySelector<HTMLElement>('[data-ticket-time]');

	if (
		!locationsRoot ||
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
		!ticketProfessional ||
		!ticketService ||
		!ticketDate ||
		!ticketTime ||
		!prevMonthButton ||
		!nextMonthButton ||
		!backToLocations ||
		!backToCalendarButtons.length ||
		!backToSlots ||
		restartButtons.length === 0
	) {
		return;
	}

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

		renderOrganizationServices();
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
	let isLoadingSlots = false;
	let isSubmitting = false;
	let isValidatingCustomer = false;
	let pendingAppointmentId = 0;
	let validatedCustomerPhoneE164 = '';
	let toastTimer: number | null = null;

	const publicSlug = String(root.dataset.publicSlug || '').trim();
	const draftStorageKey = userBookingDraftKey(publicSlug || 'unknown');
	const draftPersister = createDraftPersister(draftStorageKey, () => {
		if (step >= 5 || !selectedService) return null;
		const draftStep = (step <= 4 ? step : 4) as PublicBookingDraftStep;
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

	const setStep = (nextStep: UserBookingWizardStep) => {
		step = nextStep;
		for (const panel of stepPanels) {
			const panelStep = Number(panel.dataset.stepPanel || '0');
			panel.classList.toggle('hidden', panelStep !== step);
		}
		for (const item of stepItems) {
			const itemStep = Number(item.dataset.stepItem || '0');
			item.classList.remove('step-item-default', 'step-item-current', 'step-item-done');
			if (itemStep === step && step <= 4) {
				item.classList.add('step-item-current');
				continue;
			}
			if (itemStep < step || step >= 5) {
				item.classList.add('step-item-done');
				continue;
			}
			item.classList.add('step-item-default');
		}

		const cappedStep = step >= 5 ? 4 : step;
		if (stepCompactLabel) {
			stepCompactLabel.textContent =
				step === 6
					? 'Transferí la seña'
					: step === 5
						? 'Reserva confirmada'
						: `Paso ${cappedStep} de 4: ${USER_BOOKING_STEP_LABELS[cappedStep as 1 | 2 | 3 | 4]}`;
		}
		if (stepProgressBar) {
			stepProgressBar.style.width = `${step >= 5 ? 100 : cappedStep * 25}%`;
		}

		if (step <= 4) draftPersister.schedule();
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

	let servicesExpandedByOrg = new Map<number, boolean>();
	let servicePickerPhase: 'orgs' | 'locations' | 'services' = 'orgs';

	const formatLocationCountLabel = (count: number) =>
		count === 1 ? '1 ubicación disponible' : `${count} ubicaciones disponibles`;

	const formatLocationLine = (location: UserBookingContext) => {
		const branch = formatBranchLabel(location);
		const address = String(location.address || '').trim();
		if (address && branch && address.toLowerCase() !== branch.toLowerCase()) {
			return `${branch} · ${address}`;
		}
		return branch || address || 'Ubicación';
	};

	const updateStep1Copy = () => {
		const showBack =
			(servicePickerPhase === 'locations' && orgGroups.length > 1) ||
			(servicePickerPhase === 'services' &&
				Boolean(
					selectedOrgGroup &&
						(selectedOrgGroup.locations.length > 1 || orgGroups.length > 1)
				));

		if (backToOrgsWrap) backToOrgsWrap.classList.toggle('hidden', !showBack);

		if (servicePickerPhase === 'orgs') {
			if (step1Title) step1Title.textContent = 'Seleccioná un negocio';
			if (step1Subtitle) {
				step1Subtitle.textContent = 'Elegí el negocio para ver ubicaciones y servicios.';
			}
			return;
		}

		if (servicePickerPhase === 'locations' && selectedOrgGroup) {
			if (step1Title) step1Title.textContent = 'Seleccioná una ubicación';
			if (step1Subtitle) {
				step1Subtitle.textContent = `Ubicaciones de ${selectedOrgGroup.organization_name}.`;
			}
			return;
		}

		if (servicePickerPhase === 'services' && selectedOrgGroup) {
			if (step1Title) step1Title.textContent = '¿Qué servicio desea?';
			if (step1Subtitle) {
				const locationLabel = selectedContext ? formatLocationLine(selectedContext) : '';
				step1Subtitle.textContent = locationLabel
					? `${selectedOrgGroup.organization_name} · ${locationLabel}`
					: `Servicios en ${selectedOrgGroup.organization_name}.`;
			}
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
	};

	const selectOrganizationGroup = (group: OrganizationBookingGroup) => {
		selectedOrgGroup = group;
		clearBookingSelection({ keepOrg: true });
		if (group.locations.length === 1) {
			selectedContext = group.locations[0];
			servicePickerPhase = 'services';
		} else {
			servicePickerPhase = 'locations';
		}
		refreshSummary();
		renderOrganizationServices();
		renderCalendar();
		draftPersister.schedule();
	};

	const selectOrganizationLocation = (location: UserBookingContext) => {
		if (!selectedOrgGroup) return;
		selectedContext = location;
		selectedService = null;
		selectedDate = '';
		selectedTime = '';
		availableSlotGroups = [];
		pendingAppointmentId = 0;
		servicePickerPhase = 'services';
		refreshSummary();
		renderOrganizationServices();
		renderCalendar();
		draftPersister.schedule();
	};

	const backToOrganizationPicker = () => {
		if (
			servicePickerPhase === 'services' &&
			selectedOrgGroup &&
			selectedOrgGroup.locations.length > 1
		) {
			clearBookingSelection({ keepOrg: true });
			servicePickerPhase = 'locations';
			refreshSummary();
			renderOrganizationServices();
			renderCalendar();
			draftPersister.schedule();
			setStep(1);
			return;
		}

		clearBookingSelection();
		servicePickerPhase = 'orgs';
		refreshSummary();
		renderOrganizationServices();
		renderCalendar();
		draftPersister.schedule();
		setStep(1);
	};

	const renderOrganizationServices = () => {
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
			return;
		}

		if (orgGroups.length === 1 && !selectedOrgGroup) {
			selectedOrgGroup = orgGroups[0];
			if (selectedOrgGroup.locations.length === 1) {
				selectedContext = selectedOrgGroup.locations[0];
				servicePickerPhase = 'services';
			} else {
				servicePickerPhase = 'locations';
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
			for (const group of orgGroups) {
				const button = document.createElement('button');
				button.type = 'button';
				button.className = 'public-org-card';

				const title = document.createElement('span');
				title.className = 'text-lg font-semibold text-[var(--on-surface)]';
				title.textContent = group.organization_name;

				const meta = document.createElement('span');
				meta.className = 'text-sm font-medium text-[var(--on-surface-variant)]';
				meta.textContent = formatLocationCountLabel(group.locations.length);

				button.append(title, meta);
				button.addEventListener('click', () => selectOrganizationGroup(group), { signal });
				locationsRoot.appendChild(button);
			}
			return;
		}

		const group = selectedOrgGroup;
		if (!group) {
			servicePickerPhase = 'orgs';
			renderOrganizationServices();
			return;
		}

		if (servicePickerPhase === 'locations') {
			const list = document.createElement('div');
			list.className = 'grid gap-3';

			for (const location of group.locations) {
				const card = document.createElement('div');
				card.className = `public-org-card public-org-card--location${
					selectedContext?.id_location === location.id_location ? ' is-selected' : ''
				}`;

				const selectButton = document.createElement('button');
				selectButton.type = 'button';
				selectButton.className = 'public-org-card__select';
				selectButton.setAttribute(
					'aria-label',
					`Elegir ubicación ${formatLocationLine(location)}`
				);

				const row = document.createElement('span');
				row.className = 'public-org-card__location';
				const icon = document.createElement('span');
				icon.className = 'material-symbols-rounded';
				icon.setAttribute('aria-hidden', 'true');
				icon.textContent = 'location_on';

				const textWrap = document.createElement('span');
				textWrap.className = 'public-org-card__location-text';
				const title = document.createElement('span');
				title.className = 'public-org-card__location-title';
				title.textContent = formatBranchLabel(location);
				textWrap.append(title);
				const address = String(location.address || '').trim();
				const branch = formatBranchLabel(location);
				if (address && address.toLowerCase() !== branch.toLowerCase()) {
					const addressNode = document.createElement('span');
					addressNode.className = 'public-org-card__location-address';
					addressNode.textContent = address;
					textWrap.append(addressNode);
				}
				row.append(icon, textWrap);
				selectButton.append(row);
				selectButton.addEventListener('click', () => selectOrganizationLocation(location), {
					signal,
				});
				card.append(selectButton);

				if (mapController?.canShowLocationMap(location)) {
					const mapButton = document.createElement('button');
					mapButton.type = 'button';
					mapButton.className = 'public-org-card__map-btn';
					mapButton.setAttribute('aria-label', 'Ver en el mapa');
					mapButton.innerHTML =
						'<span class="material-symbols-rounded" aria-hidden="true">map</span>';
					mapButton.addEventListener(
						'click',
						(event) => {
							event.preventDefault();
							event.stopPropagation();
							void mapController.openLocationMap(location, { fetchCoordinates: true });
						},
						{ signal }
					);
					card.append(mapButton);
				}

				list.appendChild(card);
			}

			locationsRoot.appendChild(list);
			return;
		}

		const INITIAL_VISIBLE_SERVICES = 4;
		const servicesGrid = document.createElement('div');
		servicesGrid.className = 'user-org-group grid gap-3 sm:grid-cols-2';

		if (group.services.length === 0) {
			const emptyServices = document.createElement('p');
			emptyServices.className = 'text-sm font-medium text-[var(--on-surface-variant)] sm:col-span-2';
			emptyServices.textContent = 'No hay servicios disponibles en este negocio.';
			servicesGrid.appendChild(emptyServices);
			locationsRoot.appendChild(servicesGrid);
			return;
		}

		const selectedIndex = selectedService
			? group.services.findIndex((service) => service.id_service === selectedService.id_service)
			: -1;
		if (selectedIndex >= INITIAL_VISIBLE_SERVICES) {
			servicesExpandedByOrg.set(group.org_id_organization, true);
		}

		const expanded = Boolean(servicesExpandedByOrg.get(group.org_id_organization));
		const visibleServices = expanded
			? group.services
			: group.services.slice(0, INITIAL_VISIBLE_SERVICES);
		const hiddenCount = Math.max(0, group.services.length - INITIAL_VISIBLE_SERVICES);

		for (const service of visibleServices) {
			const isSelected = selectedService?.id_service === service.id_service;
			const serviceButton = document.createElement('button');
			serviceButton.type = 'button';
			serviceButton.className = `public-service-card${isSelected ? ' is-selected' : ''}`;
			serviceButton.innerHTML = `
				${
					service.image_url
						? `<span class="public-service-card__cover"><img src="${String(service.image_url).replace(/"/g, '&quot;')}" alt="" loading="lazy" /></span>`
						: `<span class="public-service-card__cover public-service-card__cover--brand" aria-hidden="true"></span>`
				}
				<span class="public-service-card__body">
					<span class="public-service-card__title text-base font-medium text-[var(--on-surface)]">${service.name}</span>
					<span class="public-service-card__meta flex items-center justify-between gap-2 text-sm font-medium text-[var(--on-surface-variant)]">
						<span>${formatDuration(service.duration_minutes)}</span>
						<span>${service.hide_public_price === 1 ? (service.hidden_price_label || 'A evaluar') : formatCurrency(service.price)}</span>
					</span>
				</span>
				<span class="material-symbols-rounded public-service-card__check" aria-hidden="true">check_circle</span>
			`;
			serviceButton.addEventListener(
				'click',
				() => {
					selectedOrgGroup = group;
					selectedService = service;
					selectedDate = '';
					selectedTime = '';
					availableSlotGroups = [];
					pendingAppointmentId = 0;
					refreshSummary();
					renderOrganizationServices();
					renderCalendar();
					draftPersister.schedule();
					setStep(2);
				},
				{ signal }
			);
			servicesGrid.appendChild(serviceButton);
		}

		if (!expanded && hiddenCount > 0) {
			const moreButton = document.createElement('button');
			moreButton.type = 'button';
			moreButton.className = 'public-services-more';
			moreButton.textContent =
				hiddenCount === 1 ? 'Ver 1 servicio más' : `Ver ${hiddenCount} servicios más`;
			moreButton.addEventListener(
				'click',
				() => {
					servicesExpandedByOrg.set(group.org_id_organization, true);
					renderOrganizationServices();
				},
				{ signal }
			);
			servicesGrid.appendChild(moreButton);
		}

		locationsRoot.appendChild(servicesGrid);
	};

	const getSelectedSlotKey = () =>
		selectedContext && selectedTime ? `${selectedContext.id_location}:${selectedTime}` : '';

	const renderCalendar = () => {
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

			const dayButton = document.createElement('button');
			dayButton.type = 'button';
			dayButton.textContent = String(day);
			dayButton.disabled = isPast || !selectedService;
			dayButton.className = [
				isSelected ? 'is-selected' : '',
				isToday ? 'is-today' : '',
				isPast ? 'is-past' : '',
			]
				.filter(Boolean)
				.join(' ');

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
					void loadSlots(dateKey);
				},
				{ signal }
			);

			calendarGrid.appendChild(dayButton);
		}
	};

	const renderSlots = () => {
		slotsContainer.innerHTML = '';
		slotsLoadingNode.classList.toggle('hidden', !isLoadingSlots);

		const totalSlots = availableSlotGroups.reduce(
			(count, group) => count + group.slots.length,
			0
		);
		noSlotsNode.classList.toggle('hidden', isLoadingSlots || totalSlots > 0);
		if (isLoadingSlots) return;

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

			const grid = document.createElement('div');
			grid.className = 'grid grid-cols-2 gap-3 sm:grid-cols-4';

			for (const slot of group.slots) {
				const slotKey = `${group.location.id_location}:${slot}`;
				const isSelected = selectedSlotKey === slotKey;
				const button = document.createElement('button');
				button.type = 'button';
				button.textContent = slot;
				button.className =
					'public-slot-time flex h-11 items-center justify-center rounded-full border px-4 text-sm font-medium transition' +
					(isSelected ? ' is-selected' : '');
				button.addEventListener(
					'click',
					() => {
						selectedTime = slot;
						selectedContext = group.location;
						pendingAppointmentId = 0;
						refreshSummary();
						renderSlots();
						draftPersister.schedule();
						setStep(4);
					},
					{ signal }
				);
				grid.appendChild(button);
			}

			section.appendChild(grid);
			slotsContainer.appendChild(section);
		}
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
		if (!options?.skipStepChange) setStep(3);

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
		ticketProfessional.textContent = profile.full_name;
		ticketService.textContent = selectedService?.name || '-';
		ticketDate.textContent = selectedDate ? formatLongDateFromApiDate(selectedDate) : '-';
		ticketTime.textContent = selectedTime || '-';
		setStep(5);
	};

	const finalizeDepositHold = (hold: Record<string, unknown>) => {
		draftPersister.clear();
		fillSipapDepositPanel(root, unwrapSipapHold(hold as any), selectedContext?.deposit_settings, {
			serviceName: selectedService?.name,
			professionalName: profile.full_name,
			depositAmount: calculateDepositAmount(selectedService),
		});
		ticketProfessional.textContent = profile.full_name;
		ticketService.textContent = selectedService?.name || '-';
		ticketDate.textContent = selectedDate ? formatLongDateFromApiDate(selectedDate) : '-';
		ticketTime.textContent = selectedTime || '-';
		setStep(6);
	};

	const submitBooking = async (reserveForDeposit: boolean) => {
		if (isSubmitting) return;
		setSubmitError('');
		setPhoneFieldError('');
		setNameFieldError('');
		setPolicyFieldError('');

		const payload = await buildAppointmentPayload(reserveForDeposit);
		if (!payload) return;

		isSubmitting = true;
		submitButton.disabled = true;
		payDepositButton.disabled = true;

		try {
			const created = await createPublicAppointment(payload);
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
		servicesExpandedByOrg = new Map();
		stopSipapHoldCountdown(root);
		customerForm.reset();
		resetCustomerLookupState();
		setSubmitError('');
		refreshSummary();
		renderOrganizationServices();
		renderCalendar();
		renderSlots();
		setStep(1);
	};

	prevMonthButton.addEventListener('click', () => {
		visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
		renderCalendar();
	}, { signal });

	nextMonthButton.addEventListener('click', () => {
		visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
		renderCalendar();
	}, { signal });

	backToLocations.addEventListener(
		'click',
		() => {
			if (selectedOrgGroup) {
				servicePickerPhase =
					selectedOrgGroup.locations.length > 1 ? 'locations' : 'services';
			} else {
				servicePickerPhase = 'orgs';
			}
			setStep(1);
			renderOrganizationServices();
		},
		{ signal }
	);
	backToOrgsButton?.addEventListener('click', () => backToOrganizationPicker(), { signal });
	backToCalendarButtons.forEach((button) => {
		button.addEventListener('click', () => setStep(2), { signal });
	});
	backToSlots.addEventListener('click', () => setStep(3), { signal });
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
			showToast(
				result.message || 'Comprobante recibido.',
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
		if (validatedCustomerPhoneE164) resetCustomerLookupState();
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
	renderOrganizationServices();
	renderCalendar();
	renderSlots();

	const restoreDraft = async () => {
		const draft = readPublicBookingDraft(draftStorageKey, formatApiDate(today));
		if (!draft || draft.serviceId <= 0) {
			servicePickerPhase = 'orgs';
			renderOrganizationServices();
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
			renderOrganizationServices();
			setStep(1);
			return;
		}

		selectedOrgGroup = matchedGroup;
		selectedService = matchedService;
		servicePickerPhase = 'services';
		selectedDate = draft.date || '';
		selectedTime = draft.time || '';
		selectedContext =
			(draft.locationId
				? matchedGroup.locations.find((loc) => loc.id_location === draft.locationId) ?? null
				: null) ?? null;

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

		refreshSummary();
		renderOrganizationServices();
		renderCalendar();

		const wantedTime = selectedTime;

		if (selectedDate) {
			await loadSlots(selectedDate, { preserveSelection: true, skipStepChange: true });
			if (signal.aborted) return;

			if (wantedTime && !selectedTime) {
				showToast(SLOT_UNAVAILABLE_RESTORE_MESSAGE, 'error', 4800);
				refreshSummary();
				renderSlots();
				draftPersister.schedule();
				setStep(3);
				return;
			}
		}

		let targetStep: PublicBookingDraftStep = draft.step;
		if (!selectedService) targetStep = 1;
		else if (!selectedDate) targetStep = Math.min(draft.step, 2) as PublicBookingDraftStep;
		else if (!selectedTime) targetStep = Math.min(Math.max(draft.step, 3), 3) as PublicBookingDraftStep;
		else targetStep = Math.min(Math.max(draft.step, 4), 4) as PublicBookingDraftStep;

		refreshSummary();
		renderSlots();
		setStep(targetStep);
	};

	void restoreDraft();
};
