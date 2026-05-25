export type GeolocationPoint = {
	latitude: number;
	longitude: number;
};

const hasBrowserGeolocation = () =>
	typeof window !== 'undefined' &&
	typeof navigator !== 'undefined' &&
	'geolocation' in navigator;

/** Obtiene la ubicación actual del dispositivo (solo en el navegador). */
export const getBrowserGeolocation = (
	options: PositionOptions = {}
): Promise<GeolocationPoint | null> => {
	if (!hasBrowserGeolocation()) return Promise.resolve(null);

	return new Promise((resolve) => {
		navigator.geolocation.getCurrentPosition(
			(position) => {
				const { latitude, longitude } = position.coords;
				if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
					resolve(null);
					return;
				}
				resolve({ latitude, longitude });
			},
			() => resolve(null),
			{
				enableHighAccuracy: true,
				timeout: 12_000,
				maximumAge: 60_000,
				...options,
			}
		);
	});
};
