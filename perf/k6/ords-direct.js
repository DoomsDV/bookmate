import http from 'k6/http';
import { check, sleep } from 'k6';
import { loadPerfConfig } from './config.js';

const cfg = loadPerfConfig();

export const options = {
	stages: [
		{ duration: '30s', target: 5 },
		{ duration: '1m', target: 10 },
		{ duration: '30s', target: 0 },
	],
	thresholds: {
		http_req_failed: ['rate<0.01'],
		'http_req_duration{layer:ords}': ['p(95)<800'],
	},
};

export default function ordsDirect() {
	const org = http.get(`${cfg.ordsPublicBaseUrl}/org/${cfg.orgSlug}`, {
		tags: { layer: 'ords', name: 'ords_org' },
	});
	check(org, { 'ords org 200': (r) => r.status === 200 });

	const user = http.get(`${cfg.ordsPublicBaseUrl}/user/${cfg.userSlug}`, {
		tags: { layer: 'ords', name: 'ords_user' },
	});
	check(user, { 'ords user 200': (r) => r.status === 200 });

	const profile = http.get(
		`${cfg.ordsPublicBaseUrl}/profile/${cfg.orgSlug}/${cfg.proSlug}`,
		{ tags: { layer: 'ords', name: 'ords_profile' } }
	);
	check(profile, { 'ords profile 200': (r) => r.status === 200 });

	const params = `pro_id=${cfg.proId}&loc_id=${cfg.locId}&ser_id=${cfg.serId}&from_date=2026-08-10&to_date=2026-08-24`;
	const dates = http.get(`${cfg.ordsPublicBaseUrl}/available-dates?${params}`, {
		tags: { layer: 'ords', name: 'ords_dates' },
	});
	check(dates, { 'ords dates 200': (r) => r.status === 200 });

	const slots = http.get(
		`${cfg.ordsPublicBaseUrl}/available-slots?pro_id=${cfg.proId}&loc_id=${cfg.locId}&ser_id=${cfg.serId}&target_date=2026-08-11`,
		{ tags: { layer: 'ords', name: 'ords_slots' } }
	);
	check(slots, { 'ords slots 200': (r) => r.status === 200 });

	sleep(0.5);
}
