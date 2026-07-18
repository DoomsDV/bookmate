type ServiceItem = {
	id_service: number;
	name: string;
	duration_minutes: number;
	price: number;
	is_active: 0 | 1;
};

type ServicesListMeta = {
	current_page: number;
	per_page: number;
	total_records: number;
	total_pages: number;
};

const PAGE_SIZE = 9;

const currencyFormatter = new Intl.NumberFormat('es-PY', {
	style: 'currency',
	currency: 'PYG',
	maximumFractionDigits: 0,
});

const toDurationLabel = (value?: number | null) => {
	if (!value || value <= 0) return '--';
	if (value === 60) return '1 hora';
	if (value > 60 && value % 60 === 0) return `${value / 60} horas`;

	const hours = Math.floor(value / 60);
	const mins = value % 60;
	if (hours > 0) return `${hours} h ${mins} min`;
	return `${value} min`;
};

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const getListRoot = () => document.querySelector<HTMLElement>('[data-services-list]');

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

const renderServiceCard = (service: ServiceItem) => {
	const name = service.name || `Servicio #${service.id_service}`;
	const isActive = service.is_active === 1;
	const statusClass = isActive ? 'services-card-status--active' : 'services-card-status--inactive';
	const dotClass = isActive ? 'services-summary-dot--active' : 'services-summary-dot--inactive';
	const statusLabel = isActive ? 'Activo' : 'Inactivo';
	const price = service.price ? currencyFormatter.format(service.price) : '--';

	return `
		<article
			class="services-card group cursor-pointer"
			data-service-card
			data-service-id="${service.id_service}"
			tabindex="0"
			role="button"
			aria-label="Editar servicio ${escapeHtml(name)}"
		>
			<div class="flex items-start justify-between gap-4">
				<div class="services-card-icon">
					<span class="material-symbols-rounded text-[1.25rem]">design_services</span>
				</div>
				<span class="services-card-status ${statusClass}">
					<span class="size-1.5 rounded-full ${dotClass}"></span>
					${statusLabel}
				</span>
			</div>
			<div class="services-card-body">
				<h3 class="services-card-title">${escapeHtml(name)}</h3>
				<dl class="services-card-metrics">
					<div class="flex items-center justify-between text-[0.92rem]">
						<dt class="services-card-term">Duración</dt>
						<dd class="services-card-value services-card-value--duration">${toDurationLabel(service.duration_minutes)}</dd>
					</div>
					<div class="flex items-center justify-between text-[0.92rem]">
						<dt class="services-card-term">Precio</dt>
						<dd class="services-card-value services-card-value--price">${price}</dd>
					</div>
				</dl>
			</div>
		</article>
	`;
};

const updateSummaryPills = (services: ServiceItem[]) => {
	const root = getListRoot();
	if (!root) return;

	const activeCount = services.filter((s) => s.is_active === 1).length;
	const inactiveCount = services.length - activeCount;

	const activeNode = root.querySelector('[data-services-active-count]');
	if (activeNode) activeNode.textContent = String(activeCount);

	const inactivePill = root.querySelector<HTMLElement>('[data-services-inactive-pill]');
	const inactiveCountNode = root.querySelector('[data-services-inactive-count]');
	if (inactivePill && inactiveCountNode) {
		inactiveCountNode.textContent = String(inactiveCount);
		inactivePill.hidden = inactiveCount <= 0;
	}
};

const updateEmptyOrGrid = (
	services: ServiceItem[],
	state: { search: string; isActive: number | null }
) => {
	const root = getListRoot();
	if (!root) return;

	const results = root.querySelector<HTMLElement>('[data-services-results]');
	if (!results) return;

	const hasSearch = Boolean(state.search);
	const hasStatusFilter = state.isActive === 0 || state.isActive === 1;
	const hasFilters = hasSearch || hasStatusFilter;

	if (services.length === 0) {
		const title = hasFilters ? 'No se encontraron servicios' : 'No hay servicios registrados';
		const copy = hasSearch
			? 'Probá con otro nombre.'
			: hasStatusFilter
				? 'No hay servicios con ese estado.'
				: 'Aun no has agregado ningun servicio a esta organizacion. Comienza creando tu primera prestacion.';
		const icon = hasFilters ? 'search_off' : 'inbox';

		results.innerHTML = `
			<div class="services-empty-state" data-services-empty>
				<div class="services-empty-icon">
					<span class="material-symbols-rounded text-[2rem]">${icon}</span>
				</div>
				<h3 class="text-[1.1rem] font-bold text-(--on-surface)">${title}</h3>
				<p class="mt-1.5 max-w-sm text-[0.95rem] leading-relaxed text-(--on-surface-variant)">${copy}</p>
			</div>
		`;
		return;
	}

	results.innerHTML = `
		<div class="material-cards-grid gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3" data-services-grid>
			${services.map(renderServiceCard).join('')}
		</div>
	`;
};

