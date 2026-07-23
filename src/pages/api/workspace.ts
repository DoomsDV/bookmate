import type { APIRoute } from 'astro';

import { ROLES } from '../../config/roles';
import { setOrganizationCacheCookies } from '../../lib/auth';
import {
	bufferToBase64,
	optimizeProfileImage,
} from '../../lib/optimize-profile-image';
import {
	getWorkspaceSettingsWithOrds,
	type UpdateWorkspacePayload,
	updateWorkspaceSettingsWithOrds,
	WorkspaceSettingsApiError,
} from '../../lib/workspace-settings';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new WorkspaceSettingsApiError(
			'No hay sesion valida para procesar la configuración.',
			401
		);
	}
	return token;
};

const requireAdminRole = (roleId: number | undefined) => {
	if (Number(roleId || 0) !== ROLES.ADMIN) {
		throw new WorkspaceSettingsApiError(
			'Solo administradores pueden gestionar la configuración del negocio.',
			403
		);
	}
};

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const workspaceError =
		error instanceof WorkspaceSettingsApiError
			? error
			: new WorkspaceSettingsApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: workspaceError.message,
			details: workspaceError.details,
			errors: workspaceError.fieldErrors,
		},
		{ status: workspaceError.status }
	);
};

const parseBody = async (request: Request) => {
	const contentType = request.headers.get('content-type') || '';
	if (contentType.includes('application/json')) {
		return request.json();
	}

	const formData = await request.formData();
	return {
		name: formData.get('name'),
		profile_slug: formData.get('profile_slug'),
		description: formData.get('description'),
		public_whatsapp: formData.get('public_whatsapp'),
		time_format: formData.get('time_format'),
		theme_pref: formData.get('theme_pref'),
		unanswered_alert_action: formData.get('unanswered_alert_action'),
		panel_theme: formData.get('panel_theme'),
		logo_base64: formData.get('logo_base64'),
		logo_name: formData.get('logo_name'),
		logo_mime: formData.get('logo_mime'),
	};
};

