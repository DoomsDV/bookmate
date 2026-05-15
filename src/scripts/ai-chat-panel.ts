import { marked } from 'marked';
import { AI_CHAT_QUICK_ACTIONS, AI_CHAT_SUGGESTED_QUESTIONS } from '../lib/chat';

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

const ALLOWED_MARKDOWN_TAGS = new Set([
	'a',
	'blockquote',
	'br',
	'code',
	'del',
	'em',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'hr',
	'li',
	'ol',
	'p',
	'pre',
	'strong',
	'table',
	'tbody',
	'td',
	'th',
	'thead',
	'tr',
	'ul',
]);

const ALLOWED_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const CHAT_DEBUG_PREFIX = '[AiChatPanel]';

class AiChatPanel extends HTMLElement {
	#bound = false;
	#listeners: AbortController | null = null;

	private shell: HTMLElement | null = null;
	private sessionsNode: HTMLElement | null = null;
	private sessionsStateNode: HTMLElement | null = null;
	private messagesNode: HTMLElement | null = null;
	private quickActionsNode: HTMLElement | null = null;
	private errorNode: HTMLElement | null = null;
	private form: HTMLFormElement | null = null;
	private input: HTMLTextAreaElement | null = null;
	private sendButton: HTMLButtonElement | null = null;
	private historyToggleButton: HTMLButtonElement | null = null;
	private toolsToggleButton: HTMLButtonElement | null = null;
	private toolsPopover: HTMLElement | null = null;

	private sessions: ChatSession[] = [];
	private activeSessionId = 0;
	private isLoadingSessions = false;
	private isLoadingMessages = false;
	private isSending = false;
	private deletingSessionId = 0;

