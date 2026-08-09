/** @type {import('@lhci/cli').LHCI.ServerCommand.Options & { ci?: object }} */
const userSlug = process.env.USER_SLUG || 'dann-villasanti';
const orgSlug = process.env.ORG_SLUG || 'consultorio-dann';
const proSlug = process.env.PRO_SLUG || 'dann-villasanti';
const baseUrl = process.env.PERF_BASE_URL || 'http://127.0.0.1:4321';

module.exports = {
	ci: {
		collect: {
			url: [
				`${baseUrl}/`,
				`${baseUrl}/auth/login`,
				`${baseUrl}/u/${userSlug}`,
				`${baseUrl}/${orgSlug}/p/${proSlug}`,
			],
			numberOfRuns: 3,
			settings: {
				preset: 'desktop',
				onlyCategories: ['performance', 'accessibility', 'best-practices'],
				throttlingMethod: 'simulate',
			},
		},
		assert: {
			assertions: {
				'categories:performance': ['warn', { minScore: 0.75 }],
				'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
				'cumulative-layout-shift': ['warn', { maxNumericValue: 0.1 }],
				'total-blocking-time': ['warn', { maxNumericValue: 300 }],
				interactive: ['warn', { maxNumericValue: 4500 }],
			},
		},
		upload: {
			target: 'filesystem',
			outputDir: './perf/reports/lhci',
		},
	},
};
