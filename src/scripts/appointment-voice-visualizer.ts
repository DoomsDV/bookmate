type VisualizerMode = 'idle' | 'live' | 'collapsing' | 'off';

type DotState = {
	y: number;
	scaleX: number;
	scaleY: number;
};

const COLLAPSE_MS = 640;
const RESTING_DOT: DotState = { y: 0, scaleX: 1, scaleY: 1 };

export class AppointmentVoiceVisualizer {
	#root: HTMLElement;
	#dots: HTMLElement[];
	#current: DotState[];
	#target: DotState[];
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
		this.#dots = Array.from(root.querySelectorAll<HTMLElement>('[data-voice-dot]'));

		this.#current = this.createDotStates();
		this.#target = this.createDotStates();
		this.applyDots();
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
			this.resetDots();
			return;
		}

		if (mode === 'idle' || mode === 'live') {
			this.#current = this.createDotStates();
			this.#target = this.createDotStates();
			this.applyDots();
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

	cancelCollapse() {
		if (this.#collapseResolve) {
			const resolve = this.#collapseResolve;
			this.#collapseResolve = null;
			resolve();
		}

		this.#mode = 'off';
		this.#collapseProgress = 0;
		this.#root.dataset.visualizerMode = 'off';
		this.#root.style.removeProperty('--collapse');
		this.stop();
		this.#level = 0;
		this.#emitLevel(0);
		this.resetDots();
	}

	destroy() {
		this.cancelCollapse();
	}

	private createDotStates() {
		return Array.from({ length: this.#dots.length }, () => ({ ...RESTING_DOT }));
	}

	private readLevel() {
		if (this.#mode === 'live' && this.#analyser && this.#dataArray) {
			this.#analyser.getByteTimeDomainData(this.#dataArray);
			let sum = 0;
			for (let i = 0; i < this.#dataArray.length; i += 1) {
				const centered = ((this.#dataArray[i] ?? 128) - 128) / 128;
				sum += centered * centered;
			}
			const rms = Math.sqrt(sum / this.#dataArray.length);
			this.#level += (Math.min(1, rms * 5.5) - this.#level) * 0.36;
			return;
		}

		if (this.#mode === 'idle') {
			this.#level += (0.05 - this.#level) * 0.06;
			return;
		}

		const wave = (Math.sin(this.#phase * 1.2) + Math.sin(this.#phase * 2.1 + 0.8)) * 0.5;
		const target = 0.12 + wave * 0.07;
		this.#level += (target - this.#level) * 0.08;
	}

	private readDotEnergy(index: number) {
		if (!this.#analyser || !this.#dataArray || this.#dataArray.length === 0) {
			return 0;
		}

		const segmentSize = Math.floor(this.#dataArray.length / this.#dots.length);
		const start = Math.max(0, index * segmentSize);
		const end = Math.min(this.#dataArray.length, start + segmentSize);
		let sum = 0;

		for (let i = start; i < end; i += 1) {
			const centered = ((this.#dataArray[i] ?? 128) - 128) / 128;
			sum += centered * centered;
		}

		const rms = Math.sqrt(sum / Math.max(1, end - start));
		return Math.min(1, rms * 6.2);
	}

	private updateDotTargets() {
		const collapse = this.#mode === 'collapsing' ? this.#collapseProgress : 0;
		const collapseScale = 1 - collapse;

		this.#target.forEach((_, index) => {
			const idleWave = Math.sin(this.#phase * 1.25 + index * 0.86);
			const alternate = index % 2 === 0 ? -1 : 1;

			if (this.#mode === 'idle') {
				const y = idleWave * 3.4;
				this.#target[index] = {
					y,
					scaleX: 1 + Math.abs(idleWave) * 0.04,
					scaleY: 1 + Math.abs(idleWave) * 0.08,
				};
				return;
			}

			const energy = this.#mode === 'live' ? this.readDotEnergy(index) : this.#level;
			const lift = (8 + energy * 34) * alternate;
			const pulse = Math.sin(this.#phase * 2.6 + index * 0.72) * (3 + energy * 6);

			this.#target[index] = {
				y: (pulse + lift * energy) * collapseScale,
				scaleX: (1 + energy * 0.34) * collapseScale + collapse,
				scaleY: (1 + energy * 1.18 + this.#level * 0.28) * collapseScale + collapse,
			};
		});
	}

	private smoothDots() {
		const easing = this.#mode === 'live' ? 0.42 : this.#mode === 'idle' ? 0.16 : 0.14;
		this.#current.forEach((current, index) => {
			const target = this.#target[index] ?? RESTING_DOT;
			current.y += (target.y - current.y) * easing;
			current.scaleX += (target.scaleX - current.scaleX) * easing;
			current.scaleY += (target.scaleY - current.scaleY) * easing;
		});
	}

	private applyDots() {
		this.#dots.forEach((dot, index) => {
			const state = this.#current[index] ?? RESTING_DOT;
			dot.style.setProperty('--dot-y', `${state.y.toFixed(2)}px`);
			dot.style.setProperty('--dot-scale-x', state.scaleX.toFixed(3));
			dot.style.setProperty('--dot-scale-y', state.scaleY.toFixed(3));
		});
	}

	private applyMagicGlow() {
		const collapseScale = this.#mode === 'collapsing' ? 1 - this.#collapseProgress : 1;
		const breathe = Math.sin(this.#phase * 1.18) * 0.5 + Math.sin(this.#phase * 0.72 + 0.8) * 0.5;
		const driftX = Math.sin(this.#phase * 0.9) * (1.5 + this.#level * 3.5);
		const driftY = Math.cos(this.#phase * 1.1 + 0.4) * (1.1 + this.#level * 3);
		const scale = (0.96 + this.#level * 0.22 + breathe * 0.025) * collapseScale;
		const rotate = Math.sin(this.#phase * 0.82) * (1.8 + this.#level * 3.2);

		this.#root.style.setProperty('--magic-x', `${driftX.toFixed(2)}px`);
		this.#root.style.setProperty('--magic-y', `${driftY.toFixed(2)}px`);
		this.#root.style.setProperty('--magic-scale', scale.toFixed(3));
		this.#root.style.setProperty('--magic-rotate', `${rotate.toFixed(2)}deg`);
	}

	private resetDots() {
		this.#current = this.createDotStates();
		this.#target = this.createDotStates();
		this.applyDots();
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
				? 0.075 + this.#level * 0.12
				: this.#mode === 'collapsing'
					? 0.055
					: 0.032;

		this.updateDotTargets();
		this.smoothDots();
		this.applyDots();
		this.applyMagicGlow();
		this.#emitLevel(this.#level);

		this.#raf = requestAnimationFrame(this.#tick);
	};
}

