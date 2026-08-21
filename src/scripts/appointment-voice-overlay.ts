import { prepareAgendaScanImage } from '../lib/agenda-scan-image';
import {
	APPOINTMENT_AI_DRAFT_STORAGE_KEY,
	type AppointmentAiDraft,
	type StoredAppointmentAiDraft,
} from '../lib/appointment-ai-types';
import { destroyActiveBookmateTour } from '../lib/product-tour';
import { openPanelModal } from '../lib/panel-scroll-lock';
import { AppointmentVoiceVisualizer } from './appointment-voice-visualizer';

type VoiceOverlayMode = 'navigate' | 'inline';
type VoiceUiState = 'idle' | 'recording' | 'paused' | 'collapsing' | 'processing' | 'success';
type VoiceTab = 'voice' | 'scan';

type VoiceUiNodes = {
	recordButton: HTMLButtonElement | null;
	restartButton: HTMLButtonElement | null;
	stopButton: HTMLButtonElement | null;
	primaryIcon: HTMLElement | null;
	liveLabel: HTMLElement | null;
	controlsNode: HTMLElement | null;
	livebar: HTMLElement | null;
	actionsNode: HTMLElement | null;
	processingNode: HTMLElement | null;
	stageNode: HTMLElement | null;
	statusNode: HTMLElement | null;
	subtitle: HTMLElement | null;
	helpButton: HTMLButtonElement | null;
};

const MAX_RECORDING_MS = 60_000;
const MAX_SCAN_IMAGE_BYTES = 12 * 1024 * 1024;
const ALLOWED_SCAN_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

class AppointmentVoiceOverlay extends HTMLElement {
	#bound = false;
	#listeners: AbortController | null = null;
	#mediaRecorder: MediaRecorder | null = null;
	#mediaStream: MediaStream | null = null;
	#audioChunks: Blob[] = [];
	#maxRecordingTimer: number | null = null;
	#elapsedTimerInterval: number | null = null;
	#recordingStartedAt = 0;
	#elapsedBeforePause = 0;
	#recordingBudgetRemainingMs = MAX_RECORDING_MS;
	#mode: VoiceOverlayMode = 'navigate';
	#visualizer: AppointmentVoiceVisualizer | null = null;
	#audioContext: AudioContext | null = null;
	#analyser: AnalyserNode | null = null;
	#statusFadeTimer: number | null = null;
	#autoCloseTimer: number | null = null;
	#closeTimer: number | null = null;
	#settleOpenHandler: ((event: AnimationEvent) => void) | null = null;
	#settleOpenFallback: number | null = null;
	#draftAbortController: AbortController | null = null;
	#session = 0;
	#tab: VoiceTab = 'voice';
	#scanAbortController: AbortController | null = null;
	#ui: VoiceUiNodes | null = null;

	private static readonly STATUS_LABELS: Record<VoiceUiState, string> = {
		idle: 'Toca el micrófono y describe la cita.',
		recording: 'Escuchando… describe la cita.',
		paused: 'En pausa. Tocá reanudar para seguir.',
		collapsing: '',
		processing: '',
		success: 'Formulario listo. Revisá los datos precargados.',
	};

