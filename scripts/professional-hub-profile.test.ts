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
	isHubListedProfessionalPayload,
	normalizeProfessionalShortBio,
	payloadHasProfessionalShortBio,
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

test('isHubListedProfessional no usa foto ni bio como gate', () => {
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
		true
	);
	assert.equal(
		isHubListedProfessional({
			imageUrl: '',
			shortBio: 'Bio corta',
		}),
		true
	);
	assert.equal(
		isHubListedProfessional({
			imageUrl: '',
			shortBio: '',
			shortBioPresent: false,
		}),
		true
	);
	assert.equal(payloadHasProfessionalShortBio({ image_url: 'x' }), false);
	assert.equal(payloadHasProfessionalShortBio({ short_bio: '' }), true);
	assert.equal(payloadHasProfessionalShortBio({ shortBio: 'Hola' }), true);
});

test('gaps y labels dejan claro qué falta', () => {
	assert.deepEqual(
		getProfessionalHubGaps({ imageUrl: '', shortBio: '' }),
		['photo', 'bio']
	);
	assert.equal(formatProfessionalHubGapsLabel(['photo', 'bio']), 'Falta foto y bio');
	assert.equal(formatProfessionalHubGapsLabel(['photo']), 'Falta foto');
	assert.equal(formatProfessionalHubGapsLabel(['bio']), 'Falta bio');
	assert.equal(formatProfessionalHubListingHint(['photo']), 'Falta foto');
	assert.equal(formatProfessionalHubListingHint([]), '');
});

test('payload sin foto o bio sigue listable en el hub', () => {
	assert.equal(
		isHubListedProfessionalPayload({
			id_professional: 1,
			full_name: 'Dann Villasanti',
			image_url: 'https://cdn.example/dann.jpg',
			profile_slug: 'dann-villasanti',
		}),
		true
	);
	assert.equal(
		isHubListedProfessionalPayload({
			id_professional: 3,
			full_name: 'Alex Villalba',
			image_url: '',
			profile_slug: 'alex-villalba',
		}),
		true
	);
	assert.equal(
		isHubListedProfessionalPayload({
			id_professional: 2,
			full_name: 'Sin Bio',
			image_url: 'https://cdn.example/face.jpg',
			short_bio: '',
			profile_slug: 'sin-bio',
		}),
		true
	);
	assert.equal(
		isHubListedProfessionalPayload({
			id_professional: 1,
			full_name: 'Dann Villasanti',
			image_url: 'https://cdn.example/dann.jpg',
			short_bio: 'Quiropráctico. Turnos puntuales.',
			profile_slug: 'dann-villasanti',
		}),
		true
	);
});
