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
		http_req_duration: ['p(95)<2000'],
	},
};

export default function publicRead() {
	const org = http.get(`${cfg.bffBaseUrl}/api/public/org/${cfg.orgSlug}`, {
		tags: { name: 'bff_org' },
	});
	check(org, { 'org 200': (r) => r.status === 200 });

	const user = http.get(`${cfg.bffBaseUrl}/api/public/user/${cfg.userSlug}`, {
		tags: { name: 'bff_user' },
	});
	check(user, { 'user 200': (r) => r.status === 200 });

	const profile = http.get(
		`${cfg.bffBaseUrl}/api/public/profile/${cfg.orgSlug}/${cfg.proSlug}`,
		{ tags: { name: 'bff_profile' } }
	);
	check(profile, { 'profile 200': (r) => r.status === 200 });

	const params = `pro_id=${cfg.proId}&loc_id=${cfg.locId}&ser_id=${cfg.serId}&from_date=2026-08-10&to_date=2026-08-24`;
	const dates = http.get(`${cfg.bffBaseUrl}/api/public/available-dates?${params}`, {
		tags: { name: 'bff_dates' },
	});
	check(dates, { 'dates 200': (r) => r.status === 200 });

	const slots = http.get(
		`${cfg.bffBaseUrl}/api/public/available-slots?pro_id=${cfg.proId}&loc_id=${cfg.locId}&ser_id=${cfg.serId}&target_date=2026-08-11`,
		{ tags: { name: 'bff_slots' } }
	);
	check(slots, { 'slots 200': (r) => r.status === 200 });

	sleep(0.5);
}
