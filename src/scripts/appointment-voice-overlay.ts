import {
	APPOINTMENT_AI_DRAFT_STORAGE_KEY,
	type AppointmentAiDraft,
	type StoredAppointmentAiDraft,
} from '../lib/appointment-ai-types';
import { showAppointmentVoiceTour } from '../lib/appointment-voice-tour';
import { destroyActiveBookmateTour } from '../lib/product-tour';
import { AppointmentVoiceVisualizer } from './appointment-voice-visualizer';

type VoiceOverlayMode = 'navigate' | 'inline';
type VoiceUiState = 'idle' | 'recording' | 'collapsing' | 'processing' | 'success';

const MAX_RECORDING_MS = 60_000;

class AppointmentVoiceOverlay extends HTMLElement {
	#bound = false;
	#listeners: AbortController | null = null;
	#mediaRecorder: MediaRecorder | null = null;
	#mediaStream: MediaStream | null = null;
	#audioChunks: Blob[] = [];
	#maxRecordingTimer: number | null = null;
	#elapsedTimerInterval: number | null = null;
	#recordingStartedAt = 0;
	#mode: VoiceOverlayMode = 'navigate';
	#visualizer: AppointmentVoiceVisualizer | null = null;
	#audioContext: AudioContext | null = null;
	#analyser: AnalyserNode | null = null;
	#statusFadeTimer: number | null = null;
	#autoCloseTimer: number | null = null;
	#draftAbortController: AbortController | null = null;
	#session = 0;

	private static readonly STATUS_LABELS: Record<VoiceUiState, string> = {
		idle: 'Toca el micrófono y describe la cita.',
		recording: 'Escuchando… describe la cita.',
		collapsing: '',
		processing: '',
		success: 'Formulario listo. Revisá los datos precargados.',
	};

	connectedCallback() {
		if (this.#bound) return;
		this.#bound = true;
		this.#listeners = new AbortController();
		const signal = this.#listeners.signal;

		const visualizerRoot = this.querySelector<HTMLElement>('[data-voice-overlay-visualizer]');
		if (visualizerRoot) {
			this.#visualizer = new AppointmentVoiceVisualizer(visualizerRoot);
			this.#visualizer.setMode('idle');
		}

		document.addEventListener('click', this.handleDocumentClick, { signal });
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
				showAppointmentVoiceTour();
			},
			{ signal }
		);
		this.querySelector('[data-voice-overlay-record]')?.addEventListener(
			'click',
			this.handleRecordToggle,
			{ signal }
		);
		this.querySelector('[data-voice-overlay-continue]')?.addEventListener(
			'click',
			this.handleContinue,
			{ signal }
		);
		this.querySelector('[data-voice-overlay-discard]')?.addEventListener(
			'click',
			this.handleDiscardRecording,
			{ signal }
		);

