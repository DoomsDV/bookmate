import {
	destroySearchableSelect,
	ensureSearchableSelect,
	setSearchableSelectDisabled,
	setSearchableSelectValue,
	syncSearchableSelect,
} from './searchable-select';

type ProfessionalLov = { id_professional: number; display_name: string };
type Customer = {
	id_customer: number;
	full_name: string;
	phone_number: string;
	created_at: string;
};
type CustomerMeta = {
	current_page: number;
	per_page: number;
	total_records: number;
	total_pages: number;
};
type ApiResponse<TData = unknown> = {
	status?: string;
	message?: string;
	data?: TData;
	meta?: CustomerMeta;
};

class CustomerManager extends HTMLElement {
	#bound = false;
	#listeners: AbortController | null = null;

	private roleId = 0;
	private currentProfessionalId = 0;
	private selectedProfessionalId = 0;
	private page = 1;
	private limit = 9;
	private totalPages = 1;
	private totalRecords = 0;
	private isLoading = false;

	private professionalSelect: HTMLSelectElement | null = null;
	private loadingNode: HTMLElement | null = null;
	private errorNode: HTMLElement | null = null;
	private summaryNode: HTMLElement | null = null;
	private gridNode: HTMLElement | null = null;
	private emptyNode: HTMLElement | null = null;
	private pageLabelNode: HTMLElement | null = null;
	private currentPageNode: HTMLElement | null = null;
	private prevButton: HTMLButtonElement | null = null;
	private nextButton: HTMLButtonElement | null = null;

	private professionals: ProfessionalLov[] = [];

