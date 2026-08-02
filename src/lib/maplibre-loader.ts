/**
 * Loader compartido de MapLibre GL + estilos Stadia Maps.
 *
 * - `loadMapLibre()`: import dinámico memoizado del módulo `maplibre-gl` + su CSS.
 * - `getStadiaStyleUrl(theme, key)`: URL del `style.json` según tema.
 * - `resolveMapTheme(root?)`: deriva `dark | light` desde `data-theme` o `prefers-color-scheme`.
 *
 * Único lugar que conoce la key pública y los estilos.
 *
 * MapLibre v6 + Vite: el worker no se resuelve solo desde el dep optimizer
 * (MIME vacío en `/node_modules/.vite/deps/maplibre-gl-worker.mjs`). Hay que
 * pasar la URL del worker con `?worker&url` y `setWorkerUrl()`.
 */

export type MapCoordinates = { lat: number; lng: number };
export type MapTheme = 'dark' | 'light';

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
	// El CSS se importa junto al bundle para evitar FOUC de controles y popups.
	await import('maplibre-gl/dist/maplibre-gl.css');
};

const resolveWorkerUrl = (rawUrl: string): string => {
	const raw = String(rawUrl || '').trim();
	if (!raw) {
		throw new Error('No se pudo resolver la URL del worker de MapLibre.');
	}
	// Evita file:// (Firefox bloquea workers/scripts file:// desde http://).
	if (raw.startsWith('file:')) {
		return new URL(
			'/node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs',
			window.location.origin,
		).href;
	}
	if (raw.startsWith('blob:') || raw.startsWith('http://') || raw.startsWith('https://')) {
		return raw;
	}
	return new URL(raw, window.location.origin).href;
};

const configureWorker = async (maplibregl: MapLibreModule) => {
	if (workerConfigured || typeof document === 'undefined') return;
	workerConfigured = true;
	// `?worker&url` pasa el archivo por el pipeline de workers de Vite y emite
	// un chunk self-contained con MIME correcto (dev + prod).
	const workerUrl = (
		await import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url')
	).default;
	maplibregl.setWorkerUrl(resolveWorkerUrl(workerUrl));
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

const STADIA_STATIC_STYLES: Record<MapTheme, string> = {
	dark: 'alidade_smooth_dark',
	light: 'alidade_smooth',
};

/**
 * Miniatura Static Maps de Stadia (panel / covers).
 * Devuelve `null` si faltan key o coordenadas.
 */
export const buildStadiaStaticMapUrl = (
	apiKey: string,
	coords: MapCoordinates | null | undefined,
	options: {
		theme?: MapTheme;
		width?: number;
		height?: number;
		zoom?: number;
		retina?: boolean;
		markerColor?: string;
	} = {},
): string | null => {
	const key = String(apiKey || '').trim();
	if (!key || !coords) return null;
	if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return null;

	const theme = options.theme || 'dark';
	const width = Math.max(256, Math.min(1024, Math.round(options.width ?? 480)));
	const height = Math.max(64, Math.min(1024, Math.round(options.height ?? 270)));
	const zoom = Math.max(0, Math.min(18, Math.round(options.zoom ?? 15)));
	const scale = options.retina === false ? '' : '@2x';
	const style = STADIA_STATIC_STYLES[theme] || STADIA_STATIC_STYLES.dark;
	const markerColor = String(options.markerColor || 'FB7185').replace(/^#/, '');

	const params = new URLSearchParams({
		center: `${coords.lat},${coords.lng}`,
		zoom: String(zoom),
		size: `${width}x${height}${scale}`,
		api_key: key,
	});
	// style vacío + color → pin recoloreado del estilo del mapa.
	params.append('markers', `${coords.lat},${coords.lng},,${markerColor}`);

	return `https://tiles.stadiamaps.com/static/${style}.png?${params.toString()}`;
};

export const resolveMapTheme = (root?: Element | null): MapTheme => {
	if (typeof document === 'undefined') return 'dark';
	const explicit = (root ?? document.documentElement).getAttribute('data-theme');
	if (explicit === 'light') return 'light';
	if (explicit === 'dark') return 'dark';
	try {
		return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
	} catch {
		return 'dark';
	}
};

export const coordsToLngLat = (coords: MapCoordinates): [number, number] => [coords.lng, coords.lat];

/**
 * Convierte lat/lng arbitrarios a `MapCoordinates` si ambos son finitos.
 */
export const parseCoordinates = (
	latitude: unknown,
	longitude: unknown,
): MapCoordinates | null => {
	const lat = Number(latitude);
	const lng = Number(longitude);
	return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

const MARKER_ELEMENT_CSS = `
.bookmate-map-marker{
	width:28px;
	height:36px;
	display:block;
	pointer-events:none;
	z-index:2;
	filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));
}
.bookmate-map-marker svg{display:block;width:28px;height:36px}
`;

let markerCssInjected = false;

const ensureMarkerCss = () => {
	if (markerCssInjected || typeof document === 'undefined') return;
	markerCssInjected = true;
	const style = document.createElement('style');
	style.dataset.bookmateMapMarker = 'true';
	style.textContent = MARKER_ELEMENT_CSS;
	document.head.appendChild(style);
};

/** Pin HTML propio (evita el SVG default de MapLibre que a veces queda bajo el canvas). */
export const createBrandMarkerElement = (color = '#FB7185'): HTMLDivElement => {
	ensureMarkerCss();
	const el = document.createElement('div');
	el.className = 'bookmate-map-marker';
	el.setAttribute('aria-hidden', 'true');
	el.innerHTML = `<svg viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg" focusable="false">
		<path fill="${color}" d="M14 0C7.373 0 2 5.373 2 12c0 8.25 10 22 12 22s12-13.75 12-22C26 5.373 20.627 0 14 0z"/>
		<circle cx="14" cy="12" r="4.5" fill="#fff"/>
	</svg>`;
	return el;
};

export const createBrandMarker = (
	maplibregl: MapLibreModule,
	coords: MapCoordinates,
	options: { color?: string; title?: string } = {},
) => {
	const color = options.color || '#FB7185';
	const marker = new maplibregl.Marker({
		element: createBrandMarkerElement(color),
		anchor: 'bottom',
		color,
	}).setLngLat([coords.lng, coords.lat]);

	if (options.title) {
		marker.getElement().setAttribute('aria-label', options.title);
		marker.getElement().setAttribute('title', options.title);
	}
	return marker;
};
