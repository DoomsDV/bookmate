/**
 * React Bits — Animated Content (lightweight port for Astro).
 * Same visual: opacity + translate + scale on enter, once.
 * Uses IntersectionObserver instead of ScrollTrigger/React islands.
 */

export type AnimatedContentPlayOptions = {
	/** Force reveal without waiting for intersection. */
	immediate?: boolean;
};

const DEFAULT_DISTANCE = 50;
const DEFAULT_DURATION = 0.75;
const DEFAULT_SCALE = 0.92;
const DEFAULT_THRESHOLD = 0.12;

const applyVars = (el: HTMLElement) => {
	const distance = Number(el.dataset.acDistance ?? DEFAULT_DISTANCE);
	const duration = Number(el.dataset.acDuration ?? DEFAULT_DURATION);
	const scale = Number(el.dataset.acScale ?? DEFAULT_SCALE);
	const delay = Number(el.dataset.acDelay ?? 0);
	el.style.setProperty('--ac-distance', `${Number.isFinite(distance) ? distance : DEFAULT_DISTANCE}px`);
	el.style.setProperty('--ac-duration', `${Number.isFinite(duration) ? duration : DEFAULT_DURATION}s`);
	el.style.setProperty('--ac-scale', String(Number.isFinite(scale) ? scale : DEFAULT_SCALE));
	el.style.setProperty('--ac-delay', `${Number.isFinite(delay) ? delay : 0}s`);
};

export const playAnimatedContent = (el: HTMLElement, options: AnimatedContentPlayOptions = {}) => {
	applyVars(el);
	if (options.immediate) {
		el.style.setProperty('--ac-delay', '0s');
	}
	// Force style flush so the transition runs from the hidden state.
	void el.offsetWidth;
	el.classList.add('is-visible');
};

export const initAnimatedContent = (root: ParentNode = document) => {
	const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-animated-content]')).filter(
		(node) => !node.closest('astro-island')
	);

	if (!nodes.length) return;

	nodes.forEach((el) => applyVars(el));

	if (prefersReduced) {
		nodes.forEach((el) => el.classList.add('is-visible'));
		return;
	}

	const autoNodes = nodes.filter((el) => !el.hasAttribute('data-ac-manual'));

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				const el = entry.target as HTMLElement;
				el.classList.add('is-visible');
				observer.unobserve(el);
			}
		},
		{
			threshold: DEFAULT_THRESHOLD,
			rootMargin: '0px 0px -6% 0px',
		}
	);

	autoNodes.forEach((el) => {
		// Already in view on first paint: still observe so threshold applies once.
		observer.observe(el);
	});
};
