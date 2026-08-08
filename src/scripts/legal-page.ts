const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-policy-section]'));
const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]'));
const mobileDetails = document.querySelector<HTMLDetailsElement>('.policy-toc-mobile');
const topbar = document.querySelector<HTMLElement>('[data-policy-topbar]');
const sentinel = document.querySelector<HTMLElement>('[data-scroll-sentinel]');

const setActive = (id: string) => {
	for (const link of links) {
		link.classList.toggle('is-active', link.dataset.tocLink === id);
	}
};

for (const link of links) {
	link.addEventListener('click', () => {
		if (mobileDetails) mobileDetails.open = false;
	});
}

if (topbar && sentinel && 'IntersectionObserver' in window) {
	const topObserver = new IntersectionObserver(
		([entry]) => {
			if (!entry) return;
			topbar.classList.toggle('is-scrolled', !entry.isIntersecting);
		},
		{ root: null, threshold: 0, rootMargin: '-1px 0px 0px 0px' }
	);
	topObserver.observe(sentinel);
}

if (sections.length && 'IntersectionObserver' in window) {
	const visible = new Map<string, number>();
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const id = entry.target.id;
				if (!id) continue;
				if (entry.isIntersecting) visible.set(id, entry.intersectionRatio);
				else visible.delete(id);
			}
			let bestId = '';
			let bestRatio = 0;
			for (const [id, ratio] of visible) {
				if (ratio >= bestRatio) {
					bestRatio = ratio;
					bestId = id;
				}
			}
			if (bestId) setActive(bestId);
		},
		{ rootMargin: '-20% 0px -55% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
	);
	for (const section of sections) observer.observe(section);
	setActive(sections[0]?.id || '');
}