	connectedCallback() {
		if (this.#bound) return;

		this.professionalSelect = this.querySelector<HTMLSelectElement>('[data-professional-filter]');
		this.loadingNode = this.querySelector<HTMLElement>('[data-customers-loading]');
		this.errorNode = this.querySelector<HTMLElement>('[data-customers-error]');
		this.summaryNode = this.querySelector<HTMLElement>('[data-customers-summary]');
		this.gridNode = this.querySelector<HTMLElement>('[data-customers-grid]');
		this.emptyNode = this.querySelector<HTMLElement>('[data-customers-empty]');
		this.pageLabelNode = this.querySelector<HTMLElement>('[data-customers-page-label]');
		this.currentPageNode = this.querySelector<HTMLElement>('[data-customers-current-page]');
		this.prevButton = this.querySelector<HTMLButtonElement>('[data-customers-prev]');
		this.nextButton = this.querySelector<HTMLButtonElement>('[data-customers-next]');

		if (!this.professionalSelect || !this.gridNode) return;

		this.#bound = true;
		this.#listeners = new AbortController();
		const signal = this.#listeners.signal;

		ensureSearchableSelect(this.professionalSelect, {
			placeholder: 'Buscar profesional...',
		});

		this.professionalSelect.addEventListener('change', this.handleProfessionalChange, { signal });
		this.prevButton?.addEventListener('click', this.handlePrevPage, { signal });
		this.nextButton?.addEventListener('click', this.handleNextPage, { signal });

		this.updateControls();
		void this.loadMeta();
	}

	disconnectedCallback() {
		this.#bound = false;
		this.#listeners?.abort();
		this.#listeners = null;
		destroySearchableSelect(this.professionalSelect);
	}

	private handleProfessionalChange = () => {
		if (!this.professionalSelect || this.roleId === 3) return;
		this.selectedProfessionalId = Number(this.professionalSelect.value || 0);
		this.page = 1;
		void this.loadCustomers();
	};

	private handlePrevPage = () => {
		if (this.page <= 1) return;
		this.page -= 1;
		void this.loadCustomers();
	};

	private handleNextPage = () => {
		if (this.page >= this.totalPages) return;
		this.page += 1;
		void this.loadCustomers();
	};

	private clearNode(node: Element) {
		while (node.firstChild) node.removeChild(node.firstChild);
	}

	private createOption(value: string, label: string) {
		const option = document.createElement('option');
		option.value = value;
		option.textContent = label;
		return option;
	}

	private async parseJson<TData>(response: Response): Promise<ApiResponse<TData>> {
		try {
			return (await response.json()) as ApiResponse<TData>;
		} catch {
			throw new Error('No fue posible interpretar la respuesta del servidor.');
		}
	}

	private getBackendMessage(data: ApiResponse, fallback: string) {
		const message = String(data?.message || '').trim();
		return message || fallback;
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

	private setLoading(value: boolean) {
		this.isLoading = value;
		this.updateControls();
	}

	private updateControls() {
		if (this.loadingNode) this.loadingNode.classList.toggle('hidden', !this.isLoading);

		setSearchableSelectDisabled(
			this.professionalSelect,
			this.isLoading || this.roleId === 3 || this.professionals.length === 0
		);

		if (this.prevButton) this.prevButton.disabled = this.isLoading || this.page <= 1;
		if (this.nextButton) {
			this.nextButton.disabled =
				this.isLoading || this.totalRecords === 0 || this.page >= this.totalPages;
		}
		this.prevButton?.classList.toggle('is-disabled', Boolean(this.prevButton.disabled));
		this.nextButton?.classList.toggle('is-disabled', Boolean(this.nextButton.disabled));

		if (this.pageLabelNode) {
			const totalPages = Math.max(1, this.totalPages);
			this.pageLabelNode.innerHTML = `Pagina <strong>${this.page}</strong> de <strong>${totalPages}</strong> <span aria-hidden="true">-</span> Total: <strong>${this.totalRecords}</strong> clientes`;
		}
		if (this.currentPageNode) this.currentPageNode.textContent = String(this.page);
	}

	private renderProfessionalOptions() {
		if (!this.professionalSelect) return;

		this.clearNode(this.professionalSelect);
		if (this.roleId === 3) {
			this.professionalSelect.appendChild(this.createOption('', 'Mi perfil profesional'));
		} else {
			this.professionalSelect.appendChild(this.createOption('', 'Todos los profesionales'));
		}

		for (const professional of this.professionals) {
			this.professionalSelect.appendChild(
				this.createOption(String(professional.id_professional), professional.display_name)
			);
		}

		if (this.selectedProfessionalId > 0) {
			setSearchableSelectValue(this.professionalSelect, this.selectedProfessionalId);
		}

		syncSearchableSelect(this.professionalSelect);
	}

	private formatDate(value: string) {
		const text = String(value || '').trim();
		if (!text) return '-';

		const date = new Date(text);
		if (Number.isNaN(date.getTime())) return text;

		return new Intl.DateTimeFormat('es-PY', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
		}).format(date);
	}

	private renderCustomers(customers: Customer[]) {
		if (!this.gridNode) return;

		this.clearNode(this.gridNode);
		if (this.emptyNode) this.emptyNode.classList.toggle('hidden', customers.length > 0);
		this.gridNode.classList.toggle('hidden', customers.length === 0);

		const fragment = document.createDocumentFragment();
		for (const customer of customers) {
			const article = document.createElement('article');
			article.className = 'customer-card group';

			const topRow = document.createElement('div');
			topRow.className = 'flex items-start';

			const iconWrap = document.createElement('div');
			iconWrap.className = 'customer-card-icon';
			iconWrap.innerHTML = '<span class="material-symbols-rounded text-[1.25rem]">person</span>';

			topRow.append(iconWrap);

			const body = document.createElement('div');
			body.className = 'customer-card-body';

			const name = document.createElement('h3');
			name.className = 'customer-card-title';
			name.textContent = customer.full_name || `Cliente #${customer.id_customer}`;

			const metrics = document.createElement('dl');
			metrics.className = 'customer-card-metrics';
			metrics.append(
				this.createMetricRow('Teléfono', customer.phone_number || '-'),
				this.createMetricRow('Registrado', this.formatDate(customer.created_at))
			);

			body.append(name, metrics);
			article.append(topRow, body);
			fragment.appendChild(article);
		}

		this.gridNode.appendChild(fragment);
	}

	private createMetricRow(label: string, value: string) {
		const row = document.createElement('div');
		row.className = 'flex items-center justify-between text-[0.92rem]';

		const term = document.createElement('dt');
		term.className = 'customer-card-term';
		term.textContent = label;

		const description = document.createElement('dd');
		description.className = 'customer-card-value';
		description.textContent = value;

		row.append(term, description);
		return row;
	}

	private renderSummary() {
		if (!this.summaryNode) return;

		const professionalName =
			this.selectedProfessionalId > 0
				? this.professionals.find(
						(professional) => professional.id_professional === this.selectedProfessionalId
					)?.display_name
				: '';
		const scope = professionalName ? ` de ${professionalName}` : '';
		const total = this.totalRecords === 1 ? '1 cliente' : `${this.totalRecords} clientes`;
		this.summaryNode.textContent = `${total}${scope}`;
	}

	private async loadMeta() {
		this.setLoading(true);
		this.clearError();

		try {
			const response = await fetch('/api/customers/meta', {
				method: 'GET',
				headers: { Accept: 'application/json' },
			});
			const data = await this.parseJson<{
				professionals: ProfessionalLov[];
				session?: { role_id?: number; professional_id?: number };
			}>(response);

			if (!response.ok || data.status !== 'success' || !data.data) {
				throw new Error(this.getBackendMessage(data, 'No fue posible cargar los catalogos.'));
			}

			this.roleId = Number(data.data.session?.role_id || 0);
			this.currentProfessionalId = Number(data.data.session?.professional_id || 0);
			this.professionals = Array.isArray(data.data.professionals) ? data.data.professionals : [];
			this.selectedProfessionalId = this.roleId === 3 ? this.currentProfessionalId : 0;

			this.renderProfessionalOptions();
			await this.loadCustomers();
		} catch (error) {
			this.showError(
				error instanceof Error ? error.message : 'No fue posible cargar la configuracion inicial.'
			);
			this.renderCustomers([]);
		} finally {
			this.setLoading(false);
		}
	}

	private async loadCustomers() {
		this.setLoading(true);
		this.clearError();

		try {
			const query = new URLSearchParams({
				page: String(this.page),
				limit: String(this.limit),
			});
			if (this.selectedProfessionalId > 0) {
				query.set('pro_id', String(this.selectedProfessionalId));
			}

			const response = await fetch(`/api/customers?${query.toString()}`, {
				method: 'GET',
				headers: { Accept: 'application/json' },
			});
			const data = await this.parseJson<Customer[]>(response);

			if (!response.ok || data.status !== 'success' || !Array.isArray(data.data)) {
				throw new Error(this.getBackendMessage(data, 'No fue posible obtener los clientes.'));
			}

			this.page = Number(data.meta?.current_page || this.page);
			this.limit = Number(data.meta?.per_page || this.limit);
			this.totalRecords = Number(data.meta?.total_records || 0);
			this.totalPages = Math.max(1, Number(data.meta?.total_pages || 0));

			this.renderCustomers(data.data);
			this.renderSummary();
		} catch (error) {
			this.showError(error instanceof Error ? error.message : 'No fue posible obtener los clientes.');
			this.renderCustomers([]);
			this.totalRecords = 0;
			this.totalPages = 1;
			this.renderSummary();
		} finally {
			this.setLoading(false);
		}
	}
}

if (!customElements.get('customer-manager')) {
	customElements.define('customer-manager', CustomerManager);
}
