import type { APIRoute } from 'astro';

import { ROLES } from '../../../../config/roles';
import {
	deleteWorkspaceGalleryImageWithOrds,
	WorkspaceSettingsApiError,
} from '../../../../lib/workspace-settings';

export const DELETE: APIRoute = async ({ params, locals }) => {
	try {
		const token = locals.token;
		if (!token) {
			throw new WorkspaceSettingsApiError('No hay sesion valida.', 401);
		}
		if (Number(locals.roleId || 0) !== ROLES.ADMIN) {
			throw new WorkspaceSettingsApiError('Solo administradores pueden gestionar la galería.', 403);
		}

		const galleryId = Number(params.id);
		if (!Number.isInteger(galleryId) || galleryId <= 0) {
			throw new WorkspaceSettingsApiError('id de galería inválido.', 400);
		}

		const result = await deleteWorkspaceGalleryImageWithOrds(token, galleryId);
		return Response.json(
			{
				status: 'success',
				message: result.message || 'Imagen eliminada.',
				data: { gallery_images: result.gallery_images },
			},
			{ status: 200 }
		);
	} catch (error) {
		const workspaceError =
			error instanceof WorkspaceSettingsApiError
				? error
				: new WorkspaceSettingsApiError('No fue posible eliminar la imagen.', 500);
		return Response.json(
			{ status: 'error', message: workspaceError.message },
			{ status: workspaceError.status }
		);
	}
};
