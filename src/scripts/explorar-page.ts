import type {
	OrgDirectoryCity,
	OrgDirectoryFacets,
	OrgDirectoryItem,
	OrgDirectorySpecialty,
} from '../lib/public-org-directory';
import {
	createBrandMarker,
	createStadiaTransformRequest,
	getStadiaStyleUrl,
	layoutMapLibreMap,
	loadMapLibre,
	MAPLIBRE_ES_UI_LOCALE,
	resolveMapTheme,
	type MapLibreMap,
} from '../lib/maplibre-interactive';

type ExplorarPagePayload = {
	items: OrgDirectoryItem[];
	facets: OrgDirectoryFacets;
	hasCoords: boolean;
	stadiaKey: string;
};

const parsePayload = (): ExplorarPagePayload | null => {
	const root = document.querySelector<HTMLElement>('[data-explorar-root]');
	if (!root) return null;
	try {
		return JSON.parse(root.dataset.explorarPayload || '') as ExplorarPagePayload;
	} catch {
		return null;
	}
};

const buildSuggestItems = (
	query: string,
	facets: OrgDirectoryFacets,
	items: OrgDirectoryItem[]
) => {
	const q = query.trim().toLowerCase();
	if (!q) return [];

	const results: Array<{ label: string; meta?: string; href: string }> = [];
	const seen = new Set<string>();

	const push = (label: string, href: string, meta?: string) => {
		const key = `${label}|${href}`;
		if (seen.has(key)) return;
		seen.add(key);
		results.push({ label, href, meta });
	};

	items
		.filter((item) => item.name.toLowerCase().includes(q))
		.slice(0, 5)
		.forEach((item) => push(item.name, `/${encodeURIComponent(item.slug)}`, item.city_name));

	facets.specialties
		.filter(
			(spec: OrgDirectorySpecialty) =>
				spec.label.toLowerCase().includes(q) || spec.code.toLowerCase().includes(q)
		)
		.slice(0, 4)
		.forEach((spec) => {
			const url = new URL('/explorar', window.location.origin);
			url.searchParams.set('specialty', spec.code);
			push(spec.label, `${url.pathname}${url.search}`, 'Rubro');
		});

	facets.cities
		.filter((city: OrgDirectoryCity) => city.name.toLowerCase().includes(q))
		.slice(0, 4)
		.forEach((city) => {
			const url = new URL('/explorar', window.location.origin);
			url.searchParams.set('city_id', String(city.id));
			push(city.name, `${url.pathname}${url.search}`, 'Ciudad');
		});

	return results.slice(0, 8);
};

const closeExplorarCombos = (except?: HTMLElement | null) => {
	document.querySelectorAll<HTMLElement>('[data-explorar-combo].is-open').forEach((root) => {
		if (except && root === except) return;
		root.classList.remove('is-open');
		const menu = root.querySelector<HTMLElement>('[data-explorar-combo-menu]');
		const trigger = root.querySelector<HTMLButtonElement>('[data-explorar-combo-trigger]');
		if (menu) menu.hidden = true;
		trigger?.setAttribute('aria-expanded', 'false');
	});
};

const initCombos = () => {
	document.querySelectorAll<HTMLElement>('[data-explorar-combo]').forEach((root) => {
		if (root.dataset.explorarComboReady === '1') return;
		const select = root.querySelector('select');
		const trigger = root.querySelector<HTMLButtonElement>('[data-explorar-combo-trigger]');
		const valueNode = root.querySelector('[data-explorar-combo-value]');
		const menu = root.querySelector<HTMLElement>('[data-explorar-combo-menu]');
		if (!select || !trigger || !valueNode || !menu) return;

		root.dataset.explorarComboReady = '1';

		const sync = () => {
			const selected = select.selectedOptions[0];
			valueNode.textContent = selected?.textContent?.trim() || '';
			menu.replaceChildren(
				...Array.from(select.options).map((option) => {
					const button = document.createElement('button');
					button.type = 'button';
					button.className = 'explorar-combo__option';
					button.setAttribute('role', 'option');
					button.setAttribute('aria-selected', option.selected ? 'true' : 'false');
					button.classList.toggle('is-selected', option.selected);
					button.dataset.value = option.value;
					button.textContent = option.textContent;
					return button;
				})
			);
		};

		const setOpen = (open: boolean) => {
			if (open) closeExplorarCombos(root);
			menu.hidden = !open;
			trigger.setAttribute('aria-expanded', String(open));
			root.classList.toggle('is-open', open);
			if (open) sync();
		};

		sync();

		trigger.addEventListener('click', (event) => {
			event.preventDefault();
			setOpen(!root.classList.contains('is-open'));
		});

		root.addEventListener('click', (event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			if (target.closest('[data-explorar-combo-trigger], [data-explorar-combo-menu]')) return;
			trigger.click();
		});

		menu.addEventListener('click', (event) => {
			const option = (event.target as Element).closest<HTMLButtonElement>('[data-value]');
			if (!option) return;
			event.stopPropagation();
			select.value = option.dataset.value || '';
			sync();
			setOpen(false);
		});
	});
};

const bindComboChrome = () => {
	if (document.documentElement.dataset.explorarComboChrome === '1') return;
	document.documentElement.dataset.explorarComboChrome = '1';

	document.addEventListener('pointerdown', (event) => {
		const target = event.target;
		if (!(target instanceof Element) || target.closest('[data-explorar-combo]')) return;
		closeExplorarCombos();
	});

	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') closeExplorarCombos();
	});
};

