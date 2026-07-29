export type PaginationItem = number | 'ellipsis';

export const buildPaginationItems = (
	currentPage: number,
	totalPages: number
): PaginationItem[] => {
	const total = Math.max(1, totalPages);
	const current = Math.min(Math.max(1, currentPage), total);

	if (total <= 7) {
		return Array.from({ length: total }, (_, index) => index + 1);
	}

	const items: PaginationItem[] = [1];

	if (current > 4) {
		items.push('ellipsis');
	}

	if (current <= 4) {
		for (let page = 2; page <= Math.min(5, total - 1); page += 1) {
			items.push(page);
		}
	} else if (current >= total - 3) {
		for (let page = Math.max(2, total - 4); page <= total - 1; page += 1) {
			items.push(page);
		}
	} else {
		for (let page = current - 1; page <= current + 1; page += 1) {
			items.push(page);
		}
	}

	if (current < total - 3) {
		items.push('ellipsis');
	}

	if (total > 1) {
		items.push(total);
	}

	return items;
};

export const renderPaginationSummaryHtml = (
	currentPage: number,
	totalPages: number,
	totalRecords: number,
	recordLabel: string
) =>
	`Página <strong>${currentPage}</strong> de <strong>${totalPages}</strong> <span aria-hidden="true">-</span> Total: <strong>${totalRecords}</strong> ${recordLabel}`;

export const renderPaginationPagesHtml = (
	currentPage: number,
	totalPages: number,
	pageDataAttr = 'data-pagination-page'
) =>
	buildPaginationItems(currentPage, totalPages)
		.map((item) => {
			if (item === 'ellipsis') {
				return '<span class="app-pagination__ellipsis" aria-hidden="true">…</span>';
			}
			if (item === currentPage) {
				return `<span class="app-pagination__page is-active" aria-current="page">${item}</span>`;
			}
			return `<button type="button" class="app-pagination__page" ${pageDataAttr}="${item}" aria-label="Página ${item}">${item}</button>`;
		})
		.join('');

export type AppPaginationDomOptions = {
	currentPage: number;
	totalPages: number;
	totalRecords: number;
	recordLabel: string;
	summarySelector: string;
	pagesSelector: string;
	prevSelector: string;
	nextSelector: string;
	pageDataAttr?: string;
};

export const updateAppPaginationDom = (
	root: ParentNode,
	{
		currentPage,
		totalPages,
		totalRecords,
		recordLabel,
		summarySelector,
		pagesSelector,
		prevSelector,
		nextSelector,
		pageDataAttr = 'data-pagination-page',
	}: AppPaginationDomOptions
) => {
	const safeTotalPages = Math.max(1, totalPages);
	const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages);

	const summary = root.querySelector(summarySelector);
	if (summary) {
		summary.innerHTML = renderPaginationSummaryHtml(
			safeCurrentPage,
			safeTotalPages,
			totalRecords,
			recordLabel
		);
	}

	const pagesNode = root.querySelector(pagesSelector);
	if (pagesNode) {
		pagesNode.innerHTML = renderPaginationPagesHtml(
			safeCurrentPage,
			safeTotalPages,
			pageDataAttr
		);
	}

	const prevBtn = root.querySelector<HTMLButtonElement>(prevSelector);
	const nextBtn = root.querySelector<HTMLButtonElement>(nextSelector);
	if (prevBtn) {
		prevBtn.disabled = safeCurrentPage <= 1;
		prevBtn.classList.toggle('is-disabled', safeCurrentPage <= 1);
		prevBtn.dataset.page = String(Math.max(1, safeCurrentPage - 1));
	}
	if (nextBtn) {
		nextBtn.disabled = safeCurrentPage >= safeTotalPages;
		nextBtn.classList.toggle('is-disabled', safeCurrentPage >= safeTotalPages);
		nextBtn.dataset.page = String(Math.min(safeTotalPages, safeCurrentPage + 1));
	}
};
