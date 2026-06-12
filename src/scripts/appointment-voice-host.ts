import type { StoredAppointmentAiDraft } from '../lib/appointment-ai-types';
import { ROLES } from '../config/roles';
import { AppointmentsClient } from './calendar/appointments-client';
import type { AppointmentModalConfig } from './calendar/appointment-modal';
import { toInt, toPositiveInt } from './calendar/utils';

type AppointmentModalApi = {
	setClient: (client: AppointmentsClient) => void;
	configure: (config: AppointmentModalConfig) => void;
	openCreateWithAiDraft: (
		draft: import('../lib/appointment-ai-types').AppointmentAiDraft,
		context?: import('./calendar/appointment-modal').OpenCreateContext
	) => void;
};

const hasAppointmentModalApi = (value: unknown): value is AppointmentModalApi => {
	if (!value || typeof value !== 'object') return false;
	const source = value as AppointmentModalApi;
	return (
		typeof source.setClient === 'function' &&
		typeof source.configure === 'function' &&
		typeof source.openCreateWithAiDraft === 'function'
	);
};

class AppointmentVoiceHost extends HTMLElement {
	#bound = false;
	#listeners: AbortController | null = null;
	#bindRetryAttempts = 0;
	#bindRetryTimer: number | null = null;
	#client = new AppointmentsClient();
	#ready = false;
	#pendingDraft: StoredAppointmentAiDraft | null = null;
	#redirectAfterCreate = false;

	connectedCallback() {
		if (this.#bound || document.querySelector('calendar-manager')) return;
		this.#bound = true;
		void this.bootstrap();
	}

	disconnectedCallback() {
		this.#bound = false;
		this.#listeners?.abort();
		this.#listeners = null;
		if (this.#bindRetryTimer) {
			window.clearTimeout(this.#bindRetryTimer);
			this.#bindRetryTimer = null;
		}
		this.#bindRetryAttempts = 0;
	}

	private getAppointmentModal(): AppointmentModalApi | null {
		const modal =
			this.querySelector<HTMLElement>('appointment-modal') ??
			document.querySelector<HTMLElement>('appointment-modal');
		return hasAppointmentModalApi(modal) ? modal : null;
	}

	private scheduleBindRetry() {
		if (!this.isConnected) return;
		this.#bindRetryAttempts += 1;
		if (this.#bindRetryAttempts > 10) {
			console.error('[appointment-voice-host] appointment-modal was not found during initialization.');
			return;
		}
		if (this.#bindRetryTimer) {
			window.clearTimeout(this.#bindRetryTimer);
		}
		this.#bindRetryTimer = window.setTimeout(() => {
			void this.bootstrap();
		}, 50);
	}

	private async bootstrap() {
		await customElements.whenDefined('appointment-modal');

		const modal = this.getAppointmentModal();
		if (!modal) {
			this.scheduleBindRetry();
			return;
		}

		this.#listeners?.abort();
		this.#listeners = new AbortController();
		const signal = this.#listeners.signal;

		modal.setClient(this.#client);

		const dialog = this.querySelector<HTMLDialogElement>('[data-appointment-modal]');
		dialog?.addEventListener(
			'close',
			() => {
				this.#redirectAfterCreate = false;
			},
			{ signal }
		);

		document.addEventListener('appointment-voice:success', this.handleVoiceSuccess as EventListener, {
			signal,
		});
		this.addEventListener('appointment:changed', this.handleAppointmentChanged as EventListener, {
			signal,
		});

		try {
			const data = await this.#client.getMeta();
			const roleId = toInt(data.session?.role_id, 0);
			let currentProfessionalId = toPositiveInt(data.session?.professional_id, 0);

			const professionals = Array.isArray(data.professionals)
				? data.professionals
						.map((item) => ({
							id: toPositiveInt(item?.id_professional, 0),
							name: String(item?.display_name || '').trim(),
						}))
						.filter((item) => item.id > 0 && item.name)
				: [];

			const locations = Array.isArray(data.locations)
				? data.locations
						.map((item) => ({
							id: toPositiveInt(item?.id_location, 0),
							name: String(item?.name || '').trim(),
						}))
						.filter((item) => item.id > 0 && item.name)
				: [];

			const services = Array.isArray(data.services)
				? data.services
						.map((item) => ({
							id: toPositiveInt(item?.id_service, 0),
							name: String(item?.name || '').trim(),
						}))
						.filter((item) => item.id > 0 && item.name)
				: [];

			if (roleId === ROLES.PROFESIONAL && currentProfessionalId <= 0 && professionals.length === 1) {
				currentProfessionalId = professionals[0].id;
			}

			modal.configure({
				roleId,
				currentProfessionalId,
				professionals,
				locations,
				services,
			});

			this.#ready = true;
			if (this.#pendingDraft?.draft) {
				this.openDraftModal(modal, this.#pendingDraft);
				this.#pendingDraft = null;
			}
		} catch (error) {
			console.error('[appointment-voice-host] failed to load appointment meta.', error);
		}
	}

	private openDraftModal(modal: AppointmentModalApi, stored: StoredAppointmentAiDraft) {
		this.#redirectAfterCreate = true;
		modal.openCreateWithAiDraft(stored.draft);
	}

	private handleVoiceSuccess = (event: Event) => {
		if (document.querySelector('calendar-manager')) return;

		const customEvent = event as CustomEvent<StoredAppointmentAiDraft>;
		const stored = customEvent.detail;
		if (!stored?.draft) return;

		const modal = this.getAppointmentModal();
		if (!this.#ready || !modal) {
			this.#pendingDraft = stored;
			return;
		}

		this.openDraftModal(modal, stored);
	};

	private handleAppointmentChanged = (event: Event) => {
		if (!this.#redirectAfterCreate) return;

		const customEvent = event as CustomEvent<{ mode?: string }>;
		if (customEvent.detail?.mode !== 'create') return;

		this.#redirectAfterCreate = false;
		window.location.href = '/panel/calendar';
	};
}

if (!customElements.get('appointment-voice-host')) {
	customElements.define('appointment-voice-host', AppointmentVoiceHost);
}

export { AppointmentVoiceHost };
