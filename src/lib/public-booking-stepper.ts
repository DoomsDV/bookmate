/** Desktop breakpoint: back row hidden; stepper tabs are the PC back navigation. */
const DESKTOP_STEPPER_MQ = '(min-width: 640px)';

export function bindPublicBookingStepIndicator(options: {
	stepItems: NodeListOf<HTMLElement> | Iterable<HTMLElement>;
	getCurrentStep: () => number;
	onNavigateToStep: (targetStep: number) => void;
	signal: AbortSignal;
	maxNavigableStep?: number;
}) {
	const {
		stepItems,
		getCurrentStep,
		onNavigateToStep,
		signal,
		maxNavigableStep = 5,
	} = options;
	const items = [...stepItems];
	const mq = window.matchMedia(DESKTOP_STEPPER_MQ);
	const isDesktop = () => mq.matches;

	const refreshClickableState = () => {
		const current = getCurrentStep();
		const canNavigate = isDesktop() && current >= 1 && current <= maxNavigableStep;

		for (const item of items) {
			const itemStep = Number(item.dataset.stepItem || '0');
			const isPreviousStep =
				canNavigate && itemStep >= 1 && itemStep < current && item.classList.contains('step-item-done');

			item.classList.toggle('step-item-clickable', isPreviousStep);

			if (isPreviousStep) {
				item.setAttribute('role', 'button');
				item.setAttribute('tabindex', '0');
				item.setAttribute('aria-label', `Volver al paso ${itemStep}`);
			} else {
				item.removeAttribute('role');
				item.removeAttribute('tabindex');
				item.removeAttribute('aria-label');
			}
		}
	};

	const tryNavigate = (item: HTMLElement) => {
		if (!isDesktop()) return;
		const current = getCurrentStep();
		const targetStep = Number(item.dataset.stepItem || '0');
		if (current > maxNavigableStep || targetStep < 1 || targetStep >= current) return;
		if (!item.classList.contains('step-item-done')) return;
		onNavigateToStep(targetStep);
	};

	for (const item of items) {
		item.addEventListener(
			'click',
			() => {
				tryNavigate(item);
			},
			{ signal }
		);

		item.addEventListener(
			'keydown',
			(event) => {
				if (event.key !== 'Enter' && event.key !== ' ') return;
				event.preventDefault();
				tryNavigate(item);
			},
			{ signal }
		);
	}

	mq.addEventListener('change', refreshClickableState, { signal });

	return { refreshClickableState };
}
