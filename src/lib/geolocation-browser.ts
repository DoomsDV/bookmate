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

const readCurrentPosition = (
	options: PositionOptions,
): Promise<GeolocationPoint | null> =>
	new Promise((resolve) => {
		navigator.geolocation.getCurrentPosition(
			(position) => resolve(toPoint(position)),
			() => resolve(null),
			options,
		);
	});

const refineWithWatch = (
	options: PositionOptions,
	watchMs: number,
	seed: GeolocationPoint | null,
): Promise<GeolocationPoint | null> =>
	new Promise((resolve) => {
		let best = seed;
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
			if (accuracy <= 80) finish(best);
		};

		const timeoutId = window.setTimeout(() => finish(best), watchMs);

		watchId = navigator.geolocation.watchPosition(
			consider,
			() => finish(best),
			options,
		);
	});

/**
 * Obtiene la mejor lectura posible del GPS/Wi‑Fi del dispositivo.
 * Siempre resuelve antes de `maxWaitMs` (evita colgar el UI en PC sin GPS).
 */
export const getBrowserGeolocation = (
	options: PositionOptions = {},
	maxWaitMs = 10_000,
): Promise<GeolocationPoint | null> => {
	if (!hasBrowserGeolocation()) return Promise.resolve(null);

	const positionOptions: PositionOptions = {
		enableHighAccuracy: true,
		maximumAge: 0,
		timeout: Math.min(8_000, maxWaitMs),
		...options,
	};

	const collect = async (): Promise<GeolocationPoint | null> => {
		const first = await readCurrentPosition(positionOptions);
		if (!first) return null;

		const accuracy = first.accuracy ?? Number.POSITIVE_INFINITY;
		if (accuracy <= 120) return first;

		const remaining = Math.max(1_500, maxWaitMs - 2_500);
		const refined = await refineWithWatch(
			positionOptions,
			Math.min(remaining, 4_000),
			first,
		);
		return refined ?? first;
	};

	return Promise.race([
		collect(),
		new Promise<GeolocationPoint | null>((resolve) => {
			window.setTimeout(() => resolve(null), maxWaitMs);
		}),
	]);
};
