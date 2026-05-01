type ChatSession = {
	id_session: number;
	title: string;
	updated_at: string;
};

type ChatMessage = {
	id_message: number;
	role: 'user' | 'assistant';
	content: string;
	created_at: string;
};

type ApiResponse<TData = unknown> = {
	status?: string;
	message?: string;
	data?: TData;
};

class AiChatPanel extends HTMLElement {
	#bound = false;
	#listeners: AbortController | null = null;

	private shell: HTMLElement | null = null;
	private sessionsNode: HTMLElement | null = null;
	private sessionsStateNode: HTMLElement | null = null;
	private messagesNode: HTMLElement | null = null;
	private errorNode: HTMLElement | null = null;
	private form: HTMLFormElement | null = null;
	private input: HTMLTextAreaElement | null = null;
	private sendButton: HTMLButtonElement | null = null;

	private sessions: ChatSession[] = [];
	private activeSessionId = 0;
	private isLoadingSessions = false;
	private isLoadingMessages = false;
	private isSending = false;

	connectedCallback() {
		if (this.#bound) return;
		this.shell = this.querySelector<HTMLElement>('[data-ai-chat-shell]');
		this.sessionsNode = this.querySelector<HTMLElement>('[data-ai-chat-sessions]');
		this.sessionsStateNode = this.querySelector<HTMLElement>('[data-ai-chat-sessions-state]');
		this.messagesNode = this.querySelector<HTMLElement>('[data-ai-chat-messages]');
		this.errorNode = this.querySelector<HTMLElement>('[data-ai-chat-error]');
		this.form = this.querySelector<HTMLFormElement>('[data-ai-chat-form]');
		this.input = this.querySelector<HTMLTextAreaElement>('[data-ai-chat-input]');
		this.sendButton = this.querySelector<HTMLButtonElement>('[data-ai-chat-send]');

		if (!this.shell || !this.messagesNode || !this.form || !this.input) return;

		this.#bound = true;
		this.#listeners = new AbortController();
		const signal = this.#listeners.signal;

		document.addEventListener('click', this.handleDocumentClick, { signal });
		document.addEventListener('keydown', this.handleDocumentKeydown, { signal });
		this.addEventListener('click', this.handlePanelClick, { signal });
		this.form.addEventListener('submit', this.handleSubmit, { signal });
		this.input.addEventListener('input', this.handleInput, { signal });

		this.updateControls();
	}

	disconnectedCallback() {
		this.#bound = false;
		this.#listeners?.abort();
		this.#listeners = null;
		document.body.classList.remove('ai-chat-open');
	}

	private handleDocumentClick = (event: MouseEvent) => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		if (!target.closest('[data-open-ai-chat]')) return;

		event.preventDefault();
		void this.open();
	};

	private handleDocumentKeydown = (event: KeyboardEvent) => {
		if (event.key === 'Escape' && this.isOpen()) {
			this.close();
		}
	};

	private handlePanelClick = (event: MouseEvent) => {
		const target = event.target;
		if (!(target instanceof Element)) return;

		if (target.closest('[data-ai-chat-close]')) {
			this.close();
			return;
		}

		if (target.closest('[data-ai-chat-new]')) {
			this.startNewChat();
			return;
		}

		const sessionButton = target.closest<HTMLElement>('[data-ai-chat-session-id]');
		if (sessionButton) {
			const sessionId = Number(sessionButton.dataset.aiChatSessionId || 0);
			if (sessionId > 0) void this.loadMessages(sessionId);
		}
	};

	private handleSubmit = (event: SubmitEvent) => {
		event.preventDefault();
		void this.sendMessage();
	};

	private handleInput = () => {
		if (!this.input) return;
		this.input.style.height = 'auto';
		this.input.style.height = `${Math.min(this.input.scrollHeight, 128)}px`;
		this.updateControls();
	};

	private isOpen() {
		return Boolean(this.shell?.classList.contains('is-open'));
	}

