type ProfessionalItem = {
	id_professional: number;
	display_name?: string | null;
	phone_number?: string | null;
	profile_image_url?: string | null;
	is_active?: 0 | 1;
	membership_status?: string | null;
	user?: {
		email?: string | null;
		is_active?: 0 | 1;
	} | null;
	specialty?: {
		name?: string | null;
	} | null;
};

type ProfessionalsListMeta = {
	current_page: number;
	per_page: number;
	total_records: number;
	total_pages: number;
};

const PAGE_SIZE = 9;
const PROFESSIONAL_ICON = 'badge';

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const getDisplayName = (professional: ProfessionalItem) => {
	const displayName = String(professional.display_name || '').trim();
	if (displayName) return displayName;
	const email = String(professional.user?.email || '').trim();
	if (email) return email;
	return `Personal #${professional.id_professional}`;
};

const isAccountActive = (professional: ProfessionalItem) => {
	if (professional.membership_status === 'pending_invite') return false;
	const userActive = professional.user?.is_active === 1 ? 1 : 0;
	const profActive = professional.is_active === 1 ? 1 : 0;
	return userActive === 1 || profActive === 1;
};

const getListRoot = () => document.querySelector<HTMLElement>('[data-professionals-list]');

const readStateFromUrl = () => {
	const url = new URL(window.location.href);
	const rawPage = Number(url.searchParams.get('page') || '1');
	const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
	const search = String(url.searchParams.get('search') || '').trim();
	const rawIsActive = String(url.searchParams.get('is_active') || '').trim();
	const isActive = rawIsActive === '0' || rawIsActive === '1' ? Number(rawIsActive) : null;
	return { page, search, isActive };
};

const syncUrl = (state: { page: number; search: string; isActive: number | null }) => {
	const url = new URL(window.location.href);
	if (state.page > 1) url.searchParams.set('page', String(state.page));
	else url.searchParams.delete('page');

	if (state.search) url.searchParams.set('search', state.search);
	else url.searchParams.delete('search');

	if (state.isActive === 0 || state.isActive === 1) {
		url.searchParams.set('is_active', String(state.isActive));
	} else {
		url.searchParams.delete('is_active');
	}

	const nextHref = `${url.pathname}${url.search}`;
	const currentHref = `${window.location.pathname}${window.location.search}`;
	if (nextHref !== currentHref) {
		window.history.replaceState({}, '', nextHref);
	}
};

