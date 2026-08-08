/**
 * React Bits — FadeContent (lightweight vanilla port for Astro).
 * Opacity + optional blur on enter, once. CSS transitions, no GSAP.
 */

export type FadeContentPlayOptions = {
	immediate?: boolean;
};

const DEFAULT_DURATION_MS = 1000;
const DEFAULT_OPACITY = 0;
const DEFAULT_BLUR_PX = 10;
const DEFAULT_THRESHOLD = 0.1;

const toDurationMs = (raw: string | undefined): number => {
	const value = Number(raw);
	if (!Number.isFinite(value) || value <= 0) return DEFAULT_DURATION_MS;
	return value > 10 ? value : value * 1000;
};

const applyVars = (el: HTMLElement) => {
	const durationMs = toDurationMs(el.dataset.fcDuration);
	const opacity = Number(el.dataset.fcOpacity ?? DEFAULT_OPACITY);
	const blurEnabled = el.dataset.fcBlur === 'true';
	const easing = el.dataset.fcEasing?.trim() || 'ease-out';
	const delayMs = toDurationMs(el.dataset.fcDelay);

	el.style.setProperty('--fc-duration', `${durationMs}ms`);
	el.style.setProperty('--fc-delay', `${delayMs}ms`);
	el.style.setProperty('--fc-easing', easing);
	el.style.setProperty('--fc-opacity', String(Number.isFinite(opacity) ? opacity : DEFAULT_OPACITY));
	el.style.setProperty('--fc-blur', blurEnabled ? `${DEFAULT_BLUR_PX}px` : '0px');
};

export const playFadeContent = (el: HTMLElement, options: FadeContentPlayOptions = {}) => {
	applyVars(el);
	if (options.immediate) {
		el.style.setProperty('--fc-delay', '0ms');
	}
	void el.offsetWidth;
	el.classList.add('is-visible');
};

const collectFadeNodes = (root: ParentNode): HTMLElement[] => {
	const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-fade-content]'));
	if (root instanceof HTMLElement && root.matches('[data-fade-content]') && !nodes.includes(root)) {
		nodes.unshift(root);
	}
	return nodes;
};

export const initFadeContent = (root: ParentNode = document, options: FadeContentPlayOptions = {}) => {
	const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const nodes = collectFadeNodes(root);

	if (!nodes.length) return;

	nodes.forEach((el) => applyVars(el));

	if (prefersReduced) {
		nodes.forEach((el) => el.classList.add('is-visible'));
		return;
	}

	const immediate = options.immediate ?? nodes.some((el) => el.dataset.fcImmediate === 'true');

	if (immediate) {
		requestAnimationFrame(() => {
			nodes.forEach((el) => playFadeContent(el, { immediate: true }));
		});
		return;
	}

	const threshold = Number(nodes[0]?.dataset.fcThreshold ?? DEFAULT_THRESHOLD);

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				const el = entry.target as HTMLElement;
				playFadeContent(el);
				observer.unobserve(el);
			}
		},
		{
			threshold: Number.isFinite(threshold) ? threshold : DEFAULT_THRESHOLD,
			rootMargin: '0px 0px -6% 0px',
		}
	);

	nodes.forEach((el) => observer.observe(el));
};
