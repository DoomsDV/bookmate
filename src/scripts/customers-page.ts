import { ROLES } from '../config/roles';
import type {
	CustomerAppointmentSummary,
	CustomerProfile,
	CustomerTopService,
} from '../lib/customers';
import { parseParaguayMobilePhone } from '../lib/paraguay-phone';
import {
	destroySearchableSelect,
	ensureSearchableSelect,
	setSearchableSelectDisabled,
	setSearchableSelectValue,
} from './searchable-select';

type ProfessionalLov = { id_professional: number; display_name: string };
type Customer = {
	id_customer: number;
	full_name: string;
	phone_number: string;
	created_at: string;
};
type CustomerMeta = {
	current_page: number;
	per_page: number;
	total_records: number;
	total_pages: number;
};
type ApiResponse<TData = unknown> = {
	status?: string;
	message?: string;
	data?: TData;
	meta?: CustomerMeta;
};

class CustomerManager extends HTMLElement {
	#bound = false;
	#listeners: AbortController | null = null;
	#profileCloseTimer: number | null = null;

	private roleId = 0;
	private currentProfessionalId = 0;
	private selectedProfessionalId = 0;
	private page = 1;
	private limit = 9;
	private totalPages = 1;
	private totalRecords = 0;
	private isLoading = false;
	private isProfileLoading = false;
	private activeProfileCustomerId = 0;

	private professionalSelect: HTMLSelectElement | null = null;
	private loadingNode: HTMLElement | null = null;
	private errorNode: HTMLElement | null = null;
	private summaryNode: HTMLElement | null = null;
	private gridNode: HTMLElement | null = null;
	private emptyNode: HTMLElement | null = null;
	private pageLabelNode: HTMLElement | null = null;
	private currentPageNode: HTMLElement | null = null;
	private prevButton: HTMLButtonElement | null = null;
	private nextButton: HTMLButtonElement | null = null;

	private profileModal: HTMLDialogElement | null = null;
	private profileLoadingNode: HTMLElement | null = null;
	private profileErrorNode: HTMLElement | null = null;
	private profileBodyNode: HTMLElement | null = null;
	private profileNameNode: HTMLElement | null = null;
	private profilePhoneNode: HTMLElement | null = null;
	private profileRegisteredNode: HTMLElement | null = null;
	private profileScopeNode: HTMLElement | null = null;
	private profileScopeIconNode: HTMLElement | null = null;
	private profileScopeLabelNode: HTMLElement | null = null;
	private profileAttendanceDot: HTMLElement | null = null;
	private profileAttendanceRate: HTMLElement | null = null;
	private profileAttendanceDetail: HTMLElement | null = null;
	private profileLtvNode: HTMLElement | null = null;
	private profileLastNode: HTMLElement | null = null;
	private profileNextNode: HTMLElement | null = null;
	private profilePendingWrap: HTMLElement | null = null;
	private profilePendingList: HTMLElement | null = null;
	private profileServicesNode: HTMLElement | null = null;

	private professionals: ProfessionalLov[] = [];