const renderProfessionalCard = (professional: ProfessionalItem) => {
	const name = getDisplayName(professional);
	const email = String(professional.user?.email || '').trim() || '—';
	const specialty = professional.specialty?.name || 'Sin especialidad';
	const phone = professional.phone_number || '-';
	const imageUrl = String(professional.profile_image_url || '').trim();
	const isPending = professional.membership_status === 'pending_invite';
	const isActive = isAccountActive(professional);

	const statusClass = isPending
		? 'professionals-card-status--pending'
		: isActive
			? 'professionals-card-status--active'
			: 'professionals-card-status--inactive';
	const dotClass = isPending
		? 'professionals-summary-dot--pending'
		: isActive
			? 'professionals-summary-dot--active'
			: 'professionals-summary-dot--inactive';
	const statusLabel = isPending ? 'Invitación pendiente' : isActive ? 'Activo' : 'Inactivo';

	const avatarClasses = imageUrl
		? 'professionals-card-avatar'
		: 'professionals-card-avatar professionals-card-avatar--placeholder';
	const iconClasses = imageUrl
		? 'material-symbols-rounded professionals-card-avatar-icon professionals-card-avatar-icon--fallback'
		: 'material-symbols-rounded professionals-card-avatar-icon';

	const imageHtml = imageUrl
		? `<img
				src="${escapeHtml(imageUrl)}"
				alt="Foto de perfil de ${escapeHtml(name)}"
				class="professionals-card-avatar-image"
				loading="lazy"
				decoding="async"
				onerror="this.classList.add('is-hidden'); this.parentElement?.classList.add('professionals-card-avatar--placeholder');"
			/>`
		: '';

	return `
		<article
			class="professionals-card group cursor-pointer relative overflow-hidden"
			data-professional-card
			data-professional-id="${professional.id_professional}"
			tabindex="0"
			role="button"
			aria-label="Editar personal ${escapeHtml(name)}"
		>
			<div class="relative flex items-start justify-between gap-4">
				<div class="${avatarClasses}" data-professional-card-avatar>
					${imageHtml}
					<span class="${iconClasses}" aria-hidden="true">${PROFESSIONAL_ICON}</span>
				</div>
				<span class="professionals-card-status ${statusClass}">
					<span class="size-1.5 rounded-full ${dotClass}"></span>
					${statusLabel}
				</span>
			</div>
			<div class="professionals-card-body">
				<div>
					<h3 class="professionals-card-title line-clamp-1">${escapeHtml(name)}</h3>
					<p class="mt-1 text-[0.9rem] text-(--on-surface-variant) line-clamp-1">${escapeHtml(email)}</p>
				</div>
				<dl class="mt-auto shrink-0 grid gap-0.5">
					<div class="flex items-center justify-between text-[0.92rem]">
						<dt class="professionals-card-term">Especialidad</dt>
						<dd class="professionals-card-value">${escapeHtml(specialty)}</dd>
					</div>
					<div class="flex items-center justify-between text-[0.92rem]">
						<dt class="professionals-card-term">Teléfono</dt>
						<dd class="professionals-card-value">${escapeHtml(String(phone))}</dd>
					</div>
				</dl>
			</div>
		</article>
	`;
};

const updateSummaryPills = (professionals: ProfessionalItem[]) => {
	const root = getListRoot();
	if (!root) return;

	const activeCount = professionals.filter(
		(item) => item.membership_status !== 'pending_invite' && isAccountActive(item)
	).length;
	const inactiveCount = professionals.filter(
		(item) => item.membership_status !== 'pending_invite' && !isAccountActive(item)
	).length;

	const activeNode = root.querySelector('[data-professionals-active-count]');
	if (activeNode) activeNode.textContent = String(activeCount);

	const inactivePill = root.querySelector<HTMLElement>('[data-professionals-inactive-pill]');
	const inactiveCountNode = root.querySelector('[data-professionals-inactive-count]');
	if (inactivePill && inactiveCountNode) {
		inactiveCountNode.textContent = String(inactiveCount);
		inactivePill.hidden = inactiveCount <= 0;
	}
};

const updateEmptyOrGrid = (
	professionals: ProfessionalItem[],
	state: { search: string; isActive: number | null }
) => {
	const root = getListRoot();
	const results = root?.querySelector<HTMLElement>('[data-professionals-results]');
	if (!results) return;

	const hasSearch = Boolean(state.search);
	const hasStatusFilter = state.isActive === 0 || state.isActive === 1;
	const hasFilters = hasSearch || hasStatusFilter;

	if (professionals.length === 0) {
		results.innerHTML = `
			<div class="professionals-empty-state" data-professionals-empty>
				<div class="professionals-empty-icon">
					<span class="material-symbols-rounded text-[2rem]">${hasFilters ? 'search_off' : 'badge'}</span>
				</div>
				<h3 class="text-[1.1rem] font-bold text-(--on-surface)">
					${hasFilters ? 'No se encontraron profesionales' : 'No hay profesionales registrados'}
				</h3>
				<p class="mt-1.5 max-w-sm text-[0.95rem] leading-relaxed text-(--on-surface-variant)">
					${
						hasSearch
							? 'Probá con otro nombre, email o teléfono.'
							: hasStatusFilter
								? 'No hay profesionales con ese estado.'
								: 'Aún no has agregado a ningún profesional a esta organización. Comienza creando tu primer registro de personal.'
					}
				</p>
			</div>
		`;
		return;
	}

	results.innerHTML = `
		<div class="material-cards-grid gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3" data-professionals-grid>
			${professionals.map(renderProfessionalCard).join('')}
		</div>
	`;
};

