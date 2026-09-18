const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

export const SETUP_PATHS = {
	services: '/panel/services',
	professionals: '/panel/professionals',
	locations: '/panel/locations',
	schedules: '/panel/schedules',
} as const;

export type SetupStepId =
	| 'create_service'
	| 'create_professional'
	| 'complete_professional_hub'
	| 'assign_services'
	| 'create_location';

export type SetupStep = {
	id: SetupStepId;
	title: string;
	copy: string;
	ctaLabel: string;
	href: string;
	icon: string;
};

export type SetupInventory = {
	serviceCount: number;
	professionalCount: number;
	assignedServiceProfessionalCount?: number;
	locationCount?: number;
};

export type PublicProfileSetupInventory = Omit<SetupInventory, 'professionalCount'> & {
	/** Personal del panel. `null` = todavía no se pudo contar; no asumir cero. */
	professionalCount: number | null;
	/** Profesionales que el hub público lista (activos con slug). */
	hubListedProfessionalCount: number;
};

export const SCREEN_EMPTY = {
	services: {
		title: 'Todavía no hay servicios',
		copy: 'Sin un servicio, los clientes no pueden reservar.',
		ctaLabel: 'Creá tu primer servicio',
		icon: 'inbox',
	},
	professionals: {
		title: 'Todavía no hay personal',
		copy: 'Agregá a quien atiende para abrir turnos.',
		ctaLabel: 'Agregá tu primer profesional',
		icon: 'badge',
	},
	professionalsNotOnHub: {
		title: 'El personal no aparece en tu página',
		copy: 'Revisá que estén activos en Personal. Foto y bio son opcionales.',
		ctaLabel: 'Completar en Personal',
		href: SETUP_PATHS.professionals,
		icon: 'badge',
	},
	schedulesNoProfessionals: {
		title: 'Todavía no hay personal',
		copy: 'Primero agregá a quien atiende. Después configurás sus horarios.',
		ctaLabel: 'Agregá personal',
		href: SETUP_PATHS.professionals,
		icon: 'badge',
	},
	schedulesNoLocations: {
		title: 'Falta una sucursal',
		copy: 'Los turnos se abren por sucursal.',
		ctaLabel: 'Creá una sucursal',
		href: SETUP_PATHS.locations,
		icon: 'domain',
	},
} as const;

const STEPS: Record<SetupStepId, SetupStep> = {
	create_service: {
		id: 'create_service',
		title: SCREEN_EMPTY.services.title,
		copy: SCREEN_EMPTY.services.copy,
		ctaLabel: SCREEN_EMPTY.services.ctaLabel,
		href: SETUP_PATHS.services,
		icon: 'design_services',
	},
	create_professional: {
		id: 'create_professional',
		title: SCREEN_EMPTY.professionals.title,
		copy: SCREEN_EMPTY.professionals.copy,
		ctaLabel: SCREEN_EMPTY.professionals.ctaLabel,
		href: SETUP_PATHS.professionals,
		icon: 'badge',
	},
	complete_professional_hub: {
		id: 'complete_professional_hub',
		title: SCREEN_EMPTY.professionalsNotOnHub.title,
		copy: SCREEN_EMPTY.professionalsNotOnHub.copy,
		ctaLabel: SCREEN_EMPTY.professionalsNotOnHub.ctaLabel,
		href: SETUP_PATHS.professionals,
		icon: 'badge',
	},
	assign_services: {
		id: 'assign_services',
		title: 'Falta asignar servicios',
		copy: 'Cada profesional necesita al menos un servicio para atender.',
		ctaLabel: 'Asigná servicios en Personal',
		href: SETUP_PATHS.professionals,
		icon: 'badge',
	},
	create_location: {
		id: 'create_location',
		title: SCREEN_EMPTY.schedulesNoLocations.title,
		copy: SCREEN_EMPTY.schedulesNoLocations.copy,
		ctaLabel: SCREEN_EMPTY.schedulesNoLocations.ctaLabel,
		href: SETUP_PATHS.locations,
		icon: 'domain',
	},
};

/** Siguiente paso único hacia un negocio que se puede reservar. */
export const resolveBookableNextStep = (inventory: SetupInventory): SetupStep | null => {
	if (inventory.serviceCount <= 0) return STEPS.create_service;
	if (inventory.professionalCount <= 0) return STEPS.create_professional;
	if (
		typeof inventory.assignedServiceProfessionalCount === 'number' &&
		inventory.assignedServiceProfessionalCount <= 0
	) {
		return STEPS.assign_services;
	}
	if (typeof inventory.locationCount === 'number' && inventory.locationCount <= 0) {
		return STEPS.create_location;
	}
	return null;
};

