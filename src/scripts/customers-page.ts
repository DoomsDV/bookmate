import { ROLES } from '../config/roles';
import type {
	CustomerAppointmentSummary,
	CustomerProfile,
	CustomerTopService,
} from '../lib/customers';
import { createAttachmentListItem } from '../lib/attachment-list-item';
import { bindFileViewer, type FileViewerHandle } from '../lib/file-viewer';
import { hasAnySessionNote, SESSION_NOTE_FIELDS } from '../lib/session-notes';
import { updateAppPaginationDom } from '../lib/pagination';
import { parseParaguayMobilePhone } from '../lib/paraguay-phone';
import type { Odontogram3dHandle } from './odontogram-3d';
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

type OdontogramFindingCode = 'CARIES' | 'RESTORATION' | 'EXTRACTION' | 'CROWN';
type OdontogramFaces = {
	occlusal: 0 | 1;
	vestibular: 0 | 1;
	palatal: 0 | 1;
	mesial: 0 | 1;
	distal: 0 | 1;
};
type OdontogramTooth = {
	tooth_fdi: number;
	finding_code: OdontogramFindingCode | string;
	notes: string;
	faces: OdontogramFaces;
	updated_at: string;
};
type OdontogramEvent = {
	id_event: number;
	tooth_fdi: number;
	finding_code: OdontogramFindingCode | string;
	notes: string;
	created_at: string;
	faces: OdontogramFaces;
};
type OdontogramData = {
	entitled: boolean | 0 | 1;
	teeth: OdontogramTooth[];
	events: OdontogramEvent[];
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
	private profilePanel: HTMLElement | null = null;
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
	private activeProfileTab: 'summary' | 'history' | 'odontogram' = 'summary';
	private currentProfileHistoryEnabled = false;
	private fileViewer: FileViewerHandle | null = null;

	private odontogramLock: HTMLElement | null = null;
	private odontogramLockAction: HTMLElement | null = null;
	private odontogramContent: HTMLElement | null = null;
	private odontogramToolbar: HTMLElement | null = null;
	private odontogramCam: HTMLElement | null = null;
	private odontogramCanvas: HTMLCanvasElement | null = null;
	private odontogramViewport: HTMLElement | null = null;
	private odontogramTip: HTMLElement | null = null;
	private odontogramTipTooth: HTMLElement | null = null;
	private odontogramTipFinding: HTMLElement | null = null;
	private odontogramExport: HTMLButtonElement | null = null;
	private odontogramSide: HTMLElement | null = null;
	private odontogramStatus: HTMLElement | null = null;
	private odontogramLoading: HTMLElement | null = null;
	private odontogramEventsWrap: HTMLElement | null = null;
	private odontogramEventsList: HTMLElement | null = null;
	private odontogramEventsEmpty: HTMLElement | null = null;
	private odontogramPopover: HTMLElement | null = null;
	private odontogramPopoverDragHandle: HTMLElement | null = null;
	private odontogramPopoverForm: HTMLFormElement | null = null;
	private odontogramEditor: HTMLElement | null = null;
	private odontogramSummary: HTMLElement | null = null;
	private odontogramSummaryList: HTMLElement | null = null;
	private odontogramSummaryEmpty: HTMLElement | null = null;
	private odontogramPopoverTitle: HTMLElement | null = null;
	private odontogramPopoverError: HTMLElement | null = null;
	private odontogramPalatalLabel: HTMLElement | null = null;
	private odontogramFacesSection: HTMLElement | null = null;
	private odontogramActiveTool: OdontogramFindingCode | null = null;
	private odontogramPopoverTooth = 0;
	private odontogramApiEntitled: boolean | null = null;
	private odontogramTeeth = new Map<number, OdontogramTooth>();
	private odontogramEvents: OdontogramEvent[] = [];
	private isOdontogramLoading = false;
	private odontogramLoadRequestId = 0;
	private odontogram3d: Odontogram3dHandle | null = null;
	private odontogram3dMountGen = 0;
	private odontogramRotateLocked = false;
	private odontogramGhostMode = false;
	private odontogramExporting = false;
	private odontogramPopoverDragged = false;
	private odontogramPopoverDrag: {
		pointerId: number;
		offsetX: number;
		offsetY: number;
	} | null = null;

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
		this.profilePanel = this.querySelector<HTMLElement>('[data-customer-profile-panel]');
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

		this.odontogramLock = this.querySelector<HTMLElement>('[data-customer-odontogram-lock]');
		this.odontogramLockAction = this.querySelector<HTMLElement>(
			'[data-customer-odontogram-lock-action]'
		);
		this.odontogramContent = this.querySelector<HTMLElement>('[data-customer-odontogram-content]');
		this.odontogramToolbar = this.querySelector<HTMLElement>('[data-customer-odontogram-toolbar]');
		this.odontogramCam = this.querySelector<HTMLElement>('[data-customer-odontogram-cam]');
		this.odontogramCanvas = this.querySelector<HTMLCanvasElement>(
			'[data-customer-odontogram-canvas]'
		);
		this.odontogramViewport = this.querySelector<HTMLElement>(
			'[data-customer-odontogram-viewport]'
		);
		this.odontogramTip = this.querySelector<HTMLElement>('[data-customer-odontogram-tip]');
		this.odontogramTipTooth = this.querySelector<HTMLElement>(
			'[data-customer-odontogram-tip-tooth]'
		);
		this.odontogramTipFinding = this.querySelector<HTMLElement>(
			'[data-customer-odontogram-tip-finding]'
		);
		this.odontogramExport = this.querySelector<HTMLButtonElement>(
			'[data-customer-odontogram-export]'
		);
		this.odontogramSide = this.querySelector<HTMLElement>('[data-customer-odontogram-side]');
		this.odontogramStatus = this.querySelector<HTMLElement>('[data-customer-odontogram-status]');
		this.odontogramLoading = this.querySelector<HTMLElement>('[data-customer-odontogram-loading]');
		this.odontogramEventsWrap = this.querySelector<HTMLElement>(
			'[data-customer-odontogram-events-wrap]'
		);
		this.odontogramEventsList = this.querySelector<HTMLElement>(
			'[data-customer-odontogram-events-list]'
		);
		this.odontogramEventsEmpty = this.querySelector<HTMLElement>(
			'[data-customer-odontogram-events-empty]'
		);
		this.odontogramPopover = this.querySelector<HTMLElement>(
			'[data-customer-odontogram-popover]'
		);
		this.odontogramPopoverDragHandle = this.querySelector<HTMLElement>(
			'[data-customer-odontogram-popover-drag]'
		);
		this.odontogramPopoverForm = this.querySelector<HTMLFormElement>(
			'[data-customer-odontogram-popover-form]'
		);
		this.odontogramEditor = this.querySelector<HTMLElement>(
			'[data-customer-odontogram-editor]'
		);
		this.odontogramSummary = this.querySelector<HTMLElement>(
			'[data-customer-odontogram-summary]'
		);
		this.odontogramSummaryList = this.querySelector<HTMLElement>(
			'[data-customer-odontogram-summary-list]'
		);
		this.odontogramSummaryEmpty = this.querySelector<HTMLElement>(
			'[data-customer-odontogram-summary-empty]'
		);
		this.odontogramPopoverTitle = this.querySelector<HTMLElement>(
			'[data-customer-odontogram-popover-title]'
		);
		this.odontogramPopoverError = this.querySelector<HTMLElement>(
			'[data-customer-odontogram-popover-error]'
		);
		this.odontogramPalatalLabel = this.querySelector<HTMLElement>(
			'[data-customer-odontogram-palatal-label]'
		);
		this.odontogramFacesSection = this.querySelector<HTMLElement>(
			'[data-customer-odontogram-faces-section]'
		);

		if (!this.gridNode) return;

		this.#bound = true;
		this.roleId = Number(this.dataset.roleId || 0);
		this.#listeners = new AbortController();
		const signal = this.#listeners.signal;
		this.fileViewer = bindFileViewer(this, signal);

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

		this.odontogramToolbar?.addEventListener('click', this.handleOdontogramToolbarClick, { signal });
		this.odontogramCam?.addEventListener('click', this.handleOdontogramCamClick, { signal });
		this.odontogramExport?.addEventListener('click', this.handleOdontogramExportClick, { signal });
		this.odontogramEventsList?.addEventListener('click', this.handleOdontogramEventsClick, {
			signal,
		});
		this.odontogramPopoverForm?.addEventListener('submit', this.handleOdontogramPopoverSubmit, {
			signal,
		});
		this.odontogramPopover?.addEventListener('click', this.handleOdontogramPopoverClick, { signal });
		this.odontogramPopoverDragHandle?.addEventListener(
			'pointerdown',
			this.handleOdontogramPopoverDragStart,
			{ signal }
		);
		this.odontogramPopoverDragHandle?.addEventListener(
			'pointermove',
			this.handleOdontogramPopoverDragMove,
			{ signal }
		);
		this.odontogramPopoverDragHandle?.addEventListener(
			'pointerup',
			this.handleOdontogramPopoverDragEnd,
			{ signal }
		);
		this.odontogramPopoverDragHandle?.addEventListener(
			'pointercancel',
			this.handleOdontogramPopoverDragEnd,
			{ signal }
		);
		document.addEventListener('keydown', this.handleOdontogramPopoverKeydown, { signal });

		this.updateControls();
		void this.loadMeta();
	}

	disconnectedCallback() {
		this.#bound = false;
		this.disposeOdontogram3d();
		this.fileViewer?.close();
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
		if (this.isOdontogramPopoverOpen()) {
			this.closeOdontogramPopover();
			return;
		}
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
		this.fileViewer?.close();
		this.closeOdontogramPopover();
		this.setOdontogramWorkspace(false);
		this.disposeOdontogram3d();
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
		if (tab !== 'summary' && tab !== 'history' && tab !== 'odontogram') return;
		this.setActiveProfileTab(tab);
	};

	private setActiveProfileTab(tab: 'summary' | 'history' | 'odontogram') {
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

		const activeTab = [...(this.profileTabButtons ?? [])].find(
			(button) => button.dataset.customerProfileTab === tab
		);
		activeTab?.scrollIntoView({ inline: 'nearest', block: 'nearest' });

		this.setOdontogramWorkspace(tab === 'odontogram');

		if (tab === 'odontogram') {
			this.updateOdontogramLockUi();
			if (this.activeProfileCustomerId > 0) {
				void this.loadOdontogram(this.activeProfileCustomerId);
			}
			this.maybeMountOdontogram3d();
		}
	}

	private hasOdontogramEntitlement() {
		const sub = window.HaselSubscription;
		if (!sub) return false;
		const hasAddon = sub.hasAddon;
		if (typeof hasAddon === 'function' && hasAddon('ODONTOGRAM_3D')) return true;
		if (typeof sub.hasFeature === 'function' && sub.hasFeature('ODONTOGRAM_3D')) return true;
		const addonFeatures = sub.addonFeatures;
		if (Array.isArray(addonFeatures) && addonFeatures.includes('ODONTOGRAM_3D')) return true;
		return false;
	}

	private isOdontogramApiEntitled(value: OdontogramData['entitled'] | null | undefined) {
		return value === true || value === 1;
	}

	private resetOdontogramState() {
		this.odontogramLoadRequestId += 1;
		this.odontogramApiEntitled = null;
		this.odontogramTeeth.clear();
		this.odontogramEvents = [];
		this.odontogramActiveTool = null;
		this.odontogramPopoverTooth = 0;
		this.disposeOdontogram3d();
		this.closeOdontogramPopover();
		this.setOdontogramLoading(false);
		this.updateOdontogramToolbarUi();
		if (this.odontogramEventsList) this.clearNode(this.odontogramEventsList);
		this.odontogramEventsWrap?.classList.add('hidden');
		this.odontogramEventsEmpty?.classList.add('hidden');
		this.odontogramContent?.classList.add('hidden');
		this.odontogramLock?.classList.add('hidden');
	}

	private renderOdontogramLockAction() {
		if (!this.odontogramLockAction) return;
		this.clearNode(this.odontogramLockAction);

		if (this.roleId === ROLES.ADMIN) {
			const link = document.createElement('a');
			link.href = '/panel/complementos';
			link.className = 'customer-odontogram-lock__link';
			link.textContent = 'Ver complementos';
			const wrap = document.createElement('div');
			wrap.className = 'customer-odontogram-lock__action';
			wrap.appendChild(link);
			this.odontogramLockAction.appendChild(wrap);
			return;
		}

		const hint = document.createElement('p');
		hint.className = 'customer-odontogram-lock__hint';
		hint.textContent = 'Pedile al administrador que active Complementos.';
		this.odontogramLockAction.appendChild(hint);
	}

	private updateOdontogramLockUi() {
		this.renderOdontogramLockAction();
		const apiLocked = this.odontogramApiEntitled === false;
		const frontendLocked = !this.hasOdontogramEntitlement();
		const showLock =
			apiLocked || (this.odontogramApiEntitled === null && frontendLocked && !this.isOdontogramLoading);

		this.odontogramLock?.classList.toggle('hidden', !showLock);
		this.odontogramContent?.classList.toggle('hidden', showLock || this.isOdontogramLoading);
	}

	private setOdontogramLoading(value: boolean) {
		this.isOdontogramLoading = value;
		this.odontogramLoading?.classList.toggle('hidden', !value);
		if (value) {
			this.odontogramContent?.classList.add('hidden');
		} else {
			this.updateOdontogramLockUi();
			this.maybeMountOdontogram3d();
		}
	}

	private setOdontogramWorkspace(active: boolean) {
		this.profileModal?.classList.toggle('is-odontogram-workspace', active);
		this.profilePanel?.classList.toggle('is-odontogram-workspace', active);
		if (!active) return;
		window.requestAnimationFrame(() => {
			this.odontogram3d?.resize();
			window.requestAnimationFrame(() => this.odontogram3d?.resize());
		});
	}

	private setOdontogramViewerStatus(message: string | null) {
		if (!this.odontogramStatus) return;
		const text = String(message || '').trim();
		this.odontogramStatus.textContent = text;
		this.odontogramStatus.classList.toggle('hidden', !text);
	}

	private recycleOdontogramCanvas() {
		const current = this.odontogramCanvas;
		if (!current?.parentElement) return;
		const next = current.cloneNode(false) as HTMLCanvasElement;
		next.removeAttribute('data-engine');
		current.replaceWith(next);
		this.odontogramCanvas = next;
	}

	private disposeOdontogram3d() {
		this.odontogram3dMountGen += 1;
		this.odontogram3d?.dispose();
		this.odontogram3d = null;
		this.odontogramRotateLocked = false;
		this.odontogramGhostMode = false;
		this.syncOdontogramCamUi();
		this.hideOdontogramTip();
		this.recycleOdontogramCanvas();
		this.setOdontogramViewerStatus(null);
	}

	private maybeMountOdontogram3d() {
		if (this.activeProfileTab !== 'odontogram') return;
		if (this.isOdontogramLoading) return;
		if (this.odontogramApiEntitled !== true) return;
		if (this.odontogramContent?.classList.contains('hidden')) return;
		void this.ensureOdontogram3dMounted();
	}

	private async ensureOdontogram3dMounted() {
		if (this.odontogram3d) {
			this.odontogram3d.setTeeth(this.odontogramTeeth.values());
			return;
		}
		if (!this.odontogramCanvas) return;

		const gen = ++this.odontogram3dMountGen;
		this.setOdontogramViewerStatus('Cargando modelo 3D…');

		try {
			const { mountOdontogram3d } = await import('./odontogram-3d');
			if (gen !== this.odontogram3dMountGen) return;

			const handle = await mountOdontogram3d({
				canvas: this.odontogramCanvas,
				onToothSelect: (toothFdi) => {
					this.hideOdontogramTip();
					this.openOdontogramPopover(toothFdi);
				},
				onToothHover: (toothFdi, point) => {
					this.updateOdontogramTip(toothFdi, point);
				},
				onStatus: (message) => this.setOdontogramViewerStatus(message),
			});

			if (gen !== this.odontogram3dMountGen) {
				handle.dispose();
				return;
			}

			this.odontogram3d = handle;
			this.odontogramCanvas = handle.canvas;
			handle.setTeeth(this.odontogramTeeth.values());
			handle.resize();
		} catch (error) {
			if (gen !== this.odontogram3dMountGen) return;
			if (import.meta.env.DEV) {
				console.error('[odontogram-3d] no se pudo montar el visor', error);
			}
			this.setOdontogramViewerStatus('No se pudo cargar el modelo 3D.');
		}
	}

	private formatOdontogramFindingLabel(code: string) {
		const normalized = String(code || '').trim().toUpperCase();
		if (normalized === 'CARIES') return 'Caries';
		if (normalized === 'RESTORATION') return 'Restauración';
		if (normalized === 'EXTRACTION') return 'Extracción';
		if (normalized === 'CROWN') return 'Corona';
		return normalized || 'Hallazgo';
	}

	private normalizeOdontogramFinding(code: string | null | undefined): OdontogramFindingCode | null {
		const normalized = String(code || '').trim().toUpperCase();
		if (normalized === 'CARIES') return 'CARIES';
		if (normalized === 'RESTORATION') return 'RESTORATION';
		if (normalized === 'EXTRACTION') return 'EXTRACTION';
		if (normalized === 'CROWN') return 'CROWN';
		return null;
	}

	private odontogramFindingSwatchClass(code: string) {
		const finding = this.normalizeOdontogramFinding(code);
		if (finding === 'CARIES') return 'customer-odontogram-tool__swatch--caries';
		if (finding === 'RESTORATION') return 'customer-odontogram-tool__swatch--restoration';
		if (finding === 'EXTRACTION') return 'customer-odontogram-tool__swatch--extraction';
		if (finding === 'CROWN') return 'customer-odontogram-tool__swatch--crown';
		return '';
	}

	private parseApiDate(value: string) {
		const text = String(value || '').trim();
		if (!text) return null;

		const normalized = text
			.replace(/(\.\d{3})\d+/, '$1')
			.replace(/\s*UTC$/i, 'Z')
			.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');

		const date = new Date(normalized);
		if (!Number.isNaN(date.getTime())) return date;

		const fallback = new Date(text.replace('T', ' '));
		return Number.isNaN(fallback.getTime()) ? null : fallback;
	}

	private formatOdontogramEventDate(value: string) {
		const date = this.parseApiDate(value);
		if (!date) return String(value || '').trim();

		const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
		const day = date.getDate();
		const month = months[date.getMonth()] ?? '';
		const year = date.getFullYear();
		let hours = date.getHours();
		const minutes = String(date.getMinutes()).padStart(2, '0');
		const suffix = hours >= 12 ? 'PM' : 'AM';
		hours = hours % 12 || 12;
		return `${day} ${month} ${year}, ${hours}:${minutes} ${suffix}`;
	}

	private isOdontogramFaceMarked(value: unknown) {
		return value === 1 || value === true || value === '1';
	}

	private formatOdontogramFaces(faces: Partial<OdontogramFaces> | null | undefined) {
		if (!faces) return '';
		const labels: string[] = [];
		if (this.isOdontogramFaceMarked(faces.occlusal)) labels.push('Oclusal');
		if (this.isOdontogramFaceMarked(faces.vestibular)) labels.push('Vestibular');
		if (this.isOdontogramFaceMarked(faces.palatal)) labels.push('Palatina/Lingual');
		if (this.isOdontogramFaceMarked(faces.mesial)) labels.push('Mesial');
		if (this.isOdontogramFaceMarked(faces.distal)) labels.push('Distal');
		return labels.join(', ');
	}

	private isUpperTooth(toothFdi: number) {
		return toothFdi >= 11 && toothFdi <= 28;
	}

	private createOdontogramEventItem(
		event: OdontogramEvent,
		options: { includeTooth?: boolean; includeVoid?: boolean } = {}
	) {
		const includeTooth = options.includeTooth !== false;
		const includeVoid = options.includeVoid !== false;
		const finding = this.normalizeOdontogramFinding(event.finding_code);

		const item = document.createElement('li');
		item.className = 'customer-odontogram-event';
		item.dataset.odontogramEventId = String(event.id_event);

		const rail = document.createElement('span');
		rail.className = 'customer-odontogram-event__rail';
		const dot = document.createElement('span');
		dot.className = `customer-odontogram-tool__swatch ${this.odontogramFindingSwatchClass(event.finding_code)}`;
		dot.setAttribute('aria-hidden', 'true');
		rail.appendChild(dot);

		const body = document.createElement('div');
		body.className = 'customer-odontogram-event__body';

		const head = document.createElement('div');
		head.className = 'customer-odontogram-event__head';

		const title = document.createElement('p');
		title.className = 'customer-odontogram-event__title';
		const findingLabel = this.formatOdontogramFindingLabel(event.finding_code);
		title.textContent = includeTooth ? `${findingLabel} • Pieza ${event.tooth_fdi}` : findingLabel;

		if (includeVoid) {
			const voidButton = document.createElement('button');
			voidButton.type = 'button';
			voidButton.className = 'customer-odontogram-event__void';
			voidButton.dataset.odontogramEventVoid = String(event.id_event);
			voidButton.setAttribute('aria-label', 'Eliminar registro');
			const voidIcon = document.createElement('span');
			voidIcon.className = 'material-symbols-rounded';
			voidIcon.setAttribute('aria-hidden', 'true');
			voidIcon.textContent = 'delete';
			voidButton.appendChild(voidIcon);
			head.append(title, voidButton);
		} else {
			head.appendChild(title);
		}

		const time = document.createElement('p');
		time.className = 'customer-odontogram-event__date';
		time.textContent = this.formatOdontogramEventDate(event.created_at);
		body.append(head, time);

		const faces = this.odontogramFindingNeedsFaces(finding)
			? this.formatOdontogramFaces(event.faces)
			: '';
		if (faces) {
			const facesEl = document.createElement('p');
			facesEl.className = 'customer-odontogram-event__meta';
			facesEl.textContent = `Caras: ${faces}`;
			body.appendChild(facesEl);
		}

		const notes = String(event.notes || '').trim();
		if (notes) {
			const notesEl = document.createElement('p');
			notesEl.className = 'customer-odontogram-event__meta';
			notesEl.textContent = `Notas: ${notes}`;
			body.appendChild(notesEl);
		}

		item.append(rail, body);
		return item;
	}

	private renderOdontogramEvents() {
		if (!this.odontogramEventsList) return;
		this.clearNode(this.odontogramEventsList);

		const hasEvents = this.odontogramEvents.length > 0;
		this.odontogramEventsWrap?.classList.toggle('hidden', !hasEvents);
		this.odontogramEventsEmpty?.classList.toggle('hidden', hasEvents);
		if (!hasEvents) return;

		const fragment = document.createDocumentFragment();
		for (const event of this.odontogramEvents) {
			fragment.appendChild(this.createOdontogramEventItem(event));
		}

		this.odontogramEventsList.appendChild(fragment);
	}

	private renderOdontogramSummary(toothFdi: number) {
		if (!this.odontogramSummaryList) return;
		this.clearNode(this.odontogramSummaryList);

		const events = this.odontogramEvents.filter((event) => Number(event.tooth_fdi) === toothFdi);
		const hasEvents = events.length > 0;
		this.odontogramSummaryList.classList.toggle('hidden', !hasEvents);
		this.odontogramSummaryEmpty?.classList.toggle('hidden', hasEvents);
		if (!hasEvents) return;

		const fragment = document.createDocumentFragment();
		for (const event of events) {
			fragment.appendChild(
				this.createOdontogramEventItem(event, { includeTooth: false, includeVoid: false })
			);
		}
		this.odontogramSummaryList.appendChild(fragment);
	}

	private handleOdontogramEventsClick = (event: Event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const button = target.closest<HTMLButtonElement>('[data-odontogram-event-void]');
		if (!button || !this.odontogramEventsList?.contains(button)) return;
		event.preventDefault();
		const eventId = Number(button.dataset.odontogramEventVoid || 0);
		if (eventId > 0) void this.voidOdontogramEvent(eventId);
	};

	private async voidOdontogramEvent(eventId: number) {
		const customerId = this.activeProfileCustomerId;
		if (eventId <= 0 || customerId <= 0) return;

		const confirmed = window.BookmateAlert?.confirm
			? await window.BookmateAlert.confirm({
					type: 'error',
					title: 'Eliminar registro',
					message:
						'¿Estás seguro de que querés eliminar este registro? Esta acción actualizará el odontograma.',
					confirmText: 'Eliminar',
					cancelText: 'Cancelar',
				})
			: window.confirm(
					'¿Estás seguro de que querés eliminar este registro? Esta acción actualizará el odontograma.'
				);
		if (!confirmed) return;

		this.closeOdontogramPopover();

		try {
			const response = await fetch(`/api/customers/${customerId}/odontogram/${eventId}/void`, {
				method: 'POST',
				headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
				body: '{}',
			});
			const data = await this.parseJson(response);
			if (!response.ok || data.status !== 'success') {
				throw new Error(
					this.getBackendMessage(data, 'No fue posible anular el registro del odontograma.')
				);
			}
			await this.loadOdontogram(customerId);
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: 'No fue posible anular el registro del odontograma.';
			if (window.BookmateAlert?.alert) {
				await window.BookmateAlert.alert({ type: 'error', title: 'No se pudo eliminar', message });
			}
		}
	}

	private applyOdontogramData(data: OdontogramData) {
		this.odontogramApiEntitled = this.isOdontogramApiEntitled(data.entitled);
		this.odontogramTeeth.clear();

		for (const tooth of Array.isArray(data.teeth) ? data.teeth : []) {
			const toothFdi = Number(tooth.tooth_fdi || 0);
			if (toothFdi > 0) this.odontogramTeeth.set(toothFdi, tooth);
		}

		this.odontogramEvents = Array.isArray(data.events) ? [...data.events] : [];
		this.odontogramEvents.sort((a, b) => {
			const aTime = this.parseApiDate(a.created_at)?.getTime() ?? 0;
			const bTime = this.parseApiDate(b.created_at)?.getTime() ?? 0;
			return bTime - aTime;
		});

		this.updateOdontogramLockUi();
		if (!this.odontogramApiEntitled) {
			this.disposeOdontogram3d();
			return;
		}

		this.renderOdontogramEvents();
		if (this.isOdontogramPopoverOpen() && this.odontogramPopoverTooth > 0 && !this.odontogramActiveTool) {
			this.renderOdontogramSummary(this.odontogramPopoverTooth);
		}
		this.odontogram3d?.setTeeth(this.odontogramTeeth.values());
		this.maybeMountOdontogram3d();
	}

	private async loadOdontogram(customerId: number) {
		if (customerId <= 0) return;

		const requestId = ++this.odontogramLoadRequestId;
		this.setOdontogramLoading(true);

		try {
			const response = await fetch(`/api/customers/${customerId}/odontogram`, {
				method: 'GET',
				headers: { Accept: 'application/json' },
			});
			const data = await this.parseJson<OdontogramData>(response);

			if (requestId !== this.odontogramLoadRequestId) return;
			if (this.activeProfileCustomerId !== customerId) return;

			if (!response.ok || data.status !== 'success' || !data.data) {
				throw new Error(
					this.getBackendMessage(data, 'No fue posible cargar el odontograma del cliente.')
				);
			}

			this.applyOdontogramData(data.data);
		} catch {
			if (requestId !== this.odontogramLoadRequestId) return;
			if (this.activeProfileCustomerId !== customerId) return;
		} finally {
			if (requestId === this.odontogramLoadRequestId) {
				this.setOdontogramLoading(false);
			}
		}
	}

	private syncOdontogramCamUi() {
		const lockButton = this.odontogramCam?.querySelector<HTMLButtonElement>(
			'[data-odontogram-cam="lock"]'
		);
		const ghostButton = this.odontogramCam?.querySelector<HTMLButtonElement>(
			'[data-odontogram-cam="ghost"]'
		);
		const lockIcon = this.odontogramCam?.querySelector<HTMLElement>(
			'[data-odontogram-cam-lock-icon]'
		);
		const lockLabel = this.odontogramRotateLocked ? 'Desbloquear rotación' : 'Bloquear rotación';
		if (lockButton) {
			lockButton.setAttribute('aria-pressed', this.odontogramRotateLocked ? 'true' : 'false');
			lockButton.setAttribute('title', lockLabel);
			lockButton.setAttribute('aria-label', lockLabel);
		}
		if (lockIcon) lockIcon.textContent = this.odontogramRotateLocked ? 'lock' : 'lock_open';
		if (ghostButton) {
			ghostButton.setAttribute('aria-pressed', this.odontogramGhostMode ? 'true' : 'false');
		}
	}

	private handleOdontogramCamClick = (event: Event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const button = target.closest<HTMLButtonElement>('[data-odontogram-cam]');
		if (!button || !this.odontogramCam?.contains(button)) return;

		const action = button.dataset.odontogramCam;
		if (!action || !this.odontogram3d) return;

		if (action === 'reset') {
			this.odontogram3d.resetView();
			return;
		}
		if (action === 'upper' || action === 'lower') {
			this.odontogram3d.setArchView(action);
			return;
		}
		if (action === 'lock') {
			this.odontogramRotateLocked = !this.odontogramRotateLocked;
			this.odontogram3d.setRotateLocked(this.odontogramRotateLocked);
			this.syncOdontogramCamUi();
			return;
		}
		if (action === 'ghost') {
			this.odontogramGhostMode = !this.odontogramGhostMode;
			this.odontogram3d.setGhostMode(this.odontogramGhostMode);
			this.syncOdontogramCamUi();
		}
	};

	private hideOdontogramTip() {
		this.odontogramTip?.classList.add('hidden');
	}

	private updateOdontogramTip(
		toothFdi: number | null,
		point: { clientX: number; clientY: number } | null
	) {
		const tip = this.odontogramTip;
		const viewport = this.odontogramViewport;
		if (!tip || !viewport) return;
		if (!toothFdi || !point || this.isOdontogramPopoverOpen()) {
			tip.classList.add('hidden');
			return;
		}

		if (this.odontogramTipTooth) {
			this.odontogramTipTooth.textContent = `Pieza ${toothFdi}`;
		}

		const tooth = this.odontogramTeeth.get(toothFdi);
		if (this.odontogramTipFinding) {
			if (tooth) {
				const finding = this.normalizeOdontogramFinding(tooth.finding_code);
				const label = this.formatOdontogramFindingLabel(String(tooth.finding_code));
				const faces = this.odontogramFindingNeedsFaces(finding)
					? this.formatOdontogramFaces(tooth.faces)
					: '';
				this.odontogramTipFinding.textContent = faces ? `${label} (${faces})` : label;
				this.odontogramTipFinding.classList.remove('hidden');
			} else {
				this.odontogramTipFinding.textContent = '';
				this.odontogramTipFinding.classList.add('hidden');
			}
		}

		tip.classList.remove('hidden');
		const rect = viewport.getBoundingClientRect();
		const tipWidth = tip.offsetWidth || 160;
		const tipHeight = tip.offsetHeight || 48;
		const offset = 14;
		const x = Math.min(
			Math.max(8, point.clientX - rect.left + offset),
			Math.max(8, rect.width - tipWidth - 8)
		);
		const y = Math.min(
			Math.max(8, point.clientY - rect.top + offset),
			Math.max(8, rect.height - tipHeight - 8)
		);
		tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
	}

	private handleOdontogramExportClick = () => {
		void this.exportOdontogramPdf();
	};

	private async exportOdontogramPdf() {
		if (this.odontogramExporting) return;
		this.odontogramExporting = true;
		if (this.odontogramExport) this.odontogramExport.disabled = true;

		try {
			const capture = this.odontogram3d?.capturePng() ?? null;
			const customerName = String(this.profileNameNode?.textContent || 'Cliente').trim() || 'Cliente';
			const clinicName = String(this.dataset.orgName || '').trim();
			const logoUrl = String(this.dataset.orgLogoUrl || '').trim();
			const { downloadOdontogramPdf, loadImageDataUrl } = await import('../lib/odontogram-pdf');
			const clinicLogoDataUrl = logoUrl ? await loadImageDataUrl(logoUrl) : null;
			await downloadOdontogramPdf({
				customerName,
				customerHc:
					this.activeProfileCustomerId > 0 ? String(this.activeProfileCustomerId) : '',
				clinicName,
				clinicLogoDataUrl,
				capturedAt: new Date(),
				image: capture,
				events: this.odontogramEvents.map((event) => {
					const finding = this.normalizeOdontogramFinding(event.finding_code);
					return {
						date: this.formatOdontogramEventDate(event.created_at),
						toothFdi: Number(event.tooth_fdi || 0),
						finding: this.formatOdontogramFindingLabel(String(event.finding_code)),
						faces: this.odontogramFindingNeedsFaces(finding)
							? this.formatOdontogramFaces(event.faces)
							: '',
						notes: String(event.notes || '').trim(),
					};
				}),
			});
		} catch (error) {
			if (import.meta.env.DEV) {
				console.error('[odontogram-pdf] no se pudo generar el PDF', error);
			}
		} finally {
			this.odontogramExporting = false;
			if (this.odontogramExport) this.odontogramExport.disabled = false;
		}
	}

	private updateOdontogramToolbarUi() {
		if (!this.odontogramToolbar) return;
		for (const button of this.odontogramToolbar.querySelectorAll<HTMLButtonElement>(
			'[data-odontogram-tool]'
		)) {
			const tool = button.dataset.odontogramTool as OdontogramFindingCode | undefined;
			const isActive = Boolean(tool && tool === this.odontogramActiveTool);
			button.classList.toggle('is-active', isActive);
			button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
		}
	}

	private handleOdontogramToolbarClick = (event: Event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const button = target.closest<HTMLButtonElement>('[data-odontogram-tool]');
		if (!button || !this.odontogramToolbar?.contains(button)) return;

		const tool = button.dataset.odontogramTool as OdontogramFindingCode | undefined;
		if (!tool) return;

		this.odontogramActiveTool = this.odontogramActiveTool === tool ? null : tool;
		this.updateOdontogramToolbarUi();
		if (this.isOdontogramPopoverOpen() && this.odontogramPopoverTooth > 0) {
			this.openOdontogramPopover(this.odontogramPopoverTooth);
		}
	};

	private setOdontogramPopoverError(message: string) {
		if (!this.odontogramPopoverError) return;
		if (!message) {
			this.odontogramPopoverError.textContent = '';
			this.odontogramPopoverError.classList.add('hidden');
			return;
		}
		this.odontogramPopoverError.textContent = message;
		this.odontogramPopoverError.classList.remove('hidden');
	}

	private setOdontogramPopoverMode(mode: 'editor' | 'summary') {
		this.odontogramEditor?.classList.toggle('hidden', mode !== 'editor');
		this.odontogramSummary?.classList.toggle('hidden', mode !== 'summary');
	}

	private resetOdontogramPopoverForm(toothFdi: number) {
		if (!this.odontogramPopoverForm) return;

		this.odontogramPopoverForm.reset();

		if (this.odontogramPalatalLabel) {
			this.odontogramPalatalLabel.textContent = this.isUpperTooth(toothFdi)
				? 'Palatina'
				: 'Lingual';
		}

		this.setOdontogramPopoverError('');
		this.updateOdontogramPopoverFacesUi();
	}

	private odontogramFindingNeedsFaces(code: OdontogramFindingCode | null) {
		return code === 'CARIES' || code === 'RESTORATION';
	}

	private emptyOdontogramFaces(): OdontogramFaces {
		return {
			occlusal: 0,
			vestibular: 0,
			palatal: 0,
			mesial: 0,
			distal: 0,
		};
	}

	private updateOdontogramPopoverFacesUi() {
		const section = this.odontogramFacesSection;
		if (!section) return;

		const finding = this.odontogramActiveTool;
		const showFaces = this.odontogramFindingNeedsFaces(finding);

		section.hidden = !showFaces;
		if (showFaces) section.removeAttribute('inert');
		else section.setAttribute('inert', '');
	}

	private isOdontogramPopoverOpen() {
		return Boolean(this.odontogramPopover?.classList.contains('is-open'));
	}

	private positionOdontogramPopover() {
		const dialog = this.odontogramPopover;
		if (!dialog) return;

		dialog.style.width = '';

		const pad = 16;
		const gap = 16;
		const model = this.odontogramViewport?.getBoundingClientRect();
		const side = this.odontogramSide?.getBoundingClientRect();
		const width = dialog.offsetWidth || 288;
		const height = dialog.offsetHeight || 320;

		const sideIsRightOfModel = Boolean(
			model && side && side.width > 80 && side.left >= model.right - 8
		);

		let left = window.innerWidth - width - pad;
		let top = (window.innerHeight - height) / 2;

		if (sideIsRightOfModel && model && side) {
			left = side.left - width - gap;
			top = model.top + (model.height - height) / 2;
		} else if (model && model.width > 2) {
			left = model.right - width - gap;
			top = model.top + (model.height - height) / 2;
		}

		left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));
		top = Math.max(pad, Math.min(top, window.innerHeight - height - pad));

		dialog.style.left = `${Math.round(left)}px`;
		dialog.style.top = `${Math.round(top)}px`;
	}

	private openOdontogramPopover(toothFdi: number) {
		this.hideOdontogramTip();
		if (!this.odontogramPopover || toothFdi <= 0) return;

		this.odontogramPopoverTooth = toothFdi;
		if (this.odontogramPopoverTitle) {
			this.odontogramPopoverTitle.textContent = `Pieza ${toothFdi}`;
		}

		if (this.odontogramActiveTool) {
			this.setOdontogramPopoverMode('editor');
			this.resetOdontogramPopoverForm(toothFdi);
		} else {
			this.setOdontogramPopoverMode('summary');
			this.renderOdontogramSummary(toothFdi);
		}

		const wasOpen = this.isOdontogramPopoverOpen();
		this.odontogramPopover.hidden = false;
		this.odontogramPopover.removeAttribute('inert');
		this.odontogramPopover.setAttribute('aria-hidden', 'false');
		this.odontogramPopover.classList.add('is-open');
		if (!wasOpen || !this.odontogramPopoverDragged) {
			this.positionOdontogramPopover();
			window.requestAnimationFrame(() => this.positionOdontogramPopover());
		}
	}

	private clampOdontogramPopoverPosition(left: number, top: number) {
		const dialog = this.odontogramPopover;
		if (!dialog) return { left, top };
		const pad = 8;
		const width = dialog.offsetWidth || 288;
		const height = dialog.offsetHeight || 320;
		return {
			left: Math.max(pad, Math.min(left, window.innerWidth - width - pad)),
			top: Math.max(pad, Math.min(top, window.innerHeight - height - pad)),
		};
	}

	private handleOdontogramPopoverDragStart = (event: PointerEvent) => {
		if (event.button !== 0) return;
		if (!(event.target instanceof Element)) return;
		if (event.target.closest('[data-close-odontogram-popover]')) return;
		const dialog = this.odontogramPopover;
		if (!dialog || !this.isOdontogramPopoverOpen()) return;

		const rect = dialog.getBoundingClientRect();
		this.odontogramPopoverDrag = {
			pointerId: event.pointerId,
			offsetX: event.clientX - rect.left,
			offsetY: event.clientY - rect.top,
		};
		dialog.classList.add('is-dragging');
		this.odontogramPopoverDragHandle?.setPointerCapture(event.pointerId);
		event.preventDefault();
	};

	private handleOdontogramPopoverDragMove = (event: PointerEvent) => {
		const drag = this.odontogramPopoverDrag;
		const dialog = this.odontogramPopover;
		if (!drag || drag.pointerId !== event.pointerId || !dialog) return;

		const next = this.clampOdontogramPopoverPosition(
			event.clientX - drag.offsetX,
			event.clientY - drag.offsetY
		);
		dialog.style.left = `${Math.round(next.left)}px`;
		dialog.style.top = `${Math.round(next.top)}px`;
		this.odontogramPopoverDragged = true;
	};

	private handleOdontogramPopoverDragEnd = (event: PointerEvent) => {
		if (this.odontogramPopoverDrag?.pointerId !== event.pointerId) return;
		this.odontogramPopoverDrag = null;
		this.odontogramPopover?.classList.remove('is-dragging');
		if (this.odontogramPopoverDragHandle?.hasPointerCapture(event.pointerId)) {
			this.odontogramPopoverDragHandle.releasePointerCapture(event.pointerId);
		}
	};

	private closeOdontogramPopover() {
		this.odontogramPopoverDrag = null;
		this.odontogramPopoverDragged = false;
		this.odontogramPopover?.classList.remove('is-dragging');
		const dialog = this.odontogramPopover;
		if (dialog) {
			dialog.style.left = '';
			dialog.style.top = '';
			dialog.style.width = '';
		}
		if (!dialog?.classList.contains('is-open')) return;
		dialog.hidden = true;
		dialog.setAttribute('inert', '');
		dialog.setAttribute('aria-hidden', 'true');
		dialog.classList.remove('is-open');
		this.odontogramPopoverTooth = 0;
		this.setOdontogramPopoverError('');
		this.odontogram3d?.setSelectedTooth(null);
	}

	private handleOdontogramPopoverClick = (event: Event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		if (target.closest('[data-close-odontogram-popover]')) {
			event.preventDefault();
			this.closeOdontogramPopover();
		}
	};

	private handleOdontogramPopoverKeydown = (event: KeyboardEvent) => {
		if (event.key !== 'Escape') return;
		if (!this.isOdontogramPopoverOpen()) return;
		event.preventDefault();
		event.stopPropagation();
		this.closeOdontogramPopover();
	};

	private readOdontogramFacesFromForm(form: HTMLFormElement): OdontogramFaces {
		const read = (name: keyof OdontogramFaces): 0 | 1 => {
			const input = form.elements.namedItem(name);
			return input instanceof HTMLInputElement && input.checked ? 1 : 0;
		};

		return {
			occlusal: read('occlusal'),
			vestibular: read('vestibular'),
			palatal: read('palatal'),
			mesial: read('mesial'),
			distal: read('distal'),
		};
	}

	private hasSelectedOdontogramFace(faces: OdontogramFaces) {
		return Object.values(faces).some((value) => this.isOdontogramFaceMarked(value));
	}

	private handleOdontogramPopoverSubmit = (event: Event) => {
		event.preventDefault();
		if (!this.odontogramPopoverForm) return;

		const toothFdi = this.odontogramPopoverTooth;
		const customerId = this.activeProfileCustomerId;
		if (toothFdi <= 0 || customerId <= 0) return;

		const finding = this.odontogramActiveTool;
		if (!finding) {
			this.setOdontogramPopoverError('Elegí un comando para guardar este hallazgo.');
			return;
		}

		const faces = this.odontogramFindingNeedsFaces(finding)
			? this.readOdontogramFacesFromForm(this.odontogramPopoverForm)
			: this.emptyOdontogramFaces();
		const notesInput = this.odontogramPopoverForm.elements.namedItem('notes');
		const notes =
			notesInput instanceof HTMLTextAreaElement ? String(notesInput.value || '').trim() : '';

		if (this.odontogramFindingNeedsFaces(finding) && !this.hasSelectedOdontogramFace(faces)) {
			this.setOdontogramPopoverError('Seleccioná al menos una cara para este hallazgo.');
			return;
		}

		this.setOdontogramPopoverError('');
		void this.saveOdontogramFinding(customerId, {
			tooth_fdi: toothFdi,
			finding_code: finding,
			notes,
			faces,
		});
	};

	private async saveOdontogramFinding(
		customerId: number,
		payload: {
			tooth_fdi: number;
			finding_code: OdontogramFindingCode;
			notes: string;
			faces: OdontogramFaces;
		}
	) {
		const saveButton = this.odontogramPopoverForm?.querySelector<HTMLButtonElement>(
			'[data-customer-odontogram-save]'
		);
		if (saveButton) saveButton.disabled = true;

		try {
			const response = await fetch(`/api/customers/${customerId}/odontogram`, {
				method: 'POST',
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(payload),
			});
			const data = await this.parseJson<OdontogramData>(response);

			if (!response.ok || data.status !== 'success') {
				throw new Error(
					this.getBackendMessage(data, 'No fue posible guardar el hallazgo del odontograma.')
				);
			}

			this.closeOdontogramPopover();
			await this.loadOdontogram(customerId);
		} catch (error) {
			this.setOdontogramPopoverError(
				error instanceof Error
					? error.message
					: 'No fue posible guardar el hallazgo del odontograma.'
			);
		} finally {
			if (saveButton) saveButton.disabled = false;
		}
	}

	private formatAppointmentStatusLabel(status: string) {
		const normalized = String(status || '').trim().toUpperCase();
		if (normalized === 'COMPLETADO') return 'Completado';
		if (normalized === 'CONFIRMADO') return 'Confirmado';
		if (normalized === 'CANCELADO' || normalized === 'AUSENTE') return 'Cancelado';
		if (normalized === 'PENDIENTE') return 'Pendiente';
		return normalized || '—';
	}

	private getAppointmentStatusClass(status: string) {
		const normalized = String(status || '').trim().toUpperCase();
		if (normalized === 'COMPLETADO' || normalized === 'CONFIRMADO') return 'is-done';
		if (normalized === 'CANCELADO' || normalized === 'AUSENTE') return 'is-cancelled';
		if (normalized === 'PENDIENTE') return 'is-upcoming';
		return 'is-neutral';
	}

	private getAppointmentStatusIcon(status: string) {
		const statusClass = this.getAppointmentStatusClass(status);
		if (statusClass === 'is-done') return 'check';
		if (statusClass === 'is-cancelled') return 'close';
		if (statusClass === 'is-upcoming') return 'schedule';
		return 'radio_button_unchecked';
	}

	private parseAppointmentDate(value: string) {
		const date = new Date(String(value || '').trim());
		return Number.isNaN(date.getTime()) ? null : date;
	}

	private getMonthYearKey(date: Date) {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
	}

	private formatMonthYearHeading(date: Date) {
		const month = new Intl.DateTimeFormat('es-PY', { month: 'long' }).format(date);
		const capitalized = month ? month.charAt(0).toUpperCase() + month.slice(1) : 'Mes';
		return `${capitalized} ${date.getFullYear()}`;
	}

	private formatTimelineWhen(value: string) {
		const date = this.parseAppointmentDate(value);
		if (!date) return '—';

		const datePart = new Intl.DateTimeFormat('es-PY', {
			day: '2-digit',
			month: 'short',
		}).format(date);
		const timePart = new Intl.DateTimeFormat('es-PY', {
			hour: '2-digit',
			minute: '2-digit',
		}).format(date);

		return `${datePart} · ${timePart}`;
	}

	private shouldHideHistoryProfessionalName() {
		return this.selectedProfessionalId > 0 || this.roleId === ROLES.PROFESIONAL;
	}

	private fillHistoryItemBody(
		body: HTMLElement,
		appointment: CustomerAppointmentSummary,
		historyEnabled: boolean
	) {
		if (!historyEnabled) {
			const premium = document.createElement('p');
			premium.className = 'customer-profile-history-muted';
			premium.textContent =
				'Las notas y archivos de la sesión están disponibles en el plan Premium.';
			body.appendChild(premium);
			return;
		}

		const notesBlock = document.createElement('div');
		notesBlock.className = 'customer-profile-history-block';

		const structuredFields = SESSION_NOTE_FIELDS.map((field) => ({
			key: field.key,
			label: field.label,
			value: String(appointment[field.key] || '').trim(),
		})).filter((field) => field.value.length > 0);

		if (structuredFields.length > 0) {
			for (const field of structuredFields) {
				const section = document.createElement('div');
				section.className = 'customer-profile-history-note-section';
				if (field.key !== 'procedure_notes') {
					const label = document.createElement('p');
					label.className = 'customer-profile-history-block__label';
					label.textContent = field.label;
					section.appendChild(label);
				}
				const text = document.createElement('p');
				text.className = 'customer-profile-history-notes';
				text.textContent = field.value;
				section.appendChild(text);
				notesBlock.appendChild(section);
			}
		} else {
			const notesTitle = document.createElement('p');
			notesTitle.className = 'customer-profile-history-block__label';
			notesTitle.textContent = 'Notas de la sesión';
			notesBlock.appendChild(notesTitle);

			const legacyNotes = String(appointment.notes || '').trim();
			if (legacyNotes) {
				const notesText = document.createElement('p');
				notesText.className = 'customer-profile-history-notes';
				notesText.textContent = legacyNotes;
				notesBlock.appendChild(notesText);
			} else if (!hasAnySessionNote(appointment)) {
				const noNotes = document.createElement('p');
				noNotes.className = 'customer-profile-history-muted';
				noNotes.textContent = 'Sin notas registradas.';
				notesBlock.appendChild(noNotes);
			}
		}
		body.appendChild(notesBlock);

		const filesBlock = document.createElement('div');
		filesBlock.className = 'customer-profile-history-block';
		const filesTitle = document.createElement('p');
		filesTitle.className = 'customer-profile-history-block__label';
		filesTitle.textContent = 'Archivos adjuntos';
		filesBlock.appendChild(filesTitle);

		const attachments = Array.isArray(appointment.attachments) ? appointment.attachments : [];
		if (attachments.length > 0) {
			const list = document.createElement('ul');
			list.className = 'customer-profile-history-attachments';
			for (const file of attachments) {
				list.appendChild(
					createAttachmentListItem(file, {
						variant: 'chip',
						onPreview: () =>
							this.fileViewer?.open({
								url: file.url,
								name: file.file_name,
								mimeType: file.mime_type,
							}),
					})
				);
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

	private createHistoryTimelineItem(
		appointment: CustomerAppointmentSummary,
		options: { hideProfessional: boolean; historyEnabled: boolean }
	) {
		const statusClass = this.getAppointmentStatusClass(appointment.status);
		const statusLabel = this.formatAppointmentStatusLabel(appointment.status);
		const when = this.formatTimelineWhen(appointment.start_time);
		const serviceName = appointment.service_name || 'Servicio';
		const professionalName = options.hideProfessional
			? ''
			: String(appointment.professional_name || '').trim();

		const item = document.createElement('article');
		item.className = `customer-profile-timeline__item ${statusClass}`;

		const toggle = document.createElement('button');
		toggle.type = 'button';
		toggle.className = 'customer-profile-timeline__toggle';
		toggle.setAttribute('aria-expanded', 'false');
		toggle.setAttribute(
			'aria-label',
			[serviceName, statusLabel, when, professionalName].filter(Boolean).join(', ')
		);

		const node = document.createElement('span');
		node.className = 'material-symbols-rounded customer-profile-timeline__node';
		node.title = statusLabel;
		node.setAttribute('aria-hidden', 'true');
		node.textContent = this.getAppointmentStatusIcon(appointment.status);

		const content = document.createElement('span');
		content.className = 'customer-profile-timeline__content';

		const titleRow = document.createElement('span');
		titleRow.className = 'customer-profile-timeline__title-row';

		const title = document.createElement('span');
		title.className = 'customer-profile-timeline__title';
		title.textContent = serviceName;
		titleRow.appendChild(title);

		const hasNotes = appointment.has_history_notes === true;
		const attachmentCount = Math.max(0, Math.floor(Number(appointment.attachment_count || 0)));
		if (hasNotes || attachmentCount > 0) {
			const marks = document.createElement('span');
			marks.className = 'customer-profile-timeline__marks';
			if (hasNotes) {
				const noteIcon = document.createElement('span');
				noteIcon.className = 'material-symbols-rounded';
				noteIcon.title = 'Notas';
				noteIcon.setAttribute('aria-hidden', 'true');
				noteIcon.textContent = 'notes';
				marks.appendChild(noteIcon);
			}
			if (attachmentCount > 0) {
				const fileIcon = document.createElement('span');
				fileIcon.className = 'material-symbols-rounded';
				fileIcon.title =
					attachmentCount === 1 ? '1 archivo' : `${attachmentCount} archivos`;
				fileIcon.setAttribute('aria-hidden', 'true');
				fileIcon.textContent = 'attach_file';
				marks.appendChild(fileIcon);
			}
			titleRow.appendChild(marks);
		}

		const subtitleParts = [when, professionalName].filter(Boolean);
		const subtitle = document.createElement('span');
		subtitle.className = 'customer-profile-timeline__subtitle';
		subtitle.textContent = subtitleParts.join(' · ');

		content.append(titleRow, subtitle);

		const chevron = document.createElement('span');
		chevron.className = 'material-symbols-rounded customer-profile-timeline__chevron';
		chevron.setAttribute('aria-hidden', 'true');
		chevron.textContent = 'expand_more';

		toggle.append(node, content, chevron);

		const body = document.createElement('div');
		body.className = 'customer-profile-timeline__body';
		this.fillHistoryItemBody(body, appointment, options.historyEnabled);

		toggle.addEventListener('click', () => {
			const isOpen = item.classList.toggle('is-open');
			toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
		});

		item.append(toggle, body);
		return item;
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
		let currentKey = '';
		let groupEl: HTMLElement | null = null;
		let headingIndex = 0;

		for (const appointment of appointments) {
			const date = this.parseAppointmentDate(appointment.start_time);
			const key = date ? this.getMonthYearKey(date) : '__unknown';

			if (key !== currentKey || !groupEl) {
				currentKey = key;
				headingIndex += 1;
				groupEl = document.createElement('section');
				groupEl.className = 'customer-profile-timeline__group';

				const heading = document.createElement('h4');
				heading.className = 'customer-profile-timeline__heading';
				heading.id = `customer-history-month-${headingIndex}`;
				heading.textContent = date ? this.formatMonthYearHeading(date) : 'Sin fecha';
				groupEl.setAttribute('aria-labelledby', heading.id);
				groupEl.appendChild(heading);
				this.profileHistoryList.appendChild(groupEl);
			}

			groupEl.appendChild(
				this.createHistoryTimelineItem(appointment, { hideProfessional, historyEnabled })
			);
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
		this.resetOdontogramState();
		this.updateOdontogramLockUi();
		this.setActiveProfileTab('summary');
		void this.loadOdontogram(profile.id_customer);

		if (this.profileBodyNode) this.profileBodyNode.classList.remove('hidden');
	}

	private async openCustomerProfile(customerId: number) {
		if (!this.profileModal) return;

		this.activeProfileCustomerId = customerId;
		this.resetOdontogramState();
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
