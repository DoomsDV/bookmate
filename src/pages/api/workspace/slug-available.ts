import type { APIRoute } from 'astro';

import { ROLES } from '../../../config/roles';
import { isReservedOrgSlug } from '../../../lib/reserved-org-slugs';
import {
	checkProfileSlugAvailableWithOrds,
	WorkspaceSettingsApiError,
} from '../../../lib/workspace-settings';

export const GET: APIRoute = async ({ locals, url }) => {
	try {
		const token = String(locals.token || '').trim();
		if (!token) {
			throw new WorkspaceSettingsApiError('No hay sesión válida.', 401);
		}
		if (Number(locals.roleId || 0) !== ROLES.ADMIN) {
			throw new WorkspaceSettingsApiError(
				'Solo administradores pueden validar el enlace del negocio.',
				403
			);
		}

		const slug = String(url.searchParams.get('slug') || '').trim().toLowerCase();
		if (!slug) {
			return Response.json(
				{
					status: 'success',
					data: { slug: '', available: false, reason: 'invalid' },
				},
				{ status: 200 }
			);
		}

		if (isReservedOrgSlug(slug)) {
			return Response.json(
				{
					status: 'success',
					data: { slug, available: false, reason: 'reserved' },
				},
				{ status: 200 }
			);
		}

		const result = await checkProfileSlugAvailableWithOrds(token, slug);
		return Response.json({ status: 'success', data: result }, { status: 200 });
	} catch (error) {
		const workspaceError =
			error instanceof WorkspaceSettingsApiError
				? error
				: new WorkspaceSettingsApiError('No fue posible validar el enlace público.', 500);

		return Response.json(
			{
				status: 'error',
				message: workspaceError.message,
			},
			{ status: workspaceError.status }
		);
	}
};
