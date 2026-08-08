/**
 * Dashboard greeting — char stagger is CSS; subtitle fades in after stagger.
 */

export const initDashboardGreeting = (root: ParentNode = document) => {
	const intro = root.querySelector<HTMLElement>('[data-dashboard-intro]');
	if (!intro) return;

	const sub = intro.querySelector<HTMLElement>('[data-dashboard-greeting-sub]');
	if (!sub || sub.classList.contains('is-in')) return;

	const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (prefersReduced) {
		sub.classList.add('is-in');
		return;
	}

	const charCount = intro.querySelectorAll('.dashboard-greeting__char').length;
	const delay = Math.min(520, 120 + charCount * 16);
	window.setTimeout(() => sub.classList.add('is-in'), delay);
};
