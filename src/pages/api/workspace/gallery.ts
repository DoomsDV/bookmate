import type { APIRoute } from 'astro';

import { ROLES } from '../../../config/roles';
import {
	bufferToBase64,
	optimizeProfileImage,
} from '../../../lib/optimize-profile-image';
import {
	addWorkspaceGalleryImageWithOrds,
	deleteWorkspaceGalleryImageWithOrds,
	reorderWorkspaceGalleryWithOrds,
	WorkspaceSettingsApiError,
} from '../../../lib/workspace-settings';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new WorkspaceSettingsApiError(
			'No hay sesion valida para procesar la galería.',
			401
		);
	}
	return token;
};

const requireAdminRole = (roleId: number | undefined) => {
	if (Number(roleId || 0) !== ROLES.ADMIN) {
		throw new WorkspaceSettingsApiError(
			'Solo administradores pueden gestionar la galería.',
			403
		);
	}
};

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const workspaceError =
		error instanceof WorkspaceSettingsApiError
			? error
			: error instanceof Error
				? new WorkspaceSettingsApiError(error.message, 400)
				: new WorkspaceSettingsApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: workspaceError.message,
			details: workspaceError.details,
		},
		{ status: workspaceError.status }
	);
};

export const POST: APIRoute = async ({ request, locals }) => {
	try {
		const token = requireToken(locals.token);
		requireAdminRole(locals.roleId);

		const form = await request.formData();
		const file = form.get('file');
		const compressRaw = String(form.get('compress') ?? 'true').toLowerCase();
		const compress = compressRaw !== 'false' && compressRaw !== '0';

		if (!(file instanceof File) || file.size <= 0) {
			throw new WorkspaceSettingsApiError('Seleccioná una imagen para la galería.', 400);
		}

		const input = Buffer.from(await file.arrayBuffer());
		const optimized = await optimizeProfileImage({
			input,
			filename: file.name || 'gallery.jpg',
			mimeType: file.type || 'image/jpeg',
			compress,
			mode: 'gallery',
		});

		const result = await addWorkspaceGalleryImageWithOrds(token, {
			image_base64: bufferToBase64(optimized.buffer),
			image_name: optimized.filename,
			image_mime: optimized.mime,
		});

		return Response.json(
			{
				status: 'success',
				message: result.message || 'Imagen agregada a la galería.',
				data: {
					gallery_images: result.gallery_images,
					item: result.item,
					bytes: optimized.bytes,
					compressed: optimized.compressed,
				},
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible subir la imagen a la galería.');
	}
};

export const PUT: APIRoute = async ({ request, locals }) => {
	try {
		const token = requireToken(locals.token);
		requireAdminRole(locals.roleId);
		const body = (await request.json()) as { ids?: unknown };
		const ids = Array.isArray(body?.ids)
			? body.ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
			: [];
		if (!ids.length) {
			throw new WorkspaceSettingsApiError('ids es obligatorio.', 400);
		}

		const result = await reorderWorkspaceGalleryWithOrds(token, ids);
		return Response.json(
			{
				status: 'success',
				message: result.message || 'Orden actualizado.',
				data: { gallery_images: result.gallery_images },
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible reordenar la galería.');
	}
};

export const DELETE: APIRoute = async ({ locals, url }) => {
	try {
		const token = requireToken(locals.token);
		requireAdminRole(locals.roleId);
		const idParam = url.searchParams.get('id') || '';
		const galleryId = Number(idParam);
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
		return toErrorResponse(error, 'No fue posible eliminar la imagen de la galería.');
	}
};
