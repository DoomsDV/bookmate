const EMPTY_SPECIALTY_LABELS = new Set(['', 'sin especialidad', 'sin especialidades']);

/** Especialidad solo si aporta valor (no placeholders del backend). */
export const getPublicProfileSpecialtyLabel = (specialty?: string | null): string | null => {
	const trimmed = String(specialty || '').trim();
	if (!trimmed || EMPTY_SPECIALTY_LABELS.has(trimmed.toLowerCase())) {
		return null;
	}
	return trimmed;
};

export const buildPublicProfileMetaDescription = (params: {
	professionalName: string;
	organizationName: string;
	specialty?: string | null;
}): string => {
	const name = String(params.professionalName || '').trim();
	const org = String(params.organizationName || '').trim();
	const specialty = getPublicProfileSpecialtyLabel(params.specialty);

	if (specialty) {
		return `Reservá tu turno con ${name} (${specialty}) en ${org}. Elegí horario y confirmá online en segundos.`;
	}

	return `Reservá tu turno con ${name} en ${org}. Elegí horario y confirmá online en segundos.`;
};
