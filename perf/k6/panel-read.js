import http from 'k6/http';
import { check, sleep } from 'k6';
import { loadPerfConfig } from './config.js';

const cfg = loadPerfConfig();

export const options = {
	vus: 5,
	duration: '30s',
	thresholds: {
		http_req_failed: ['rate<0.01'],
		http_req_duration: ['p(95)<2000'],
	},
};

export function setup() {
	if (!cfg.jwt) {
		console.warn('[panel-read] PERF_JWT vacío — saltando escenario autenticado.');
		return { skip: true };
	}
	return { skip: false };
}

export default function panelRead(data) {
	if (data?.skip) {
		sleep(1);
		return;
	}

	const headers = {
		Authorization: `Bearer ${cfg.jwt}`,
		Cookie: `access_token=${cfg.jwt}`,
	};

	const calendar = http.get(`${cfg.bffBaseUrl}/api/appointments/calendar`, { headers });
	check(calendar, { 'calendar 200': (r) => r.status === 200 });

	const customers = http.get(`${cfg.bffBaseUrl}/api/customers?page=1`, { headers });
	check(customers, { 'customers 200': (r) => r.status === 200 });

	const pending = http.get(`${cfg.bffBaseUrl}/api/cobros/pending-count`, { headers });
	check(pending, { 'pending count 200': (r) => r.status === 200 });

	sleep(1);
}
