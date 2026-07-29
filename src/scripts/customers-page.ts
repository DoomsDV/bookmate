import { ROLES } from '../config/roles';
import type {
	CustomerAppointmentSummary,
	CustomerProfile,
	CustomerTopService,
} from '../lib/customers';
import { updateAppPaginationDom } from '../lib/pagination';
import { parseParaguayMobilePhone } from '../lib/paraguay-phone';
type ProfessionalLov = { id_professional: number; display_name: string };
type Customer = {
	id_customer: number;
	full_name: string;
	phone_number: string;
	created_at: string;
	appointment_count?: number;
	last_appointment_at?: string | null;
};

const CUSTOMER_AVATAR_TONES = 6;
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
	#proFilterOutsideBound = false;

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
	private searchQuery = '';
	#searchDebounceTimer: number | null = null;

	private professionalSelect: HTMLSelectElement | null = null;
	private searchInput: HTMLInputElement | null = null;
	private proFilterButton: HTMLButtonElement | null = null;
	private proFilterBadge: HTMLElement | null = null;
	private proFilterSheet: HTMLDialogElement | null = null;
	private proFilterList: HTMLElement | null = null;
	private loadingNode: HTMLElement | null = null;
	private errorNode: HTMLElement | null = null;
	private summaryNode: HTMLElement | null = null;
	private gridNode: HTMLElement | null = null;
	private emptyNode: HTMLElement | null = null;
	private emptyTitleNode: HTMLElement | null = null;
	private emptyCopyNode: HTMLElement | null = null;
	private emptyIconNode: HTMLElement | null = null;
	private pageLabelNode: HTMLElement | null = null;
	private paginationNode: HTMLElement | null = null;
	private prevButton: HTMLButtonElement | null = null;
	private nextButton: HTMLButtonElement | null = null;

	private profileModal: HTMLDialogElement | null = null;
	private profileLoadingNode: HTMLElement | null = null;
	private profileErrorNode: HTMLElement | null = null;
	private profileBodyNode: HTMLElement | null = null;
	private profileNameNode: HTMLElement | null = null;
	private profileAvatarNode: HTMLElement | null = null;
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
	private profileProfitabilityWrap: HTMLElement | null = null;
	private profileAvgTicketNode: HTMLElement | null = null;
	private profileLostValueNode: HTMLElement | null = null;
	private profileHistoryList: HTMLElement | null = null;
	private profileHistoryEmpty: HTMLElement | null = null;
	private profileTabButtons: NodeListOf<HTMLButtonElement> | null = null;
	private profileTabPanels: NodeListOf<HTMLElement> | null = null;
	private activeProfileTab: 'summary' | 'history' = 'summary';
	private currentProfileHistoryEnabled = false;

	private professionals: ProfessionalLov[] = [];

	connectedCallback() {
		if (this.#bound) return;

		this.professionalSelect = this.querySelector<HTMLSelectElement>('[data-professional-filter]');
		this.searchInput = this.querySelector<HTMLInputElement>('[data-customers-search]');
		this.proFilterButton = this.querySelector<HTMLButtonElement>('[data-open-pro-filter]');
		this.proFilterBadge = this.querySelector<HTMLElement>('[data-pro-filter-badge]');
		this.proFilterSheet = this.querySelector<HTMLDialogElement>('[data-pro-filter-sheet]');
		this.proFilterList = this.querySelector<HTMLElement>('[data-pro-filter-list]');
		this.loadingNode = this.querySelector<HTMLElement>('[data-customers-loading]');
		this.errorNode = this.querySelector<HTMLElement>('[data-customers-error]');
		this.summaryNode = this.querySelector<HTMLElement>('[data-customers-summary]');
		this.gridNode = this.querySelector<HTMLElement>('[data-customers-grid]');
		this.emptyNode = this.querySelector<HTMLElement>('[data-customers-empty]');
		this.emptyTitleNode = this.querySelector<HTMLElement>('[data-customers-empty-title]');
		this.emptyCopyNode = this.querySelector<HTMLElement>('[data-customers-empty-copy]');
		this.emptyIconNode = this.querySelector<HTMLElement>('[data-customers-empty-icon]');
		this.pageLabelNode = this.querySelector<HTMLElement>('[data-customers-page-label]');
		this.paginationNode = this.querySelector<HTMLElement>('[data-customers-pagination]');
		this.prevButton = this.querySelector<HTMLButtonElement>('[data-customers-prev]');
		this.nextButton = this.querySelector<HTMLButtonElement>('[data-customers-next]');

		this.profileModal = this.querySelector<HTMLDialogElement>('[data-customer-profile-modal]');
		this.profileLoadingNode = this.querySelector<HTMLElement>('[data-customer-profile-loading]');
		this.profileErrorNode = this.querySelector<HTMLElement>('[data-customer-profile-error]');
		this.profileBodyNode = this.querySelector<HTMLElement>('[data-customer-profile-body]');
		this.profileNameNode = this.querySelector<HTMLElement>('[data-customer-profile-name]');
		this.profileAvatarNode = this.querySelector<HTMLElement>('[data-customer-profile-avatar]');
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
		this.profileProfitabilityWrap = this.querySelector<HTMLElement>(
			'[data-customer-profile-profitability-wrap]'
		);
		this.profileAvgTicketNode = this.querySelector<HTMLElement>(
			'[data-customer-profile-avg-ticket]'
		);
		this.profileLostValueNode = this.querySelector<HTMLElement>(
			'[data-customer-profile-lost-value]'
		);
		this.profileHistoryList = this.querySelector<HTMLElement>(
			'[data-customer-profile-history-list]'
		);
		this.profileHistoryEmpty = this.querySelector<HTMLElement>(
			'[data-customer-profile-history-empty]'
		);
		this.profileTabButtons = this.querySelectorAll<HTMLButtonElement>(
			'[data-customer-profile-tab]'
		);
		this.profileTabPanels = this.querySelectorAll<HTMLElement>(
			'[data-customer-profile-tab-panel]'
		);

		if (!this.gridNode) return;

		this.#bound = true;
		this.roleId = Number(this.dataset.roleId || 0);
		this.#listeners = new AbortController();
		const signal = this.#listeners.signal;

		this.professionalSelect?.addEventListener('change', this.handleProfessionalChange, { signal });
		this.searchInput?.addEventListener('input', this.handleSearchInput, { signal });
		this.proFilterButton?.addEventListener('click', this.handleOpenProFilter, { signal });
		this.proFilterSheet?.addEventListener('click', this.handleProFilterSheetClick, { signal });
		this.proFilterSheet?.addEventListener('cancel', this.handleProFilterSheetCancel, { signal });
		this.proFilterSheet?.addEventListener('close', this.handleProFilterSheetClose, { signal });
		window.addEventListener('resize', this.handleProFilterViewportChange, { signal });
		window.addEventListener('scroll', this.handleProFilterViewportChange, { signal, capture: true });
		document.addEventListener('keydown', this.handleProFilterKeydown, { signal });
		document.addEventListener('pointerdown', this.handleProFilterOutsidePointer, { signal, capture: true });
		this.prevButton?.addEventListener('click', this.handlePrevPage, { signal });
		this.nextButton?.addEventListener('click', this.handleNextPage, { signal });
		this.paginationNode?.addEventListener('click', this.handlePaginationClick, { signal });
		this.gridNode.addEventListener('click', this.handleGridClick, { signal });
		this.gridNode.addEventListener('keydown', this.handleGridKeydown, { signal });

		this.addEventListener('click', this.handleDelegatedClick, { signal });
		this.profileModal?.addEventListener('click', this.handleProfileModalClick, { signal });
		this.profileModal?.addEventListener('cancel', this.handleProfileModalCancel, { signal });
		for (const tab of this.profileTabButtons ?? []) {
			tab.addEventListener('click', this.handleProfileTabClick, { signal });
		}

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
		if (this.#searchDebounceTimer !== null) {
			window.clearTimeout(this.#searchDebounceTimer);
			this.#searchDebounceTimer = null;
		}
	}

	private canFilterByProfessional() {
		return this.roleId === ROLES.ADMIN || this.roleId === ROLES.RECEPCIONISTA;
	}

	private handleProfessionalChange = () => {
		if (!this.professionalSelect || !this.canFilterByProfessional()) return;
		this.selectedProfessionalId = Number(this.professionalSelect.value || 0);
		this.page = 1;
		this.updateProFilterUi();
		void this.loadCustomers();
	};

	private isDesktopProFilter() {
		return window.matchMedia('(min-width: 768px)').matches;
	}

	private clearProFilterPopoverStyles() {
		if (!this.proFilterSheet) return;
		this.proFilterSheet.style.top = '';
		this.proFilterSheet.style.left = '';
		this.proFilterSheet.style.right = '';
		this.proFilterSheet.style.bottom = '';
		this.proFilterSheet.style.width = '';
		this.proFilterSheet.style.maxWidth = '';
		this.proFilterSheet.style.margin = '';
	}

	private positionProFilterPopover() {
		if (!this.proFilterSheet || !this.proFilterButton) return;

		const buttonRect = this.proFilterButton.getBoundingClientRect();
		const gap = 8;
		const width = Math.min(18.5 * 16, window.innerWidth - 24);
		let left = buttonRect.right - width;
		left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
		let top = buttonRect.bottom + gap;

		this.proFilterSheet.style.width = `${width}px`;
		this.proFilterSheet.style.maxWidth = `${width}px`;
		this.proFilterSheet.style.margin = '0';
		this.proFilterSheet.style.right = 'auto';
		this.proFilterSheet.style.bottom = 'auto';
		this.proFilterSheet.style.left = `${left}px`;
		this.proFilterSheet.style.top = `${top}px`;

		// Si no entra abajo, abrir hacia arriba.
		requestAnimationFrame(() => {
			if (!this.proFilterSheet || !this.proFilterButton) return;
			const panelRect = this.proFilterSheet.getBoundingClientRect();
			const overflowBottom = panelRect.bottom - window.innerHeight + 12;
			if (overflowBottom > 0) {
				const aboveTop = buttonRect.top - gap - panelRect.height;
				if (aboveTop >= 12) {
					this.proFilterSheet.style.top = `${aboveTop}px`;
				} else {
					this.proFilterSheet.style.top = `${Math.max(12, top - overflowBottom)}px`;
				}
			}
		});
	}

	private openProFilterPopover() {
		if (!this.proFilterSheet) return;
		this.proFilterSheet.classList.add('is-desktop-popover');
		this.positionProFilterPopover();
		this.proFilterSheet.show();
		this.proFilterButton?.setAttribute('aria-expanded', 'true');
		this.#proFilterOutsideBound = true;
	}

	private openProFilterModal() {
		if (!this.proFilterSheet) return;
		this.proFilterSheet.classList.remove('is-desktop-popover');
		this.clearProFilterPopoverStyles();
		this.proFilterSheet.showModal();
		this.proFilterButton?.setAttribute('aria-expanded', 'true');
		this.#proFilterOutsideBound = false;
	}

	private handleOpenProFilter = (event: Event) => {
		event.preventDefault();
		event.stopPropagation();
		if (!this.canFilterByProfessional() || this.isLoading || !this.proFilterSheet) return;

		if (this.proFilterSheet.open) {
			this.closeProFilterSheet();
			return;
		}

		this.renderProFilterList();
		// Evita que el mismo click del botón cierre el dialog al instante (click-through).
		window.setTimeout(() => {
			if (!this.proFilterSheet || this.proFilterSheet.open) return;
			if (this.isDesktopProFilter()) {
				this.openProFilterPopover();
			} else {
				this.openProFilterModal();
			}
		}, 0);
	};

	private handleProFilterSheetCancel = (event: Event) => {
		event.preventDefault();
		this.closeProFilterSheet();
	};

	private handleProFilterSheetClose = () => {
		this.clearProFilterPopoverStyles();
		this.proFilterSheet?.classList.remove('is-desktop-popover');
		this.proFilterButton?.setAttribute('aria-expanded', 'false');
		this.#proFilterOutsideBound = false;
	};

	private handleProFilterViewportChange = () => {
		if (!this.proFilterSheet?.open) return;

		if (!this.isDesktopProFilter()) {
			if (this.proFilterSheet.classList.contains('is-desktop-popover')) {
				this.closeProFilterSheet();
			}
			return;
		}

		if (this.proFilterSheet.classList.contains('is-desktop-popover')) {
			this.positionProFilterPopover();
			return;
		}

		// Pasó de mobile modal a desktop: reabrir como popover.
		this.closeProFilterSheet();
	};

	private handleProFilterKeydown = (event: KeyboardEvent) => {
		if (event.key !== 'Escape') return;
		if (!this.proFilterSheet?.open) return;
		if (!this.proFilterSheet.classList.contains('is-desktop-popover')) return;
		event.preventDefault();
		this.closeProFilterSheet();
	};

	private handleProFilterOutsidePointer = (event: PointerEvent) => {
		if (!this.#proFilterOutsideBound || !this.proFilterSheet?.open) return;
		if (!this.proFilterSheet.classList.contains('is-desktop-popover')) return;

		const target = event.target;
		if (!(target instanceof Node)) return;
		if (this.proFilterSheet.contains(target)) return;
		if (this.proFilterButton?.contains(target)) return;
		this.closeProFilterSheet();
	};

	private handleProFilterSheetClick = (event: MouseEvent) => {
		const target = event.target;
		if (!(target instanceof Element) || !this.proFilterSheet) return;

		if (target.closest('[data-close-pro-filter]')) {
			this.closeProFilterSheet();
			return;
		}

		const option = target.closest<HTMLButtonElement>('[data-pro-filter-option]');
		if (option && this.proFilterList?.contains(option)) {
			const nextId = Number(option.dataset.proFilterOption || 0);
			if (!this.professionalSelect) return;

			this.professionalSelect.value = nextId > 0 ? String(nextId) : '';
			this.closeProFilterSheet();
			this.handleProfessionalChange();
			return;
		}

		// Mobile modal: cerrar si el click cayó fuera del panel (backdrop).
		if (this.proFilterSheet.classList.contains('is-desktop-popover')) return;
		const rect = this.proFilterSheet.getBoundingClientRect();
		const insidePanel =
			event.clientX >= rect.left &&
			event.clientX <= rect.right &&
			event.clientY >= rect.top &&
			event.clientY <= rect.bottom;
		if (!insidePanel) this.closeProFilterSheet();
	};

	private closeProFilterSheet() {
		if (!this.proFilterSheet?.open) {
			this.handleProFilterSheetClose();
			return;
		}
		this.proFilterSheet.close();
	}

	private handleSearchInput = () => {
		const nextQuery = String(this.searchInput?.value || '').trim();
		if (this.#searchDebounceTimer !== null) {
			window.clearTimeout(this.#searchDebounceTimer);
		}
		this.#searchDebounceTimer = window.setTimeout(() => {
			this.#searchDebounceTimer = null;
			if (nextQuery === this.searchQuery) return;
			this.searchQuery = nextQuery;
			this.page = 1;
			void this.loadCustomers();
		}, 300);
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

	private handlePaginationClick = (event: Event) => {
		const target = event.target;
		if (!(target instanceof Element) || this.isLoading) return;

		const pageBtn = target.closest<HTMLButtonElement>('[data-customers-page]');
		if (!pageBtn) return;

		const nextPage = Number(pageBtn.getAttribute('data-customers-page') || '1');
		if (!Number.isInteger(nextPage) || nextPage <= 0 || nextPage === this.page) return;
		this.page = nextPage;
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

	private handleProfileModalClick = (event: MouseEvent) => {
		// Click en el área vacía del dialog (blur / fuera del panel) → cerrar.
		if (event.target === this.profileModal) {
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
		// Evita que las cards previas queden visibles debajo del skeleton
		// (por si .hidden pierde contra display:grid de .material-cards-grid).
		if (value && this.gridNode) this.clearNode(this.gridNode);
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
		const hasCustomers = Boolean(this.gridNode && this.gridNode.childElementCount > 0);
		const showEmpty = !this.isLoading && !hasCustomers;

		if (this.loadingNode) this.loadingNode.classList.toggle('hidden', !this.isLoading);
		if (this.gridNode) {
			this.gridNode.classList.toggle('hidden', this.isLoading || !hasCustomers);
		}
		if (this.emptyNode) {
			this.emptyNode.classList.toggle('hidden', !showEmpty);
			if (showEmpty) this.updateEmptyStateCopy();
		}
		this.paginationNode?.classList.toggle('hidden', this.isLoading || !hasCustomers);

		if (this.searchInput) this.searchInput.disabled = this.isLoading;

		if (this.proFilterButton) {
			this.proFilterButton.disabled =
				this.isLoading || (this.canFilterByProfessional() && this.professionals.length === 0);
		}
		this.updateProFilterUi();

		if (this.pageLabelNode && this.paginationNode) {
			updateAppPaginationDom(this.paginationNode, {
				currentPage: this.page,
				totalPages: Math.max(1, this.totalPages),
				totalRecords: this.totalRecords,
				recordLabel: 'clientes',
				summarySelector: '[data-customers-page-label]',
				pagesSelector: '[data-customers-pagination-pages]',
				prevSelector: '[data-customers-prev]',
				nextSelector: '[data-customers-next]',
				pageDataAttr: 'data-customers-page',
			});
		}

		if (this.prevButton) this.prevButton.disabled = this.isLoading || this.page <= 1;
		if (this.nextButton) {
			this.nextButton.disabled =
				this.isLoading || this.totalRecords === 0 || this.page >= this.totalPages;
		}
		this.prevButton?.classList.toggle('is-disabled', Boolean(this.prevButton.disabled));
		this.nextButton?.classList.toggle('is-disabled', Boolean(this.nextButton.disabled));
	}

	private updateEmptyStateCopy() {
		const hasSearch = Boolean(this.searchQuery);
		const hasProFilter = this.canFilterByProfessional() && this.selectedProfessionalId > 0;

		if (this.emptyTitleNode) {
			this.emptyTitleNode.textContent = hasSearch
				? 'No se encontraron clientes'
				: 'No hay clientes para mostrar';
		}
		if (this.emptyCopyNode) {
			if (hasSearch) {
				this.emptyCopyNode.textContent = 'Probá con otro nombre o teléfono.';
			} else if (hasProFilter) {
				this.emptyCopyNode.textContent =
					'No hay clientes asociados al profesional seleccionado.';
			} else {
				this.emptyCopyNode.textContent =
					'Cuando registres citas, tus clientes aparecerán aquí.';
			}
		}
		if (this.emptyIconNode) {
			this.emptyIconNode.textContent = hasSearch ? 'search_off' : 'group_off';
		}
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

	private formatReservationWhen(value: string, options: { relative?: boolean } = {}) {
		const text = String(value || '').trim();
		if (!text) return '—';

		const date = new Date(text);
		if (Number.isNaN(date.getTime())) return text;

		const absolute = new Intl.DateTimeFormat('es-PY', {
			day: '2-digit',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit',
		}).format(date);

		if (!options.relative) {
			const withYear = new Intl.DateTimeFormat('es-PY', {
				day: '2-digit',
				month: 'short',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
			}).format(date);
			return withYear.replace(',', ' a las');
		}

		const now = new Date();
		const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		const dayDiff = Math.round(
			(startOfTarget.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000)
		);
		const timePart = new Intl.DateTimeFormat('es-PY', {
			hour: '2-digit',
			minute: '2-digit',
		}).format(date);
		const shortDate = new Intl.DateTimeFormat('es-PY', {
			day: '2-digit',
			month: 'short',
		}).format(date);

		if (dayDiff === 0) return `Hoy a las ${timePart}`;
		if (dayDiff === 1) return `Mañana a las ${timePart}`;
		if (dayDiff > 1 && dayDiff <= 14) {
			return `En ${dayDiff} días (${shortDate} a las ${timePart})`;
		}
		if (dayDiff === -1) return `Ayer a las ${timePart}`;
		if (dayDiff < -1 && dayDiff >= -14) {
			return `Hace ${Math.abs(dayDiff)} días (${shortDate} a las ${timePart})`;
		}
		return `${absolute.replace(',', ' a las')}`;
	}

	private renderReservationLine(
		container: HTMLElement | null,
		appointment: CustomerAppointmentSummary | null,
		emptyLabel: string,
		options: { relative?: boolean } = {}
	) {
		if (!container) return;
		this.clearNode(container);

		if (!appointment) {
			const empty = document.createElement('span');
			empty.className = 'customer-profile-reservation-card__empty';
			empty.textContent = emptyLabel;
			container.appendChild(empty);
			return;
		}

		const service = document.createElement('p');
		service.className = 'customer-profile-reservation-card__service';
		const serviceName = appointment.service_name || 'Servicio';
		const professional = String(appointment.professional_name || '').trim();
		service.textContent = professional
			? `${serviceName} con ${professional}`
			: serviceName;

		const when = document.createElement('p');
		when.className = 'customer-profile-reservation-card__when';
		const icon = document.createElement('span');
		icon.className = 'material-symbols-rounded';
		icon.setAttribute('aria-hidden', 'true');
		icon.textContent = 'calendar_month';
		const whenText = document.createElement('span');
		whenText.textContent = this.formatReservationWhen(appointment.start_time, {
			relative: options.relative === true,
		});
		when.append(icon, whenText);

		container.append(service, when);
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

		const historyRow = this.buildHistoryBadges(appointment);
		if (historyRow) detail.appendChild(historyRow);

		container.appendChild(detail);
	}

	private buildHistoryBadges(appointment: CustomerAppointmentSummary): HTMLElement | null {
		const hasNotes = appointment.has_history_notes === true;
		const attachmentCount = Math.max(0, Math.floor(Number(appointment.attachment_count || 0)));
		if (!hasNotes && attachmentCount === 0) return null;

		const row = document.createElement('div');
		row.className = 'flex flex-wrap items-center gap-1.5 pt-1';

		const makeBadge = (icon: string, label: string) => {
			const badge = document.createElement('span');
			badge.className =
				'inline-flex items-center gap-1 rounded-full bg-(--primary-soft) px-2 py-0.5 text-[0.72rem] font-bold text-(--primary)';
			const iconEl = document.createElement('span');
			iconEl.className = 'material-symbols-rounded text-[0.9rem]';
			iconEl.setAttribute('aria-hidden', 'true');
			iconEl.textContent = icon;
			const text = document.createElement('span');
			text.textContent = label;
			badge.append(iconEl, text);
			return badge;
		};

		if (hasNotes) row.appendChild(makeBadge('description', 'Notas'));
		if (attachmentCount > 0) {
			row.appendChild(
				makeBadge(
					'attach_file',
					attachmentCount === 1 ? '1 archivo' : `${attachmentCount} archivos`
				)
			);
		}
		return row;
	}

	private renderProfitability(stats: CustomerProfile['stats']) {
		if (!this.profileProfitabilityWrap) return;

		const profitability = stats.profitability_enabled ? stats.profitability : null;
		if (!profitability) {
			this.profileProfitabilityWrap.classList.add('hidden');
			return;
		}

		this.profileProfitabilityWrap.classList.remove('hidden');
		if (this.profileAvgTicketNode) {
			this.profileAvgTicketNode.textContent = this.formatCurrency(profitability.avg_ticket);
		}
		if (this.profileLostValueNode) {
			this.profileLostValueNode.textContent = this.formatCurrency(profitability.lost_value);
		}
	}

	private handleProfileTabClick = (event: Event) => {
		const button = event.currentTarget as HTMLButtonElement | null;
		const tab = button?.dataset.customerProfileTab;
		if (tab !== 'summary' && tab !== 'history') return;
		this.setActiveProfileTab(tab);
	};

	private setActiveProfileTab(tab: 'summary' | 'history') {
		this.activeProfileTab = tab;
		for (const button of this.profileTabButtons ?? []) {
			const isActive = button.dataset.customerProfileTab === tab;
			button.classList.toggle('is-active', isActive);
			button.setAttribute('aria-selected', isActive ? 'true' : 'false');
			button.tabIndex = isActive ? 0 : -1;
		}
		for (const panel of this.profileTabPanels ?? []) {
			const isActive = panel.dataset.customerProfileTabPanel === tab;
			panel.classList.toggle('hidden', !isActive);
			if (isActive) panel.removeAttribute('hidden');
			else panel.setAttribute('hidden', '');
		}
	}

	private formatAppointmentStatusLabel(status: string) {
		const normalized = String(status || '').trim().toUpperCase();
		if (normalized === 'COMPLETADO') return 'Completado';
		if (normalized === 'CONFIRMADO') return 'Confirmado';
		if (normalized === 'CANCELADO') return 'Cancelado';
		if (normalized === 'PENDIENTE') return 'Pendiente';
		return normalized || '—';
	}

	private getAppointmentStatusBadgeClass(status: string) {
		const normalized = String(status || '').trim().toUpperCase();
		if (normalized === 'COMPLETADO') return 'is-completed';
		if (normalized === 'CONFIRMADO') return 'is-confirmed';
		if (normalized === 'CANCELADO') return 'is-cancelled';
		if (normalized === 'PENDIENTE') return 'is-pending';
		return 'is-neutral';
	}

	private shouldHideHistoryProfessionalName() {
		return this.selectedProfessionalId > 0 || this.roleId === ROLES.PROFESIONAL;
	}

	private renderAppointmentHistory(
		appointments: CustomerAppointmentSummary[],
		historyEnabled: boolean
	) {
		if (!this.profileHistoryList) return;
		this.clearNode(this.profileHistoryList);
		this.currentProfileHistoryEnabled = historyEnabled;

		const hasItems = appointments.length > 0;
		this.profileHistoryEmpty?.classList.toggle('hidden', hasItems);
		if (!hasItems) {
			this.profileHistoryEmpty?.classList.remove('hidden');
			return;
		}
		this.profileHistoryEmpty?.classList.add('hidden');

		const hideProfessional = this.shouldHideHistoryProfessionalName();

		for (const appointment of appointments) {
			const item = document.createElement('article');
			item.className = 'customer-profile-history-item';

			const toggle = document.createElement('button');
			toggle.type = 'button';
			toggle.className = 'customer-profile-history-item__toggle';
			toggle.setAttribute('aria-expanded', 'false');

			const main = document.createElement('div');
			main.className = 'customer-profile-history-item__main';

			const titleRow = document.createElement('div');
			titleRow.className = 'customer-profile-history-item__title-row';

			const title = document.createElement('div');
			title.className = 'customer-profile-history-item__title';
			title.textContent = appointment.service_name || 'Servicio';

			const statusBadge = document.createElement('span');
			statusBadge.className = `customer-profile-history-status ${this.getAppointmentStatusBadgeClass(appointment.status)}`;
			statusBadge.textContent = this.formatAppointmentStatusLabel(appointment.status);

			titleRow.append(title, statusBadge);

			const meta = document.createElement('div');
			meta.className = 'customer-profile-history-item__meta';
			const metaParts = [
				this.formatDateTime(appointment.start_time),
				hideProfessional ? '' : appointment.professional_name,
			].filter((part) => Boolean(String(part || '').trim()));
			meta.textContent = metaParts.join(' · ');

			main.append(titleRow, meta);
			const badges = this.buildHistoryBadges(appointment);
			if (badges) main.appendChild(badges);

			const chevron = document.createElement('span');
			chevron.className =
				'material-symbols-rounded customer-profile-history-item__chevron text-[1.2rem]';
			chevron.setAttribute('aria-hidden', 'true');
			chevron.textContent = 'expand_more';

			toggle.append(main, chevron);

			const body = document.createElement('div');
			body.className = 'customer-profile-history-item__body';

			if (!historyEnabled) {
				const premium = document.createElement('p');
				premium.className = 'customer-profile-history-muted';
				premium.textContent =
					'Las notas y archivos de la sesión están disponibles en el plan Premium.';
				body.appendChild(premium);
			} else {
				const notesBlock = document.createElement('div');
				notesBlock.className = 'customer-profile-history-block';
				const notesTitle = document.createElement('p');
				notesTitle.className = 'customer-profile-history-block__label';
				notesTitle.textContent = 'Notas de la sesión';
				notesBlock.appendChild(notesTitle);

				const notes = String(appointment.notes || '').trim();
				if (notes) {
					const notesText = document.createElement('p');
					notesText.className = 'customer-profile-history-notes';
					notesText.textContent = notes;
					notesBlock.appendChild(notesText);
				} else {
					const noNotes = document.createElement('p');
					noNotes.className = 'customer-profile-history-muted';
					noNotes.textContent = 'Sin notas registradas.';
					notesBlock.appendChild(noNotes);
				}
				body.appendChild(notesBlock);

				const filesBlock = document.createElement('div');
				filesBlock.className = 'customer-profile-history-block';
				const filesTitle = document.createElement('p');
				filesTitle.className = 'customer-profile-history-block__label';
				filesTitle.textContent = 'Archivos adjuntos';
				filesBlock.appendChild(filesTitle);

				const attachments = Array.isArray(appointment.attachments)
					? appointment.attachments
					: [];
				if (attachments.length > 0) {
					const list = document.createElement('ul');
					list.className = 'customer-profile-history-attachments';
					for (const file of attachments) {
						const li = document.createElement('li');
						const link = document.createElement('a');
						link.href = file.url;
						link.target = '_blank';
						link.rel = 'noopener noreferrer';
						const icon = document.createElement('span');
						icon.className = 'material-symbols-rounded text-[1.05rem]';
						icon.setAttribute('aria-hidden', 'true');
						icon.textContent = String(file.mime_type || '').startsWith('image/')
							? 'image'
							: 'description';
						const label = document.createElement('span');
						label.textContent = file.file_name;
						link.append(icon, label);
						li.appendChild(link);
						list.appendChild(li);
					}
					filesBlock.appendChild(list);
				} else {
					const noFiles = document.createElement('p');
					noFiles.className = 'customer-profile-history-muted';
					noFiles.textContent = 'Sin archivos adjuntos.';
					filesBlock.appendChild(noFiles);
				}
				body.appendChild(filesBlock);
			}

			toggle.addEventListener('click', () => {
				const isOpen = item.classList.toggle('is-open');
				toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
			});

			item.append(toggle, body);
			this.profileHistoryList.appendChild(item);
		}
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
		const displayName = profile.full_name || `Cliente #${profile.id_customer}`;

		this.renderProfileScope();

		if (this.profileNameNode) {
			this.profileNameNode.textContent = displayName;
		}
		if (this.profileAvatarNode) {
			const tone = this.getCustomerAvatarTone({
				id_customer: profile.id_customer,
				full_name: displayName,
				phone_number: profile.phone_number,
				created_at: profile.created_at,
			});
			this.profileAvatarNode.className = `customer-card-avatar customer-card-avatar--tone-${tone} size-12 text-[0.85rem]`;
			this.profileAvatarNode.textContent = this.getCustomerInitials(displayName);
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

		this.renderReservationLine(
			this.profileLastNode,
			stats.last_appointment,
			'Sin reservas atendidas'
		);
		this.renderReservationLine(
			this.profileNextNode,
			stats.next_appointment,
			'Sin reserva confirmada',
			{ relative: true }
		);
		this.renderPendingAppointments(stats.pending_appointments);
		this.renderTopServices(stats.top_services);
		this.renderProfitability(stats);
		this.renderAppointmentHistory(stats.appointment_history ?? [], stats.history_enabled === true);
		this.setActiveProfileTab('summary');

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
		if (this.profileAvatarNode) {
			this.profileAvatarNode.className =
				'customer-card-avatar customer-card-avatar--tone-1 size-12 text-[0.85rem]';
			this.profileAvatarNode.textContent = '?';
		}
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
		} else {
			this.professionalSelect.value = '';
		}

		this.renderProFilterList();
		this.updateProFilterUi();
	}

	private renderProFilterList() {
		if (!this.proFilterList || !this.canFilterByProfessional()) return;

		this.clearNode(this.proFilterList);
		const fragment = document.createDocumentFragment();
		const options: Array<{ id: number; label: string }> = [
			{ id: 0, label: 'Todos los profesionales' },
			...this.professionals.map((professional) => ({
				id: professional.id_professional,
				label: professional.display_name,
			})),
		];

		for (const option of options) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'customers-pro-filter-option';
			button.dataset.proFilterOption = option.id > 0 ? String(option.id) : '';
			button.setAttribute('role', 'option');
			const selected = option.id === this.selectedProfessionalId;
			button.classList.toggle('is-selected', selected);
			button.setAttribute('aria-selected', selected ? 'true' : 'false');

			const label = document.createElement('span');
			label.textContent = option.label;

			const check = document.createElement('span');
			check.className = 'material-symbols-rounded';
			check.setAttribute('aria-hidden', 'true');
			check.textContent = 'check';

			button.append(label, check);
			fragment.appendChild(button);
		}

		this.proFilterList.appendChild(fragment);
	}

	private updateProFilterUi() {
		const active = this.canFilterByProfessional() && this.selectedProfessionalId > 0;
		this.proFilterBadge?.classList.toggle('hidden', !active);
		this.proFilterButton?.classList.toggle('is-active', active);
		this.proFilterButton?.setAttribute('aria-pressed', active ? 'true' : 'false');

		if (!this.proFilterList) return;
		for (const option of this.proFilterList.querySelectorAll<HTMLButtonElement>(
			'[data-pro-filter-option]'
		)) {
			const optionId = Number(option.dataset.proFilterOption || 0);
			const selected = optionId === this.selectedProfessionalId;
			option.classList.toggle('is-selected', selected);
			option.setAttribute('aria-selected', selected ? 'true' : 'false');
		}
	}

	private formatCustomerPhone(rawValue: string) {
		const value = String(rawValue || '').trim();
		if (!value) return 'Sin teléfono';

		const parsed = parseParaguayMobilePhone(value);
		if (parsed.isValid) return parsed.pretty;

		return value;
	}

	private getCustomerInitials(name: string) {
		const parts = String(name || '')
			.trim()
			.split(/\s+/)
			.filter(Boolean);
		if (parts.length === 0) return '?';
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
	}

	private getCustomerAvatarTone(customer: Customer) {
		const seed = String(customer.full_name || customer.id_customer || '')
			.toLowerCase()
			.replace(/\s+/g, '');
		let hash = 0;
		for (let i = 0; i < seed.length; i += 1) {
			hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
		}
		return (hash % CUSTOMER_AVATAR_TONES) + 1;
	}

	private formatShortAppointmentDate(value: string) {
		const text = String(value || '').trim();
		if (!text) return '';

		const date = new Date(text.includes('T') ? text : text.replace(' ', 'T'));
		if (Number.isNaN(date.getTime())) return text;

		const day = date.getDate();
		const monthRaw = new Intl.DateTimeFormat('es-PY', { month: 'short' })
			.format(date)
			.replace(/\./g, '')
			.trim();
		const month = monthRaw ? monthRaw.charAt(0).toUpperCase() + monthRaw.slice(1) : '';
		return month ? `${day}/${month}` : text;
	}

	private getCustomerCardSubtitle(customer: Customer) {
		const lastAt = String(customer.last_appointment_at || '').trim();
		const count = Math.max(0, Math.floor(Number(customer.appointment_count) || 0));

		if (lastAt) {
			const shortDate = this.formatShortAppointmentDate(lastAt);
			if (count > 1) return `Última cita: ${shortDate} · ${count} citas`;
			return `Última cita: ${shortDate}`;
		}

		if (count > 0) {
			return count === 1 ? '1 cita' : `Citas totales: ${count}`;
		}

		return 'Sin citas aún';
	}

	private renderCustomers(customers: Customer[]) {
		if (!this.gridNode) return;

		this.clearNode(this.gridNode);
		this.updateEmptyStateCopy();

		const fragment = document.createDocumentFragment();
		for (const customer of customers) {
			const article = document.createElement('article');
			article.className = 'customer-card group';
			article.setAttribute('role', 'button');
			article.tabIndex = 0;
			article.dataset.customerCard = 'true';
			article.dataset.customerId = String(customer.id_customer);

			const headerRow = document.createElement('div');
			headerRow.className = 'flex items-start justify-between gap-4';

			const displayName = customer.full_name || `Cliente #${customer.id_customer}`;
			const avatar = document.createElement('div');
			avatar.className = `customer-card-avatar customer-card-avatar--tone-${this.getCustomerAvatarTone(customer)}`;
			avatar.setAttribute('aria-hidden', 'true');
			avatar.textContent = this.getCustomerInitials(displayName);

			headerRow.append(avatar);

			const body = document.createElement('div');
			body.className = 'customer-card-body';

			const nameBlock = document.createElement('div');
			nameBlock.className = 'customer-card-name-block';

			const name = document.createElement('h3');
			name.className = 'customer-card-title line-clamp-1';
			name.textContent = displayName;

			const subtitle = document.createElement('p');
			subtitle.className = 'customer-card-subtitle';
			subtitle.textContent = this.getCustomerCardSubtitle(customer);

			nameBlock.append(name, subtitle);

			const metrics = document.createElement('dl');
			metrics.className = 'customer-card-metrics';

			const metricRow = document.createElement('div');
			metricRow.className = 'flex items-center justify-between text-[0.92rem]';

			const term = document.createElement('dt');
			term.className = 'customer-card-term';
			term.textContent = 'Teléfono';

			const value = document.createElement('dd');
			value.className = 'customer-card-value';
			value.textContent = this.formatCustomerPhone(customer.phone_number);

			metricRow.append(term, value);
			metrics.append(metricRow);
			body.append(nameBlock, metrics);
			article.append(headerRow, body);
			fragment.appendChild(article);
		}

		this.gridNode.appendChild(fragment);
	}

	private renderSummary() {
		if (!this.summaryNode) return;
		this.summaryNode.textContent = `(${this.totalRecords})`;
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
			if (this.searchQuery) {
				query.set('search', this.searchQuery);
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