	private async open() {
		if (!this.shell) return;
		this.shell.classList.add('is-open');
		this.shell.setAttribute('aria-hidden', 'false');
		document.body.classList.add('ai-chat-open');
		window.setTimeout(() => this.input?.focus(), 80);

		if (this.sessions.length === 0 && !this.isLoadingSessions) {
			await this.loadSessions();
		}
	}

	private close() {
		if (!this.shell) return;
		this.shell.classList.remove('is-open');
		this.shell.setAttribute('aria-hidden', 'true');
		document.body.classList.remove('ai-chat-open');
	}

	private startNewChat() {
		this.activeSessionId = 0;
		this.clearError();
		this.renderSessions();
		this.renderEmptyState();
		this.input?.focus();
	}

	private clearNode(node: Element) {
		while (node.firstChild) node.removeChild(node.firstChild);
	}

	private clearError() {
		if (!this.errorNode) return;
		this.errorNode.textContent = '';
		this.errorNode.classList.add('hidden');
	}

	private showError(message: string) {
		if (!this.errorNode) return;
		this.errorNode.textContent = message;
		this.errorNode.classList.remove('hidden');
	}

	private updateControls() {
		const busy = this.isLoadingSessions || this.isLoadingMessages || this.isSending;
		if (this.sendButton) this.sendButton.disabled = busy || !String(this.input?.value || '').trim();
		if (this.input) this.input.disabled = this.isSending;
	}

	private async parseJson<TData>(response: Response): Promise<ApiResponse<TData>> {
		try {
			return (await response.json()) as ApiResponse<TData>;
		} catch {
			throw new Error('No fue posible interpretar la respuesta del servidor.');
		}
	}

	private getApiMessage(data: ApiResponse, fallback: string) {
		const message = String(data?.message || '').trim();
		return message || fallback;
	}

	private formatDate(value: string) {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		return new Intl.DateTimeFormat('es-PY', {
			day: '2-digit',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit',
		}).format(date);
	}

	private renderSessions() {
		if (!this.sessionsNode) return;
		this.clearNode(this.sessionsNode);

		const fragment = document.createDocumentFragment();
		for (const session of this.sessions) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'ai-chat-session-btn';
			button.dataset.aiChatSessionId = String(session.id_session);
			button.classList.toggle('is-active', session.id_session === this.activeSessionId);

			const title = document.createElement('span');
			title.className = 'ai-chat-session-title';
			title.textContent = session.title;

			const date = document.createElement('span');
			date.className = 'ai-chat-session-date';
			date.textContent = this.formatDate(session.updated_at);

			button.append(title, date);
			fragment.appendChild(button);
		}

		this.sessionsNode.appendChild(fragment);

