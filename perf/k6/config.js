/**
 * Configuración base para pruebas k6 (local/DEV).
 * Copiá config.local.example.js → config.local.js para overrides.
 */

const defaults = {
	bffBaseUrl: 'http://127.0.0.1:4321',
	ordsPublicBaseUrl:
		'https://g9549f707e8ebfa-aoxdev.adb.sa-saopaulo-1.oraclecloudapps.com/ords/aoxdev/public/v1',
	ordsApiBaseUrl:
		'https://g9549f707e8ebfa-aoxdev.adb.sa-saopaulo-1.oraclecloudapps.com/ords/aoxdev/api/v1',
	userSlug: 'dann-villasanti',
	orgSlug: 'consultorio-dann',
	proSlug: 'dann-villasanti',
	orgId: 1,
	proId: 1,
	locId: 1,
	serId: 1,
	jwt: '',
};

/** @returns {typeof defaults} */
export function loadPerfConfig() {
	try {
		// k6 supports dynamic import in init context when bundling; for plain k6 use __ENV
		const fromEnv = {
			bffBaseUrl: __ENV.BFF_BASE_URL,
			ordsPublicBaseUrl: __ENV.ORDS_PUBLIC_BASE_URL,
			userSlug: __ENV.USER_SLUG,
			orgSlug: __ENV.ORG_SLUG,
			proSlug: __ENV.PRO_SLUG,
			orgId: __ENV.ORG_ID ? Number(__ENV.ORG_ID) : undefined,
			proId: __ENV.PRO_ID ? Number(__ENV.PRO_ID) : undefined,
			locId: __ENV.LOC_ID ? Number(__ENV.LOC_ID) : undefined,
			serId: __ENV.SER_ID ? Number(__ENV.SER_ID) : undefined,
			jwt: __ENV.PERF_JWT,
		};

		return {
			...defaults,
			...Object.fromEntries(
				Object.entries(fromEnv).filter(([, value]) => value !== undefined && value !== '')
			),
		};
	} catch {
		return defaults;
	}
}

export { defaults };
