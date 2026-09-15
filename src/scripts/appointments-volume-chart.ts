export const bindAppointmentsVolumeChart = (root: ParentNode = document) => {
	const chart = root.querySelector<HTMLElement>('[data-day-chart]');
	if (!chart || chart.dataset.chartBound === '1') return;
	chart.dataset.chartBound = '1';

	const area = chart.querySelector<HTMLElement>('[data-chart-area]');
	const tip = chart.querySelector<HTMLElement>('[data-chart-tip]');
	const tipTitle = chart.querySelector<HTMLElement>('[data-chart-tip-title]');
	const tipCount = chart.querySelector<HTMLElement>('[data-chart-tip-count]');
	let pinnedBar: HTMLElement | null = null;
	let barSettleTimer = 0;

	const settleChartBars = () => {
		window.clearTimeout(barSettleTimer);
		chart.classList.remove('is-bars-settled');
		barSettleTimer = window.setTimeout(() => {
			chart.classList.add('is-bars-settled');
		}, 720);
	};

	const canHoverTip = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

	const hideChartTip = () => {
		pinnedBar = null;
		tip?.setAttribute('hidden', '');
		tip?.classList.remove('is-below');
		for (const col of chart.querySelectorAll('.dashboard-week-chart__col.is-active')) {
			col.classList.remove('is-active');
		}
	};

	const placeChartTip = (col: HTMLElement) => {
		if (!tip || !area) return;
		const bar = col.querySelector<HTMLElement>('.dashboard-week-chart__bar');
		const areaRect = area.getBoundingClientRect();
		const barRect = (bar ?? col).getBoundingClientRect();
		tip.removeAttribute('hidden');
		const tipWidth = tip.offsetWidth;
		let left = barRect.left + barRect.width / 2 - areaRect.left;
		const pad = 8;
		const half = tipWidth / 2;
		left = Math.min(Math.max(half + pad, left), Math.max(half + pad, areaRect.width - half - pad));
		tip.classList.remove('is-below');
		tip.style.left = `${left}px`;
		tip.style.top = `${Math.max(barRect.top - areaRect.top, 0)}px`;
	};

	const showChartTip = (col: HTMLElement, pin: boolean) => {
		if (!tip || !tipTitle || !tipCount) return;
		if (pin) {
			pinnedBar = col;
		} else if (pinnedBar && pinnedBar !== col) {
			return;
		}
		for (const other of chart.querySelectorAll('.dashboard-week-chart__col.is-active')) {
			other.classList.remove('is-active');
		}
		col.classList.add('is-active');
		tipTitle.textContent = col.getAttribute('data-tip-title') || '';
		tipCount.textContent = col.getAttribute('data-tip-count') || '';
		placeChartTip(col);
	};

	chart.addEventListener('click', (event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const col = target.closest<HTMLElement>('[data-chart-bar]');
		if (!col || !chart.contains(col)) return;
		if (pinnedBar === col) {
			hideChartTip();
			return;
		}
		showChartTip(col, true);
	});

	chart.addEventListener('pointerover', (event) => {
		if (!canHoverTip()) return;
		const target = event.target;
		if (!(target instanceof Element)) return;
		const col = target.closest<HTMLElement>('[data-chart-bar]');
		if (col && chart.contains(col)) {
			if (pinnedBar) return;
			showChartTip(col, false);
			return;
		}
		if (!pinnedBar && !target.closest('[data-chart-tip]')) hideChartTip();
	});

	chart.addEventListener('pointerleave', () => {
		if (pinnedBar) return;
		hideChartTip();
	});

	if (!(window as unknown as { __haselChartTipBound?: boolean }).__haselChartTipBound) {
		(window as unknown as { __haselChartTipBound?: boolean }).__haselChartTipBound = true;
		document.addEventListener('pointerdown', (event) => {
			const target = event.target;
			const host = document.querySelector<HTMLElement>('[data-day-chart]');
			if (!host || !(target instanceof Element) || host.contains(target)) return;
			host.dispatchEvent(new Event('chart-tip-hide'));
		});
		document.addEventListener('keydown', (event) => {
			if (event.key !== 'Escape') return;
			document.querySelector('[data-day-chart]')?.dispatchEvent(new Event('chart-tip-hide'));
		});
	}

	chart.addEventListener('chart-tip-hide', hideChartTip);
	settleChartBars();
};