		if (this.sessionsStateNode) {
			this.sessionsStateNode.classList.toggle('hidden', this.sessions.length > 0);
			if (this.sessions.length === 0) {
				this.sessionsStateNode.textContent = this.isLoadingSessions
					? 'Cargando historial...'
					: 'Todavia no hay conversaciones.';
			}
		}
	}

	private renderEmptyState() {
		if (!this.messagesNode) return;
		this.messagesNode.innerHTML = `
			<div class="ai-chat-empty">
				<div class="ai-chat-empty-icon">
					<span class="material-symbols-rounded">auto_awesome</span>
				</div>
				<h3>Consulta tu agenda</h3>
				<p>Haz preguntas sobre clientes, turnos, disponibilidad o el estado del negocio.</p>
			</div>
		`;
	}

	private appendMessage(message: Pick<ChatMessage, 'role' | 'content'>) {
		if (!this.messagesNode) return;
		const empty = this.messagesNode.querySelector('.ai-chat-empty');
		if (empty) empty.remove();

		const wrapper = document.createElement('article');
		wrapper.className = `ai-chat-message ai-chat-message--${message.role}`;

		const bubble = document.createElement('div');
		bubble.className = 'ai-chat-bubble';
		bubble.textContent = message.content;

		wrapper.appendChild(bubble);
		this.messagesNode.appendChild(wrapper);
		this.messagesNode.scrollTop = this.messagesNode.scrollHeight;
	}

	private renderMessages(messages: ChatMessage[]) {
		if (!this.messagesNode) return;
		this.clearNode(this.messagesNode);
		if (messages.length === 0) {
			this.renderEmptyState();
			return;
		}
		for (const message of messages) {
			this.appendMessage(message);
		}
	}

	private async loadSessions() {
		this.isLoadingSessions = true;
		let failed = false;
		this.updateControls();
		if (this.sessionsStateNode) {
			this.sessionsStateNode.classList.remove('hidden');
			this.sessionsStateNode.textContent = 'Cargando historial...';
		}

		try {
			const response = await fetch('/api/ai/chat/sessions', {
				method: 'GET',
				headers: { Accept: 'application/json' },
			});
			const data = await this.parseJson<ChatSession[]>(response);
			if (!response.ok || data.status !== 'success' || !Array.isArray(data.data)) {
				throw new Error(this.getApiMessage(data, 'No fue posible cargar el historial.'));
			}
			this.sessions = data.data;
			this.renderSessions();
		} catch (error) {
			failed = true;
			if (this.sessionsStateNode) {
				this.sessionsStateNode.classList.remove('hidden');
				this.sessionsStateNode.textContent =
					error instanceof Error ? error.message : 'No fue posible cargar el historial.';
			}
		} finally {
			this.isLoadingSessions = false;
			this.updateControls();
			if (!failed) this.renderSessions();
		}
	}

	private async loadMessages(sessionId: number) {
		this.activeSessionId = sessionId;
		this.isLoadingMessages = true;
		this.clearError();
		this.renderSessions();
		this.updateControls();

		if (this.messagesNode) {
			this.messagesNode.innerHTML = '<div class="ai-chat-history-state">Cargando mensajes...</div>';
		}

		try {
			const response = await fetch(`/api/ai/chat/sessions/${sessionId}/messages`, {
				method: 'GET',
				headers: { Accept: 'application/json' },
			});
			const data = await this.parseJson<ChatMessage[]>(response);
			if (!response.ok || data.status !== 'success' || !Array.isArray(data.data)) {
				throw new Error(this.getApiMessage(data, 'No fue posible cargar los mensajes.'));
			}
			this.renderMessages(data.data);
		} catch (error) {
			this.renderEmptyState();
			this.showError(error instanceof Error ? error.message : 'No fue posible cargar los mensajes.');
		} finally {
			this.isLoadingMessages = false;
			this.updateControls();
		}
	}

	private async sendMessage() {
		const message = String(this.input?.value || '').trim();
		if (!message || this.isSending) return;

		this.isSending = true;
		this.clearError();
		this.updateControls();
		if (this.input) {
			this.input.value = '';
			this.input.style.height = 'auto';
		}

		this.appendMessage({ role: 'user', content: message });
		this.appendMessage({ role: 'assistant', content: 'Pensando...' });
		const pendingNode = this.messagesNode?.lastElementChild?.querySelector<HTMLElement>('.ai-chat-bubble');

		try {
			const response = await fetch('/api/ai/chat/message', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
				},
				body: JSON.stringify({
					message,
					session_id: this.activeSessionId > 0 ? this.activeSessionId : undefined,
				}),
			});
			const data = await this.parseJson<{ session_id: number; response: string }>(response);
			if (!response.ok || data.status !== 'success' || !data.data) {
				throw new Error(this.getApiMessage(data, 'No fue posible enviar el mensaje.'));
			}

			this.activeSessionId = Number(data.data.session_id || this.activeSessionId);
			if (pendingNode) pendingNode.textContent = String(data.data.response || '').trim() || 'Sin respuesta.';
			await this.loadSessions();
		} catch (error) {
			if (pendingNode) pendingNode.textContent = 'No pude responder en este momento.';
			this.showError(error instanceof Error ? error.message : 'No fue posible enviar el mensaje.');
		} finally {
			this.isSending = false;
			this.updateControls();
			this.input?.focus();
		}
	}
}

if (!customElements.get('ai-chat-panel')) {
	customElements.define('ai-chat-panel', AiChatPanel);
}
