/**
 * Utilidades MapLibre sin cargar maplibre-gl (static maps, tema, markers HTML).
 */

export type MapCoordinates = { lat: number; lng: number };
export type MapTheme = 'dark' | 'light';

const STADIA_STATIC_STYLES: Record<MapTheme, string> = {
	dark: 'alidade_smooth_dark',
	light: 'alidade_smooth',
};

/** Miniatura en cards horizontales (~35% ancho; CSS ~108–160px). Sin @2x: suficiente en grid. */
export const LOCATION_CARD_STATIC_MAP_OPTIONS = {
	width: 160,
	height: 160,
	zoom: 15,
	retina: false,
	includeMarker: false,
} as const;

/** Banner 16:9 en cards del hub público (pestaña Sucursales). */
export const HUB_LOCATION_CARD_STATIC_MAP_OPTIONS = {
	width: 640,
	height: 360,
	zoom: 15,
	retina: false,
	includeMarker: false,
} as const;

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
		/** Si es false, el mapa no incluye pin de Stadia (usar `renderBrandMapMarkerOverlay`). */
		includeMarker?: boolean;
	} = {},
): string | null => {
	const key = String(apiKey || '').trim();
	if (!key || !coords) return null;
	if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return null;

	const theme = options.theme || 'dark';
	const width = Math.max(64, Math.min(1024, Math.round(options.width ?? 480)));
	const height = Math.max(64, Math.min(1024, Math.round(options.height ?? 270)));
	const zoom = Math.max(0, Math.min(18, Math.round(options.zoom ?? 15)));
	const scale = options.retina === false ? '' : '@2x';
	const style = STADIA_STATIC_STYLES[theme] || STADIA_STATIC_STYLES.dark;
	const includeMarker = options.includeMarker === true;

	const params = new URLSearchParams({
		center: `${coords.lat},${coords.lng}`,
		zoom: String(zoom),
		size: `${width}x${height}${scale}`,
		api_key: key,
	});
	if (includeMarker) {
		const markerColor = String(options.markerColor || 'FB7185').replace(/^#/, '');
		params.append('markers', `${coords.lat},${coords.lng},,${markerColor}`);
	}

	return `https://tiles.stadiamaps.com/static/${style}.png?${params.toString()}`;
};

/** SSR / cookie / localStorage: mismo criterio que `setBookmateTheme` (default dark). */
export const resolveMapThemeFromStorage = (stored?: string | null): MapTheme =>
	stored === 'light' ? 'light' : 'dark';

export const resolveMapTheme = (root?: Element | null): MapTheme => {
	if (typeof document === 'undefined') return 'dark';
	const explicit = (root ?? document.documentElement).getAttribute('data-theme');
	if (explicit === 'light' || explicit === 'dark') return explicit;
	try {
		return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
	} catch {
		return 'dark';
	}
};

export const coordsToLngLat = (coords: MapCoordinates): [number, number] => [coords.lng, coords.lat];

export const parseCoordinates = (
	latitude: unknown,
	longitude: unknown,
): MapCoordinates | null => {
	const lat = Number(latitude);
	const lng = Number(longitude);
	return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

export const BRAND_MAP_MARKER_COLOR = '#FB7185';

export const buildBrandMarkerSvgHtml = (color = BRAND_MAP_MARKER_COLOR): string =>
	`<svg viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg" focusable="false">
		<path fill="${color}" d="M14 0C7.373 0 2 5.373 2 12c0 8.25 10 22 12 22s12-13.75 12-22C26 5.373 20.627 0 14 0z"/>
		<circle cx="14" cy="12" r="4.5" fill="#fff"/>
	</svg>`;

export const renderBrandMapMarkerOverlay = (
	color = BRAND_MAP_MARKER_COLOR,
): string =>
	`<span class="bookmate-map-marker-overlay" aria-hidden="true">${buildBrandMarkerSvgHtml(color)}</span>`;

const MARKER_ELEMENT_CSS = `
.bookmate-map-marker,
.bookmate-map-marker-overlay{
	width:28px;
	height:36px;
	display:block;
	pointer-events:none;
	filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));
}
.bookmate-map-marker svg,
.bookmate-map-marker-overlay svg{display:block;width:28px;height:36px}
.bookmate-map-marker-overlay{
	position:absolute;
	left:50%;
	top:50%;
	transform:translate(-50%,-100%);
	z-index:1;
}
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

export const createBrandMarkerElement = (color = BRAND_MAP_MARKER_COLOR): HTMLDivElement => {
	ensureMarkerCss();
	const el = document.createElement('div');
	el.className = 'bookmate-map-marker';
	el.setAttribute('aria-hidden', 'true');
	el.innerHTML = buildBrandMarkerSvgHtml(color);
	return el;
};
