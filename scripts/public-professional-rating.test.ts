import assert from 'node:assert/strict';
import test from 'node:test';

import {
	formatPublicProfessionalRating,
	normalizePublicProfessionalRating,
} from '../src/lib/public-professional-rating.ts';

test('normalizePublicProfessionalRating ignora promedios sin conteo', () => {
	assert.deepEqual(normalizePublicProfessionalRating(4.8, 0), {
		rating_avg: null,
		rating_count: 0,
	});
	assert.deepEqual(normalizePublicProfessionalRating(4.8, 3), {
		rating_avg: 4.8,
		rating_count: 3,
	});
});

test('formatPublicProfessionalRating oculta el placeholder de feature faltante', () => {
	const empty = formatPublicProfessionalRating(null, 0);
	assert.equal(empty.hasRating, false);
	assert.notEqual(empty.aria.toLowerCase(), 'sin reseñas todavía');
	assert.match(empty.aria, /encuesta/i);

	const rated = formatPublicProfessionalRating(4.5, 12);
	assert.deepEqual(rated, {
		hasRating: true,
		label: '4.5',
		aria: '4.5 de 5',
	});
});
