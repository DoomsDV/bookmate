export type DashboardTodayKpisInput = {
	today_appointments: number;
	today_confirmed_appointments?: number;
	today_pending_appointments?: number;
	week_appointments?: number;
	week_confirmed_appointments?: number;
	week_pending_appointments?: number;
	pending_deposits_count?: number;
	pending_deposits_amount?: number;
};

export type DashboardTodayKpis = {
	todayAppointments: number;
	todayConfirmed: number;
	todayPending: number;
	weekAppointments: number;
	weekConfirmed: number;
	weekPending: number;
	pendingDepositsCount: number;
	pendingDepositsAmount: number;
	hasTodaySplit: boolean;
};

const toCount = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(0, Math.floor(parsed));
};

const toAmount = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(0, parsed);
};

export const extrasFromKpis = (kpis: DashboardTodayKpisInput): DashboardTodayKpis => {
	const todayAppointments = toCount(kpis.today_appointments);
	const todayConfirmed = toCount(kpis.today_confirmed_appointments);
	const todayPending = toCount(kpis.today_pending_appointments);
	return {
		todayAppointments,
		todayConfirmed,
		todayPending,
		weekAppointments: toCount(kpis.week_appointments),
		weekConfirmed: toCount(kpis.week_confirmed_appointments),
		weekPending: toCount(kpis.week_pending_appointments),
		pendingDepositsCount: toCount(kpis.pending_deposits_count),
		pendingDepositsAmount: toAmount(kpis.pending_deposits_amount),
		hasTodaySplit: todayConfirmed + todayPending > 0 || todayAppointments === 0,
	};
};

export const formatConfirmedPending = (confirmed: number, pending: number) => {
	const confirmedLabel = confirmed === 1 ? '1 confirmada' : `${confirmed} confirmadas`;
	const pendingLabel = pending === 1 ? '1 pendiente' : `${pending} pendientes`;
	return `${confirmedLabel} · ${pendingLabel}`;
};

export const formatTodayCaption = (kpis: DashboardTodayKpisInput) => {
	const extras = extrasFromKpis(kpis);
	if (extras.todayAppointments === 0) return 'Sin turnos';
	if (!extras.hasTodaySplit) {
		return extras.todayAppointments === 1 ? '1 turno' : `${extras.todayAppointments} turnos`;
	}
	return formatConfirmedPending(extras.todayConfirmed, extras.todayPending);
};

export const formatWeekCaption = (kpis: DashboardTodayKpisInput) => {
	const extras = extrasFromKpis(kpis);
	if (extras.weekAppointments === 0) return 'Sin citas esta semana';
	return formatConfirmedPending(extras.weekConfirmed, extras.weekPending);
};

export const formatDepositAmount = (amount: number) => {
	const safe = Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0;
	if (safe <= 0) return 'Nada por cobrar';
	return `Gs. ${safe.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
};

export const formatDepositCaption = (kpis: DashboardTodayKpisInput) => {
	const extras = extrasFromKpis(kpis);
	if (extras.pendingDepositsCount <= 0) return 'Nada por cobrar';
	if (extras.pendingDepositsAmount <= 0) {
		return extras.pendingDepositsCount === 1 ? '1 seña pendiente' : `${extras.pendingDepositsCount} señas pendientes`;
	}
	return formatDepositAmount(extras.pendingDepositsAmount);
};