	connectedCallback() {
		if (this.#bound) return;
		this.#bound = true;
		this.#listeners = new AbortController();
		const signal = this.#listeners.signal;
		this.#ui = this.cacheUiNodes();

		const visualizerRoot = this.querySelector<HTMLElement>('[data-voice-overlay-visualizer]');
		if (visualizerRoot) {
			this.#visualizer = new AppointmentVoiceVisualizer(visualizerRoot);
			// off por defecto: no arrancar rAF hasta que el overlay se abra.
			this.#visualizer.setMode('off');
		}

		document.addEventListener('click', this.handleDocumentClick, { signal });
		document.addEventListener('visibilitychange', this.handleVisibilityChange, { signal });
		window.addEventListener('pagehide', this.handlePageHide, { signal });
		this.querySelectorAll('[data-voice-overlay-close]').forEach((button) => {
			button.addEventListener(
				'click',
				(event) => {
					event.preventDefault();
					this.close();
				},
				{ signal }
			);
		});
		this.querySelector('[data-voice-overlay-tour-help]')?.addEventListener(
			'click',
			(event) => {
				event.preventDefault();
				void this.openQuickTour();
			},
			{ signal }
		);
		this.querySelector('[data-voice-overlay-record]')?.addEventListener(
			'click',
			this.handleRecordToggle,
			{ signal }
		);
		this.querySelector('[data-voice-overlay-stop]')?.addEventListener(
			'click',
			this.handleStopRecording,
			{ signal }
		);
		this.querySelector('[data-voice-overlay-restart]')?.addEventListener(
			'click',
			this.handleRestartRecording,
			{ signal }
		);
		this.querySelector('[data-voice-overlay-continue]')?.addEventListener(
			'click',
			this.handleContinue,
			{ signal }
		);

		this.querySelectorAll<HTMLButtonElement>('[data-voice-overlay-tab]').forEach((button) => {
			button.addEventListener(
				'click',
				(event) => {
					event.preventDefault();
					const tab = button.dataset.voiceOverlayTab === 'scan' ? 'scan' : 'voice';
					this.setTab(tab);
				},
				{ signal }
			);
		});

		const scanInput = this.querySelector<HTMLInputElement>('[data-voice-overlay-scan-input]');
		scanInput?.addEventListener(
			'change',
			() => {
				const file = scanInput.files?.[0];
				if (file) void this.handleScanFile(file);
				scanInput.value = '';
			},
			{ signal }
		);

		const dropzone = this.querySelector<HTMLElement>('[data-voice-overlay-dropzone]');
		if (dropzone) {
			['dragenter', 'dragover'].forEach((type) => {
				dropzone.addEventListener(
					type,
					(event) => {
						event.preventDefault();
						dropzone.classList.add('is-dragover');
					},
					{ signal }
				);
			});
			['dragleave', 'dragend', 'drop'].forEach((type) => {
				dropzone.addEventListener(
					type,
					() => dropzone.classList.remove('is-dragover'),
					{ signal }
				);
			});
			dropzone.addEventListener(
				'drop',
				(event) => {
					event.preventDefault();
					const file = (event as DragEvent).dataTransfer?.files?.[0];
					if (file) void this.handleScanFile(file);
				},
				{ signal }
			);
		}

		const shell = this.querySelector<HTMLDialogElement>('[data-voice-overlay-shell]');
		shell?.addEventListener(
			'click',
			(event) => {
				const mouse = event as MouseEvent;
				const rect = shell.getBoundingClientRect();
				const inside =
					mouse.clientX >= rect.left &&
					mouse.clientX <= rect.right &&
					mouse.clientY >= rect.top &&
					mouse.clientY <= rect.bottom;
				if (!inside) this.close();
			},
			{ signal }
		);
		shell?.addEventListener(
			'cancel',
			(event) => {
				event.preventDefault();
				this.close();
			},
			{ signal }
		);
	}

	disconnectedCallback() {
		this.#bound = false;
		this.#listeners?.abort();
		this.#listeners = null;
		this.cancelAll(true);
		this.#visualizer?.destroy();
		this.#visualizer = null;
		this.#ui = null;
	}

	open(options: { mode?: VoiceOverlayMode } = {}) {
		const shell = this.querySelector<HTMLDialogElement>('[data-voice-overlay-shell]');
		if (!shell) return;

		this.#mode = options.mode === 'inline' ? 'inline' : 'navigate';
		if (this.#closeTimer) {
			window.clearTimeout(this.#closeTimer);
			this.#closeTimer = null;
		}

		this.cancelAll(false);
		this.#session += 1;
		this.stopElapsedTimer();
		this.setTab('voice');

		if (this.#settleOpenFallback) {
			window.clearTimeout(this.#settleOpenFallback);
			this.#settleOpenFallback = null;
		}
		if (this.#settleOpenHandler) {
			shell.removeEventListener('animationend', this.#settleOpenHandler);
			this.#settleOpenHandler = null;
		}

		const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (prefersReducedMotion) {
			shell.classList.remove('is-closing');
			shell.classList.add('is-settled');
			if (!shell.open) openPanelModal(shell);
			return;
		}

		shell.classList.remove('is-closing', 'is-settled');
		const settleOpen = () => {
			shell.classList.add('is-settled');
			if (this.#settleOpenHandler) {
				shell.removeEventListener('animationend', this.#settleOpenHandler);
				this.#settleOpenHandler = null;
			}
			if (this.#settleOpenFallback) {
				window.clearTimeout(this.#settleOpenFallback);
				this.#settleOpenFallback = null;
			}
		};
		this.#settleOpenHandler = (event: AnimationEvent) => {
			if (event.target !== shell) return;
			settleOpen();
		};
		shell.addEventListener('animationend', this.#settleOpenHandler);
		this.#settleOpenFallback = window.setTimeout(settleOpen, 220);

		if (!shell.open) openPanelModal(shell);
	}

	private cacheUiNodes(): VoiceUiNodes {
		return {
			recordButton: this.querySelector<HTMLButtonElement>('[data-voice-overlay-record]'),
			restartButton: this.querySelector<HTMLButtonElement>('[data-voice-overlay-restart]'),
			stopButton: this.querySelector<HTMLButtonElement>('[data-voice-overlay-stop]'),
			primaryIcon: this.querySelector<HTMLElement>('[data-voice-overlay-primary-icon]'),
			liveLabel: this.querySelector<HTMLElement>('[data-voice-overlay-live-label]'),
			controlsNode: this.querySelector<HTMLElement>('[data-voice-overlay-controls]'),
			livebar: this.querySelector<HTMLElement>('[data-voice-overlay-livebar]'),
			actionsNode: this.querySelector<HTMLElement>('[data-voice-overlay-actions]'),
			processingNode: this.querySelector<HTMLElement>('[data-voice-overlay-processing]'),
			stageNode: this.querySelector<HTMLElement>('[data-voice-overlay-stage]'),
			statusNode: this.querySelector<HTMLElement>('[data-voice-overlay-status]'),
			subtitle: this.querySelector<HTMLElement>('[data-voice-overlay-subtitle]'),
			helpButton: this.querySelector<HTMLButtonElement>('[data-voice-overlay-tour-help]'),
		};
	}

	private async openQuickTour() {
		const { showAppointmentQuickTour } = await import('../lib/appointment-voice-tour');
		if (!this.isConnected) return;
		showAppointmentQuickTour(this.#tab);
	}

	close() {
		const shell = this.querySelector<HTMLDialogElement>('[data-voice-overlay-shell]');
		if (!shell?.open) {
			this.cancelAll(true);
			return;
		}

		if (shell.classList.contains('is-closing')) return;

		if (this.#settleOpenFallback) {
			window.clearTimeout(this.#settleOpenFallback);
			this.#settleOpenFallback = null;
		}
		if (this.#settleOpenHandler) {
			shell.removeEventListener('animationend', this.#settleOpenHandler);
			this.#settleOpenHandler = null;
		}

		// Cortar micrófono/visualizer de inmediato para que el cierre se sienta al toque.
		this.cancelAll(true);

		const finishClose = () => {
			window.clearTimeout(this.#closeTimer);
			this.#closeTimer = null;
			shell.classList.remove('is-closing', 'is-settled');
			if (shell.open) shell.close();
		};

		const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (prefersReducedMotion) {
			finishClose();
			return;
		}

		shell.classList.add('is-closing');
		shell.classList.remove('is-settled');
		this.#closeTimer = window.setTimeout(finishClose, 140);
	}

	private isSessionActive(session: number) {
		return this.#session === session;
	}

	private clearUiTimers() {
		if (this.#statusFadeTimer) {
			window.clearTimeout(this.#statusFadeTimer);
			this.#statusFadeTimer = null;
		}

		if (this.#autoCloseTimer) {
			window.clearTimeout(this.#autoCloseTimer);
			this.#autoCloseTimer = null;
		}

		if (this.#closeTimer) {
			window.clearTimeout(this.#closeTimer);
			this.#closeTimer = null;
		}
	}

	private abortDraftRequest() {
		this.#draftAbortController?.abort();
		this.#draftAbortController = null;
		this.#scanAbortController?.abort();
		this.#scanAbortController = null;
	}

	private setTab(tab: VoiceTab) {
		// Al cambiar de pestaña cortamos cualquier grabación/proceso en curso.
		if (this.#tab !== tab) {
			this.cancelAll(false);
		}
		this.#tab = tab;
		this.dataset.voiceMode = tab;
		this.setError('');
		this.setTranscript('');
		this.setState('idle');

		this.querySelectorAll<HTMLButtonElement>('[data-voice-overlay-tab]').forEach((button) => {
			const isActive = button.dataset.voiceOverlayTab === tab;
			button.classList.toggle('is-active', isActive);
			button.setAttribute('aria-selected', isActive ? 'true' : 'false');
		});

		const subtitle = this.#ui?.subtitle;
		if (subtitle) {
			subtitle.textContent =
				tab === 'scan' ? 'Escaneá tu agenda escrita a mano' : 'Describe la cita con tu voz';
		}

		const helpButton = this.#ui?.helpButton;
		if (helpButton) {
			helpButton.setAttribute(
				'aria-label',
				tab === 'scan'
					? 'Guía para escanear agenda escrita a mano'
					: 'Guía de cita rápida por voz'
			);
		}
	}

	private setProcessingLabel(text: string) {
		const label = this.querySelector<HTMLElement>('[data-voice-overlay-processing-label]');
		if (label) label.textContent = text;
	}

	private async handleScanFile(file: File) {
		this.setError('');

		const rawType = String(file.type || '').toLowerCase();
		const mimeType = rawType === 'image/jpg' ? 'image/jpeg' : rawType;
		if (!ALLOWED_SCAN_TYPES.has(mimeType)) {
			this.setError('Formato no soportado. Usá una foto JPG, PNG o WEBP.');
			return;
		}
		if (file.size <= 0) {
			this.setError('La imagen está vacía.');
			return;
		}
		if (file.size > MAX_SCAN_IMAGE_BYTES) {
			this.setError('La imagen es muy pesada (máx. 12 MB).');
			return;
		}

		const session = this.#session;
		this.setProcessingLabel('Optimizando imagen…');
		this.setState('processing');
		this.#scanAbortController = new AbortController();
		const signal = this.#scanAbortController.signal;

		try {
			const prepared = await prepareAgendaScanImage(file, { signal });
			if (!this.isSessionActive(session)) return;

			this.setProcessingLabel('Analizando tu agenda…');

			const formData = new FormData();
			formData.append('image', prepared, prepared.name || 'agenda.jpg');

			const response = await fetch('/api/ai/appointments/image-draft', {
				method: 'POST',
				body: formData,
				credentials: 'same-origin',
				signal,
			});

			if (!this.isSessionActive(session)) return;

			const payload = (await response.json()) as {
				status?: string;
				message?: string;
				data?: { appointments?: unknown[] };
			};

			if (!response.ok || payload.status !== 'success' || !Array.isArray(payload.data?.appointments)) {
				throw new Error(payload.message || 'No fue posible leer la agenda.');
			}

			const appointments = payload.data.appointments;
			if (appointments.length === 0) {
				if (!this.isSessionActive(session)) return;
				this.setState('idle');
				this.setError('No se detectaron citas legibles en la imagen. Probá con otra foto.');
				return;
			}

			let imageDataUrl = '';
			try {
				imageDataUrl = await this.readFileAsDataUrl(prepared);
			} catch {
				imageDataUrl = '';
			}

			document.dispatchEvent(
				new CustomEvent('agenda-scan:success', {
					detail: { appointments, imageDataUrl },
				})
			);

			this.close();
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;
			if (error instanceof Error && error.name === 'AbortError') return;
			if (!this.isSessionActive(session)) return;
			this.setState('idle');
			this.setError(error instanceof Error ? error.message : 'No fue posible leer la agenda.');
		} finally {
			this.#scanAbortController = null;
		}
	}

	private readFileAsDataUrl(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result || ''));
			reader.onerror = () => reject(reader.error);
			reader.readAsDataURL(file);
		});
	}

	private cancelAll(invalidateSession = true) {
		if (invalidateSession) {
			this.#session += 1;
		}

		destroyActiveBookmateTour();
		this.clearUiTimers();
		this.abortDraftRequest();

		if (this.#maxRecordingTimer) {
			window.clearTimeout(this.#maxRecordingTimer);
			this.#maxRecordingTimer = null;
		}

		this.stopElapsedTimer();
		this.stopRecording(false);
		this.teardownAudioAnalysis();
		this.#visualizer?.cancelCollapse();
		this.#visualizer?.setMode('off');
		this.#audioChunks = [];
		this.#recordingBudgetRemainingMs = MAX_RECORDING_MS;
		this.#elapsedBeforePause = 0;
	}

	private handleDocumentClick = (event: Event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;

		const trigger = target.closest<HTMLElement>('[data-open-appointment-voice]');
		if (!trigger) return;

		event.preventDefault();
		const mode = trigger.dataset.appointmentVoiceMode === 'inline' ? 'inline' : 'navigate';
		this.open({ mode });
	};

	private handleVisibilityChange = () => {
		if (document.hidden) {
			this.pauseForBackground();
			return;
		}
		this.resumeFromBackground();
	};

	private handlePageHide = () => {
		this.pauseForBackground();
	};

	/** Corta mic/rAF/timers al backgroundear sin cerrar el overlay. */
	private pauseForBackground() {
		const state = this.dataset.voiceState as VoiceUiState | undefined;
		if (state === 'recording' || state === 'paused') {
			void this.stopRecording(false);
			this.setError(
				'La grabación se detuvo al salir de la app. Tocá el micrófono para empezar de nuevo.'
			);
		}

		this.clearMaxRecordingTimer();
		this.stopElapsedTimer();
		this.teardownAudioAnalysis();
		this.#visualizer?.cancelCollapse();
		this.#visualizer?.setMode('off');
	}

	private resumeFromBackground() {
		const shell = this.querySelector<HTMLDialogElement>('[data-voice-overlay-shell]');
		if (!shell?.open) return;

		const state = this.dataset.voiceState as VoiceUiState | undefined;
		if (state === 'idle' || state === 'paused' || !state) {
			this.#visualizer?.setMode('idle');
		}
	}

	private handleRecordToggle = () => {
		const state = this.dataset.voiceState as VoiceUiState | undefined;
		if (state === 'recording') {
			this.pauseRecording();
			return;
		}
		if (state === 'paused') {
			this.resumeRecording();
			return;
		}
		void this.startRecording();
	};

	private handleStopRecording = () => {
		const state = this.dataset.voiceState;
		if (state !== 'recording' && state !== 'paused') return;
		void this.stopRecording(true);
	};

	private handleRestartRecording = () => {
		const state = this.dataset.voiceState;
		if (state !== 'recording' && state !== 'paused') return;
		void this.restartRecording();
	};

	private updateStatus(state: VoiceUiState) {
		const statusNode = this.#ui?.statusNode;
		if (!statusNode) return;

		const nextText = AppointmentVoiceOverlay.STATUS_LABELS[state];
		const shouldHide = state === 'collapsing' || state === 'processing';

		if (this.#statusFadeTimer) {
			window.clearTimeout(this.#statusFadeTimer);
			this.#statusFadeTimer = null;
		}

		if (shouldHide) {
			if (statusNode.classList.contains('hidden')) return;
			statusNode.classList.add('is-leaving');
			this.#statusFadeTimer = window.setTimeout(() => {
				statusNode.classList.add('hidden');
				statusNode.classList.remove('is-leaving', 'is-entering');
				this.#statusFadeTimer = null;
			}, 180);
			return;
		}

		statusNode.classList.remove('hidden');

		if (statusNode.textContent === nextText && !statusNode.classList.contains('is-leaving')) {
			return;
		}

		statusNode.classList.add('is-leaving');
		this.#statusFadeTimer = window.setTimeout(() => {
			statusNode.textContent = nextText;
			statusNode.classList.remove('is-leaving');
			statusNode.classList.add('is-entering');
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					statusNode.classList.remove('is-entering');
					this.#statusFadeTimer = null;
				});
			});
		}, 180);
	}

	private formatRecordingClock(ms: number) {
		const totalSeconds = Math.max(0, Math.floor(ms / 1000));
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	}

	private getElapsedRecordingMs() {
		if (this.#recordingStartedAt <= 0 && this.#elapsedBeforePause <= 0) return 0;
		if (this.dataset.voiceState === 'paused') return this.#elapsedBeforePause;
		if (this.#recordingStartedAt <= 0) return this.#elapsedBeforePause;
		return this.#elapsedBeforePause + (Date.now() - this.#recordingStartedAt);
	}

	private updateRecordingTimer() {
		const timerNode = this.querySelector<HTMLElement>('[data-voice-overlay-timer]');
		if (!timerNode) return;

		const elapsed = this.getElapsedRecordingMs();
		timerNode.textContent = this.formatRecordingClock(elapsed);
		timerNode.classList.toggle('is-near-limit', elapsed >= MAX_RECORDING_MS * 0.85);
		timerNode.setAttribute('aria-label', `Tiempo de grabación: ${timerNode.textContent}`);
	}

	private startElapsedTimer(reset = true) {
		if (this.#elapsedTimerInterval) {
			window.clearInterval(this.#elapsedTimerInterval);
			this.#elapsedTimerInterval = null;
		}

		if (reset) {
			this.#elapsedBeforePause = 0;
			this.#recordingStartedAt = Date.now();
		} else if (this.#recordingStartedAt <= 0) {
			this.#recordingStartedAt = Date.now();
		}

		const livebar = this.querySelector<HTMLElement>('[data-voice-overlay-livebar]');
		livebar?.classList.remove('hidden');
		this.updateRecordingTimer();
		this.#elapsedTimerInterval = window.setInterval(() => this.updateRecordingTimer(), 250);
	}

	private stopElapsedTimer() {
		if (this.#elapsedTimerInterval) {
			window.clearInterval(this.#elapsedTimerInterval);
			this.#elapsedTimerInterval = null;
		}
		this.#recordingStartedAt = 0;
		this.#elapsedBeforePause = 0;

		const timerNode = this.querySelector<HTMLElement>('[data-voice-overlay-timer]');
		const livebar = this.querySelector<HTMLElement>('[data-voice-overlay-livebar]');
		if (timerNode) {
			timerNode.classList.remove('is-near-limit');
			timerNode.textContent = this.formatRecordingClock(0);
		}
		livebar?.classList.add('hidden');
	}

	private clearMaxRecordingTimer() {
		if (this.#maxRecordingTimer) {
			window.clearTimeout(this.#maxRecordingTimer);
			this.#maxRecordingTimer = null;
		}
	}

	private armMaxRecordingTimer(remainingMs = this.#recordingBudgetRemainingMs) {
		this.clearMaxRecordingTimer();
		const budget = Math.max(0, remainingMs);
		this.#recordingBudgetRemainingMs = budget;
		if (budget <= 0) {
			void this.stopRecording(true);
			return;
		}
		this.#maxRecordingTimer = window.setTimeout(() => {
			void this.stopRecording(true);
		}, budget);
	}

	private setState(state: VoiceUiState) {
		this.dataset.voiceState = state;
		const ui = this.#ui;
		const recordButton = ui?.recordButton ?? null;
		const restartButton = ui?.restartButton ?? null;
		const stopButton = ui?.stopButton ?? null;
		const primaryIcon = ui?.primaryIcon ?? null;
		const liveLabel = ui?.liveLabel ?? null;
		const controlsNode = ui?.controlsNode ?? null;
		const livebar = ui?.livebar ?? null;
		const actionsNode = ui?.actionsNode ?? null;
		const processingNode = ui?.processingNode ?? null;
		const stageNode = ui?.stageNode ?? null;

		const isLive = state === 'recording' || state === 'paused';
		const isBusy = state === 'processing' || state === 'collapsing' || state === 'success';

		if (controlsNode) {
			controlsNode.hidden = isBusy;
		}

		if (recordButton) {
			recordButton.disabled = isBusy;
			recordButton.setAttribute(
				'aria-label',
				state === 'recording'
					? 'Pausar grabación'
					: state === 'paused'
						? 'Reanudar grabación'
						: 'Empezar a grabar'
			);
		}

		if (primaryIcon) {
			primaryIcon.textContent =
				state === 'recording' ? 'pause' : state === 'paused' ? 'play_arrow' : 'mic';
		}

		if (restartButton) {
			restartButton.disabled = !isLive;
		}

		if (stopButton) {
			stopButton.disabled = !isLive;
		}

		if (liveLabel) {
			liveLabel.textContent = state === 'paused' ? 'En pausa' : 'Escuchando…';
		}

		livebar?.classList.toggle('hidden', !isLive);

		stageNode?.classList.toggle('is-collapsing', state === 'collapsing');

		actionsNode?.classList.add('hidden');

		this.updateStatus(state);

		processingNode?.classList.toggle('hidden', state !== 'processing');

		if (state === 'idle' || state === 'paused') {
			if (state === 'idle') this.#visualizer?.setAnalyser(null);
			this.#visualizer?.setMode('idle');
		} else if (state === 'recording') {
			this.#visualizer?.setMode('live');
		} else if (state === 'processing' || state === 'collapsing') {
			this.#visualizer?.setAnalyser(null);
		} else if (state === 'success') {
			this.#visualizer?.setMode('off');
		}
	}

	private async playCollapseTransition(session: number) {
		this.setState('collapsing');
		this.teardownAudioAnalysis();
		await this.#visualizer?.playCollapse();
		if (!this.isSessionActive(session)) return false;
		this.setProcessingLabel('Transcribiendo y completando datos…');
		this.setState('processing');
		return true;
	}

	private teardownAudioAnalysis() {
		this.#analyser = null;
		this.#visualizer?.setAnalyser(null);
		void this.#audioContext?.close().catch(() => undefined);
		this.#audioContext = null;
	}

	private setupAudioAnalysis(stream: MediaStream) {
		if (typeof AudioContext === 'undefined') return;

		this.teardownAudioAnalysis();
		this.#audioContext = new AudioContext();
		const source = this.#audioContext.createMediaStreamSource(stream);
		this.#analyser = this.#audioContext.createAnalyser();
		this.#analyser.fftSize = 512;
		this.#analyser.smoothingTimeConstant = 0.68;
		source.connect(this.#analyser);
		this.#visualizer?.setAnalyser(this.#analyser);
	}

	private setError(message: string) {
		const errorNode = this.querySelector<HTMLElement>('[data-voice-overlay-error]');
		if (!errorNode) return;
		if (!message) {
			errorNode.textContent = '';
			errorNode.classList.add('hidden');
			return;
		}
		errorNode.textContent = message;
		errorNode.classList.remove('hidden');
	}

	private setTranscript(message: string) {
		const transcriptWrap = this.querySelector<HTMLElement>('[data-voice-overlay-transcript-wrap]');
		const transcriptNode = this.querySelector<HTMLElement>('[data-voice-overlay-transcript]');
		if (!transcriptWrap || !transcriptNode) return;
		if (!message) {
			transcriptNode.textContent = '';
			transcriptWrap.classList.add('hidden');
			return;
		}
		transcriptNode.textContent = `“${message}”`;
		transcriptWrap.classList.remove('hidden');
	}

	private handleContinue = () => {
		this.close();
	};

	private resolveMimeType() {
		if (typeof MediaRecorder === 'undefined') return '';
		if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
		if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
		if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
		return '';
	}

	private async startRecording() {
		const session = this.#session;
		this.setError('');
		this.setTranscript('');

		if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
			this.setError('Tu navegador no soporta grabación de voz.');
			return;
		}

		const mimeType = this.resolveMimeType();
		if (!mimeType) {
			this.setError('No hay un formato de audio compatible en este navegador.');
			return;
		}

		try {
			this.#mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
			if (!this.isSessionActive(session)) {
				this.#mediaStream.getTracks().forEach((track) => track.stop());
				this.#mediaStream = null;
				return;
			}

			this.#audioChunks = [];
			this.#mediaRecorder = new MediaRecorder(this.#mediaStream, { mimeType });

			this.#mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) this.#audioChunks.push(event.data);
			};

			this.#mediaRecorder.onstop = () => {
				void this.handleRecordingComplete(mimeType, session);
			};

			this.#mediaRecorder.start();
			this.setupAudioAnalysis(this.#mediaStream);
			this.#recordingBudgetRemainingMs = MAX_RECORDING_MS;
			this.setState('recording');
			this.startElapsedTimer(true);
			this.armMaxRecordingTimer(MAX_RECORDING_MS);
		} catch {
			if (!this.isSessionActive(session)) return;
			this.setError('No fue posible acceder al micrófono.');
			this.setState('idle');
		}
	}

	private pauseRecording() {
		const recorder = this.#mediaRecorder;
		if (!recorder || recorder.state !== 'recording') return;

		try {
			recorder.pause();
		} catch {
			return;
		}

		this.#elapsedBeforePause = this.getElapsedRecordingMs();
		this.#recordingStartedAt = 0;
		this.#recordingBudgetRemainingMs = Math.max(
			0,
			MAX_RECORDING_MS - this.#elapsedBeforePause
		);
		this.clearMaxRecordingTimer();
		this.setState('paused');
		this.updateRecordingTimer();
	}

	private resumeRecording() {
		const recorder = this.#mediaRecorder;
		if (!recorder || recorder.state !== 'paused') return;

		try {
			recorder.resume();
		} catch {
			return;
		}

		this.#recordingStartedAt = Date.now();
		this.setState('recording');
		this.startElapsedTimer(false);
		this.armMaxRecordingTimer(this.#recordingBudgetRemainingMs);
		if (this.#mediaStream) this.setupAudioAnalysis(this.#mediaStream);
	}

	private async restartRecording() {
		await this.stopRecording(false);
		await this.startRecording();
	}

	private async stopRecording(process: boolean) {
		this.clearMaxRecordingTimer();
		this.stopElapsedTimer();

		const recorder = this.#mediaRecorder;
		if (recorder && (recorder.state === 'recording' || recorder.state === 'paused')) {
			if (process) {
				try {
					if (recorder.state === 'paused') recorder.resume();
				} catch {
					// ignore
				}
				recorder.stop();
			} else {
				recorder.onstop = null;
				try {
					recorder.stop();
				} catch {
					// ignore
				}
			}
		}

		this.#mediaRecorder = null;
		this.#mediaStream?.getTracks().forEach((track) => track.stop());
		this.#mediaStream = null;
		this.#recordingBudgetRemainingMs = MAX_RECORDING_MS;
		this.#elapsedBeforePause = 0;

		if (!process) {
			this.teardownAudioAnalysis();
			this.#audioChunks = [];
			this.setState('idle');
		}
	}

	private async handleRecordingComplete(mimeType: string, session: number) {
		if (!this.isSessionActive(session)) return;

		const blob = new Blob(this.#audioChunks, { type: mimeType });
		this.#audioChunks = [];

		if (blob.size <= 0) {
			if (!this.isSessionActive(session)) return;
			this.setError('No se capturó audio. Intenta de nuevo.');
			this.setState('idle');
			return;
		}

		const shouldContinue = await this.playCollapseTransition(session);
		if (!shouldContinue || !this.isSessionActive(session)) return;

		this.#draftAbortController = new AbortController();

		try {
			const extension = mimeType.includes('mp4') ? 'cita.mp4' : 'cita.webm';
			const formData = new FormData();
			formData.append('audio', blob, extension);

			const response = await fetch('/api/ai/appointments/voice-draft', {
				method: 'POST',
				body: formData,
				credentials: 'same-origin',
				signal: this.#draftAbortController.signal,
			});

			if (!this.isSessionActive(session)) return;

			const payload = (await response.json()) as {
				status?: string;
				message?: string;
				data?: { transcript?: string; draft?: AppointmentAiDraft };
			};

			if (!response.ok || payload.status !== 'success' || !payload.data?.draft) {
				throw new Error(payload.message || 'No fue posible procesar la cita por voz.');
			}

			if (!this.isSessionActive(session)) return;

			const transcript = String(payload.data.transcript || '').trim();
			const draft = payload.data.draft;
			const inlineFill =
				this.#mode === 'inline' &&
				Boolean(document.querySelector<HTMLDialogElement>('[data-appointment-modal]')?.open);

			const stored: StoredAppointmentAiDraft = {
				draft,
				transcript,
				ts: Date.now(),
				inlineFill,
			};
			sessionStorage.setItem(APPOINTMENT_AI_DRAFT_STORAGE_KEY, JSON.stringify(stored));

			this.dispatchEvent(
				new CustomEvent('appointment-voice:success', {
					bubbles: true,
					detail: stored,
				})
			);

			if (inlineFill) {
				this.close();
				return;
			}

			this.setTranscript(transcript);
			this.setState('success');
			this.#autoCloseTimer = window.setTimeout(() => {
				this.#autoCloseTimer = null;
				this.close();
			}, 400);
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;
			if (!this.isSessionActive(session)) return;
			this.setError(
				error instanceof Error ? error.message : 'No fue posible procesar la cita por voz.'
			);
			this.setState('idle');
		} finally {
			this.#draftAbortController = null;
		}
	}
}

if (!customElements.get('appointment-voice-overlay')) {
	customElements.define('appointment-voice-overlay', AppointmentVoiceOverlay);
}

export { AppointmentVoiceOverlay };
