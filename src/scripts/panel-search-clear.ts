const INIT_FLAG = '__panelSearchClearInit';

const syncClearButton = (input: HTMLInputElement) => {
	const field = input.closest('[data-panel-search]');
	const clearBtn = field?.querySelector<HTMLButtonElement>('[data-panel-search-clear]');
	if (!clearBtn) return;
	clearBtn.hidden = String(input.value || '').length === 0;
};

const syncAll = (root: ParentNode = document) => {
	root.querySelectorAll<HTMLInputElement>('[data-panel-search] input').forEach(syncClearButton);
};

export const initPanelSearchClear = () => {
	const win = window as unknown as Record<string, boolean | undefined>;
	if (win[INIT_FLAG]) {
		syncAll();
		return;
	}
	win[INIT_FLAG] = true;

	document.addEventListener('input', (event) => {
		const target = event.target;
		if (!(target instanceof HTMLInputElement) || !target.closest('[data-panel-search]')) {
			return;
		}
		syncClearButton(target);
	});

	document.addEventListener('click', (event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;

		const clearBtn = target.closest<HTMLButtonElement>('[data-panel-search-clear]');
		if (!clearBtn) return;

		const field = clearBtn.closest('[data-panel-search]');
		const input = field?.querySelector('input');
		if (!(input instanceof HTMLInputElement)) return;

		event.preventDefault();
		input.value = '';
		syncClearButton(input);
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.focus();
	});

	document.addEventListener('astro:page-load', () => {
		syncAll();
	});

	syncAll();
};