	connectedCallback() {
		if (this.#bound) return;
		this.shell = this.querySelector<HTMLElement>('[data-ai-chat-shell]');
		this.sessionsNode = this.querySelector<HTMLElement>('[data-ai-chat-sessions]');
		this.sessionsStateNode = this.querySelector<HTMLElement>('[data-ai-chat-sessions-state]');
		this.messagesNode = this.querySelector<HTMLElement>('[data-ai-chat-messages]');
		this.quickActionsNode = this.querySelector<HTMLElement>('[data-ai-chat-quick-actions]');
		this.errorNode = this.querySelector<HTMLElement>('[data-ai-chat-error]');
		this.form = this.querySelector<HTMLFormElement>('[data-ai-chat-form]');
		this.input = this.querySelector<HTMLTextAreaElement>('[data-ai-chat-input]');
		this.sendButton = this.querySelector<HTMLButtonElement>('[data-ai-chat-send]');
		this.historyToggleButton = this.querySelector<HTMLButtonElement>('[data-ai-chat-history-toggle]');
		this.toolsToggleButton = this.querySelector<HTMLButtonElement>('[data-ai-chat-tools-toggle]');
		this.toolsPopover = this.querySelector<HTMLElement>('#ai-chat-tools-popover');

		if (!this.shell || !this.messagesNode || !this.form || !this.input) return;

		this.#bound = true;
		this.#listeners = new AbortController();
		const signal = this.#listeners.signal;

		document.addEventListener('click', this.handleDocumentClick, { signal });
		document.addEventListener('keydown', this.handleDocumentKeydown, { signal });
		this.addEventListener('click', this.handlePanelClick, { signal });
		this.form.addEventListener('submit', this.handleSubmit, { signal });
		this.input.addEventListener('input', this.handleInput, { signal });

		this.renderQuickActions();
		this.renderSuggestedQuestions();
		this.updateControls();
	}

	disconnectedCallback() {
		this.#bound = false;
		this.#listeners?.abort();
		this.#listeners = null;
		this.setHistoryOpen(false);
		this.setToolsOpen(false);
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
		if (event.key !== 'Escape' || !this.isOpen()) return;

		if (this.isToolsOpen()) {
			this.setToolsOpen(false);
			return;
		}

		if (this.isHistoryOpen()) {
			this.setHistoryOpen(false);
			return;
		}

		if (this.isOpen()) {
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

		if (target.closest('[data-ai-chat-history-toggle]')) {
			this.setHistoryOpen(!this.isHistoryOpen());
			return;
		}

		if (target.closest('[data-ai-chat-history-close]')) {
			this.setHistoryOpen(false);
			return;
		}

		if (target.closest('[data-ai-chat-tools-toggle]')) {
			this.setToolsOpen(!this.isToolsOpen());
			return;
		}

		if (target.closest('[data-ai-chat-new]')) {
			this.startNewChat();
			return;
		}

		const deleteButton = target.closest<HTMLButtonElement>('[data-ai-chat-delete-session-id]');
		if (deleteButton) {
			const sessionId = Number(deleteButton.dataset.aiChatDeleteSessionId || 0);
			if (sessionId > 0) void this.deleteSession(sessionId);
			return;
		}

		const quickActionButton = target.closest<HTMLButtonElement>('[data-ai-chat-quick-action]');
		if (quickActionButton) {
			this.handleQuickAction(quickActionButton);
			return;
		}

		const suggestionButton = target.closest<HTMLButtonElement>('[data-ai-chat-suggestion]');
		if (suggestionButton) {
			this.handleSuggestedQuestion(suggestionButton);
			return;
		}

		const sessionButton = target.closest<HTMLElement>('[data-ai-chat-session-id]');
		if (sessionButton) {
			const sessionId = Number(sessionButton.dataset.aiChatSessionId || 0);
			if (sessionId > 0) {
				this.setHistoryOpen(false);
				void this.loadMessages(sessionId);
			}
			return;
		}

		if (this.isToolsOpen() && !target.closest('[data-ai-chat-tools]')) {
			this.setToolsOpen(false);
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

	private isHistoryOpen() {
		return Boolean(this.shell?.classList.contains('is-history-open'));
	}

	private isToolsOpen() {
		return Boolean(this.shell?.classList.contains('is-tools-open'));
	}

	private setHistoryOpen(open: boolean) {
		if (!this.shell) return;
		this.shell.classList.toggle('is-history-open', open);
		this.historyToggleButton?.setAttribute('aria-expanded', String(open));
		this.historyToggleButton?.setAttribute('aria-label', open ? 'Cerrar historial' : 'Abrir historial');
		if (open) this.setToolsOpen(false);
	}

	private setToolsOpen(open: boolean) {
		if (!this.shell) return;
		this.shell.classList.toggle('is-tools-open', open);
		this.toolsToggleButton?.setAttribute('aria-expanded', String(open));
		this.toolsPopover?.setAttribute('aria-hidden', String(!open));
		if (open) this.setHistoryOpen(false);
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
		this.setHistoryOpen(false);
		this.setToolsOpen(false);
		this.shell.classList.remove('is-open');
		this.shell.setAttribute('aria-hidden', 'true');
		document.body.classList.remove('ai-chat-open');
	}

	private startNewChat() {
		this.activeSessionId = 0;
		this.clearError();
		this.setHistoryOpen(false);
		this.setToolsOpen(false);
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

	private isSafeUrl(value: string) {
		const url = value.trim();
		if (!url || url.startsWith('#')) return Boolean(url);

		try {
			const parsed = new URL(url, window.location.origin);
			return ALLOWED_LINK_PROTOCOLS.has(parsed.protocol);
		} catch {
			return false;
		}
	}

	private sanitizeMarkdownHtml(html: string) {
		const template = document.createElement('template');
		template.innerHTML = html;

		const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
		const elements: Element[] = [];
		while (walker.nextNode()) {
			elements.push(walker.currentNode as Element);
		}

		for (const element of elements) {
			const tagName = element.tagName.toLowerCase();
			if (!ALLOWED_MARKDOWN_TAGS.has(tagName)) {
				element.replaceWith(...Array.from(element.childNodes));
				continue;
			}

			const href = element.getAttribute('href') || '';
			for (const attribute of Array.from(element.attributes)) {
				element.removeAttribute(attribute.name);
			}

			if (tagName === 'a' && this.isSafeUrl(href)) {
				element.setAttribute('href', href.trim());
				element.setAttribute('target', '_blank');
				element.setAttribute('rel', 'noreferrer');
			}
		}

		return template.innerHTML;
	}

	private renderMarkdown(content: string) {
		const html = marked.parse(content, {
			async: false,
			breaks: true,
			gfm: true,
		});
		return this.sanitizeMarkdownHtml(html);
	}

	private updateControls() {
		const busy =
			this.isLoadingSessions || this.isLoadingMessages || this.isSending || this.deletingSessionId > 0;
		if (this.sendButton) this.sendButton.disabled = busy || !String(this.input?.value || '').trim();
		if (this.input) this.input.disabled = this.isSending;
		this.sessionsNode
			?.querySelectorAll<HTMLButtonElement>('[data-ai-chat-delete-session-id]')
			.forEach((button) => {
				const sessionId = Number(button.dataset.aiChatDeleteSessionId || 0);
				button.disabled = busy || sessionId === this.deletingSessionId;
			});
		this.quickActionsNode
			?.querySelectorAll<HTMLButtonElement>('[data-ai-chat-quick-action]')
			.forEach((button) => {
				button.disabled = busy;
			});
		this.messagesNode?.querySelectorAll<HTMLButtonElement>('[data-ai-chat-suggestion]').forEach((button) => {
			button.disabled = busy;
		});
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

	private logApiResponse<TData>(label: string, response: Response, data: ApiResponse<TData>) {
		console.info(`${CHAT_DEBUG_PREFIX} ${label}`, {
			ok: response.ok,
			status: response.status,
			statusText: response.statusText,
			url: response.url,
			payload: data,
		});
	}

	private logApiError(label: string, error: unknown) {
		console.error(`${CHAT_DEBUG_PREFIX} ${label}`, error);
	}

	private logAssistantWarning(responseText: string, data: unknown) {
		if (!/(ORA-|insufficient privileges|Tuvimos un problema)/i.test(responseText)) return;
		console.warn(`${CHAT_DEBUG_PREFIX} Respuesta del asistente con posible error backend`, {
			responseText,
			payload: data,
		});
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

	private renderQuickActions() {
		if (!this.quickActionsNode) return;
		this.clearNode(this.quickActionsNode);

		const fragment = document.createDocumentFragment();
		for (const action of AI_CHAT_QUICK_ACTIONS) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'ai-chat-quick-action-btn';
			button.dataset.aiChatQuickAction = action.message;
			button.setAttribute('aria-label', action.message);

			const icon = document.createElement('span');
			icon.className = 'material-symbols-rounded';
			icon.setAttribute('aria-hidden', 'true');
			icon.textContent = action.icon;

			const label = document.createElement('span');
			label.textContent = action.label;

			button.append(icon, label);
			fragment.appendChild(button);
		}

		this.quickActionsNode.appendChild(fragment);
	}

	private renderSuggestedQuestions() {
		const suggestionsNode = this.messagesNode?.querySelector<HTMLElement>('[data-ai-chat-suggestions]');
		if (!suggestionsNode) return;
		this.clearNode(suggestionsNode);

		const fragment = document.createDocumentFragment();
		for (const suggestion of AI_CHAT_SUGGESTED_QUESTIONS) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'ai-chat-suggestion-btn';
			button.dataset.aiChatSuggestion = suggestion.message;
			button.setAttribute('aria-label', suggestion.message);

			const icon = document.createElement('span');
			icon.className = 'material-symbols-rounded';
			icon.setAttribute('aria-hidden', 'true');
			icon.textContent = suggestion.icon;

			const label = document.createElement('span');
			label.textContent = suggestion.label;

			button.append(icon, label);
			fragment.appendChild(button);
		}

		suggestionsNode.appendChild(fragment);
	}

	private renderSessions() {
		if (!this.sessionsNode) return;
		this.clearNode(this.sessionsNode);

		const fragment = document.createDocumentFragment();
		for (const session of this.sessions) {
			const item = document.createElement('div');
			item.className = 'ai-chat-session-item';
			item.classList.toggle('is-active', session.id_session === this.activeSessionId);

			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'ai-chat-session-btn';
			button.dataset.aiChatSessionId = String(session.id_session);

			const title = document.createElement('span');
			title.className = 'ai-chat-session-title';
			title.textContent = session.title;

			const date = document.createElement('span');
			date.className = 'ai-chat-session-date';
			date.textContent = this.formatDate(session.updated_at);

			button.append(title, date);

			const deleteButton = document.createElement('button');
			deleteButton.type = 'button';
			deleteButton.className = 'ai-chat-session-delete-btn';
			deleteButton.dataset.aiChatDeleteSessionId = String(session.id_session);
			deleteButton.setAttribute('aria-label', `Eliminar historial ${session.title}`);
			deleteButton.title = 'Eliminar historial';

			const icon = document.createElement('span');
			icon.className = 'material-symbols-rounded';
			icon.setAttribute('aria-hidden', 'true');
			icon.textContent = this.deletingSessionId === session.id_session ? 'progress_activity' : 'delete';
			deleteButton.appendChild(icon);

			item.append(button, deleteButton);
			fragment.appendChild(item);
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

	private async confirmDeleteSession(session: ChatSession) {
		const message = `¿Eliminar el historial "${session.title}"? Esta conversación dejará de aparecer en tu lista.`;
		if (window.BookmateAlert?.confirm) {
			return window.BookmateAlert.confirm({
				type: 'warning',
				title: 'Eliminar historial',
				message,
				confirmText: 'Eliminar',
				cancelText: 'Cancelar',
			});
		}
		return window.confirm(message);
	}

	private async deleteSession(sessionId: number) {
		if (this.deletingSessionId > 0 || this.isSending) return;
		const session = this.sessions.find((item) => item.id_session === sessionId);
		if (!session) return;

		const confirmed = await this.confirmDeleteSession(session);
		if (!confirmed) return;

		this.deletingSessionId = sessionId;
		this.clearError();
		this.updateControls();
		this.renderSessions();

		try {
			const response = await fetch(`/api/ai/chat/sessions/${sessionId}`, {
				method: 'DELETE',
				headers: { Accept: 'application/json' },
			});
			const data = await this.parseJson<{ id_session: number }>(response);
			this.logApiResponse(`DELETE /api/ai/chat/sessions/${sessionId}`, response, data);
			if (!response.ok || data.status !== 'success') {
				throw new Error(this.getApiMessage(data, 'No fue posible eliminar el historial.'));
			}

			this.sessions = this.sessions.filter((item) => item.id_session !== sessionId);
			if (this.activeSessionId === sessionId) {
				this.activeSessionId = 0;
				this.renderEmptyState();
			}
			this.renderSessions();
		} catch (error) {
			this.logApiError('Error eliminando historial', error);
			this.showError(error instanceof Error ? error.message : 'No fue posible eliminar el historial.');
		} finally {
			this.deletingSessionId = 0;
			this.updateControls();
			this.renderSessions();
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
				<div class="ai-chat-suggestions" data-ai-chat-suggestions aria-label="Preguntas sugeridas"></div>
			</div>
		`;
		this.renderSuggestedQuestions();
	}

	private handleQuickAction(button: HTMLButtonElement) {
		const message = String(button.dataset.aiChatQuickAction || '').trim();
		if (!message || this.isSending) return;
		this.clearError();
		this.setToolsOpen(false);

		if (this.input) {
			this.input.value = message;
			this.handleInput();
		}

		void this.sendMessage(message);
	}

	private handleSuggestedQuestion(button: HTMLButtonElement) {
		const message = String(button.dataset.aiChatSuggestion || '').trim();
		if (!message || this.isSending) return;
		this.clearError();

		if (this.input) {
			this.input.value = message;
			this.handleInput();
		}

		void this.sendMessage(message);
	}

	private appendMessage(message: Pick<ChatMessage, 'role' | 'content'>) {
		if (!this.messagesNode) return;
		const empty = this.messagesNode.querySelector('.ai-chat-empty');
		if (empty) empty.remove();

		const wrapper = document.createElement('article');
		wrapper.className = `ai-chat-message ai-chat-message--${message.role}`;

		const bubble = document.createElement('div');
		bubble.className = 'ai-chat-bubble';
		if (message.role === 'assistant') {
			bubble.innerHTML = this.renderMarkdown(message.content);
		} else {
			bubble.textContent = message.content;
		}

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
			this.logApiResponse('GET /api/ai/chat/sessions', response, data);
			if (!response.ok || data.status !== 'success' || !Array.isArray(data.data)) {
				throw new Error(this.getApiMessage(data, 'No fue posible cargar el historial.'));
			}
			this.sessions = data.data;
			this.renderSessions();
		} catch (error) {
			this.logApiError('Error cargando historial', error);
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
			this.logApiResponse(`GET /api/ai/chat/sessions/${sessionId}/messages`, response, data);
			if (!response.ok || data.status !== 'success' || !Array.isArray(data.data)) {
				throw new Error(this.getApiMessage(data, 'No fue posible cargar los mensajes.'));
			}
			this.renderMessages(data.data);
		} catch (error) {
			this.logApiError('Error cargando mensajes', error);
			this.renderEmptyState();
			this.showError(error instanceof Error ? error.message : 'No fue posible cargar los mensajes.');
		} finally {
			this.isLoadingMessages = false;
			this.updateControls();
		}
	}

	private async sendMessage(forcedMessage?: string) {
		const message = String(forcedMessage ?? this.input?.value ?? '').trim();
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
			this.logApiResponse('POST /api/ai/chat/message', response, data);
			if (!response.ok || data.status !== 'success' || !data.data) {
				throw new Error(this.getApiMessage(data, 'No fue posible enviar el mensaje.'));
			}

			this.activeSessionId = Number(data.data.session_id || this.activeSessionId);
			const responseText = String(data.data.response || '').trim() || 'Sin respuesta.';
			this.logAssistantWarning(responseText, data);
			if (pendingNode) pendingNode.innerHTML = this.renderMarkdown(responseText);
			await this.loadSessions();
		} catch (error) {
			this.logApiError('Error enviando mensaje', error);
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
