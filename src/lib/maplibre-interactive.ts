/**
 * MapLibre GL interactivo — import dinámico de maplibre-gl (modal / mapas en vivo).
 */

import {
	BRAND_MAP_MARKER_COLOR,
	createBrandMarkerElement,
	type MapCoordinates,
	type MapTheme,
} from './maplibre-static';

export type { MapCoordinates, MapTheme } from './maplibre-static';
export {
	BRAND_MAP_MARKER_COLOR,
	buildStadiaStaticMapUrl,
	coordsToLngLat,
	createBrandMarkerElement,
	LOCATION_CARD_STATIC_MAP_OPTIONS,
	HUB_LOCATION_CARD_COVER_OPTIONS,
	HUB_LOCATION_CARD_STATIC_MAP_OPTIONS,
	parseCoordinates,
	renderBrandMapMarkerOverlay,
	resolveMapTheme,
	resolveMapThemeFromStorage,
} from './maplibre-static';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MapLibreModule = typeof import('maplibre-gl');

const STADIA_STYLE_URLS: Record<MapTheme, string> = {
	dark: 'https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json',
	light: 'https://tiles.stadiamaps.com/styles/alidade_smooth.json',
};

let mapLibrePromise: Promise<MapLibreModule> | null = null;
let cssInjected = false;
let workerConfigured = false;

const ensureMapLibreCss = async () => {
	if (cssInjected || typeof document === 'undefined') return;
	cssInjected = true;
	await import('maplibre-gl/dist/maplibre-gl.css');
};

const resolveWorkerUrl = (rawUrl: string): string => {
	const raw = String(rawUrl || '').trim();
	if (!raw) {
		throw new Error('No se pudo resolver la URL del worker de MapLibre.');
	}
	if (raw.startsWith('blob:') || raw.startsWith('http://') || raw.startsWith('https://')) {
		return raw;
	}
	if (raw.startsWith('file:')) {
		throw new Error(
			'La URL del worker de MapLibre no puede ser file:// en el navegador.',
		);
	}
	return new URL(raw, window.location.origin).href;
};

const configureWorker = async (maplibregl: MapLibreModule) => {
	if (workerConfigured || typeof document === 'undefined') return;
	workerConfigured = true;
	const workerUrl = (await import('maplibre-gl/dist/maplibre-gl-worker.mjs?url')).default;
	maplibregl.setWorkerUrl(resolveWorkerUrl(workerUrl));
};

export type MapLibreMap = InstanceType<MapLibreModule['Map']>;

export const whenMapIdle = (map: MapLibreMap): Promise<void> =>
	new Promise((resolve) => {
		if (map.loaded() && !map.isMoving()) {
			resolve();
			return;
		}
		const finish = () => {
			map.off('idle', finish);
			resolve();
		};
		map.once('idle', finish);
	});

const containerHasSize = (el: HTMLElement) =>
	el.clientWidth >= 32 && el.clientHeight >= 32;

/** Espera a que el contenedor tenga layout real (pestaña/hash/dialog). */
export const whenMapContainerReady = (
	el: HTMLElement,
	timeoutMs = 4000,
): Promise<void> =>
	new Promise((resolve) => {
		let lastW = 0;
		let lastH = 0;
		let stableTicks = 0;
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			ro.disconnect();
			window.clearTimeout(timer);
			resolve();
		};
		const check = () => {
			const w = el.clientWidth;
			const h = el.clientHeight;
			if (!containerHasSize(el)) {
				stableTicks = 0;
				lastW = w;
				lastH = h;
				return;
			}
			if (w === lastW && h === lastH) {
				stableTicks += 1;
				if (stableTicks >= 2) finish();
				return;
			}
			stableTicks = 1;
			lastW = w;
			lastH = h;
		};
		const ro = new ResizeObserver(() => check());
		ro.observe(el);
		if (containerHasSize(el)) {
			lastW = el.clientWidth;
			lastH = el.clientHeight;
			stableTicks = 1;
			requestAnimationFrame(() => {
				if (containerHasSize(el)) finish();
			});
		}
		const timer = window.setTimeout(finish, timeoutMs);
	});

export const layoutMapLibreMap = (
	map: MapLibreMap,
	center?: MapCoordinates,
) => {
	try {
		map.resize();
	} catch {
		// ignore
	}
	if (center) {
		try {
			map.jumpTo({ center: [center.lng, center.lat] });
		} catch {
			map.setCenter([center.lng, center.lat]);
		}
	}
};

/** Recalcula tamaño y centro tras animaciones de dialog/bottom-sheet. */
export const scheduleMapLayout = (map: MapLibreMap, center?: MapCoordinates) => {
	const run = () => layoutMapLibreMap(map, center);
	run();
	requestAnimationFrame(() => {
		run();
		requestAnimationFrame(run);
	});
	window.setTimeout(run, 80);
	window.setTimeout(run, 360);
};

export const observeMapContainerResize = (
	container: HTMLElement,
	map: MapLibreMap,
	getCenter?: () => MapCoordinates | undefined,
) => {
	const ro = new ResizeObserver(() => {
		if (!containerHasSize(container)) return;
		layoutMapLibreMap(map, getCenter?.());
	});
	ro.observe(container);
	return () => ro.disconnect();
};

export const loadMapLibre = (): Promise<MapLibreModule> => {
	if (!mapLibrePromise) {
		mapLibrePromise = (async () => {
			await ensureMapLibreCss();
			const maplibregl = await import('maplibre-gl');
			await configureWorker(maplibregl);
			return maplibregl;
		})().catch((error) => {
			mapLibrePromise = null;
			workerConfigured = false;
			throw error;
		});
	}
	return mapLibrePromise;
};

export const getStadiaStyleUrl = (theme: MapTheme, apiKey: string): string => {
	const base = STADIA_STYLE_URLS[theme] || STADIA_STYLE_URLS.dark;
	const key = String(apiKey || '').trim();
	if (!key) return base;
	return `${base}?api_key=${encodeURIComponent(key)}`;
};

export const MAPLIBRE_ES_UI_LOCALE = {
	'CooperativeGesturesHandler.WindowsHelpText':
		'Usá Ctrl + scroll para hacer zoom en el mapa',
	'CooperativeGesturesHandler.MacHelpText': 'Usá ⌘ + scroll para hacer zoom en el mapa',
	'CooperativeGesturesHandler.MobileHelpText': 'Usá dos dedos para mover el mapa',
} as const;

export const createBrandMarker = (
	maplibregl: MapLibreModule,
	coords: MapCoordinates,
	options: { color?: string; title?: string } = {},
) => {
	const color = options.color || BRAND_MAP_MARKER_COLOR;
	const wrapper = document.createElement('div');
	wrapper.className = 'bookmate-map-marker-wrap';
	wrapper.style.pointerEvents = 'none';
	wrapper.style.width = '28px';
	wrapper.style.height = '36px';
	wrapper.style.lineHeight = '0';
	wrapper.appendChild(createBrandMarkerElement(color));
	const marker = new maplibregl.Marker({
		element: wrapper,
		anchor: 'bottom',
	}).setLngLat([coords.lng, coords.lat]);

	if (options.title) {
		wrapper.setAttribute('aria-label', options.title);
		wrapper.setAttribute('title', options.title);
	}
	return marker;
};
