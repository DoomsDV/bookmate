type VisualizerMode = 'idle' | 'live' | 'collapsing' | 'off';

type SparkParticle = {
	x: number;
	y: number;
	vx: number;
	vy: number;
	life: number;
	maxLife: number;
	size: number;
	alpha: number;
};

const COLLAPSE_MS = 780;

export class AppointmentVoiceVisualizer {
	#canvas: HTMLCanvasElement;
	#ctx: CanvasRenderingContext2D;
	#analyser: AnalyserNode | null = null;
	#dataArray: Uint8Array | null = null;
	#raf: number | null = null;
	#phase = 0;
	#mode: VisualizerMode = 'off';
	#level = 0;
	#collapseProgress = 0;
	#collapseStartedAt = 0;
	#collapseResolve: (() => void) | null = null;
	#particles: SparkParticle[] = [];
	#resizeObserver: ResizeObserver | null = null;

	constructor(canvas: HTMLCanvasElement) {
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			throw new Error('Canvas 2D context unavailable.');
		}
		this.#canvas = canvas;
		this.#ctx = ctx;

		this.#resizeObserver = new ResizeObserver(() => this.resize());
		this.#resizeObserver.observe(canvas);
		this.resize();
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

		if (mode === 'off') {
			this.stop();
			this.#level = 0;
			this.#particles = [];
			this.#emitLevel(0);
			this.clear();
			return;
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
		this.#resizeObserver?.disconnect();
		this.#resizeObserver = null;
		this.#collapseResolve = null;
	}

	private resize() {
		const rect = this.#canvas.getBoundingClientRect();
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const width = Math.max(1, Math.round(rect.width * dpr));
		const height = Math.max(1, Math.round(rect.height * dpr));
		if (this.#canvas.width !== width || this.#canvas.height !== height) {
			this.#canvas.width = width;
			this.#canvas.height = height;
		}
	}

	private clear() {
		const { width, height } = this.#canvas;
		this.#ctx.clearRect(0, 0, width, height);
	}

	private readLevel() {
		if (this.#mode === 'live' && this.#analyser && this.#dataArray) {
			this.#analyser.getByteTimeDomainData(this.#dataArray);
			let sum = 0;
			for (let i = 0; i < this.#dataArray.length; i += 1) {
				const sample = (this.#dataArray[i] - 128) / 128;
				sum += sample * sample;
			}
			const rms = Math.sqrt(sum / this.#dataArray.length);
			this.#level += (Math.min(1, rms * 4.2) - this.#level) * 0.22;
			return;
		}

		const base = 0.14;
		const wave = (Math.sin(this.#phase * 1.4) + Math.sin(this.#phase * 2.3 + 0.8)) * 0.5;
		const target = base + wave * 0.08;
		this.#level += (target - this.#level) * 0.07;
	}

	#emitLevel(level: number) {
		const clamped = Math.max(0, Math.min(1, level)).toFixed(3);
		this.#canvas.style.setProperty('--voice-level', clamped);
		this.#canvas
			.closest<HTMLElement>('[data-voice-overlay-stage]')
			?.style.setProperty('--voice-level', clamped);
	}

	private spawnSpark(centerX: number, centerY: number, intensity: number, burst = false) {
		const count = burst ? 3 : 1;
		for (let i = 0; i < count; i += 1) {
			const angle = Math.random() * Math.PI * 2;
			const speed = (burst ? 1.4 : 0.7) + Math.random() * (0.8 + intensity * 1.6);
			this.#particles.push({
				x: centerX,
				y: centerY,
				vx: Math.cos(angle) * speed,
				vy: Math.sin(angle) * speed,
				life: 0,
				maxLife: 28 + Math.random() * 34,
				size: 0.8 + Math.random() * (burst ? 2.2 : 1.4),
				alpha: 0.35 + Math.random() * 0.45,
			});
		}
	}

	private updateParticles(centerX: number, centerY: number, width: number) {
		const scale = width / 280;

		if (this.#mode === 'live' && Math.random() < 0.08 + this.#level * 0.22) {
			this.spawnSpark(centerX, centerY, this.#level);
		}

		this.#particles = this.#particles.filter((particle) => {
			particle.life += 1;
			particle.x += particle.vx * scale;
			particle.y += particle.vy * scale;
			particle.vy -= 0.015 * scale;
			return particle.life < particle.maxLife;
		});

		if (this.#particles.length > 90) {
			this.#particles.splice(0, this.#particles.length - 90);
		}
	}

	private drawParticles() {
		for (const particle of this.#particles) {
			const fade = 1 - particle.life / particle.maxLife;
			this.#ctx.save();
			this.#ctx.globalAlpha = particle.alpha * fade;
			this.#ctx.fillStyle = '#e0f2fe';
			this.#ctx.shadowBlur = 8;
			this.#ctx.shadowColor = '#67e8f9';
			this.#ctx.beginPath();
			this.#ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
			this.#ctx.fill();
			this.#ctx.restore();
		}
	}

