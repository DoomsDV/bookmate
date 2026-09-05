import { ADDON_FEATURES } from '../../config/feature-flags';
import {
	canShowClinicalModule,
	hasAddonFeature,
	isAddonEligible,
} from './addon-entitlement';
import type { FichaAddonCard } from './types';

const FICHA_CATALOG: Array<{
	code: FichaAddonCard['code'];
	featureCode: string;
	title: string;
	description: string;
	icon: string;
}> = [
	{
		code: 'odontogram',
		featureCode: ADDON_FEATURES.ODONTOGRAM_3D,
		title: 'Odontograma 3D',
		description: 'Ficha clínica interactiva 3D y evolución de tratamientos.',
		icon: 'dentistry',
	},
	{
		code: 'cuerpo',
		featureCode: ADDON_FEATURES.BODY_MAP,
		title: 'Cuerpo',
		description: 'Mapa corporal, zoom de articulación y evolución por sesión.',
		icon: 'accessibility_new',
	},
];

export const buildFichaAddonCards = (): FichaAddonCard[] =>
	FICHA_CATALOG.flatMap((item) => {
		if (!canShowClinicalModule(item.featureCode)) return [];
		const active = hasAddonFeature(item.featureCode);
		const eligible = isAddonEligible(item.featureCode) || active;
		return [
			{
				code: item.code,
				featureCode: item.featureCode,
				title: item.title,
				description: item.description,
				icon: item.icon,
				eligible,
				active,
				locked: eligible && !active,
			},
		];
	});

export const canOpenFichaCard = (card: FichaAddonCard): boolean => card.eligible && card.active;

export const isFichaCardVisible = (code: FichaAddonCard['code']): boolean => {
	const card = buildFichaAddonCards().find((item) => item.code === code);
	return Boolean(card);
};
