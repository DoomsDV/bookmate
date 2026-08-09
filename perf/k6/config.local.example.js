/**
 * Copiá este archivo a config.local.js (gitignored) y ajustá valores DEV.
 * También podés pasar overrides vía variables de entorno (ver perf/README.md).
 */
export default {
	bffBaseUrl: 'http://localhost:4321',
	userSlug: 'dann-villasanti',
	orgSlug: 'consultorio-dann',
	proSlug: 'dann-villasanti',
	orgId: 1,
	proId: 1,
	locId: 1,
	serId: 1,
	// JWT para panel-read.js — generar en Oracle DEV con apex_jwt.encode
	jwt: '',
};