const initSearchForm = () => {
	const form = document.querySelector<HTMLFormElement>('.explorar-search');
	if (!form || form.dataset.explorarFormReady === '1') return;
	form.dataset.explorarFormReady = '1';
	form.addEventListener('submit', () => {
		form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[name]').forEach((field) => {
			if (!String(field.value || '').trim()) field.disabled = true;
		});
	});
};

const initSuggest = (payload: ExplorarPagePayload) => {
	const field = document.querySelector<HTMLElement>('[data-explorar-query-field]');
	const input = document.querySelector<HTMLInputElement>('[data-explorar-query-input]');
	const list = document.querySelector<HTMLUListElement>('[data-explorar-suggest]');
	if (!field || !input || !list) return;

	const render = () => {
		const items = buildSuggestItems(input.value, payload.facets, payload.items);
		list.innerHTML = '';
		if (!items.length) {
			list.classList.remove('is-open');
			return;
		}
		items.forEach((item) => {
			const li = document.createElement('li');
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'explorar-suggest__item';
			btn.innerHTML = item.meta
				? `${item.label}<span class="explorar-suggest__meta">${item.meta}</span>`
				: item.label;
			btn.addEventListener('mousedown', (event) => {
				event.preventDefault();
				window.location.assign(item.href);
			});
			li.appendChild(btn);
			list.appendChild(li);
		});
		list.classList.add('is-open');
	};

	input.addEventListener('input', render);
	input.addEventListener('focus', render);
	document.addEventListener('click', (event) => {
		if (!field.contains(event.target as Node)) {
			list.classList.remove('is-open');
		}
	});
};

const initMap = async (payload: ExplorarPagePayload): Promise<MapLibreMap | null> => {
	const container = document.querySelector<HTMLElement>('[data-explorar-map]');
	if (!container || !payload.stadiaKey) return null;

	const coordsItems = payload.items.filter(
		(item) =>
			typeof item.latitude === 'number' &&
			typeof item.longitude === 'number' &&
			Number.isFinite(item.latitude) &&
			Number.isFinite(item.longitude)
	);
	if (!coordsItems.length) return null;

	const maplibregl = await loadMapLibre();
	const first = coordsItems[0]!;
	const map = new maplibregl.Map({
		container,
		style: getStadiaStyleUrl(resolveMapTheme(), payload.stadiaKey),
		center: [first.longitude!, first.latitude!],
		zoom: 11,
		locale: MAPLIBRE_ES_UI_LOCALE,
		transformRequest: createStadiaTransformRequest(payload.stadiaKey),
	});

	map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

	await new Promise<void>((resolve) => {
		map.once('load', () => resolve());
	});

	coordsItems.forEach((item) => {
		const popup = new maplibregl.Popup({ offset: 16, closeButton: false }).setHTML(
			`<strong>${item.name}</strong><br/><a href="/${encodeURIComponent(item.slug)}">Ver negocio</a>`
		);
		const marker = createBrandMarker(
			maplibregl,
			{ lat: item.latitude!, lng: item.longitude! },
			{ title: item.name }
		)
			.setPopup(popup)
			.addTo(map);
		marker.getElement()?.addEventListener('click', () => {
			document
				.querySelectorAll<HTMLElement>('[data-explorar-card]')
				.forEach((card) => card.classList.remove('is-highlighted'));
			document
				.querySelector<HTMLElement>(`[data-explorar-slug="${CSS.escape(item.slug)}"]`)
				?.classList.add('is-highlighted');
		});
	});

	if (coordsItems.length > 1) {
		const bounds = new maplibregl.LngLatBounds();
		coordsItems.forEach((item) => bounds.extend([item.longitude!, item.latitude!]));
		map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 0 });
	}

	layoutMapLibreMap(map);
	return map;
};

const initViewToggle = (payload: ExplorarPagePayload) => {
	const toggle = document.querySelector<HTMLElement>('[data-explorar-view-toggle]');
	const body = document.querySelector<HTMLElement>('[data-explorar-body]');
	const listBtn = document.querySelector<HTMLButtonElement>('[data-explorar-view-list]');
	const mapBtn = document.querySelector<HTMLButtonElement>('[data-explorar-view-map]');
	if (!toggle || !body || !listBtn || !mapBtn || !payload.hasCoords) {
		toggle?.classList.add('is-hidden');
		return;
	}

	let mapReady = false;
	let mapInstance: MapLibreMap | null = null;

	const mapPanel = document.querySelector<HTMLElement>('.explorar-map-panel');

	const refreshMapLayout = () => {
		if (!mapInstance) return;
		window.setTimeout(() => layoutMapLibreMap(mapInstance!), 80);
	};

	const setView = (view: 'list' | 'map') => {
		const isMap = view === 'map';
		body.classList.toggle('is-map-view', isMap);
		listBtn.classList.toggle('is-active', !isMap);
		mapBtn.classList.toggle('is-active', isMap);
		listBtn.setAttribute('aria-pressed', String(!isMap));
		mapBtn.setAttribute('aria-pressed', String(isMap));
		mapPanel?.setAttribute('aria-hidden', String(!isMap));
		if (isMap && !mapReady) {
			void initMap(payload).then((map) => {
				mapInstance = map;
				mapReady = Boolean(map);
				refreshMapLayout();
			});
		} else if (isMap) {
			refreshMapLayout();
		}
	};

	listBtn.addEventListener('click', () => setView('list'));
	mapBtn.addEventListener('click', () => setView('map'));
};

const initExplorarPage = () => {
	const payload = parsePayload();
	if (!payload) return;
	initCombos();
	bindComboChrome();
	initSearchForm();
	initSuggest(payload);
	initViewToggle(payload);
};

initExplorarPage();
document.addEventListener('astro:page-load', initExplorarPage);
