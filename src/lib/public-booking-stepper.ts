/** Desktop breakpoint: back row hidden; stepper tabs are the PC back navigation. */
const DESKTOP_STEPPER_MQ = '(min-width: 640px)';

/** Fases mentales del wizard (UI). Steps internos 1–5 se mapean a estas 3. */
export const BOOKING_PHASE_LABELS: Record<1 | 2 | 3, string> = {
	1: 'Detalles',
	2: 'Fecha y Hora',
	3: 'Confirmación',
};

export type BookingPhase = 1 | 2 | 3;

/** Step 4 (Horario) está retirado: se trata como fase Fecha y Hora. */
export const wizardStepToPhase = (step: number): BookingPhase => {
	if (step <= 2) return 1;
	if (step === 3 || step === 4) return 2;
	return 3;
};

export const phaseProgressPercent = (phase: BookingPhase): number =>
	Math.round((phase / 3) * 100);

/**
 * Primer wizard-step de una fase (para navegación del stepper en desktop).
 * Detalles → 1 (o 2 en flujos donde el primer subpaso no aplica).
 */
export const phaseToWizardStep = (
	phase: BookingPhase,
	options?: { detailsEntryStep?: 1 | 2 }
): number => {
	if (phase === 1) return options?.detailsEntryStep ?? 1;
	if (phase === 2) return 3;
	return 5;
};

/** Drafts antiguos con step 4 (Horario) → step 3 (Fecha y Hora fusionados). */
export const normalizeRetiredBookingStep = (step: number): number => (step === 4 ? 3 : step);

export function bindPublicBookingStepIndicator(options: {
	stepItems: NodeListOf<HTMLElement> | Iterable<HTMLElement>;
	/** Wizard step actual (1–7) o fase (1–3) si `mode: 'phase'`. */
	getCurrentStep: () => number;
	onNavigateToStep: (targetStep: number) => void;
	signal: AbortSignal;
	maxNavigableStep?: number;
	/**
	 * `wizard` (default): data-step-item = step interno.
	 * `phase`: data-step-item = fase 1–3; getCurrentStep sigue siendo wizard step.
	 */
	mode?: 'wizard' | 'phase';
	/** Solo mode phase: convierte fase clickeada → wizard step. */
	phaseToStep?: (phase: BookingPhase) => number;
}) {
	const {
		stepItems,
		getCurrentStep,
		onNavigateToStep,
		signal,
		maxNavigableStep = 5,
		mode = 'wizard',
		phaseToStep = (phase: BookingPhase) => phaseToWizardStep(phase),
	} = options;
	const items = [...stepItems];
	const mq = window.matchMedia(DESKTOP_STEPPER_MQ);
	const isDesktop = () => mq.matches;

	const resolveCurrentPhaseOrStep = () => {
		const current = getCurrentStep();
		return mode === 'phase' ? wizardStepToPhase(current) : current;
	};

	const refreshClickableState = () => {
		const current = getCurrentStep();
		const currentPhaseOrStep = resolveCurrentPhaseOrStep();
		const canNavigate = isDesktop() && current >= 1 && current <= maxNavigableStep;

		for (const item of items) {
			const itemStep = Number(item.dataset.stepItem || '0');
			const isPreviousStep =
				canNavigate &&
				itemStep >= 1 &&
				itemStep < currentPhaseOrStep &&
				item.classList.contains('step-item-done');

			item.classList.toggle('step-item-clickable', isPreviousStep);

			if (isPreviousStep) {
				item.setAttribute('role', 'button');
				item.setAttribute('tabindex', '0');
				item.setAttribute(
					'aria-label',
					mode === 'phase'
						? `Volver a ${BOOKING_PHASE_LABELS[itemStep as BookingPhase] || `fase ${itemStep}`}`
						: `Volver al paso ${itemStep}`
				);
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
		const currentPhaseOrStep = resolveCurrentPhaseOrStep();
		const targetItem = Number(item.dataset.stepItem || '0');
		if (current > maxNavigableStep || targetItem < 1 || targetItem >= currentPhaseOrStep) return;
		if (!item.classList.contains('step-item-done')) return;
		const targetWizardStep =
			mode === 'phase' ? phaseToStep(targetItem as BookingPhase) : targetItem;
		onNavigateToStep(targetWizardStep);
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
