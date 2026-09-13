/**
 * Dashboard greeting — char stagger is CSS; subtitle fades in after stagger.
 * After the intro, drop per-character compositor layers.
 */

export const initDashboardGreeting = (root: ParentNode = document) => {
	const intro = root.querySelector<HTMLElement>('[data-dashboard-intro]');
	if (!intro) return;

	const sub = intro.querySelector<HTMLElement>('[data-dashboard-greeting-sub]');
	const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const settle = () => intro.classList.add('is-settled');

	if (prefersReduced || intro.classList.contains('is-settled')) {
		sub?.classList.add('is-in');
		settle();
		return;
	}

	if (intro.dataset.greetingBound === '1') return;
	intro.dataset.greetingBound = '1';

	const charCount = intro.querySelectorAll('.dashboard-greeting__char').length;
	const delay = Math.min(520, 120 + charCount * 16);
	if (sub && !sub.classList.contains('is-in')) {
		window.setTimeout(() => sub.classList.add('is-in'), delay);
	}
	window.setTimeout(settle, delay + 420);
};