	connectedCallback() {
		if (this.#bound) return;

		this.professionalSelect = this.querySelector<HTMLSelectElement>('[data-professional-filter]');
		this.loadingNode = this.querySelector<HTMLElement>('[data-customers-loading]');
		this.errorNode = this.querySelector<HTMLElement>('[data-customers-error]');
		this.summaryNode = this.querySelector<HTMLElement>('[data-customers-summary]');
		this.gridNode = this.querySelector<HTMLElement>('[data-customers-grid]');
		this.emptyNode = this.querySelector<HTMLElement>('[data-customers-empty]');
		this.pageLabelNode = this.querySelector<HTMLElement>('[data-customers-page-label]');
		this.currentPageNode = this.querySelector<HTMLElement>('[data-customers-current-page]');
		this.prevButton = this.querySelector<HTMLButtonElement>('[data-customers-prev]');
		this.nextButton = this.querySelector<HTMLButtonElement>('[data-customers-next]');

		this.profileModal = this.querySelector<HTMLDialogElement>('[data-customer-profile-modal]');
		this.profileLoadingNode = this.querySelector<HTMLElement>('[data-customer-profile-loading]');
		this.profileErrorNode = this.querySelector<HTMLElement>('[data-customer-profile-error]');
		this.profileBodyNode = this.querySelector<HTMLElement>('[data-customer-profile-body]');
		this.profileNameNode = this.querySelector<HTMLElement>('[data-customer-profile-name]');
		this.profilePhoneNode = this.querySelector<HTMLElement>('[data-customer-profile-phone]');
		this.profileRegisteredNode = this.querySelector<HTMLElement>('[data-customer-profile-registered]');
		this.profileScopeNode = this.querySelector<HTMLElement>('[data-customer-profile-scope]');
		this.profileScopeIconNode = this.querySelector<HTMLElement>('[data-customer-profile-scope-icon]');
		this.profileScopeLabelNode = this.querySelector<HTMLElement>(
			'[data-customer-profile-scope-label]'
		);
		this.profileAttendanceDot = this.querySelector<HTMLElement>(
			'[data-customer-profile-attendance-dot]'
		);
		this.profileAttendanceRate = this.querySelector<HTMLElement>(
			'[data-customer-profile-attendance-rate]'
		);
		this.profileAttendanceDetail = this.querySelector<HTMLElement>(
			'[data-customer-profile-attendance-detail]'
		);
		this.profileLtvNode = this.querySelector<HTMLElement>('[data-customer-profile-ltv]');
		this.profileLastNode = this.querySelector<HTMLElement>('[data-customer-profile-last]');
		this.profileNextNode = this.querySelector<HTMLElement>('[data-customer-profile-next]');
		this.profilePendingWrap = this.querySelector<HTMLElement>('[data-customer-profile-pending-wrap]');
		this.profilePendingList = this.querySelector<HTMLElement>(
			'[data-customer-profile-pending-list]'
		);
		this.profileServicesNode = this.querySelector<HTMLElement>('[data-customer-profile-services]');

		if (!this.professionalSelect || !this.gridNode) return;

		this.#bound = true;
		this.#listeners = new AbortController();
		const signal = this.#listeners.signal;

		this.professionalSelect.addEventListener('change', this.handleProfessionalChange, { signal });
		this.prevButton?.addEventListener('click', this.handlePrevPage, { signal });
		this.nextButton?.addEventListener('click', this.handleNextPage, { signal });
		this.gridNode.addEventListener('click', this.handleGridClick, { signal });
		this.gridNode.addEventListener('keydown', this.handleGridKeydown, { signal });

		this.addEventListener('click', this.handleDelegatedClick, { signal });
		this.profileModal?.addEventListener('cancel', this.handleProfileModalCancel, { signal });

		this.updateControls();
		void this.loadMeta();
	}

	disconnectedCallback() {
		this.#bound = false;
		this.#listeners?.abort();
		this.#listeners = null;
		if (this.#profileCloseTimer !== null) {
			window.clearTimeout(this.#profileCloseTimer);
			this.#profileCloseTimer = null;
		}
		destroySearchableSelect(this.professionalSelect);
	}

	private canFilterByProfessional() {
		return this.roleId === ROLES.ADMIN || this.roleId === ROLES.RECEPCIONISTA;
	}

	private handleProfessionalChange = () => {
		if (!this.professionalSelect || !this.canFilterByProfessional()) return;
		this.selectedProfessionalId = Number(this.professionalSelect.value || 0);
		this.page = 1;
		void this.loadCustomers();
	};

	private handlePrevPage = () => {
		if (this.page <= 1) return;
		this.page -= 1;
		void this.loadCustomers();
	};

	private handleNextPage = () => {
		if (this.page >= this.totalPages) return;
		this.page += 1;
		void this.loadCustomers();
	};

	private handleGridClick = (event: Event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const card = target.closest<HTMLElement>('[data-customer-card]');
		if (!card || !this.gridNode?.contains(card)) return;
		const customerId = Number(card.dataset.customerId || 0);
		if (customerId > 0) void this.openCustomerProfile(customerId);
	};

	private handleGridKeydown = (event: KeyboardEvent) => {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;
		if (!target.matches('[data-customer-card]')) return;
		event.preventDefault();
		const customerId = Number(target.dataset.customerId || 0);
		if (customerId > 0) void this.openCustomerProfile(customerId);
	};

	private handleDelegatedClick = (event: Event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		if (target.closest('[data-close-customer-profile-modal]')) {
			this.closeProfileModal();
		}
	};

	private handleProfileModalCancel = (event: Event) => {
		event.preventDefault();
		this.closeProfileModal();
	};

	private clearNode(node: Element) {
		while (node.firstChild) node.removeChild(node.firstChild);
	}

	private createOption(value: string, label: string) {
		const option = document.createElement('option');
		option.value = value;
		option.textContent = label;
		return option;
	}

	private async parseJson<TData>(response: Response): Promise<ApiResponse<TData>> {
		try {
			return (await response.json()) as ApiResponse<TData>;
		} catch {
			throw new Error('No fue posible interpretar la respuesta del servidor.');
		}
	}

	private getBackendMessage(data: ApiResponse, fallback: string) {
		const message = String(data?.message || '').trim();
		return message || fallback;
	}

	private clearError() {
		if (!this.errorNode) return;
		this.errorNode.textContent = '';
		this.errorNode.classList.add('hidden');
	}

	private showError(message: string) {
		if (!this.errorNode) return;
		this.errorNode.textContent = message;
		this.errorNode.classList.remove('hidden');
	}

	private setLoading(value: boolean) {
		this.isLoading = value;
		this.updateControls();
	}

	private setProfileLoading(value: boolean) {
		this.isProfileLoading = value;
		if (this.profileLoadingNode) {
			this.profileLoadingNode.classList.toggle('hidden', !value);
		}
	}

	private clearProfileError() {
		if (!this.profileErrorNode) return;
		this.profileErrorNode.textContent = '';
		this.profileErrorNode.classList.add('hidden');
	}

	private showProfileError(message: string) {
		if (!this.profileErrorNode) return;
		this.profileErrorNode.textContent = message;
		this.profileErrorNode.classList.remove('hidden');
		if (this.profileBodyNode) this.profileBodyNode.classList.add('hidden');
	}

	private openProfileModalShell() {
		if (!this.profileModal) return;
		if (this.#profileCloseTimer !== null) {
			window.clearTimeout(this.#profileCloseTimer);
			this.#profileCloseTimer = null;
		}
		this.profileModal.classList.remove('is-closing');
		if (!this.profileModal.open) this.profileModal.showModal();
	}

	private closeProfileModal() {
		if (!this.profileModal?.open) return;
		this.profileModal.classList.add('is-closing');
		if (this.#profileCloseTimer !== null) window.clearTimeout(this.#profileCloseTimer);
		this.#profileCloseTimer = window.setTimeout(() => {
			this.profileModal?.classList.remove('is-closing');
			this.profileModal?.close();
			this.hideProfileScope();
			this.#profileCloseTimer = null;
		}, 140);
	}

	private updateControls() {
		if (this.loadingNode) this.loadingNode.classList.toggle('hidden', !this.isLoading);

		if (this.canFilterByProfessional()) {
			setSearchableSelectDisabled(
				this.professionalSelect,
				this.isLoading || this.professionals.length === 0
			);
		}

		if (this.prevButton) this.prevButton.disabled = this.isLoading || this.page <= 1;
		if (this.nextButton) {
			this.nextButton.disabled =
				this.isLoading || this.totalRecords === 0 || this.page >= this.totalPages;
		}
		this.prevButton?.classList.toggle('is-disabled', Boolean(this.prevButton.disabled));
		this.nextButton?.classList.toggle('is-disabled', Boolean(this.nextButton.disabled));

		if (this.pageLabelNode) {
			const totalPages = Math.max(1, this.totalPages);
			this.pageLabelNode.innerHTML = `Pagina <strong>${this.page}</strong> de <strong>${totalPages}</strong> <span aria-hidden="true">-</span> Total: <strong>${this.totalRecords}</strong> clientes`;
		}
		if (this.currentPageNode) this.currentPageNode.textContent = String(this.page);
	}

	private formatDate(value: string) {
		const text = String(value || '').trim();
		if (!text) return '-';

		const date = new Date(text);
		if (Number.isNaN(date.getTime())) return text;

		return new Intl.DateTimeFormat('es-PY', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
		}).format(date);
	}

	private formatDateTime(value: string) {
		const text = String(value || '').trim();
		if (!text) return '-';

		const date = new Date(text);
		if (Number.isNaN(date.getTime())) return text;

		const datePart = new Intl.DateTimeFormat('es-PY', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
		}).format(date);
		const timePart = new Intl.DateTimeFormat('es-PY', {
			hour: '2-digit',
			minute: '2-digit',
		}).format(date);

		return `${datePart} · ${timePart}`;
	}

