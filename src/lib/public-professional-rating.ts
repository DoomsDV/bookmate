export const normalizePublicProfessionalRating = (
	avg: unknown,
	count: unknown
): { rating_avg: number | null; rating_count: number } => {
	const parsedCount = Number(count);
	const rating_count = Number.isInteger(parsedCount) && parsedCount > 0 ? parsedCount : 0;
	const parsedAvg = Number(avg);
	const rating_avg =
		rating_count > 0 && Number.isFinite(parsedAvg) && parsedAvg >= 1 && parsedAvg <= 5
			? Math.round(parsedAvg * 10) / 10
			: null;
	return { rating_avg, rating_count };
};

export const formatPublicProfessionalRating = (
	avg: number | null,
	count: number
): { hasRating: boolean; label: string; aria: string } => {
	if (count > 0 && avg != null) {
		const label = avg.toFixed(1);
		return {
			hasRating: true,
			label,
			aria: `${label} de 5`,
		};
	}
	return { hasRating: false, label: '-', aria: 'Sin reseñas todavía' };
};
