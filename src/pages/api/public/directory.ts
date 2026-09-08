import type { APIRoute } from 'astro';

import { PublicBookingApiError } from '../../../lib/public-booking';
import {
	publicBookingErrorResponse,
	publicCachedJsonResponse,
	toPositiveInt,
} from '../../../lib/public-api-handlers';
import { searchOrgDirectory } from '../../../lib/public-org-directory';

export const GET: APIRoute = async ({ url }) => {
	try {
		const q = String(url.searchParams.get('q') || url.searchParams.get('search') || '').trim();
		const specialty = String(url.searchParams.get('specialty') || '').trim();
		const cityId = toPositiveInt(url.searchParams.get('city_id'));
		const departmentId = toPositiveInt(url.searchParams.get('department_id'));
		const offset = toPositiveInt(url.searchParams.get('offset'));

		if (offset > 0) {
			throw new PublicBookingApiError(
				'La paginación no está disponible en este endpoint.',
				400
			);
		}

		const data = await searchOrgDirectory({
			q: q || undefined,
			specialty: specialty || undefined,
			city_id: cityId || undefined,
			department_id: departmentId || undefined,
		});

		return publicCachedJsonResponse({
			status: 'success',
			data,
		});
	} catch (error) {
		return publicBookingErrorResponse(error, 'No fue posible cargar el directorio de negocios.');
	}
};