	private formatCurrency(value: number) {
		const amount = Number.isFinite(value) ? Math.max(0, value) : 0;
		return `Gs. ${amount.toLocaleString('es-PY')}`;
	}

	private getAttendanceDotClass(rate: number | null) {
		if (rate === null || !Number.isFinite(rate)) return '';
		if (rate >= 80) return 'is-good';
		if (rate >= 50) return 'is-warn';
		return 'is-bad';
	}

	private createProfileFieldRow(label: string, value: string, options: { emphasize?: boolean } = {}) {
		const row = document.createElement('div');
		row.className = 'customer-profile-field-row';

		const term = document.createElement('span');
		term.className = 'customer-profile-field-term';
		term.textContent = label;

		const description = document.createElement('span');
		description.className = options.emphasize
			? 'customer-profile-field-value customer-profile-field-value--emphasize'
			: 'customer-profile-field-value';
		description.textContent = value;

		row.append(term, description);
		return row;
	}

	private renderAppointmentBlock(
		container: HTMLElement | null,
		appointment: CustomerAppointmentSummary | null,
		emptyLabel: string
	) {
		if (!container) return;
		this.clearNode(container);

		if (!appointment) {
			const empty = document.createElement('p');
			empty.className = 'customer-profile-reservation-empty';
			empty.textContent = emptyLabel;
			container.appendChild(empty);
			return;
		}

		const detail = document.createElement('dl');
		detail.className = 'customer-profile-reservation-detail';

		detail.append(
			this.createProfileFieldRow(
				'Fecha y hora',
				this.formatDateTime(appointment.start_time),
				{ emphasize: true }
			),
			this.createProfileFieldRow('Servicio', appointment.service_name || 'Servicio'),
			this.createProfileFieldRow('Profesional', appointment.professional_name || '—')
		);

		if (appointment.payment_status === 'PENDING') {
			const paymentRow = document.createElement('div');
			paymentRow.className = 'customer-profile-field-row';
			const term = document.createElement('span');
			term.className = 'customer-profile-field-term';
			term.textContent = 'Pago';
			const badge = document.createElement('span');
			badge.className = 'customer-profile-payment-badge';
			badge.textContent = 'Pago pendiente';
			paymentRow.append(term, badge);
			detail.appendChild(paymentRow);
		}

		container.appendChild(detail);
	}

