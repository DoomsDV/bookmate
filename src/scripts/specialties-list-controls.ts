import {
	bindFilterPopoverChrome,
	closeFilterPopoverSheet,
	toggleFilterPopoverSheet,
} from '../lib/panel-filter-popover';
import { updateAppPaginationDom } from '../lib/pagination';

type SpecialtyItem = {
	id_specialty: number;
	name?: string | null;
	description?: string | null;
	is_active?: 0 | 1;
};

type SpecialtiesListMeta = {
	current_page: number;
	per_page: number;
	total_records: number;
	total_pages: number;
};

const PAGE_SIZE = 9;
const SPECIALTY_ICON = 'workspace_premium';

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const toDescriptionLabel = (value?: string | null) => {
	const text = String(value || '').trim();
	return text || 'Sin descripción';
};

const getListRoot = () => document.querySelector<HTMLElement>('[data-specialties-list]');

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

const renderSpecialtyCard = (specialty: SpecialtyItem) => {
	const name = specialty.name || `Especialidad #${specialty.id_specialty}`;
	const isActive = specialty.is_active === 1;
	const statusClass = isActive
		? 'specialties-card-status--active'
		: 'specialties-card-status--inactive';
	const dotClass = isActive
		? 'specialties-summary-dot--active'
		: 'specialties-summary-dot--inactive';
	const statusLabel = isActive ? 'Activa' : 'Inactiva';
	const description = toDescriptionLabel(specialty.description);

	return `
		<article
			class="specialties-card group cursor-pointer relative overflow-hidden"
			data-specialty-card
			data-specialty-id="${specialty.id_specialty}"
			tabindex="0"
			role="button"
			aria-label="Editar especialidad ${escapeHtml(name)}"
		>
			<div class="relative flex items-start justify-between gap-4">
				<div class="specialties-card-icon">
					<span class="material-symbols-rounded text-[1.25rem]">${SPECIALTY_ICON}</span>
				</div>
				<span class="specialties-card-status ${statusClass}">
					<span class="size-1.5 rounded-full ${dotClass}"></span>
					${statusLabel}
				</span>
			</div>
			<div class="specialties-card-body">
				<div>
					<h3 class="specialties-card-title line-clamp-1">${escapeHtml(name)}</h3>
					<p class="mt-1 text-[0.9rem] text-(--on-surface-variant) line-clamp-2 leading-relaxed">
						${escapeHtml(description)}
					</p>
				</div>
			</div>
		</article>
	`;
};

const updateTitleSummary = (totalRecords: number) => {
	const root = getListRoot();
	const summaryNode = root?.querySelector('[data-specialties-summary]');
	if (summaryNode) summaryNode.textContent = `(${totalRecords})`;
};

const updateSummaryPills = (specialties: SpecialtyItem[]) => {
	const root = getListRoot();
	if (!root) return;

	const activeCount = specialties.filter((item) => item.is_active === 1).length;
	const inactiveCount = specialties.length - activeCount;

	const activeNode = root.querySelector('[data-specialties-active-count]');
	if (activeNode) activeNode.textContent = String(activeCount);

	const inactivePill = root.querySelector<HTMLElement>('[data-specialties-inactive-pill]');
	const inactiveCountNode = root.querySelector('[data-specialties-inactive-count]');
	if (inactivePill && inactiveCountNode) {
		inactiveCountNode.textContent = String(inactiveCount);
		inactivePill.hidden = inactiveCount <= 0;
	}
};

const updateEmptyOrGrid = (
	specialties: SpecialtyItem[],
	state: { search: string; isActive: number | null }
) => {
	const root = getListRoot();
	const results = root?.querySelector<HTMLElement>('[data-specialties-results]');
	if (!results) return;

	const hasSearch = Boolean(state.search);
	const hasStatusFilter = state.isActive === 0 || state.isActive === 1;
	const hasFilters = hasSearch || hasStatusFilter;

	if (specialties.length === 0) {
		results.innerHTML = `
			<div class="specialties-empty-state" data-specialties-empty>
				<div class="specialties-empty-icon">
					<span class="material-symbols-rounded text-[2rem]">${hasFilters ? 'search_off' : 'inbox'}</span>
				</div>
				<h3 class="text-[1.1rem] font-bold text-(--on-surface)">
					${hasFilters ? 'No se encontraron especialidades' : 'No hay especialidades registradas'}
				</h3>
				<p class="mt-1.5 max-w-sm text-[0.95rem] leading-relaxed text-(--on-surface-variant)">
					${
						hasSearch
							? 'Probá con otro nombre.'
							: hasStatusFilter
								? 'No hay especialidades con ese estado.'
								: 'Creá tu primera especialidad para empezar.'
					}
				</p>
			</div>
		`;
		return;
	}

	results.innerHTML = `
		<div class="material-cards-grid gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3" data-specialties-grid>
			${specialties.map(renderSpecialtyCard).join('')}
		</div>
	`;
};

const updateFilterUi = (isActive: number | null) => {
	const root = getListRoot();
	if (!root) return;

	const hasStatusFilter = isActive === 0 || isActive === 1;
	const filterBtn = root.querySelector<HTMLButtonElement>('[data-open-specialties-status-filter]');
	if (filterBtn) {
		filterBtn.classList.toggle('is-active', hasStatusFilter);
		filterBtn.setAttribute('aria-pressed', hasStatusFilter ? 'true' : 'false');
		let badge = filterBtn.querySelector<HTMLElement>('[data-specialties-status-filter-badge]');
		if (hasStatusFilter && !badge) {
			badge = document.createElement('span');
			badge.className = 'panel-status-filter-badge';
			badge.setAttribute('data-specialties-status-filter-badge', '');
			badge.setAttribute('aria-hidden', 'true');
			filterBtn.appendChild(badge);
		} else if (!hasStatusFilter && badge) {
			badge.remove();
		}
	}

	root.querySelectorAll<HTMLButtonElement>('[data-specialties-status-option]').forEach((option) => {
		const value = String(option.dataset.value || '').trim();
		const selected =
			(value === '' && !hasStatusFilter) ||
			(value === '1' && isActive === 1) ||
			(value === '0' && isActive === 0);
		option.classList.toggle('is-selected', selected);
		option.setAttribute('aria-selected', selected ? 'true' : 'false');
	});
};

