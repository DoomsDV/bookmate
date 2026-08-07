import {
	bindFilterPopoverChrome,
	closeFilterPopoverSheet,
	toggleFilterPopoverSheet,
} from '../lib/panel-filter-popover';
import { buildStadiaStaticMapUrl, renderBrandMapMarkerOverlay } from '../lib/maplibre-loader';
import { updateAppPaginationDom } from '../lib/pagination';

type LocationItem = {
	id_location: number;
	name?: string | null;
	address?: string | null;
	is_active?: 0 | 1;
	latitude?: number | null;
	longitude?: number | null;
	city?: { name?: string | null } | null;
	department?: { name?: string | null } | null;
};

type LocationsListMeta = {
	current_page: number;
	per_page: number;
	total_records: number;
	total_pages: number;
};

const PAGE_SIZE = 9;

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const getListRoot = () => document.querySelector<HTMLElement>('[data-locations-list]');

const getStadiaKey = () => {
	const fromView = document.querySelector<HTMLElement>('.locations-view')?.dataset.stadiaKey;
	return String(fromView || '').trim();
};

const buildLocationCover = (location: LocationItem) => {
	const lat = Number(location.latitude);
	const lng = Number(location.longitude);
	const coords =
		Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
	const mapPreviewUrl = buildStadiaStaticMapUrl(getStadiaKey(), coords, {
		theme: 'dark',
		width: 480,
		height: 270,
		zoom: 15,
	});

	if (mapPreviewUrl) {
		return `
			<div class="locations-card-cover">
				<img
					src="${escapeHtml(mapPreviewUrl)}"
					alt=""
					loading="lazy"
					decoding="async"
					data-location-map-preview
				/>
				${renderBrandMapMarkerOverlay()}
			</div>
		`;
	}

	return `
		<div class="locations-card-cover locations-card-cover--brand" aria-hidden="true">
			${renderBrandMapMarkerOverlay()}
		</div>
	`;
};

const readStateFromUrl = () => {
	const url = new URL(window.location.href);
	const rawPage = Number(url.searchParams.get('page') || '1');
	const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
	const rawIsActive = String(url.searchParams.get('is_active') || '').trim();
	const isActive = rawIsActive === '0' || rawIsActive === '1' ? Number(rawIsActive) : null;
	return { page, isActive };
};