	private waveY(
		progress: number,
		centerY: number,
		amplitude: number,
		height: number,
		phase: number,
		collapse: number
	) {
		const pinch = Math.pow(Math.max(0, 1 - collapse * 1.05), 1.35);
		const envelope = Math.pow(Math.sin(progress * Math.PI), 1.35) * pinch;
		const organic =
			Math.sin(progress * Math.PI * 3.2 + phase) * 0.42 +
			Math.sin(progress * Math.PI * 5.4 - phase * 0.55) * 0.28 +
			Math.sin(progress * Math.PI * 8.1 + phase * 1.25) * 0.16 +
			Math.sin(progress * Math.PI * 12.5 - phase * 0.35) * 0.08;
		return centerY + organic * envelope * amplitude * height * 0.36;
	}

	private drawWaveLayers(
		width: number,
		height: number,
		centerX: number,
		centerY: number,
		amplitude: number,
		collapse: number
	) {
		const layers = [
			{ phase: this.#phase, width: 3.4, alpha: 0.18, blur: 10 },
			{ phase: this.#phase * 1.08, width: 2.2, alpha: 0.42, blur: 0 },
			{ phase: -this.#phase * 0.82, width: 1.5, alpha: 0.72, blur: 0 },
			{ phase: this.#phase * 1.45, width: 1, alpha: 0.38, blur: 0 },
		];

		for (const layer of layers) {
			this.#ctx.save();
			if (layer.blur > 0) {
				this.#ctx.filter = `blur(${layer.blur}px)`;
			}
			this.#ctx.globalAlpha = layer.alpha * (1 - collapse * 0.35);
			this.#ctx.beginPath();

			const points = Math.max(64, Math.floor(width / 4));
			for (let i = 0; i <= points; i += 1) {
				const progress = i / points;
				const x = progress * width;
				const y = this.waveY(progress, centerY, amplitude, height, layer.phase, collapse);
				if (i === 0) this.#ctx.moveTo(x, y);
				else this.#ctx.lineTo(x, y);
			}

			const gradient = this.#ctx.createLinearGradient(0, centerY, width, centerY);
			gradient.addColorStop(0, '#1e3a8a');
			gradient.addColorStop(0.35, '#2563eb');
			gradient.addColorStop(0.65, '#38bdf8');
			gradient.addColorStop(1, '#a5f3fc');
			this.#ctx.strokeStyle = gradient;
			this.#ctx.lineWidth = layer.width;
			this.#ctx.lineCap = 'round';
			this.#ctx.lineJoin = 'round';
			this.#ctx.stroke();
			this.#ctx.restore();
		}

		if (collapse > 0.05) {
			const glowSize = 10 + collapse * 22 + this.#level * 10;
			const glow = this.#ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowSize);
			glow.addColorStop(0, `rgba(186, 230, 253, ${0.18 + collapse * 0.22})`);
			glow.addColorStop(0.55, `rgba(56, 189, 248, ${0.08 + collapse * 0.1})`);
			glow.addColorStop(1, 'rgba(56, 189, 248, 0)');
			this.#ctx.fillStyle = glow;
			this.#ctx.beginPath();
			this.#ctx.arc(centerX, centerY, glowSize, 0, Math.PI * 2);
			this.#ctx.fill();
		}
	}

	private advanceCollapse() {
		const elapsed = performance.now() - this.#collapseStartedAt;
		this.#collapseProgress = Math.min(1, elapsed / COLLAPSE_MS);

		if (this.#collapseProgress >= 1) {
			this.#mode = 'off';
			this.stop();
			this.clear();
			const resolve = this.#collapseResolve;
			this.#collapseResolve = null;
			resolve?.();
		}
	}

	private draw() {
		const { width, height } = this.#canvas;
		this.clear();

		const centerX = width * 0.5;
		const centerY = height * 0.5;

		if (this.#mode === 'collapsing') {
			this.advanceCollapse();
		}

		const collapse = this.#mode === 'collapsing' ? this.#collapseProgress : 0;

		if (this.#mode === 'idle' || this.#mode === 'live' || this.#mode === 'collapsing') {
			const liveBoost = this.#mode === 'live' ? 0.48 + this.#level * 1.25 : 0.22 + this.#level * 0.35;
			const amp = Math.max(0.12, liveBoost * (1 - collapse * 0.98));
			if (amp > 0.01) {
				this.drawWaveLayers(width, height, centerX, centerY, amp, collapse);
			}
		}

		if (this.#mode === 'live' || this.#mode === 'collapsing') {
			this.updateParticles(centerX, centerY, width);
			this.drawParticles();
		}

		this.#emitLevel(this.#level);
	}

	#tick = () => {
		this.readLevel();
		this.#phase +=
			this.#mode === 'live'
				? 0.045 + this.#level * 0.07
				: this.#mode === 'collapsing'
					? 0.06
					: 0.035;
		this.draw();
		this.#raf = requestAnimationFrame(this.#tick);
	};
};