	private renderPendingAppointments(appointments: CustomerAppointmentSummary[]) {
		if (!this.profilePendingWrap || !this.profilePendingList) return;

		this.clearNode(this.profilePendingList);
		const hasPending = appointments.length > 0;
		this.profilePendingWrap.classList.toggle('hidden', !hasPending);

		if (!hasPending) return;

		for (const appointment of appointments) {
			const item = document.createElement('div');
			item.className = 'customer-profile-pending-item';
			this.renderAppointmentBlock(item, appointment, '');
			this.profilePendingList.appendChild(item);
		}
	}

	private renderTopServices(services: CustomerTopService[]) {
		if (!this.profileServicesNode) return;
		this.clearNode(this.profileServicesNode);

		if (services.length === 0) {
			const empty = document.createElement('p');
			empty.className = 'customer-profile-reservation-empty';
			empty.textContent = 'Aún sin citas atendidas registradas';
			this.profileServicesNode.appendChild(empty);
			return;
		}

		for (const service of services) {
			const chip = document.createElement('span');
			chip.className = 'customer-profile-service-chip';
			chip.textContent =
				service.count > 1 ? `${service.name} (${service.count})` : service.name;
			this.profileServicesNode.appendChild(chip);
		}
	}

	private getProfileScopeProfessionalName() {
		if (this.selectedProfessionalId <= 0) return '';
		return (
			this.professionals.find(
				(professional) => professional.id_professional === this.selectedProfessionalId
			)?.display_name || ''
		);
	}