const syncUrl = (state: { page: number; isActive: number | null }) => {
	const url = new URL(window.location.href);
	if (state.page > 1) url.searchParams.set('page', String(state.page));
	else url.searchParams.delete('page');

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

const renderLocationCard = (location: LocationItem) => {
	const name = location.name || `Sucursal #${location.id_location}`;
	const isActive = location.is_active === 1;
	const statusClass = isActive ? 'locations-card-status--active' : 'locations-card-status--inactive';
	const dotClass = isActive ? 'locations-summary-dot--active' : 'locations-summary-dot--inactive';
	const statusLabel = isActive ? 'Activa' : 'Inactiva';
	const address = location.address || 'Dirección no disponible';
	const city = location.city?.name || '-';
	const department = location.department?.name || '-';

	return `
		<article
			class="locations-card group cursor-pointer"
			data-location-card
			data-location-id="${location.id_location}"
			tabindex="0"
			role="button"
			aria-label="Editar sucursal ${escapeHtml(name)}"
		>
			${buildLocationCover(location)}
			<div class="flex items-start justify-between gap-2">
				<div class="locations-card-icon">
					<span class="material-symbols-rounded text-[1.25rem]">storefront</span>
				</div>
				<span class="locations-card-status ${statusClass}">
					<span class="size-1.5 rounded-full ${dotClass}"></span>
					${statusLabel}
				</span>
			</div>
			<div class="locations-card-body">
				<div>
					<h3 class="locations-card-title line-clamp-1">${escapeHtml(name)}</h3>
					<p class="mt-1 text-[0.85rem] text-(--on-surface-variant) line-clamp-1">${escapeHtml(address)}</p>
				</div>
				<dl class="locations-card-metrics">
					<div class="flex items-center justify-between text-[0.8rem]">
						<dt class="locations-card-term">Ciudad</dt>
						<dd class="locations-card-value">${escapeHtml(city)}</dd>
					</div>
					<div class="flex items-center justify-between text-[0.8rem]">
						<dt class="locations-card-term">Depto.</dt>
						<dd class="locations-card-value">${escapeHtml(department)}</dd>
					</div>
				</dl>
			</div>
		</article>
	`;
};

const updateSummaryPills = (locations: LocationItem[]) => {
	const root = getListRoot();
	if (!root) return;

	const activeCount = locations.filter((item) => item.is_active === 1).length;
	const inactiveCount = locations.length - activeCount;

	const activeNode = root.querySelector('[data-locations-active-count]');
	if (activeNode) activeNode.textContent = String(activeCount);

	const inactivePill = root.querySelector<HTMLElement>('[data-locations-inactive-pill]');
	const inactiveCountNode = root.querySelector('[data-locations-inactive-count]');
	if (inactivePill && inactiveCountNode) {
		inactiveCountNode.textContent = String(inactiveCount);
		inactivePill.hidden = inactiveCount <= 0;
	}
};

const updateEmptyOrGrid = (locations: LocationItem[], isActive: number | null) => {
	const root = getListRoot();
	const results = root?.querySelector<HTMLElement>('[data-locations-results]');
	if (!results) return;

	const hasStatusFilter = isActive === 0 || isActive === 1;

	if (locations.length === 0) {
		results.innerHTML = `
			<div class="locations-empty-state" data-locations-empty>
				<div class="locations-empty-icon">
					<span class="material-symbols-rounded text-[2rem]">${hasStatusFilter ? 'search_off' : 'domain'}</span>
				</div>
				<h3 class="text-[1.1rem] font-bold text-(--on-surface)">
					${hasStatusFilter ? 'No se encontraron sucursales' : 'No hay sucursales registradas'}
				</h3>
				<p class="mt-1.5 max-w-sm text-[0.95rem] leading-relaxed text-(--on-surface-variant)">
					${
						hasStatusFilter
							? 'No hay sucursales con ese estado.'
							: 'Aún no has agregado ninguna sucursal a esta organización. Comienza creando tu primer local.'
					}
				</p>
			</div>
		`;
		return;
	}

	results.innerHTML = `
		<div class="material-cards-grid gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4" data-locations-grid>
			${locations.map(renderLocationCard).join('')}
		</div>
	`;
};

const updateFilterUi = (isActive: number | null) => {
	const root = getListRoot();
	if (!root) return;

	const hasStatusFilter = isActive === 0 || isActive === 1;
	const filterBtn = root.querySelector<HTMLButtonElement>('[data-open-locations-status-filter]');
	if (filterBtn) {
		filterBtn.classList.toggle('is-active', hasStatusFilter);
		filterBtn.setAttribute('aria-pressed', hasStatusFilter ? 'true' : 'false');
		let badge = filterBtn.querySelector<HTMLElement>('[data-locations-status-filter-badge]');
		if (hasStatusFilter && !badge) {
			badge = document.createElement('span');
			badge.className = 'panel-status-filter-badge';
			badge.setAttribute('data-locations-status-filter-badge', '');
			badge.setAttribute('aria-hidden', 'true');
			filterBtn.appendChild(badge);
		} else if (!hasStatusFilter && badge) {
			badge.remove();
		}
	}

	root.querySelectorAll<HTMLButtonElement>('[data-locations-status-option]').forEach((option) => {
		const value = String(option.dataset.value || '').trim();
		const selected =
			(value === '' && !hasStatusFilter) ||
			(value === '1' && isActive === 1) ||
			(value === '0' && isActive === 0);
		option.classList.toggle('is-selected', selected);
		option.setAttribute('aria-selected', selected ? 'true' : 'false');
	});
};

const updatePagination = (meta: LocationsListMeta) => {
	const root = getListRoot();
	if (!root) return;

	updateAppPaginationDom(root, {
		currentPage: Number(meta.current_page) || 1,
		totalPages: Number(meta.total_pages) || 1,
		totalRecords: Number(meta.total_records) || 0,
		recordLabel: 'sucursales',
		summarySelector: '[data-locations-pagination-summary]',
		pagesSelector: '[data-locations-pagination-pages]',
		prevSelector: '[data-locations-page-prev]',
		nextSelector: '[data-locations-page-next]',
		pageDataAttr: 'data-locations-page',
	});
};

let loadRequestId = 0;
let isLoading = false;

const loadLocations = async (state: { page: number; isActive: number | null }) => {
	const requestId = ++loadRequestId;
	isLoading = true;

	try {
		const query = new URLSearchParams({
			page: String(state.page),
			limit: String(PAGE_SIZE),
		});
		if (state.isActive === 0 || state.isActive === 1) {
			query.set('is_active', String(state.isActive));
		}

		const response = await fetch(`/api/locations?${query.toString()}`, {
			headers: { Accept: 'application/json' },
		});
		const payload = await response.json().catch(() => ({}));
		if (requestId !== loadRequestId) return;

		if (!response.ok || payload?.status === 'error') {
			throw new Error(
				typeof payload?.message === 'string'
					? payload.message
					: 'No fue posible cargar el listado de sucursales.'
			);
		}

		const locations = Array.isArray(payload?.data) ? (payload.data as LocationItem[]) : [];
		const meta = (payload?.meta || {}) as Partial<LocationsListMeta>;
		const normalizedMeta: LocationsListMeta = {
			current_page: Number(meta.current_page) || state.page,
			per_page: Number(meta.per_page) || PAGE_SIZE,
			total_records: Number(meta.total_records) || locations.length,
			total_pages: Math.max(1, Number(meta.total_pages) || 1),
		};

		syncUrl({
			page: normalizedMeta.current_page,
			isActive: state.isActive,
		});
		updateSummaryPills(locations);
		updateEmptyOrGrid(locations, state.isActive);
		updateFilterUi(state.isActive);
		updatePagination(normalizedMeta);
	} catch (error) {
		if (requestId !== loadRequestId) return;
		console.error(error);
	} finally {
		if (requestId === loadRequestId) isLoading = false;
	}
};

export const initLocationsListControls = () => {
	if ((window as unknown as { __locationsListControlsInit?: boolean }).__locationsListControlsInit) {
		return;
	}
	(window as unknown as { __locationsListControlsInit?: boolean }).__locationsListControlsInit = true;

	const sheet = document.querySelector<HTMLDialogElement>('[data-locations-status-filter-sheet]');
	const getTrigger = () =>
		document.querySelector<HTMLElement>('[data-open-locations-status-filter]');
	if (sheet) {
		bindFilterPopoverChrome({ sheet, getTrigger });
	}

	document.addEventListener('click', (event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;

		const openBtn = target.closest<HTMLButtonElement>('[data-open-locations-status-filter]');
		if (openBtn) {
			event.preventDefault();
			event.stopPropagation();
			toggleFilterPopoverSheet(sheet, openBtn);
			return;
		}

		const closeBtn = target.closest<HTMLButtonElement>('[data-close-locations-status-filter]');
		if (closeBtn) {
			closeFilterPopoverSheet(sheet, getTrigger());
			return;
		}

		const option = target.closest<HTMLButtonElement>('[data-locations-status-option]');
		if (option) {
			const nextValue = String(option.dataset.value || '').trim();
			const current = readStateFromUrl();
			const nextIsActive =
				nextValue === '0' || nextValue === '1' ? Number(nextValue) : null;
			closeFilterPopoverSheet(sheet, getTrigger());

			if (nextIsActive === current.isActive) return;
			void loadLocations({
				page: 1,
				isActive: nextIsActive,
			});
			return;
		}

		const pageBtn = target.closest<HTMLButtonElement>(
			'[data-locations-page-prev], [data-locations-page-next], [data-locations-page]'
		);
		if (pageBtn && !pageBtn.disabled && !isLoading) {
			const nextPage = Number(pageBtn.dataset.page || pageBtn.dataset.locationsPage || '1');
			if (!Number.isInteger(nextPage) || nextPage <= 0) return;
			const current = readStateFromUrl();
			if (nextPage === current.page) return;
			void loadLocations({
				page: nextPage,
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