		const shell = this.querySelector<HTMLDialogElement>('[data-voice-overlay-shell]');
		shell?.addEventListener(
			'click',
			(event) => {
				if (event.target === shell) this.close();
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
	}

	open(options: { mode?: VoiceOverlayMode } = {}) {
		this.cancelAll(false);
		this.#session += 1;
		this.#mode = options.mode === 'inline' ? 'inline' : 'navigate';
		this.stopElapsedTimer();
		this.setState('idle');
		this.setError('');
		this.setTranscript('');
		this.#visualizer?.setMode('idle');
		const shell = this.querySelector<HTMLDialogElement>('[data-voice-overlay-shell]');
		if (shell && !shell.open) shell.showModal();
	}

	close() {
		this.cancelAll(true);
		const shell = this.querySelector<HTMLDialogElement>('[data-voice-overlay-shell]');
		if (shell?.open) shell.close();
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
	}

	private abortDraftRequest() {
		this.#draftAbortController?.abort();
		this.#draftAbortController = null;
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

	private handleRecordToggle = () => {
		if (this.#mediaRecorder?.state === 'recording') {
			void this.stopRecording(true);
			return;
		}
		void this.startRecording();
	};

	private handleDiscardRecording = () => {
		void this.stopRecording(false);
	};

	private updateStatus(state: VoiceUiState) {
		const statusNode = this.querySelector<HTMLElement>('[data-voice-overlay-status]');
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

	private updateRecordingTimer() {
		const timerNode = this.querySelector<HTMLElement>('[data-voice-overlay-timer]');
		if (!timerNode || this.#recordingStartedAt <= 0) return;

		const elapsed = Date.now() - this.#recordingStartedAt;
		timerNode.textContent = `${this.formatRecordingClock(elapsed)} / ${this.formatRecordingClock(MAX_RECORDING_MS)}`;
		timerNode.classList.toggle('is-near-limit', elapsed >= MAX_RECORDING_MS * 0.85);
		timerNode.setAttribute('aria-label', `Tiempo de grabación: ${timerNode.textContent}`);
	}

	private startElapsedTimer() {
		if (this.#elapsedTimerInterval) {
			window.clearInterval(this.#elapsedTimerInterval);
			this.#elapsedTimerInterval = null;
		}

		this.#recordingStartedAt = Date.now();
		const timerNode = this.querySelector<HTMLElement>('[data-voice-overlay-timer]');
		timerNode?.classList.remove('hidden');
		this.updateRecordingTimer();
		this.#elapsedTimerInterval = window.setInterval(() => this.updateRecordingTimer(), 250);
	}

	private stopElapsedTimer() {
		if (this.#elapsedTimerInterval) {
			window.clearInterval(this.#elapsedTimerInterval);
			this.#elapsedTimerInterval = null;
		}
		this.#recordingStartedAt = 0;

		const timerNode = this.querySelector<HTMLElement>('[data-voice-overlay-timer]');
		if (!timerNode) return;
		timerNode.classList.add('hidden');
		timerNode.classList.remove('is-near-limit');
		timerNode.textContent = `${this.formatRecordingClock(0)} / ${this.formatRecordingClock(MAX_RECORDING_MS)}`;
	}

	private setState(state: VoiceUiState) {
		this.dataset.voiceState = state;
		const recordButton = this.querySelector<HTMLButtonElement>('[data-voice-overlay-record]');
		const discardButton = this.querySelector<HTMLButtonElement>('[data-voice-overlay-discard]');
		const actionsNode = this.querySelector<HTMLElement>('[data-voice-overlay-actions]');
		const processingNode = this.querySelector<HTMLElement>('[data-voice-overlay-processing]');
		const stageNode = this.querySelector<HTMLElement>('[data-voice-overlay-stage]');
		const timerNode = this.querySelector<HTMLElement>('[data-voice-overlay-timer]');

		if (recordButton) {
			recordButton.disabled = state === 'processing' || state === 'collapsing';
			recordButton.hidden = state === 'success' || state === 'processing' || state === 'collapsing';
			recordButton.setAttribute(
				'aria-label',
				state === 'recording' ? 'Detener grabación' : 'Empezar a grabar'
			);
		}

		timerNode?.classList.toggle('hidden', state !== 'recording');

		discardButton?.classList.toggle('hidden', state !== 'recording');

		stageNode?.classList.toggle('is-collapsing', state === 'collapsing');

		actionsNode?.classList.add('hidden');

		this.updateStatus(state);

		processingNode?.classList.toggle('hidden', state !== 'processing');

		if (state === 'idle') {
			this.#visualizer?.setAnalyser(null);
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
			this.setState('recording');
			this.startElapsedTimer();

			this.#maxRecordingTimer = window.setTimeout(() => {
				void this.stopRecording(true);
			}, MAX_RECORDING_MS);
		} catch {
			if (!this.isSessionActive(session)) return;
			this.setError('No fue posible acceder al micrófono.');
			this.setState('idle');
		}
	}

	private async stopRecording(process: boolean) {
		if (this.#maxRecordingTimer) {
			window.clearTimeout(this.#maxRecordingTimer);
			this.#maxRecordingTimer = null;
		}
		this.stopElapsedTimer();

		if (this.#mediaRecorder && this.#mediaRecorder.state === 'recording') {
			if (process) {
				this.#mediaRecorder.stop();
			} else {
				this.#mediaRecorder.onstop = null;
				try {
					this.#mediaRecorder.stop();
				} catch {
					// ignore
				}
			}
		}

		this.#mediaRecorder = null;
		this.#mediaStream?.getTracks().forEach((track) => track.stop());
		this.#mediaStream = null;

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
