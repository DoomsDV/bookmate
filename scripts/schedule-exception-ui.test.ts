import assert from 'node:assert/strict';
import {
	DAY_EXCEPTION_STATE_COPY,
	groupSlotsByLocation,
	resolveCalendarDayTone,
	resolveDayExceptionState,
} from '../src/scripts/schedule-exception-ui.ts';

assert.equal(resolveDayExceptionState({ inheritsTemplate: true, exceptionType: 'OVERRIDE' }), 'normal');
assert.equal(resolveDayExceptionState({ inheritsTemplate: true, exceptionType: null }), 'normal');
assert.equal(resolveDayExceptionState({ inheritsTemplate: false, exceptionType: 'INHERIT' }), 'normal');
assert.equal(resolveDayExceptionState({ inheritsTemplate: false, exceptionType: 'BLOCKED' }), 'blocked');
assert.equal(resolveDayExceptionState({ inheritsTemplate: false, exceptionType: 'OVERRIDE' }), 'override');

assert.equal(DAY_EXCEPTION_STATE_COPY.normal.label, 'Usa plantilla');
assert.equal(DAY_EXCEPTION_STATE_COPY.blocked.label, 'Bloqueado');
assert.equal(DAY_EXCEPTION_STATE_COPY.override.label, 'Horario especial');

const grouped = groupSlotsByLocation(
	[
		{ loc_id_location: 2, start_time: '14:00', end_time: '18:00' },
		{ loc_id_location: '1', start_time: '07:00', end_time: '12:00' },
		{ loc_id_location: 1, start_time: '16:00', end_time: '18:00' },
	],
	[
		{ id_location: 1, name: 'Mi casa' },
		{ id_location: 2, name: 'Centro' },
	]
);

assert.equal(grouped.length, 2);
assert.equal(grouped[0]?.locationName, 'Centro');
assert.deepEqual(grouped[0]?.ranges, [{ start_time: '14:00', end_time: '18:00' }]);
assert.equal(grouped[1]?.locationName, 'Mi casa');
assert.equal(grouped[1]?.ranges.length, 2);
assert.deepEqual(grouped[1]?.ranges[0], { start_time: '07:00', end_time: '12:00' });

const unknown = groupSlotsByLocation([{ loc_id_location: 99, start_time: '09:00', end_time: '10:00' }], []);
assert.equal(unknown[0]?.locationName, 'Sucursal');

const summary = new Map([
	['2026-09-01', { exception_type: 'OVERRIDE' as const, is_past: true }],
	['2026-09-02', { exception_type: 'BLOCKED' as const, is_past: true }],
]);
assert.equal(resolveCalendarDayTone('2026-09-01', summary), 'override');
assert.equal(resolveCalendarDayTone('2026-09-02', summary), 'blocked');
assert.equal(resolveCalendarDayTone('2026-09-03', summary), 'normal');

console.log('schedule-exception-ui.test.ts ok');
