import {
	createBrandMarker,
	getStadiaStyleUrl,
	loadMapLibre,
	resolveMapTheme,
	type MapLibreModule,
} from '../../lib/maplibre-loader';

export type MapLocation = {
	id_location: number;
	name?: string;
	address?: string;
	latitude?: number;
	longitude?: number;
};

type Coordinates = { lat: number; lng: number };
type MapLibreMap = InstanceType<MapLibreModule['Map']>;
type MapLibreMarker = InstanceType<MapLibreModule['Marker']>;

class PublicLocationMapError extends Error {
	status: number;

	constructor(message: string, status = 500) {
		super(message);
		this.name = 'PublicLocationMapError';
		this.status = status;
	}
}

const toPositiveInt = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const readApiMessage = (data: unknown, fallbackMessage: string) => {
	const message =
		data && typeof data === 'object' && typeof (data as { message?: unknown }).message === 'string'
			? String((data as { message: string }).message).trim()
			: '';
	return message || fallbackMessage;
};

const isGenericLocationFallbackName = (value: string) => /^Sucursal #\d+$/i.test(String(value || '').trim());

const resolveLocationDisplayName = (fetchedName: string, existingName?: string) => {
	const fetched = String(fetchedName || '').trim();
	const existing = String(existingName || '').trim();
	if (!fetched) return existing;
	if (isGenericLocationFallbackName(fetched) && existing) return existing;
	return fetched;
};

const fetchJson = async <T>(url: string, init: RequestInit, fallbackMessage: string) => {
	const response = await fetch(url, init);
	const data = (await response.json().catch(() => null)) as T & { status?: string; message?: string };

	if (!response.ok || !data || data.status !== 'success') {
		throw new PublicLocationMapError(readApiMessage(data, fallbackMessage), response.status || 500);
	}

	return { response, data };
};

export type PublicUserMapController = {
	canShowLocationMap: (location: MapLocation | null | undefined) => boolean;
	openLocationMap: (
		location: MapLocation | null | undefined,
		options?: { fetchCoordinates?: boolean }
	) => Promise<void>;
};