const updateFilterUi = (isActive: number | null) => {
	const root = getListRoot();
	if (!root) return;

	const hasStatusFilter = isActive === 0 || isActive === 1;
	const filterBtn = root.querySelector<HTMLButtonElement>('[data-open-professionals-status-filter]');
	if (filterBtn) {
		filterBtn.classList.toggle('is-active', hasStatusFilter);
		filterBtn.setAttribute('aria-pressed', hasStatusFilter ? 'true' : 'false');
		let badge = filterBtn.querySelector<HTMLElement>('[data-professionals-status-filter-badge]');
		if (hasStatusFilter && !badge) {
			badge = document.createElement('span');
			badge.className = 'panel-status-filter-badge';
			badge.setAttribute('data-professionals-status-filter-badge', '');
			badge.setAttribute('aria-hidden', 'true');
			filterBtn.appendChild(badge);
		} else if (!hasStatusFilter && badge) {
			badge.remove();
		}
	}

	root.querySelectorAll<HTMLButtonElement>('[data-professionals-status-option]').forEach((option) => {
		const value = String(option.dataset.value || '').trim();
		const selected =
			(value === '' && !hasStatusFilter) ||
			(value === '1' && isActive === 1) ||
			(value === '0' && isActive === 0);
		option.classList.toggle('is-selected', selected);
		option.setAttribute('aria-selected', selected ? 'true' : 'false');
	});
};

const updatePagination = (meta: ProfessionalsListMeta) => {
	const root = getListRoot();
	if (!root) return;

	const totalPages = Math.max(1, Number(meta.total_pages) || 1);
	const currentPage = Math.min(Math.max(1, Number(meta.current_page) || 1), totalPages);
	const totalRecords = Number(meta.total_records) || 0;

	const summary = root.querySelector('[data-professionals-pagination-summary]');
	if (summary) {
		summary.innerHTML = `
			Página <strong>${currentPage}</strong> de <strong>${totalPages}</strong>
			<span aria-hidden="true">-</span>
			Total: <strong>${totalRecords}</strong> profesionales
		`;
	}

	const currentLabel = root.querySelector('[data-professionals-pagination-current]');
	if (currentLabel) currentLabel.textContent = String(currentPage);

	const prevBtn = root.querySelector<HTMLButtonElement>('[data-professionals-page-prev]');
	const nextBtn = root.querySelector<HTMLButtonElement>('[data-professionals-page-next]');
	if (prevBtn) {
		prevBtn.disabled = currentPage <= 1;
		prevBtn.classList.toggle('is-disabled', currentPage <= 1);
		prevBtn.dataset.page = String(Math.max(1, currentPage - 1));
	}
	if (nextBtn) {
		nextBtn.disabled = currentPage >= totalPages;
		nextBtn.classList.toggle('is-disabled', currentPage >= totalPages);
		nextBtn.dataset.page = String(Math.min(totalPages, currentPage + 1));
	}
};

let searchDebounceTimer: number | null = null;
let loadRequestId = 0;
let isLoading = false;