const updateFilterUi = (isActive: number | null) => {
	const root = getListRoot();
	if (!root) return;

	const hasStatusFilter = isActive === 0 || isActive === 1;
	const filterBtn = root.querySelector<HTMLButtonElement>('[data-open-services-status-filter]');
	if (filterBtn) {
		filterBtn.classList.toggle('is-active', hasStatusFilter);
		filterBtn.setAttribute('aria-pressed', hasStatusFilter ? 'true' : 'false');
		let badge = filterBtn.querySelector<HTMLElement>('[data-services-status-filter-badge]');
		if (hasStatusFilter && !badge) {
			badge = document.createElement('span');
			badge.className = 'services-status-filter-badge';
			badge.setAttribute('data-services-status-filter-badge', '');
			badge.setAttribute('aria-hidden', 'true');
			filterBtn.appendChild(badge);
		} else if (!hasStatusFilter && badge) {
			badge.remove();
		}
	}

	root.querySelectorAll<HTMLButtonElement>('[data-services-status-option]').forEach((option) => {
		const value = String(option.dataset.value || '').trim();
		const selected =
			(value === '' && !hasStatusFilter) ||
			(value === '1' && isActive === 1) ||
			(value === '0' && isActive === 0);
		option.classList.toggle('is-selected', selected);
		option.setAttribute('aria-selected', selected ? 'true' : 'false');
	});
};

const updatePagination = (meta: ServicesListMeta) => {
	const root = getListRoot();
	if (!root) return;

	const totalPages = Math.max(1, Number(meta.total_pages) || 1);
	const currentPage = Math.min(Math.max(1, Number(meta.current_page) || 1), totalPages);
	const totalRecords = Number(meta.total_records) || 0;

	const summary = root.querySelector('[data-services-pagination-summary]');
	if (summary) {
		summary.innerHTML = `
			Página <strong>${currentPage}</strong> de <strong>${totalPages}</strong>
			<span aria-hidden="true">-</span>
			Total: <strong>${totalRecords}</strong> servicios
		`;
	}

	const currentLabel = root.querySelector('[data-services-pagination-current]');
	if (currentLabel) currentLabel.textContent = String(currentPage);

	const prevBtn = root.querySelector<HTMLButtonElement>('[data-services-page-prev]');
	const nextBtn = root.querySelector<HTMLButtonElement>('[data-services-page-next]');
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

const loadServices = async (state: { page: number; search: string; isActive: number | null }) => {
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

		const response = await fetch(`/api/services?${query.toString()}`, {
			headers: { Accept: 'application/json' },
		});
		const payload = await response.json().catch(() => ({}));
		if (requestId !== loadRequestId) return;

		if (!response.ok || payload?.status === 'error') {
			throw new Error(
				typeof payload?.message === 'string'
					? payload.message
					: 'No fue posible cargar el listado de servicios.'
			);
		}

		const services = Array.isArray(payload?.data) ? (payload.data as ServiceItem[]) : [];
		const meta = (payload?.meta || {}) as Partial<ServicesListMeta>;
		const normalizedMeta: ServicesListMeta = {
			current_page: Number(meta.current_page) || state.page,
			per_page: Number(meta.per_page) || PAGE_SIZE,
			total_records: Number(meta.total_records) || services.length,
			total_pages: Math.max(1, Number(meta.total_pages) || 1),
		};

		syncUrl({
			page: normalizedMeta.current_page,
			search: state.search,
			isActive: state.isActive,
		});
		updateSummaryPills(services);
		updateEmptyOrGrid(services, state);
		updateFilterUi(state.isActive);
		updatePagination(normalizedMeta);
	} catch (error) {
		if (requestId !== loadRequestId) return;
		console.error(error);
	} finally {
		if (requestId === loadRequestId) isLoading = false;
	}
};

export const initServicesListControls = () => {
	if ((window as unknown as { __servicesListControlsInit?: boolean }).__servicesListControlsInit) {
		return;
	}
	(window as unknown as { __servicesListControlsInit?: boolean }).__servicesListControlsInit = true;

	document.addEventListener('input', (event) => {
		const target = event.target;
		if (!(target instanceof HTMLInputElement) || !target.matches('[data-services-search]')) {
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
			void loadServices({
				page: 1,
				search: nextQuery,
				isActive: current.isActive,
			});
		}, 300);
	});

	document.addEventListener('click', (event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;

		const openBtn = target.closest<HTMLButtonElement>('[data-open-services-status-filter]');
		if (openBtn) {
			document
				.querySelector<HTMLDialogElement>('[data-services-status-filter-sheet]')
				?.showModal();
			return;
		}

		const closeBtn = target.closest<HTMLButtonElement>('[data-close-services-status-filter]');
		if (closeBtn) {
			document
				.querySelector<HTMLDialogElement>('[data-services-status-filter-sheet]')
				?.close();
			return;
		}

		const option = target.closest<HTMLButtonElement>('[data-services-status-option]');
		if (option) {
			const nextValue = String(option.dataset.value || '').trim();
			const current = readStateFromUrl();
			const nextIsActive =
				nextValue === '0' || nextValue === '1' ? Number(nextValue) : null;
			document
				.querySelector<HTMLDialogElement>('[data-services-status-filter-sheet]')
				?.close();

			if (nextIsActive === current.isActive) return;
			void loadServices({
				page: 1,
				search: current.search,
				isActive: nextIsActive,
			});
			return;
		}

		const pageBtn = target.closest<HTMLButtonElement>(
			'[data-services-page-prev], [data-services-page-next]'
		);
		if (pageBtn && !pageBtn.disabled && !isLoading) {
			const nextPage = Number(pageBtn.dataset.page || '1');
			if (!Number.isInteger(nextPage) || nextPage <= 0) return;
			const current = readStateFromUrl();
			if (nextPage === current.page) return;
			void loadServices({
				page: nextPage,
				search: current.search,
				isActive: current.isActive,
			});
		}
	});

	document.addEventListener('click', (event) => {
		const sheet = document.querySelector<HTMLDialogElement>(
			'[data-services-status-filter-sheet]'
		);
		if (!sheet?.open || event.target !== sheet) return;
		sheet.close();
	});
};