/**
 * Perfil público: el inventario del hub (activos con slug) no es el personal del panel.
 * Solo el empty “crear el primero” si realmente no hay profesionales.
 */
export type HubTeamEmptyAudience = 'public' | 'owner';

export type HubTeamEmptyState = {
	kind: 'none_published' | 'no_staff' | 'staff_incomplete';
	title: string;
	copy: string;
	ctaLabel?: string;
	href?: string;
};

/**
 * Empty del tab Equipo. Público: no usa el copy de turnos online.
 * Owner: patrón HAS-34 (CTA a Personal si hay staff incompleto; no empty falso).
 */
export const resolveHubTeamEmpty = (params: {
	hubListedCount: number;
	staffCount?: number | null;
	audience: HubTeamEmptyAudience;
}): HubTeamEmptyState | null => {
	if (params.hubListedCount > 0) return null;
	if (params.audience === 'public') {
		return {
			kind: 'none_published',
			title: 'Todavía no hay equipo publicado.',
			copy: '',
		};
	}
	if (params.staffCount === 0) {
		return {
			kind: 'no_staff',
			title: SCREEN_EMPTY.professionals.title,
			copy: SCREEN_EMPTY.professionals.copy,
			ctaLabel: SCREEN_EMPTY.professionals.ctaLabel,
			href: SETUP_PATHS.professionals,
		};
	}
	return {
		kind: 'staff_incomplete',
		title: SCREEN_EMPTY.professionalsNotOnHub.title,
		copy: SCREEN_EMPTY.professionalsNotOnHub.copy,
		ctaLabel: SCREEN_EMPTY.professionalsNotOnHub.ctaLabel,
		href: SETUP_PATHS.professionals,
	};
};

export const resolvePublicProfileNextStep = (
	inventory: PublicProfileSetupInventory
): SetupStep | null => {
	if (inventory.serviceCount <= 0) return STEPS.create_service;
	if (inventory.professionalCount === null) {
		return resolveBookableNextStep({
			...inventory,
			professionalCount: Math.max(inventory.hubListedProfessionalCount, 1),
		});
	}
	if (inventory.professionalCount <= 0) return STEPS.create_professional;
	return resolveBookableNextStep({
		...inventory,
		professionalCount: inventory.professionalCount,
	});
};

/** Misma flecha Material que Ver página pública / Guardar / sidebar. */
export const SETUP_EMPTY_CTA_ICON = 'arrow_forward';

const stripLegacyCtaArrow = (label: string) => label.replace(/\s*→\s*$/u, '').trimEnd();

export const renderSetupEmptyCtaContent = (label: string) =>
	`${escapeHtml(stripLegacyCtaArrow(label))}<span class="material-symbols-rounded text-[1.1rem]" aria-hidden="true">${SETUP_EMPTY_CTA_ICON}</span>`;

export const renderSetupEmptyCta = (options: { label: string; href?: string; attrs?: string }) => {
	const content = renderSetupEmptyCtaContent(options.label);
	if (options.href) {
		return `<a class="panel-empty-cta" href="${escapeHtml(options.href)}">${content}</a>`;
	}
	return `<button type="button" class="panel-empty-cta" ${options.attrs || ''}>${content}</button>`;
};

export const renderSetupEmptyState = (options: {
	icon: string;
	title: string;
	copy: string;
	ctaHtml?: string;
	rootClass?: string;
	rootAttrs?: string;
}) => {
	const rootClass = options.rootClass || 'panel-setup-empty';
	const rootAttrs = options.rootAttrs ? ` ${options.rootAttrs}` : '';
	return `
		<div class="${rootClass}"${rootAttrs}>
			<div class="panel-setup-empty__icon">
				<span class="material-symbols-rounded text-[2rem]">${escapeHtml(options.icon)}</span>
			</div>
			<h3 class="text-[1.1rem] font-bold text-(--on-surface)">${escapeHtml(options.title)}</h3>
			<p class="mt-1.5 max-w-sm text-[0.95rem] leading-relaxed text-(--on-surface-variant)">${escapeHtml(options.copy)}</p>
			${options.ctaHtml || ''}
		</div>
	`;
};
