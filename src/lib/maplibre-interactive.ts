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

export const whenMapIdle = (
	map: InstanceType<MapLibreModule['Map']>,
): Promise<void> =>
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
	wrapper.style.pointerEvents = 'none';
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
