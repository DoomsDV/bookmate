import { CAPABILITIES } from '../../config/capabilities';
import { ADDON_FEATURES, type AddonFeature } from '../../config/feature-flags';

const hasRoleCapability = (code: string): boolean => {
	const perms = window.HaselPermissions;
	if (!perms) return true;
	if (typeof perms.has === 'function') return perms.has(code);
	return Array.isArray(perms.codes) && perms.codes.includes(code);
};

const readEligibleAddonFeatures = (): string[] => {
	const sub = window.HaselSubscription;
	if (!sub) return [];
	const raw = sub.eligibleAddonFeatures;
	return Array.isArray(raw) ? raw.map((code) => String(code || '').trim()).filter(Boolean) : [];
};

export const hasAddonFeature = (featureCode: AddonFeature | string): boolean => {
	const sub = window.HaselSubscription;
	if (!sub) return false;
	const code = String(featureCode || '').trim();
	if (!code) return false;
	if (typeof sub.hasAddon === 'function' && sub.hasAddon(code)) return true;
	if (typeof sub.hasFeature === 'function' && sub.hasFeature(code)) return true;
	const addonFeatures = sub.addonFeatures;
	return Array.isArray(addonFeatures) && addonFeatures.includes(code);
};

export const isAddonEligible = (featureCode: AddonFeature | string): boolean => {
	const code = String(featureCode || '').trim();
	if (!code) return false;
	return readEligibleAddonFeatures().includes(code);
};

export const isAddonActive = (featureCode: AddonFeature | string): boolean =>
	hasAddonFeature(featureCode);

export const canShowClinicalModule = (featureCode: AddonFeature | string): boolean =>
	isAddonEligible(featureCode) || isAddonActive(featureCode);

export const canOpenClinicalModule = (featureCode: AddonFeature | string): boolean =>
	isAddonActive(featureCode);

export const canShowClinicalTab = (): boolean =>
	(hasRoleCapability(CAPABILITIES.ADDONS_ODONTOGRAM) &&
		canOpenClinicalModule(ADDON_FEATURES.ODONTOGRAM_3D)) ||
	(hasRoleCapability(CAPABILITIES.ADDONS_BODY_MAP) && canOpenClinicalModule(ADDON_FEATURES.BODY_MAP));

export const canShowOdontogramCard = (): boolean =>
	hasRoleCapability(CAPABILITIES.ADDONS_ODONTOGRAM) &&
	canOpenClinicalModule(ADDON_FEATURES.ODONTOGRAM_3D);

export const canShowBodyMapCard = (): boolean =>
	hasRoleCapability(CAPABILITIES.ADDONS_BODY_MAP) && canOpenClinicalModule(ADDON_FEATURES.BODY_MAP);

/** Cita/reserva dental: org con rubro DENTAL (sin especialidad por servicio aún). */
export const isOrgDentalSpecialty = (): boolean => {
	const code = String(window.HaselSubscription?.orgSpecialtyCode || '')
		.trim()
		.toUpperCase();
	return code === 'DENTAL';
};

export const canShowOdontogramInAppointment = (): boolean =>
	hasRoleCapability(CAPABILITIES.ADDONS_ODONTOGRAM) &&
	canOpenClinicalModule(ADDON_FEATURES.ODONTOGRAM_3D) &&
	isOrgDentalSpecialty();