const loadProfessionals = async (state: {
	page: number;
	search: string;
	isActive: number | null;
}) => {
	const requestId = ++loadRequestId;
	isLoading = true;

	try {
		const query = new URLSearchParams({
			page: String(state.page),
			limit: String(PAGE_SIZE),
		});
		if (state.search) query.set('search', state.search);
		if (state.isActive === 0 || state.isActive === 1) {
			query.set('is_active', String(state.isActive));
		}

		const response = await fetch(`/api/professionals?${query.toString()}`, {
			headers: { Accept: 'application/json' },
		});
		const payload = await response.json().catch(() => ({}));
		if (requestId !== loadRequestId) return;

		if (!response.ok || payload?.status === 'error') {
			throw new Error(
				typeof payload?.message === 'string'
					? payload.message
					: 'No fue posible cargar el listado de personal.'
			);
		}

		const professionals = Array.isArray(payload?.data)
			? (payload.data as ProfessionalItem[])
			: [];
		const meta = (payload?.meta || {}) as Partial<ProfessionalsListMeta>;
		const normalizedMeta: ProfessionalsListMeta = {
			current_page: Number(meta.current_page) || state.page,
			per_page: Number(meta.per_page) || PAGE_SIZE,
			total_records: Number(meta.total_records) || professionals.length,
			total_pages: Math.max(1, Number(meta.total_pages) || 1),
		};

		syncUrl({
			page: normalizedMeta.current_page,
			search: state.search,
			isActive: state.isActive,
		});
		updateSummaryPills(professionals);
		updateEmptyOrGrid(professionals, state);
		updateFilterUi(state.isActive);
		updatePagination(normalizedMeta);
	} catch (error) {
		if (requestId !== loadRequestId) return;
		console.error(error);
	} finally {
		if (requestId === loadRequestId) isLoading = false;
	}
};

export const initProfessionalsListControls = () => {
	if (
		(window as unknown as { __professionalsListControlsInit?: boolean })
			.__professionalsListControlsInit
	) {
		return;
	}
	(
		window as unknown as { __professionalsListControlsInit?: boolean }
	).__professionalsListControlsInit = true;

	document.addEventListener('input', (event) => {
		const target = event.target;
		if (!(target instanceof HTMLInputElement) || !target.matches('[data-professionals-search]')) {
			return;
		}

		const nextQuery = String(target.value || '').trim();
		if (searchDebounceTimer !== null) {
			window.clearTimeout(searchDebounceTimer);
		}

		searchDebounceTimer = window.setTimeout(() => {
			searchDebounceTimer = null;
			const current = readStateFromUrl();
			if (nextQuery === current.search) return;
			void loadProfessionals({
				page: 1,
				search: nextQuery,
				isActive: current.isActive,
			});
		}, 300);
	});

	document.addEventListener('click', (event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;

		const openBtn = target.closest<HTMLButtonElement>('[data-open-professionals-status-filter]');
		if (openBtn) {
			document
				.querySelector<HTMLDialogElement>('[data-professionals-status-filter-sheet]')
				?.showModal();
			return;
		}

		const closeBtn = target.closest<HTMLButtonElement>('[data-close-professionals-status-filter]');
		if (closeBtn) {
			document
				.querySelector<HTMLDialogElement>('[data-professionals-status-filter-sheet]')
				?.close();
			return;
		}

		const option = target.closest<HTMLButtonElement>('[data-professionals-status-option]');
		if (option) {
			const nextValue = String(option.dataset.value || '').trim();
			const current = readStateFromUrl();
			const nextIsActive =
				nextValue === '0' || nextValue === '1' ? Number(nextValue) : null;
			document
				.querySelector<HTMLDialogElement>('[data-professionals-status-filter-sheet]')
				?.close();

			if (nextIsActive === current.isActive) return;
			void loadProfessionals({
				page: 1,
				search: current.search,
				isActive: nextIsActive,
			});
			return;
		}

		const pageBtn = target.closest<HTMLButtonElement>(
			'[data-professionals-page-prev], [data-professionals-page-next]'
		);
		if (pageBtn && !pageBtn.disabled && !isLoading) {
			const nextPage = Number(pageBtn.dataset.page || '1');
			if (!Number.isInteger(nextPage) || nextPage <= 0) return;
			const current = readStateFromUrl();
			if (nextPage === current.page) return;
			void loadProfessionals({
				page: nextPage,
				search: current.search,
				isActive: current.isActive,
			});
		}
	});

	document.addEventListener('click', (event) => {
		const sheet = document.querySelector<HTMLDialogElement>(
			'[data-professionals-status-filter-sheet]'
		);
		if (!sheet?.open || event.target !== sheet) return;
		sheet.close();
	});
};
