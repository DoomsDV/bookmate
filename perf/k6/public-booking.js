import http from 'k6/http';
import { check, sleep } from 'k6';
import { loadPerfConfig } from './config.js';

const cfg = loadPerfConfig();

export const options = {
	stages: [
		{ duration: '30s', target: 5 },
		{ duration: '1m', target: 15 },
		{ duration: '30s', target: 0 },
	],
	thresholds: {
		http_req_failed: ['rate<0.05'],
		http_req_duration: ['p(95)<3000'],
	},
};

const bffHeaders = {
	Origin: cfg.bffBaseUrl,
	'Content-Type': 'application/json',
};

export default function publicBooking() {
	const params = `pro_id=${cfg.proId}&loc_id=${cfg.locId}&ser_id=${cfg.serId}&from_date=2026-08-10&to_date=2026-08-24`;

	http.get(`${cfg.bffBaseUrl}/api/public/org/${cfg.orgSlug}`, { tags: { layer: 'bff' } });
	http.get(`${cfg.bffBaseUrl}/api/public/available-dates?${params}`, { tags: { layer: 'bff' } });

	const slotsRes = http.get(
		`${cfg.bffBaseUrl}/api/public/available-slots?pro_id=${cfg.proId}&loc_id=${cfg.locId}&ser_id=${cfg.serId}&target_date=2026-08-11`,
		{ tags: { layer: 'bff' } }
	);

	let startTime = '2026-08-11T10:00:00';
	let endTime = '2026-08-11T11:00:00';
	try {
		const body = slotsRes.json();
		const first = body?.data?.[0];
		if (first?.start_time && first?.end_time) {
			startTime = first.start_time;
			endTime = first.end_time;
		}
	} catch {
		// fallback slot
	}

	const payload = JSON.stringify({
		org_id_organization: cfg.orgId,
		loc_id_location: cfg.locId,
		pro_id_professional: cfg.proId,
		ser_id_service: cfg.serId,
		customer_name: `Perf Test ${__VU}-${__ITER}`,
		customer_phone: '0991000000',
		start_time: startTime,
		end_time: endTime,
		policy_accepted: true,
	});

	const idempotencyKey = `perf-${__VU}-${__ITER}-${Date.now()}`;
	const createRes = http.post(`${cfg.bffBaseUrl}/api/public/appointments`, payload, {
		headers: {
			...bffHeaders,
			'Idempotency-Key': idempotencyKey,
		},
		tags: { layer: 'bff', name: 'create_appointment' },
	});

	check(createRes, {
		'appointment created or conflict': (r) => r.status === 201 || r.status === 200 || r.status === 409,
	});

	sleep(1);
}
