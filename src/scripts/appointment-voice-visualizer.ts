type VisualizerMode = 'idle' | 'live' | 'collapsing' | 'off';

const COLLAPSE_MS = 780;
const RESTING_SCALE = 0.06;

export class AppointmentVoiceVisualizer {
	#root: HTMLElement;
	#bars: HTMLElement[];
	#barCurrent: number[];
	#barTarget: number[];
	#analyser: AnalyserNode | null = null;
	#dataArray: Uint8Array | null = null;
	#raf: number | null = null;
	#phase = 0;
	#mode: VisualizerMode = 'off';
	#level = 0;
	#collapseProgress = 0;
	#collapseStartedAt = 0;
	#collapseResolve: (() => void) | null = null;

	constructor(root: HTMLElement) {
		this.#root = root;
		this.#bars = Array.from(root.querySelectorAll<HTMLElement>('[data-voice-bar]'));
		if (this.#bars.length === 0) {
			throw new Error('Voice visualizer bars not found.');
		}

		this.#barCurrent = this.#bars.map(() => RESTING_SCALE);
		this.#barTarget = [...this.#barCurrent];
		this.#applyBarScales();
	}

	setAnalyser(analyser: AnalyserNode | null) {
		this.#analyser = analyser;
		this.#dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
	}

	setMode(mode: VisualizerMode) {
		if (mode === 'collapsing') return;
		this.#mode = mode;
		this.#collapseProgress = 0;
		this.#collapseResolve = null;
		this.#root.dataset.visualizerMode = mode;

		if (mode === 'off') {
			this.stop();
			this.#level = 0;
			this.#emitLevel(0);
			this.#resetBars();
			return;
		}

		if (mode === 'idle' || mode === 'live') {
			this.#barCurrent = this.#bars.map(() => RESTING_SCALE);
			this.#barTarget = [...this.#barCurrent];
			this.#applyBarScales();
		}

		if (!this.#raf) {
			this.#tick();
		}
	}

	playCollapse(): Promise<void> {
		if (this.#mode === 'off') return Promise.resolve();

		return new Promise((resolve) => {
			this.#mode = 'collapsing';
			this.#collapseProgress = 0;
			this.#collapseStartedAt = performance.now();
			this.#collapseResolve = resolve;
			this.#root.dataset.visualizerMode = 'collapsing';
			if (!this.#raf) {
				this.#tick();
			}
		});
	}

	getLevel() {
		return this.#level;
	}

	stop() {
		if (this.#raf) {
			cancelAnimationFrame(this.#raf);
			this.#raf = null;
		}
	}

	destroy() {
		this.stop();
		this.#collapseResolve = null;
	}

	private readLevel() {
		if (this.#mode === 'live' && this.#analyser && this.#dataArray) {
			this.#analyser.getByteFrequencyData(this.#dataArray);
			let sum = 0;
			const slice = Math.min(24, this.#dataArray.length);
			for (let i = 0; i < slice; i += 1) {
				sum += this.#dataArray[i];
			}
			const avg = sum / slice / 255;
			this.#level += (Math.min(1, avg * 3.6) - this.#level) * 0.3;
			return;
		}

		if (this.#mode === 'idle') {
			this.#level += (0.04 - this.#level) * 0.06;
			return;
		}

		const wave =
			(Math.sin(this.#phase * 1.35) + Math.sin(this.#phase * 2.1 + 0.6)) * 0.5;
		const target = 0.12 + wave * 0.07;
		this.#level += (target - this.#level) * 0.08;
	}

	private readBarLevel(index: number) {
		if (!this.#analyser || !this.#dataArray || this.#bars.length === 0) {
			return this.#level;
		}

		const binCount = this.#dataArray.length;
		const barCount = this.#bars.length;
		const binStart = Math.floor((index / barCount) * binCount * 0.55);
		const binEnd = Math.max(binStart + 1, Math.floor(((index + 1) / barCount) * binCount * 0.55));
		let sum = 0;
		for (let i = binStart; i < binEnd; i += 1) {
			sum += this.#dataArray[i] ?? 0;
		}
		return sum / (binEnd - binStart) / 255;
	}

	private updateBarTargets() {
		const collapse = this.#mode === 'collapsing' ? this.#collapseProgress : 0;

		if (this.#mode === 'idle') {
			this.#bars.forEach((_, index) => {
				this.#barTarget[index] = RESTING_SCALE;
			});
			return;
		}

		const silenceFloor = RESTING_SCALE;
		const liveBoost =
			this.#mode === 'live' ? silenceFloor + this.#level * 2.55 : 0.22 + this.#level * 0.28;
		const amp = Math.max(0, liveBoost * (1 - collapse));

		this.#bars.forEach((_, index) => {
			const barLevel = this.#mode === 'live' ? this.readBarLevel(index) : this.#level;
			const voiceMix = this.#mode === 'live' ? 0.35 + barLevel * 0.65 : 1;
			const wobbleAmp = this.#mode === 'live' ? 0.05 + this.#level * 0.16 : 0.11;
			const wobble =
				Math.sin(this.#phase * 2.4 + index * 0.72) * wobbleAmp +
				Math.sin(this.#phase * 1.55 - index * 0.48) * (wobbleAmp * 0.65);
			const target = Math.max(RESTING_SCALE, amp * voiceMix * (1 + wobble));
			this.#barTarget[index] = target;
		});
	}

	private smoothBars() {
		const easing = this.#mode === 'live' ? 0.28 : this.#mode === 'idle' ? 0.12 : 0.14;
		this.#bars.forEach((bar, index) => {
			const current = this.#barCurrent[index] ?? RESTING_SCALE;
			const target = this.#barTarget[index] ?? current;
			const next = current + (target - current) * easing;
			this.#barCurrent[index] = next;
			bar.style.setProperty('--bar-scale', next.toFixed(3));
		});
	}

	private #applyBarScales() {
		this.#bars.forEach((bar, index) => {
			bar.style.setProperty('--bar-scale', (this.#barCurrent[index] ?? RESTING_SCALE).toFixed(3));
		});
	}

	private #resetBars() {
		this.#barCurrent = this.#bars.map(() => RESTING_SCALE);
		this.#barTarget = [...this.#barCurrent];
		this.#applyBarScales();
	}

	#emitLevel(level: number) {
		const clamped = Math.max(0, Math.min(1, level)).toFixed(3);
		this.#root.style.setProperty('--voice-level', clamped);
		this.#root
			.closest<HTMLElement>('[data-voice-overlay-stage]')
			?.style.setProperty('--voice-level', clamped);
	}

	private advanceCollapse() {
		const elapsed = performance.now() - this.#collapseStartedAt;
		this.#collapseProgress = Math.min(1, elapsed / COLLAPSE_MS);
		this.#root.style.setProperty('--collapse', this.#collapseProgress.toFixed(3));

		if (this.#collapseProgress >= 1) {
			this.#mode = 'off';
			this.#root.dataset.visualizerMode = 'off';
			this.#root.style.removeProperty('--collapse');
			this.stop();
			const resolve = this.#collapseResolve;
			this.#collapseResolve = null;
			resolve?.();
		}
	}

	#tick = () => {
		if (this.#mode === 'collapsing') {
			this.advanceCollapse();
		}

		this.readLevel();
		this.#phase +=
			this.#mode === 'live'
				? 0.05 + this.#level * 0.06
				: this.#mode === 'collapsing'
					? 0.055
					: 0.032;

		this.updateBarTargets();
		this.smoothBars();
		this.#emitLevel(this.#level);

		this.#raf = requestAnimationFrame(this.#tick);
	};
}
