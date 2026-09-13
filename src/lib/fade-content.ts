/**
 * React Bits — FadeContent (lightweight vanilla port for Astro).
 * Opacity on enter, once. CSS transitions, no GSAP.
 */

export type FadeContentPlayOptions = {
	immediate?: boolean;
};

const DEFAULT_DURATION_MS = 1000;
const DEFAULT_OPACITY = 0;
const DEFAULT_THRESHOLD = 0.1;
const SETTLE_CLASS = 'is-settled';

const toDurationMs = (raw: string | undefined, fallback: number): number => {
	const value = Number(raw);
	if (!Number.isFinite(value) || value <= 0) return fallback;
	return value > 10 ? value : value * 1000;
};

const readDelayMs = (el: HTMLElement) => {
	const fromStyle = Number.parseFloat(el.style.getPropertyValue('--fc-delay'));
	if (Number.isFinite(fromStyle) && fromStyle >= 0) return fromStyle;
	return toDurationMs(el.dataset.fcDelay, 0);
};

const applyVars = (el: HTMLElement) => {
	const durationMs = toDurationMs(el.dataset.fcDuration, DEFAULT_DURATION_MS);
	const opacity = Number(el.dataset.fcOpacity ?? DEFAULT_OPACITY);
	const easing = el.dataset.fcEasing?.trim() || 'ease-out';
	const delayMs = toDurationMs(el.dataset.fcDelay, 0);

	el.style.setProperty('--fc-duration', `${durationMs}ms`);
	el.style.setProperty('--fc-delay', `${delayMs}ms`);
	el.style.setProperty('--fc-easing', easing);
	el.style.setProperty('--fc-opacity', String(Number.isFinite(opacity) ? opacity : DEFAULT_OPACITY));
};

const settleFadeContent = (el: HTMLElement) => {
	el.classList.add('is-visible', SETTLE_CLASS);
	el.style.removeProperty('--fc-blur');
};

const scheduleSettle = (el: HTMLElement) => {
	if (el.classList.contains(SETTLE_CLASS) || el.dataset.fcSettleQueued === '1') return;
	el.dataset.fcSettleQueued = '1';

	const onEnd = (event: TransitionEvent) => {
		if (event.target !== el) return;
		if (event.propertyName !== 'opacity' && event.propertyName !== 'filter') return;
		el.removeEventListener('transitionend', onEnd);
		settleFadeContent(el);
	};
	el.addEventListener('transitionend', onEnd);

	const durationMs = toDurationMs(el.dataset.fcDuration, DEFAULT_DURATION_MS);
	const delayMs = readDelayMs(el);
	window.setTimeout(() => settleFadeContent(el), durationMs + delayMs + 80);
};

export const playFadeContent = (el: HTMLElement, options: FadeContentPlayOptions = {}) => {
	if (el.classList.contains(SETTLE_CLASS)) return;
	if (el.classList.contains('is-visible')) {
		scheduleSettle(el);
		return;
	}

	applyVars(el);
	if (options.immediate) {
		el.style.setProperty('--fc-delay', '0ms');
	}
	void el.offsetWidth;
	el.classList.add('is-visible');
	scheduleSettle(el);
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

	if (prefersReduced) {
		nodes.forEach((el) => settleFadeContent(el));
		return;
	}

	const pending = nodes.filter((el) => !el.classList.contains(SETTLE_CLASS));
	if (!pending.length) return;

	pending.forEach((el) => applyVars(el));

	const immediate = options.immediate ?? pending.some((el) => el.dataset.fcImmediate === 'true');

	if (immediate) {
		requestAnimationFrame(() => {
			pending.forEach((el) => playFadeContent(el, { immediate: true }));
		});
		return;
	}

	const threshold = Number(pending[0]?.dataset.fcThreshold ?? DEFAULT_THRESHOLD);

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

	pending.forEach((el) => observer.observe(el));
};
