/**
 * Expansión de cards del hub (Sucursales).
 * El estado es un set de ids de sucursal — nunca un boolean global de la grilla.
 */

export const toggleHubLocationExpansion = (
	expandedIds: Iterable<number>,
	locationId: number,
): number[] => {
	const id = Number(locationId);
	if (!Number.isInteger(id) || id <= 0) return [...new Set(expandedIds)];
	const next = new Set(expandedIds);
	if (next.has(id)) next.delete(id);
	else next.add(id);
	return [...next];
};

export const isHubLocationExpanded = (
	expandedIds: Iterable<number>,
	locationId: number,
): boolean => {
	const id = Number(locationId);
	if (!Number.isInteger(id) || id <= 0) return false;
	return new Set(expandedIds).has(id);
};

/**
 * Clic fuera de ESTA card: colapsarla.
 * Clic en otra card de sucursal: no tocar el estado de esta (HAS-47).
 */
export const shouldCollapseHubLocationOnPointerDown = (
	root: { contains: (node: EventTarget) => boolean } | null,
	target: unknown,
): boolean => {
	if (!root || target == null || typeof target !== 'object') return false;
	if (root.contains(target as EventTarget)) return false;
	const closest = (target as { closest?: (selector: string) => unknown }).closest;
	if (
		typeof closest === 'function' &&
		closest.call(target, '[data-hub-location-card], .hub-location-map')
	) {
		return false;
	}
	return true;
};