const parseUpdatePayload = (source: any): UpdateWorkspacePayload => {
	const payload: UpdateWorkspacePayload = {};

	const name = String(source?.name ?? '').trim();
	if (name !== '') payload.name = name;

	if (Object.prototype.hasOwnProperty.call(source ?? {}, 'profile_slug')) {
		payload.profile_slug = String(source?.profile_slug ?? '').trim();
	}

	if (Object.prototype.hasOwnProperty.call(source ?? {}, 'description')) {
		payload.description = String(source?.description ?? '').trim();
	}

	if (Object.prototype.hasOwnProperty.call(source ?? {}, 'public_whatsapp')) {
		payload.public_whatsapp = String(source?.public_whatsapp ?? '').trim();
	}

	if (Object.prototype.hasOwnProperty.call(source ?? {}, 'facebook_url')) {
		payload.facebook_url = String(source?.facebook_url ?? '').trim();
	}

	if (Object.prototype.hasOwnProperty.call(source ?? {}, 'instagram_url')) {
		payload.instagram_url = String(source?.instagram_url ?? '').trim();
	}

	if (Object.prototype.hasOwnProperty.call(source ?? {}, 'business_hours')) {
		const raw = source?.business_hours;
		if (raw === null || raw === '') {
			payload.business_hours = null;
		} else if (typeof raw === 'string') {
			payload.business_hours = raw.trim() || null;
		} else if (typeof raw === 'object') {
			payload.business_hours = raw;
		}
	}

	const timeFormat = String(source?.time_format ?? '').trim();
	if (timeFormat !== '') {
		const normalizedTimeFormat = timeFormat.toLowerCase();
		if (normalizedTimeFormat === '12h') payload.time_format = '12H';
		else if (normalizedTimeFormat === '24h') payload.time_format = '24H';
		else payload.time_format = timeFormat;
	}

	const themePref = String(source?.theme_pref ?? '').trim();
	if (themePref !== '') payload.theme_pref = themePref;

	if (Object.prototype.hasOwnProperty.call(source ?? {}, 'hidden_public_price_label')) {
		const label = String(source?.hidden_public_price_label ?? '').trim();
		payload.hidden_public_price_label = label || 'A evaluar';
	}

	const unansweredAlertAction = String(source?.unanswered_alert_action ?? '').trim();
	if (unansweredAlertAction !== '') payload.unanswered_alert_action = unansweredAlertAction;

	const slotIntervalId = Number(source?.rsi_id_slot_interval ?? 0);
	if (Number.isInteger(slotIntervalId) && slotIntervalId > 0) {
		payload.rsi_id_slot_interval = slotIntervalId;
	}

	const reminderHoursId = Number(source?.rh_id_reminder_hours ?? 0);
	if (Number.isInteger(reminderHoursId) && reminderHoursId > 0) {
		payload.rh_id_reminder_hours = reminderHoursId;
	}

	if (Object.prototype.hasOwnProperty.call(source ?? {}, 'cwh_id_cancel_wait_hours')) {
		const cancelWaitId = Number(source?.cwh_id_cancel_wait_hours ?? 0);
		payload.cwh_id_cancel_wait_hours =
			Number.isInteger(cancelWaitId) && cancelWaitId > 0 ? cancelWaitId : null;
	}

	const panelTheme = String(source?.panel_theme ?? '').trim();
	if (panelTheme !== '') payload.panel_theme = panelTheme;

	const logoBase64 = String(source?.logo_base64 ?? '').trim();
	if (logoBase64 !== '') {
		payload.logo_base64 = logoBase64;
		payload.logo_name = String(source?.logo_name ?? '').trim();
		payload.logo_mime = String(source?.logo_mime ?? '').trim();
	}

	const bannerBase64 = String(source?.banner_base64 ?? '').trim();
	if (bannerBase64 !== '') {
		payload.banner_base64 = bannerBase64;
		payload.banner_name = String(source?.banner_name ?? '').trim();
		payload.banner_mime = String(source?.banner_mime ?? '').trim();
	}

	const clearBannerRaw = source?.clear_banner;
	if (clearBannerRaw === 1 || clearBannerRaw === true || clearBannerRaw === '1' || clearBannerRaw === 'true') {
		payload.clear_banner = 1;
	}

	const clearLogoRaw = source?.clear_logo;
	if (clearLogoRaw === 1 || clearLogoRaw === true || clearLogoRaw === '1' || clearLogoRaw === 'true') {
		payload.clear_logo = 1;
	}

	return payload;
};

export const GET: APIRoute = async ({ cookies, locals, url }) => {
	try {
		const token = requireToken(locals.token);
		requireAdminRole(locals.roleId);
		const workspace = await getWorkspaceSettingsWithOrds(token);
		setOrganizationCacheCookies(cookies, url, workspace);

		return Response.json(
			{
				status: 'success',
				data: workspace,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener la configuración del negocio.');
	}
};

export const PUT: APIRoute = async ({ cookies, request, locals, url }) => {
	try {
		const token = requireToken(locals.token);
		requireAdminRole(locals.roleId);
		const body = await parseBody(request);
		const payload = parseUpdatePayload(body);

		if (payload.banner_base64) {
			const compressRaw = String(body?.compress_banner ?? body?.compress ?? 'true').toLowerCase();
			const compress = compressRaw !== 'false' && compressRaw !== '0';
			const raw = payload.banner_base64.replace(/^\s*data:[^,]+,/, '');
			const input = Buffer.from(raw, 'base64');
			const optimized = await optimizeProfileImage({
				input,
				filename: payload.banner_name || 'banner.jpg',
				mimeType: payload.banner_mime || 'image/jpeg',
				compress,
				mode: 'banner',
			});
			payload.banner_base64 = bufferToBase64(optimized.buffer);
			payload.banner_name = optimized.filename;
			payload.banner_mime = optimized.mime;
		}

		const updated = await updateWorkspaceSettingsWithOrds(token, payload);
		const workspace = await getWorkspaceSettingsWithOrds(token);
		setOrganizationCacheCookies(cookies, url, workspace);

		return Response.json(
			{
				status: 'success',
				message: updated.message,
				data: workspace,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible actualizar la configuración del negocio.');
	}
};
