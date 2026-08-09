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

export default function smoke() {
	const landing = http.get(`${cfg.bffBaseUrl}/`);
	check(landing, { 'landing 200': (r) => r.status === 200 });

	const login = http.get(`${cfg.bffBaseUrl}/auth/login`);
	check(login, { 'login 200': (r) => r.status === 200 });

	const userApi = http.get(`${cfg.bffBaseUrl}/api/public/user/${cfg.userSlug}`);
	check(userApi, { 'public user api 200': (r) => r.status === 200 });

	sleep(1);
}