const updatePagination = (meta: SpecialtiesListMeta) => {
	const root = getListRoot();
	if (!root) return;

	updateAppPaginationDom(root, {
		currentPage: Number(meta.current_page) || 1,
		totalPages: Number(meta.total_pages) || 1,
		totalRecords: Number(meta.total_records) || 0,
		recordLabel: 'especialidades',
		summarySelector: '[data-specialties-pagination-summary]',
		pagesSelector: '[data-specialties-pagination-pages]',
		prevSelector: '[data-specialties-page-prev]',
		nextSelector: '[data-specialties-page-next]',
		pageDataAttr: 'data-specialties-page',
	});
};

let searchDebounceTimer: number | null = null;
let loadRequestId = 0;
let isLoading = false;

const loadSpecialties = async (state: {
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

		const response = await fetch(`/api/specialties?${query.toString()}`, {
			headers: { Accept: 'application/json' },
		});
		const payload = await response.json().catch(() => ({}));
		if (requestId !== loadRequestId) return;

		if (!response.ok || payload?.status === 'error') {
			throw new Error(
				typeof payload?.message === 'string'
					? payload.message
					: 'No fue posible cargar el listado de especialidades.'
			);
		}

		const specialties = Array.isArray(payload?.data)
			? (payload.data as SpecialtyItem[])
			: [];
		const meta = (payload?.meta || {}) as Partial<SpecialtiesListMeta>;
		const normalizedMeta: SpecialtiesListMeta = {
			current_page: Number(meta.current_page) || state.page,
			per_page: Number(meta.per_page) || PAGE_SIZE,
			total_records: Number(meta.total_records) || specialties.length,
			total_pages: Math.max(1, Number(meta.total_pages) || 1),
		};

		syncUrl({
			page: normalizedMeta.current_page,
			search: state.search,
			isActive: state.isActive,
		});
		updateTitleSummary(normalizedMeta.total_records);
		updateSummaryPills(specialties);
		updateEmptyOrGrid(specialties, state);
		updateFilterUi(state.isActive);
		updatePagination(normalizedMeta);
	} catch (error) {
		if (requestId !== loadRequestId) return;
		console.error(error);
	} finally {
		if (requestId === loadRequestId) isLoading = false;
	}
};

export const initSpecialtiesListControls = () => {
	if (
		(window as unknown as { __specialtiesListControlsInit?: boolean })
			.__specialtiesListControlsInit
	) {
		return;
	}
	(
		window as unknown as { __specialtiesListControlsInit?: boolean }
	).__specialtiesListControlsInit = true;

	const sheet = document.querySelector<HTMLDialogElement>('[data-specialties-status-filter-sheet]');
	const getTrigger = () =>
		document.querySelector<HTMLElement>('[data-open-specialties-status-filter]');
	if (sheet) {
		bindFilterPopoverChrome({ sheet, getTrigger });
	}

	document.addEventListener('input', (event) => {
		const target = event.target;
		if (!(target instanceof HTMLInputElement) || !target.matches('[data-specialties-search]')) {
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
			void loadSpecialties({
				page: 1,
				search: nextQuery,
				isActive: current.isActive,
			});
		}, 300);
	});

	document.addEventListener('click', (event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;

		const openBtn = target.closest<HTMLButtonElement>('[data-open-specialties-status-filter]');
		if (openBtn) {
			event.preventDefault();
			event.stopPropagation();
			toggleFilterPopoverSheet(sheet, openBtn);
			return;
		}

		const closeBtn = target.closest<HTMLButtonElement>('[data-close-specialties-status-filter]');
		if (closeBtn) {
			closeFilterPopoverSheet(sheet, getTrigger());
			return;
		}

		const option = target.closest<HTMLButtonElement>('[data-specialties-status-option]');
		if (option) {
			const nextValue = String(option.dataset.value || '').trim();
			const current = readStateFromUrl();
			const nextIsActive =
				nextValue === '0' || nextValue === '1' ? Number(nextValue) : null;
			closeFilterPopoverSheet(sheet, getTrigger());

			if (nextIsActive === current.isActive) return;
			void loadSpecialties({
				page: 1,
				search: current.search,
				isActive: nextIsActive,
			});
			return;
		}

		const pageBtn = target.closest<HTMLButtonElement>(
			'[data-specialties-page-prev], [data-specialties-page-next], [data-specialties-page]'
		);
		if (pageBtn && !pageBtn.disabled && !isLoading) {
			const nextPage = Number(
				pageBtn.dataset.page || pageBtn.getAttribute('data-specialties-page') || '1'
			);
			if (!Number.isInteger(nextPage) || nextPage <= 0) return;
			const current = readStateFromUrl();
			if (nextPage === current.page) return;
			void loadSpecialties({
				page: nextPage,
				search: current.search,
				isActive: current.isActive,
			});
		}
	});

	document.addEventListener('click', (event) => {
		if (!sheet?.open || sheet.classList.contains('is-desktop-popover')) return;
		if (event.target !== sheet) return;
		closeFilterPopoverSheet(sheet, getTrigger());
	});
};