	private renderProfileScope() {
		if (!this.profileScopeNode) return;

		const professionalName = this.getProfileScopeProfessionalName();
		const isProfessionalScope = this.selectedProfessionalId > 0;

		this.profileScopeNode.dataset.scope = isProfessionalScope ? 'professional' : 'global';
		this.profileScopeNode.classList.remove('hidden');

		if (this.profileScopeIconNode) {
			this.profileScopeIconNode.textContent = isProfessionalScope ? 'person' : 'public';
		}

		if (this.profileScopeLabelNode) {
			const scopeLabel = isProfessionalScope
				? professionalName
					? `Resumen con ${professionalName}`
					: 'Resumen por profesional'
				: 'Resumen general del cliente';
			this.profileScopeLabelNode.textContent = scopeLabel;
			this.profileScopeNode.title = scopeLabel;
		}
	}

	private hideProfileScope() {
		if (!this.profileScopeNode) return;
		this.profileScopeNode.classList.add('hidden');
		delete this.profileScopeNode.dataset.scope;
		if (this.profileScopeLabelNode) this.profileScopeLabelNode.textContent = '';
	}

	private renderCustomerProfile(profile: CustomerProfile) {
		const stats = profile.stats;

		this.renderProfileScope();

		if (this.profileNameNode) {
			this.profileNameNode.textContent =
				profile.full_name || `Cliente #${profile.id_customer}`;
		}
		if (this.profilePhoneNode) {
			this.profilePhoneNode.textContent = profile.phone_number || '—';
		}
		if (this.profileRegisteredNode) {
			this.profileRegisteredNode.textContent = this.formatDate(profile.created_at);
		}

		if (this.profileAttendanceDot) {
			this.profileAttendanceDot.className = 'customer-profile-attendance-dot';
			const dotClass = this.getAttendanceDotClass(stats.attendance_rate);
			if (dotClass) this.profileAttendanceDot.classList.add(dotClass);
		}

		if (this.profileAttendanceRate) {
			this.profileAttendanceRate.textContent =
				stats.attendance_rate === null || !Number.isFinite(stats.attendance_rate)
					? 'Sin datos'
					: `${stats.attendance_rate}%`;
		}

		if (this.profileAttendanceDetail) {
			const attended = stats.attended_count;
			const cancelled = stats.cancelled_count;
			const attendedLabel = attended === 1 ? '1 atendida' : `${attended} atendidas`;
			const cancelledLabel = cancelled === 1 ? '1 cancelada' : `${cancelled} canceladas`;
			this.profileAttendanceDetail.textContent = `${attendedLabel} · ${cancelledLabel}`;
		}

		if (this.profileLtvNode) {
			this.profileLtvNode.textContent = this.formatCurrency(stats.lifetime_value);
		}

		this.renderAppointmentBlock(
			this.profileLastNode,
			stats.last_appointment,
			'Sin reservas atendidas'
		);
		this.renderAppointmentBlock(
			this.profileNextNode,
			stats.next_appointment,
			'Sin reserva confirmada'
		);
		this.renderPendingAppointments(stats.pending_appointments);
		this.renderTopServices(stats.top_services);

		if (this.profileBodyNode) this.profileBodyNode.classList.remove('hidden');
	}

