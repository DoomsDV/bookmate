export type GeolocationPoint = {
	latitude: number;
	longitude: number;
	/** Radio de error estimado en metros (menor = más preciso). */
	accuracy?: number;
};

const hasBrowserGeolocation = () =>
	typeof window !== 'undefined' &&
	typeof navigator !== 'undefined' &&
	'geolocation' in navigator;

const toPoint = (position: GeolocationPosition): GeolocationPoint | null => {
	const { latitude, longitude, accuracy } = position.coords;
	if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
	return {
		latitude,
		longitude,
		accuracy: Number.isFinite(accuracy) ? accuracy : undefined,
	};
};

const isBetterReading = (
	next: GeolocationPoint,
	current: GeolocationPoint | null,
): boolean => {
	if (!current) return true;
	const nextAcc = next.accuracy ?? Number.POSITIVE_INFINITY;
	const currentAcc = current.accuracy ?? Number.POSITIVE_INFINITY;
	return nextAcc < currentAcc;
};

/**
 * Obtiene la mejor lectura posible del GPS/Wi‑Fi del dispositivo.
 * Usa `watchPosition` unos segundos para refinar la precisión en lugar de
 * quedarse con la primera posición cacheada (suele ser muy imprecisa en PC).
 */
export const getBrowserGeolocation = (
	options: PositionOptions = {},
	watchMs = 8_000,
): Promise<GeolocationPoint | null> => {
	if (!hasBrowserGeolocation()) return Promise.resolve(null);

	const merged: PositionOptions = {
		enableHighAccuracy: true,
		maximumAge: 0,
		timeout: 15_000,
		...options,
	};

	return new Promise((resolve) => {
		let best: GeolocationPoint | null = null;
		let watchId: number | null = null;
		let settled = false;

		const finish = (result: GeolocationPoint | null) => {
			if (settled) return;
			settled = true;
			if (watchId !== null) navigator.geolocation.clearWatch(watchId);
			window.clearTimeout(timeoutId);
			resolve(result);
		};

		const consider = (position: GeolocationPosition) => {
			const point = toPoint(position);
			if (!point) return;
			if (isBetterReading(point, best)) best = point;

			const accuracy = point.accuracy ?? Number.POSITIVE_INFINITY;
			// Lectura suficientemente buena: no esperar más.
			if (accuracy <= 40) finish(point);
		};

		const timeoutId = window.setTimeout(() => finish(best), watchMs);

		watchId = navigator.geolocation.watchPosition(
			consider,
			() => finish(best),
			merged,
		);

		// Lectura rápida inicial por si watch tarda en disparar.
		navigator.geolocation.getCurrentPosition(
			consider,
			() => undefined,
			merged,
		);
	});
};
