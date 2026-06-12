import {
	APPOINTMENT_AI_DRAFT_STORAGE_KEY,
	type AppointmentAiDraft,
	type StoredAppointmentAiDraft,
} from '../lib/appointment-ai-types';

type VoiceOverlayMode = 'navigate' | 'inline';

const MAX_RECORDING_MS = 60_000;

class AppointmentVoiceOverlay extends HTMLElement {
	#bound = false;
	#listeners: AbortController | null = null;
	#mediaRecorder: MediaRecorder | null = null;
	#mediaStream: MediaStream | null = null;
	#audioChunks: Blob[] = [];
	#recordingTimer: number | null = null;
	#mode: VoiceOverlayMode = 'navigate';

	connectedCallback() {
		if (this.#bound) return;
		this.#bound = true;
		this.#listeners = new AbortController();
		const signal = this.#listeners.signal;

		document.addEventListener('click', this.handleDocumentClick, { signal });
		this.querySelector('[data-voice-overlay-close]')?.addEventListener('click', () => this.close(), {
			signal,
		});
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
	}

	disconnectedCallback() {
		this.#bound = false;
		this.#listeners?.abort();
		this.#listeners = null;
		this.stopRecording(false);
	}

	open(options: { mode?: VoiceOverlayMode } = {}) {
		this.#mode = options.mode === 'inline' ? 'inline' : 'navigate';
		this.setState('idle');
		this.setError('');
		this.setTranscript('');
		const continueButton = this.querySelector<HTMLButtonElement>('[data-voice-overlay-continue]');
		if (continueButton) {
			continueButton.textContent =
				this.#mode === 'inline' ? 'Ver formulario precargado' : 'Ir al calendario';
		}
		const shell = this.querySelector<HTMLElement>('[data-voice-overlay-shell]');
		shell?.classList.remove('hidden');
		shell?.setAttribute('aria-hidden', 'false');
	}

	close() {
		this.stopRecording(false);
		const shell = this.querySelector<HTMLElement>('[data-voice-overlay-shell]');
		shell?.classList.add('hidden');
		shell?.setAttribute('aria-hidden', 'true');
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
			this.stopRecording(true);
			return;
		}
		void this.startRecording();
	};

	private setState(state: 'idle' | 'recording' | 'processing' | 'success') {
		this.dataset.voiceState = state;
		const recordButton = this.querySelector<HTMLButtonElement>('[data-voice-overlay-record]');
		const actionsNode = this.querySelector<HTMLElement>('[data-voice-overlay-actions]');
		const statusNode = this.querySelector<HTMLElement>('[data-voice-overlay-status]');
		const processingNode = this.querySelector<HTMLElement>('[data-voice-overlay-processing]');

		if (recordButton) {
			recordButton.disabled = state === 'processing';
			recordButton.hidden = state === 'success';
			const icon = recordButton.querySelector<HTMLElement>('[data-voice-overlay-record-icon]');
			if (icon) {
				icon.textContent = state === 'recording' ? 'stop_circle' : 'mic';
			}
			recordButton.setAttribute(
				'aria-label',
				state === 'recording' ? 'Detener grabación' : 'Empezar a grabar'
			);
		}

		actionsNode?.classList.toggle('hidden', state !== 'success');

		if (statusNode) {
			const labels: Record<typeof state, string> = {
				idle: 'Toca el micrófono y describe la cita.',
				recording: 'Grabando… Toca de nuevo para enviar.',
				processing: 'Procesando tu cita…',
				success: 'Revisá lo que escuché antes de continuar.',
			};
			statusNode.textContent = labels[state];
		}

		processingNode?.classList.toggle('hidden', state !== 'processing');
		recordButton?.classList.toggle('is-recording', state === 'recording');
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
		if (this.#mode === 'navigate') {
			this.close();
			window.location.href = '/panel/calendar?ai_draft=1';
			return;
		}

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
			this.#audioChunks = [];
			this.#mediaRecorder = new MediaRecorder(this.#mediaStream, { mimeType });

			this.#mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) this.#audioChunks.push(event.data);
			};

			this.#mediaRecorder.onstop = () => {
				void this.handleRecordingComplete(mimeType);
			};

			this.#mediaRecorder.start();
			this.setState('recording');

			this.#recordingTimer = window.setTimeout(() => {
				this.stopRecording(true);
			}, MAX_RECORDING_MS);
		} catch {
			this.setError('No fue posible acceder al micrófono.');
			this.setState('idle');
		}
	}

	private stopRecording(process: boolean) {
		if (this.#recordingTimer) {
			window.clearTimeout(this.#recordingTimer);
			this.#recordingTimer = null;
		}

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
			this.#audioChunks = [];
			this.setState('idle');
		}
	}

	private async handleRecordingComplete(mimeType: string) {
		const blob = new Blob(this.#audioChunks, { type: mimeType });
		this.#audioChunks = [];

		if (blob.size <= 0) {
			this.setError('No se capturó audio. Intenta de nuevo.');
			this.setState('idle');
			return;
		}

		this.setState('processing');

		try {
			const extension = mimeType.includes('mp4') ? 'cita.mp4' : 'cita.webm';
			const formData = new FormData();
			formData.append('audio', blob, extension);

			const response = await fetch('/api/ai/appointments/voice-draft', {
				method: 'POST',
				body: formData,
				credentials: 'same-origin',
			});

			const payload = (await response.json()) as {
				status?: string;
				message?: string;
				data?: { transcript?: string; draft?: AppointmentAiDraft };
			};

			if (!response.ok || payload.status !== 'success' || !payload.data?.draft) {
				throw new Error(payload.message || 'No fue posible procesar la cita por voz.');
			}

			const transcript = String(payload.data.transcript || '').trim();
			const draft = payload.data.draft;
			this.setTranscript(transcript);
			this.setState('success');

			const stored: StoredAppointmentAiDraft = {
				draft,
				transcript,
				ts: Date.now(),
			};
			sessionStorage.setItem(APPOINTMENT_AI_DRAFT_STORAGE_KEY, JSON.stringify(stored));

			this.dispatchEvent(
				new CustomEvent('appointment-voice:success', {
					bubbles: true,
					detail: stored,
				})
			);
		} catch (error) {
			this.setError(
				error instanceof Error ? error.message : 'No fue posible procesar la cita por voz.'
			);
			this.setState('idle');
		}
	}
}

if (!customElements.get('appointment-voice-overlay')) {
	customElements.define('appointment-voice-overlay', AppointmentVoiceOverlay);
}

export { AppointmentVoiceOverlay };