	private async openCustomerProfile(customerId: number) {
		if (!this.profileModal) return;

		this.activeProfileCustomerId = customerId;
		this.openProfileModalShell();
		this.clearProfileError();
		if (this.profileBodyNode) this.profileBodyNode.classList.add('hidden');
		this.setProfileLoading(true);

		if (this.profileNameNode) this.profileNameNode.textContent = 'Cliente';
		if (this.profilePhoneNode) this.profilePhoneNode.textContent = '—';
		if (this.profileRegisteredNode) this.profileRegisteredNode.textContent = '—';
		this.renderProfileScope();

		try {
			const query = new URLSearchParams();
			if (this.selectedProfessionalId > 0) {
				query.set('pro_id', String(this.selectedProfessionalId));
			}

			const queryString = query.toString();
			const response = await fetch(
				`/api/customers/${customerId}${queryString ? `?${queryString}` : ''}`,
				{
					method: 'GET',
					headers: { Accept: 'application/json' },
				}
			);
			const data = await this.parseJson<CustomerProfile>(response);

			if (!response.ok || data.status !== 'success' || !data.data) {
				throw new Error(
					this.getBackendMessage(data, 'No fue posible obtener el perfil del cliente.')
				);
			}

			if (this.activeProfileCustomerId !== customerId) return;
			this.renderCustomerProfile(data.data);
		} catch (error) {
			if (this.activeProfileCustomerId !== customerId) return;
			this.showProfileError(
				error instanceof Error ? error.message : 'No fue posible obtener el perfil del cliente.'
			);
		} finally {
			if (this.activeProfileCustomerId === customerId) {
				this.setProfileLoading(false);
			}
		}
	}

	private renderProfessionalOptions() {
		if (!this.professionalSelect) return;

		destroySearchableSelect(this.professionalSelect);
		this.clearNode(this.professionalSelect);

		if (this.canFilterByProfessional()) {
			this.professionalSelect.appendChild(this.createOption('', 'Todos los profesionales'));
		}

		for (const professional of this.professionals) {
			this.professionalSelect.appendChild(
				this.createOption(String(professional.id_professional), professional.display_name)
			);
		}

		const targetProfessionalId =
			this.selectedProfessionalId > 0
				? this.selectedProfessionalId
				: this.roleId === ROLES.PROFESIONAL && this.currentProfessionalId > 0
					? this.currentProfessionalId
					: 0;

		if (targetProfessionalId > 0) {
			this.selectedProfessionalId = targetProfessionalId;
			this.professionalSelect.value = String(targetProfessionalId);
		}

		if (!this.canFilterByProfessional()) {
			return;
		}

		ensureSearchableSelect(this.professionalSelect, {
			placeholder: 'Buscar profesional...',
		});

		if (targetProfessionalId > 0) {
			setSearchableSelectValue(this.professionalSelect, targetProfessionalId);
		}

		setSearchableSelectDisabled(
			this.professionalSelect,
			this.isLoading || this.professionals.length === 0
		);
	}

	private formatCustomerPhone(rawValue: string) {
		const value = String(rawValue || '').trim();
		if (!value) return 'Sin teléfono';

		const parsed = parseParaguayMobilePhone(value);
		if (parsed.isValid) return parsed.pretty;

		return value;
	}

	private renderCustomers(customers: Customer[]) {
		if (!this.gridNode) return;

		this.clearNode(this.gridNode);
		if (this.emptyNode) this.emptyNode.classList.toggle('hidden', customers.length > 0);
		this.gridNode.classList.toggle('hidden', customers.length === 0);

		const fragment = document.createDocumentFragment();
		for (const customer of customers) {
			const article = document.createElement('article');
			article.className = 'customer-card material-data-card group';
			article.setAttribute('role', 'button');
			article.tabIndex = 0;
			article.dataset.customerCard = 'true';
			article.dataset.customerId = String(customer.id_customer);

			const row = document.createElement('div');
			row.className = 'flex min-w-0 items-center gap-3';

			const iconWrap = document.createElement('div');
			iconWrap.className = 'customer-card-icon';
			iconWrap.innerHTML = '<span class="material-symbols-rounded text-[1.25rem]">person</span>';

			const body = document.createElement('div');
			body.className = 'customer-card-body min-w-0';

			const name = document.createElement('h3');
			name.className = 'customer-card-title min-w-0 truncate';
			name.textContent = customer.full_name || `Cliente #${customer.id_customer}`;

			const phone = document.createElement('p');
			phone.className = 'customer-card-phone min-w-0 truncate';
			phone.textContent = this.formatCustomerPhone(customer.phone_number);

			body.append(name, phone);
			row.append(iconWrap, body);
			article.append(row);
			fragment.appendChild(article);
		}

		this.gridNode.appendChild(fragment);
	}

