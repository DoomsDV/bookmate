export const fetchWithTimeout = (
	input: RequestInfo | URL,
	init: RequestInit = {},
	timeoutMs = 8_000
): Promise<Response> => {
	const controller = new AbortController();
	const timer = window.setTimeout(() => controller.abort(), timeoutMs);
	const parent = init.signal;
	if (parent) {
		if (parent.aborted) controller.abort();
		else parent.addEventListener('abort', () => controller.abort(), { once: true });
	}

	return fetch(input, { ...init, signal: controller.signal }).finally(() => {
		window.clearTimeout(timer);
	});
};
