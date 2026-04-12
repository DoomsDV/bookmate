import type { APIRoute } from 'astro';

import { ROLES } from '../../config/roles';
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
		timezone: formData.get('timezone'),
		time_format: formData.get('time_format'),
		theme_pref: formData.get('theme_pref'),
		unanswered_alert_action: formData.get('unanswered_alert_action'),
		panel_theme: formData.get('panel_theme'),
		calendar_view: formData.get('calendar_view'),
		logo_base64: formData.get('logo_base64'),
		logo_name: formData.get('logo_name'),
		logo_mime: formData.get('logo_mime'),
	};
};

const parseUpdatePayload = (source: any): UpdateWorkspacePayload => {
	const payload: UpdateWorkspacePayload = {};

	const name = String(source?.name ?? '').trim();
	if (name !== '') payload.name = name;

	const profileSlug = String(source?.profile_slug ?? '').trim();
	if (profileSlug !== '') payload.profile_slug = profileSlug;

	const description = String(source?.description ?? '').trim();
	if (description !== '') payload.description = description;

	const publicWhatsapp = String(source?.public_whatsapp ?? '').trim();
	if (publicWhatsapp !== '') payload.public_whatsapp = publicWhatsapp;

	const timezone = String(source?.timezone ?? '').trim();
	if (timezone !== '') payload.timezone = timezone;

	const timeFormat = String(source?.time_format ?? '').trim();
	if (timeFormat !== '') payload.time_format = timeFormat;

	const themePref = String(source?.theme_pref ?? '').trim();
	if (themePref !== '') payload.theme_pref = themePref;

	const unansweredAlertAction = String(source?.unanswered_alert_action ?? '').trim();
	if (unansweredAlertAction !== '') payload.unanswered_alert_action = unansweredAlertAction;

	const panelTheme = String(source?.panel_theme ?? '').trim();
	if (panelTheme !== '') payload.panel_theme = panelTheme;

	const calendarView = String(source?.calendar_view ?? '').trim();
	if (calendarView !== '') payload.calendar_view = calendarView;

	const logoBase64 = String(source?.logo_base64 ?? '').trim();
	if (logoBase64 !== '') {
		payload.logo_base64 = logoBase64;
		payload.logo_name = String(source?.logo_name ?? '').trim();
		payload.logo_mime = String(source?.logo_mime ?? '').trim();
	}

	return payload;
};

export const GET: APIRoute = async ({ locals }) => {
	try {
		const token = requireToken(locals.token);
		requireAdminRole(locals.roleId);
		const workspace = await getWorkspaceSettingsWithOrds(token);

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

export const PUT: APIRoute = async ({ request, locals }) => {
	try {
		const token = requireToken(locals.token);
		requireAdminRole(locals.roleId);
		const body = await parseBody(request);
		const payload = parseUpdatePayload(body);
		const updated = await updateWorkspaceSettingsWithOrds(token, payload);

		return Response.json(
			{
				status: 'success',
				message: updated.message,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible actualizar la configuración del negocio.');
	}
};
