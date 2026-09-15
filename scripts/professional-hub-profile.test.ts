import assert from 'node:assert/strict';
import test from 'node:test';

import {
	PROFESSIONAL_SHORT_BIO_MAX,
	formatProfessionalHubGapsLabel,
	formatProfessionalHubListingHint,
	getProfessionalHubGaps,
	hasProfessionalHubBio,
	hasProfessionalHubPhoto,
	isHubListedProfessional,
	normalizeProfessionalShortBio,
} from '../src/lib/professional-hub-profile.ts';

test('normalizeProfessionalShortBio recorta espacios y tope', () => {
	assert.equal(normalizeProfessionalShortBio('  Hola   mundo  '), 'Hola mundo');
	assert.equal(normalizeProfessionalShortBio('x'.repeat(400)).length, PROFESSIONAL_SHORT_BIO_MAX);
	assert.equal(normalizeProfessionalShortBio(null), '');
});

test('hasProfessionalHubPhoto y bio detectan vacíos', () => {
	assert.equal(hasProfessionalHubPhoto(' https://cdn.example/face.jpg '), true);
	assert.equal(hasProfessionalHubPhoto('   '), false);
	assert.equal(hasProfessionalHubBio('Odontóloga. Turnos puntuales.'), true);
	assert.equal(hasProfessionalHubBio('   \n  '), false);
});

test('isHubListedProfessional exige foto y texto', () => {
	assert.equal(
		isHubListedProfessional({
			imageUrl: 'https://cdn.example/face.jpg',
			shortBio: 'Bio corta',
		}),
		true
	);
	assert.equal(
		isHubListedProfessional({
			profileImageUrl: 'https://cdn.example/face.jpg',
			shortBio: '',
		}),
		false
	);
	assert.equal(
		isHubListedProfessional({
			imageUrl: '',
			shortBio: 'Bio corta',
		}),
		false
	);
});

test('gaps y labels dejan claro qué falta', () => {
	assert.deepEqual(
		getProfessionalHubGaps({ imageUrl: '', shortBio: '' }),
		['photo', 'bio']
	);
	assert.equal(formatProfessionalHubGapsLabel(['photo', 'bio']), 'Falta foto y bio');
	assert.equal(formatProfessionalHubGapsLabel(['photo']), 'Falta foto');
	assert.equal(formatProfessionalHubGapsLabel(['bio']), 'Falta bio');
	assert.equal(
		formatProfessionalHubListingHint(['photo']),
		'No aparece en el hub · Falta foto'
	);
	assert.equal(formatProfessionalHubListingHint([]), '');
});
