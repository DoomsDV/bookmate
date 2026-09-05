import { ADDON_FEATURES } from '../../config/feature-flags';
import { canOpenClinicalModule } from './addon-entitlement';
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

/** Solo módulos activos — la compra vive en Complementos, no en Ficha clínica. */
export const buildFichaAddonCards = (): FichaAddonCard[] =>
	FICHA_CATALOG.flatMap((item) => {
		if (!canOpenClinicalModule(item.featureCode)) return [];
		return [
			{
				code: item.code,
				featureCode: item.featureCode,
				title: item.title,
				description: item.description,
				icon: item.icon,
			},
		];
	});

export const isFichaCardVisible = (code: FichaAddonCard['code']): boolean =>
	buildFichaAddonCards().some((item) => item.code === code);