export const createPublicUserMapController = (options: {
	root: HTMLElement;
	signal: AbortSignal;
	onLocationUpdated?: (updated: MapLocation) => void;
}): PublicUserMapController | null => {
	const stadiaKey = String(options.root.dataset.stadiaKey || '').trim();
	const mapModal = options.root.querySelector<HTMLDialogElement>('[data-public-map-modal]');
	const mapCanvasWrap = options.root.querySelector<HTMLElement>('.public-map-canvas-wrap');
	const mapCanvas = options.root.querySelector<HTMLElement>('[data-public-map-canvas]');
	const mapLoading = options.root.querySelector<HTMLElement>('[data-public-map-loading]');
	const mapAddress = options.root.querySelector<HTMLElement>('[data-public-map-address]');
	const mapStatus = options.root.querySelector<HTMLElement>('[data-public-map-status]');
	const mapCloseButton = options.root.querySelector<HTMLButtonElement>('[data-public-map-close]');

	if (!mapModal || !mapCanvas || !mapCloseButton) return null;

	let mapLibre: MapLibreModule | null = null;
	let mapInstance: MapLibreMap | null = null;
	let mapMarker: MapLibreMarker | null = null;
	let mapOpenSeq = 0;

	const setMapStatus = (message: string) => {
		if (!mapStatus) return;
		mapStatus.textContent = message;
		mapStatus.classList.toggle('hidden', !message.trim());
	};

	const setMapLoading = (isLoading: boolean) => {
		if (mapLoading) {
			mapLoading.classList.toggle('hidden', !isLoading);
			mapLoading.setAttribute('aria-hidden', isLoading ? 'false' : 'true');
		}
		mapCanvasWrap?.classList.toggle('is-loading', isLoading);
	};

	const getLocationCoordinatesFrom = (location: MapLocation | null | undefined): Coordinates | null => {
		const lat = Number(location?.latitude);
		const lng = Number(location?.longitude);
		return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
	};

	const canShowLocationMap = (location: MapLocation | null | undefined) =>
		Boolean(location && toPositiveInt(location.id_location, 0));

	const fetchPublicLocationDetails = async (location: MapLocation): Promise<MapLocation> => {
		const { data } = await fetchJson<{ data?: unknown[] | Record<string, unknown> }>(
			`/api/public/locations/${location.id_location}`,
			{
				method: 'GET',
				headers: { Accept: 'application/json' },
				cache: 'no-store',
			},
			'No fue posible obtener la ubicación.'
		);

		const item = Array.isArray(data.data) ? data.data[0] : data.data;
		if (!item || typeof item !== 'object') {
			throw new PublicLocationMapError('No fue posible obtener la ubicación.', 502);
		}

		const source = item as Record<string, unknown>;
		const latitude = Number(source.latitude);
		const longitude = Number(source.longitude);

		return {
			...location,
			name: resolveLocationDisplayName(
				String(source.name || ''),
				String(location.name || '')
			),
			address: String(source.address || location.address || '').trim(),
			latitude: Number.isFinite(latitude) ? latitude : location.latitude,
			longitude: Number.isFinite(longitude) ? longitude : location.longitude,
		};
	};

	const ensureMapLibre = async (): Promise<MapLibreModule> => {
		if (!stadiaKey) {
			throw new Error('No se encontró la API key de Stadia Maps para mostrar la ubicación.');
		}
		if (!mapLibre) mapLibre = await loadMapLibre();
		return mapLibre;
	};

	const openLocationMap = async (
		location: MapLocation | null | undefined,
		openOptions: { fetchCoordinates?: boolean } = {}
	) => {
		if (!canShowLocationMap(location)) return;

		const requestedLocationId = toPositiveInt(location!.id_location, 0);
		const openSeq = ++mapOpenSeq;
		const shouldFetchCoordinates = openOptions.fetchCoordinates === true;
		const isActiveMapOpen = (locationId = requestedLocationId) =>
			openSeq === mapOpenSeq && toPositiveInt(locationId, 0) === requestedLocationId;

		setMapStatus('');
		if (mapAddress) mapAddress.textContent = location?.address || '';
		if (!mapModal.open) mapModal.showModal();

		setMapLoading(true);

		try {
			let mapLocation = location!;
			let coords = getLocationCoordinatesFrom(mapLocation);

			if (shouldFetchCoordinates || !coords) {
				try {
					mapLocation = await fetchPublicLocationDetails(mapLocation);
					if (!isActiveMapOpen(mapLocation.id_location)) return;

					options.onLocationUpdated?.(mapLocation);
					coords = getLocationCoordinatesFrom(mapLocation);
				} catch (error) {
					if (!isActiveMapOpen()) return;
					setMapStatus(
						error instanceof PublicLocationMapError
							? error.message
							: 'No fue posible obtener la ubicación.'
					);
					if (openSeq === mapOpenSeq) setMapLoading(false);
					return;
				}
			}

			if (!isActiveMapOpen(mapLocation.id_location)) return;

			if (!coords) {
				setMapStatus('Esta sucursal no tiene coordenadas cargadas.');
				if (openSeq === mapOpenSeq) setMapLoading(false);
				return;
			}

			if (mapAddress) {
				mapAddress.textContent = mapLocation.address || location?.address || '';
			}

			const locationTitle =
				String(mapLocation.name || location?.name || '').trim() || 'Ubicación';

			const maplibregl = await ensureMapLibre();
			if (!isActiveMapOpen(mapLocation.id_location)) return;

			if (!mapInstance) {
				mapInstance = new maplibregl.Map({
					container: mapCanvas,
					style: getStadiaStyleUrl(resolveMapTheme(), stadiaKey),
					center: [coords.lng, coords.lat],
					zoom: 16,
					attributionControl: { compact: true },
				});
				mapInstance.addControl(
					new maplibregl.NavigationControl({ showCompass: false }),
					'top-right'
				);
				mapMarker = createBrandMarker(maplibregl, coords, {
					color: '#FB7185',
					title: locationTitle,
				})
					.setPopup(new maplibregl.Popup({ closeButton: false, offset: 24 }).setText(locationTitle))
					.addTo(mapInstance);
			} else {
				mapInstance.setCenter([coords.lng, coords.lat]);
				mapInstance.setZoom(16);
				mapMarker?.setLngLat([coords.lng, coords.lat]);
				mapMarker?.setPopup(
					new maplibregl.Popup({ closeButton: false, offset: 24 }).setText(locationTitle)
				);
			}

			window.setTimeout(() => {
				if (!isActiveMapOpen(mapLocation.id_location)) return;
				try {
					mapInstance?.resize();
				} catch {
					// ignore
				}
				mapInstance?.setCenter([coords!.lng, coords!.lat]);
				if (openSeq === mapOpenSeq) setMapLoading(false);
			}, 80);
		} catch (error) {
			if (!isActiveMapOpen()) return;
			setMapStatus(error instanceof Error ? error.message : 'No fue posible mostrar el mapa.');
			if (openSeq === mapOpenSeq) setMapLoading(false);
		}
	};

	mapCloseButton.addEventListener('click', () => mapModal.close(), { signal: options.signal });
	mapModal.addEventListener(
		'click',
		(event) => {
			if (event.target === mapModal) mapModal.close();
		},
		{ signal: options.signal }
	);

	return {
		canShowLocationMap,
		openLocationMap,
	};
};
