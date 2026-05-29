export type MapLocation = {
	id_location: number;
	name?: string;
	address?: string;
	latitude?: number;
	longitude?: number;
};

type Coordinates = { lat: number; lng: number };

type GoogleMapsNamespace = {
	Map: new (container: HTMLElement, options: Record<string, unknown>) => any;
	Marker: new (options: Record<string, unknown>) => any;
	event?: { trigger?: (instance: unknown, eventName: string) => void };
};

type WindowWithGoogleMaps = Window & {
	google?: { maps?: GoogleMapsNamespace };
	__bookmateGoogleMapsLoader?: Promise<GoogleMapsNamespace> | null;
};

class PublicLocationMapError extends Error {
	status: number;

	constructor(message: string, status = 500) {
		super(message);
		this.name = 'PublicLocationMapError';
		this.status = status;
	}
}

const darkMapStyles = [
	{ elementType: 'geometry', stylers: [{ color: '#1d1f24' }] },
	{ elementType: 'labels.text.fill', stylers: [{ color: '#c9d1d9' }] },
	{ elementType: 'labels.text.stroke', stylers: [{ color: '#1d1f24' }] },
	{ featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a2d33' }] },
	{ featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#3a3f47' }] },
	{ featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9aa4b2' }] },
	{ featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#23262c' }] },
	{ featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#8a94a3' }] },
	{ featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#23262c' }] },
	{ featureType: 'water', elementType: 'geometry', stylers: [{ color: '#111827' }] },
	{ featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4f8cc9' }] },
];

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
	const mapsApiKey = String(options.root.dataset.googleMapsApiKey || '').trim();
	const mapModal = options.root.querySelector<HTMLDialogElement>('[data-public-map-modal]');
	const mapCanvasWrap = options.root.querySelector<HTMLElement>('.public-map-canvas-wrap');
	const mapCanvas = options.root.querySelector<HTMLElement>('[data-public-map-canvas]');
	const mapLoading = options.root.querySelector<HTMLElement>('[data-public-map-loading]');
	const mapAddress = options.root.querySelector<HTMLElement>('[data-public-map-address]');
	const mapStatus = options.root.querySelector<HTMLElement>('[data-public-map-status]');
	const mapCloseButton = options.root.querySelector<HTMLButtonElement>('[data-public-map-close]');

	if (!mapModal || !mapCanvas || !mapCloseButton) return null;

	let mapInstance: any = null;
	let mapMarker: any = null;
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
			name: String(source.name || location.name || '').trim(),
			address: String(source.address || location.address || '').trim(),
			latitude: Number.isFinite(latitude) ? latitude : location.latitude,
			longitude: Number.isFinite(longitude) ? longitude : location.longitude,
		};
	};

	const loadGoogleMaps = async (): Promise<GoogleMapsNamespace> => {
		if (!mapsApiKey) {
			throw new Error('No se encontró la API key de Google Maps para mostrar la ubicación.');
		}

		const win = window as WindowWithGoogleMaps;
		if (win.google?.maps) return win.google.maps;
		if (win.__bookmateGoogleMapsLoader) return win.__bookmateGoogleMapsLoader;

		win.__bookmateGoogleMapsLoader = new Promise<GoogleMapsNamespace>((resolve, reject) => {
			const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-maps-loader]');
			if (existingScript) {
				existingScript.addEventListener(
					'load',
					() => {
						const maps = (window as WindowWithGoogleMaps).google?.maps;
						maps ? resolve(maps) : reject(new Error('No fue posible cargar Google Maps.'));
					},
					{ once: true }
				);
				existingScript.addEventListener(
					'error',
					() => reject(new Error('No fue posible cargar Google Maps.')),
					{ once: true }
				);
				return;
			}

			const script = document.createElement('script');
			script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsApiKey)}&v=weekly`;
			script.async = true;
			script.defer = true;
			script.dataset.googleMapsLoader = 'true';
			script.addEventListener(
				'load',
				() => {
					const maps = (window as WindowWithGoogleMaps).google?.maps;
					maps ? resolve(maps) : reject(new Error('No fue posible cargar Google Maps.'));
				},
				{ once: true }
			);
			script.addEventListener(
				'error',
				() => reject(new Error('No fue posible cargar Google Maps.')),
				{ once: true }
			);
			document.head.appendChild(script);
		});

		try {
			return await win.__bookmateGoogleMapsLoader;
		} catch (error) {
			win.__bookmateGoogleMapsLoader = null;
			throw error;
		}
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

			const maps = await loadGoogleMaps();
			if (!isActiveMapOpen(mapLocation.id_location)) return;

			if (!mapInstance) {
				mapInstance = new maps.Map(mapCanvas, {
					center: coords,
					zoom: 16,
					disableDefaultUI: false,
					mapTypeControl: false,
					streetViewControl: false,
					fullscreenControl: true,
					styles: darkMapStyles,
				});
				mapMarker = new maps.Marker({
					map: mapInstance,
					position: coords,
					title: locationTitle,
				});
			} else {
				mapInstance.setOptions?.({ styles: darkMapStyles });
				mapInstance.setCenter(coords);
				mapInstance.setZoom(16);
				mapMarker?.setPosition?.(coords);
				mapMarker?.setTitle?.(locationTitle);
			}

			window.setTimeout(() => {
				if (!isActiveMapOpen(mapLocation.id_location)) return;
				maps.event?.trigger?.(mapInstance, 'resize');
				mapInstance?.setCenter?.(coords);
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
