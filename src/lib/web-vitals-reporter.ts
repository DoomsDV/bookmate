import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';

type VitalName = 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB';

const budgets: Record<VitalName, { target: number; warn: number }> = {
	LCP: { target: 2500, warn: 2500 },
	INP: { target: 200, warn: 200 },
	CLS: { target: 0.1, warn: 0.1 },
	FCP: { target: 1800, warn: 2500 },
	TTFB: { target: 800, warn: 1200 },
};

const collected = new Map<VitalName, Metric>();

const formatValue = (metric: Metric) => {
	if (metric.name === 'CLS') return metric.value.toFixed(3);
	return `${Math.round(metric.value)} ms`;
};

const statusFor = (metric: Metric): 'ok' | 'warn' | 'fail' => {
	const budget = budgets[metric.name as VitalName];
	if (!budget) return 'ok';
	const value = metric.value;
	if (metric.name === 'CLS') {
		if (value <= budget.target) return 'ok';
		return 'fail';
	}
	if (value <= budget.target) return 'ok';
	if (value <= budget.warn) return 'warn';
	return 'fail';
};

const reportMetric = (metric: Metric) => {
	collected.set(metric.name as VitalName, metric);
	const rows = [...collected.values()].map((entry) => ({
		metric: entry.name,
		value: formatValue(entry),
		rating: entry.rating,
		status: statusFor(entry),
		id: entry.id,
	}));
	console.info('[Hasel perf] Core Web Vitals', {
		path: window.location.pathname,
		rows,
	});
};

export const initWebVitalsReporter = () => {
	if (!import.meta.env.DEV) return;

	onLCP(reportMetric);
	onINP(reportMetric);
	onCLS(reportMetric);
	onFCP(reportMetric);
	onTTFB(reportMetric);
};