	private renderSummary() {
		if (!this.summaryNode) return;

		const professionalName =
			this.selectedProfessionalId > 0
				? this.professionals.find(
						(professional) => professional.id_professional === this.selectedProfessionalId
					)?.display_name
				: '';
		const scope = professionalName ? ` de ${professionalName}` : '';
		const total = this.totalRecords === 1 ? '1 cliente' : `${this.totalRecords} clientes`;
		this.summaryNode.textContent = `${total}${scope}`;
	}

	private async loadMeta() {
		this.setLoading(true);
		this.clearError();

		try {
			const response = await fetch('/api/customers/meta', {
				method: 'GET',
				headers: { Accept: 'application/json' },
			});
			const data = await this.parseJson<{
				professionals: ProfessionalLov[];
				session?: { role_id?: number; professional_id?: number };
			}>(response);

			if (!response.ok || data.status !== 'success' || !data.data) {
				throw new Error(this.getBackendMessage(data, 'No fue posible cargar los catalogos.'));
			}

			const sessionRoleId = Number(data.data.session?.role_id || 0);
			const datasetRoleId = Number(this.dataset.roleId || 0);
			this.roleId = sessionRoleId > 0 ? sessionRoleId : datasetRoleId;
			this.currentProfessionalId = Number(data.data.session?.professional_id || 0);
			this.professionals = Array.isArray(data.data.professionals) ? data.data.professionals : [];

			if (this.roleId === ROLES.PROFESIONAL) {
				this.selectedProfessionalId =
					this.currentProfessionalId > 0
						? this.currentProfessionalId
						: Number(this.professionals[0]?.id_professional || 0);
			} else {
				this.selectedProfessionalId = 0;
			}

			this.renderProfessionalOptions();
			await this.loadCustomers();
		} catch (error) {
			this.showError(
				error instanceof Error ? error.message : 'No fue posible cargar la configuracion inicial.'
			);
			this.renderCustomers([]);
		} finally {
			this.setLoading(false);
		}
	}

	private async loadCustomers() {
		this.setLoading(true);
		this.clearError();

		try {
			const query = new URLSearchParams({
				page: String(this.page),
				limit: String(this.limit),
			});
			if (this.selectedProfessionalId > 0) {
				query.set('pro_id', String(this.selectedProfessionalId));
			}

			const response = await fetch(`/api/customers?${query.toString()}`, {
				method: 'GET',
				headers: { Accept: 'application/json' },
			});
			const data = await this.parseJson<Customer[]>(response);

			if (!response.ok || data.status !== 'success' || !Array.isArray(data.data)) {
				throw new Error(this.getBackendMessage(data, 'No fue posible obtener los clientes.'));
			}

			this.page = Number(data.meta?.current_page || this.page);
			this.limit = Number(data.meta?.per_page || this.limit);
			this.totalRecords = Number(data.meta?.total_records || 0);
			this.totalPages = Math.max(1, Number(data.meta?.total_pages || 0));

			this.renderCustomers(data.data);
			this.renderSummary();
		} catch (error) {
			this.showError(error instanceof Error ? error.message : 'No fue posible obtener los clientes.');
			this.renderCustomers([]);
			this.totalRecords = 0;
			this.totalPages = 1;
			this.renderSummary();
		} finally {
			this.setLoading(false);
		}
	}
}

if (!customElements.get('customer-manager')) {
	customElements.define('customer-manager', CustomerManager);
}
