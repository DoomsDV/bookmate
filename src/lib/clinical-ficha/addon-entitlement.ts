import { ADDON_FEATURES, type AddonFeature } from '../../config/feature-flags';

const CLINICAL_FEATURE_CODES = new Set<string>([
	ADDON_FEATURES.ODONTOGRAM_3D,
	ADDON_FEATURES.BODY_MAP,
]);

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
	[...CLINICAL_FEATURE_CODES].some((code) => canShowClinicalModule(code));

export const canShowOdontogramCard = (): boolean =>
	canShowClinicalModule(ADDON_FEATURES.ODONTOGRAM_3D);

export const canShowBodyMapCard = (): boolean => canShowClinicalModule(ADDON_FEATURES.BODY_MAP);
