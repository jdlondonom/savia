import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertAppointmentWithinBusinessHours,
  buildAppointmentSlots,
} from '../lib/scheduling.ts';

const businessHours = {
  lunes: { open: '08:00', close: '18:00', enabled: true },
  martes: { open: '08:00', close: '18:00', enabled: true },
  miercoles: { open: '08:00', close: '18:00', enabled: true },
  jueves: { open: '08:00', close: '18:00', enabled: true },
  viernes: { open: '08:00', close: '18:00', enabled: true },
  sabado: { open: '09:00', close: '13:00', enabled: true },
  domingo: { open: '09:00', close: '13:00', enabled: false },
};

test('genera slots atómicos de 15 minutos', () => {
  assert.deepEqual(buildAppointmentSlots(
    '2026-08-24T13:00:00.000Z',
    '2026-08-24T14:00:00.000Z',
  ), [
    '2026-08-24T13:00:00.000Z',
    '2026-08-24T13:15:00.000Z',
    '2026-08-24T13:30:00.000Z',
    '2026-08-24T13:45:00.000Z',
  ]);
});

test('acepta una reserva dentro del horario de Bogotá', () => {
  assert.doesNotThrow(() => assertAppointmentWithinBusinessHours(
    '2026-08-24T13:00:00.000Z',
    '2026-08-24T14:00:00.000Z',
    'America/Bogota',
    businessHours,
  ));
});

test('rechaza días cerrados y horas fuera de atención', () => {
  assert.throws(() => assertAppointmentWithinBusinessHours(
    '2026-08-23T14:00:00.000Z',
    '2026-08-23T15:00:00.000Z',
    'America/Bogota',
    businessHours,
  ), /no atiende/i);
  assert.throws(() => assertAppointmentWithinBusinessHours(
    '2026-08-24T12:00:00.000Z',
    '2026-08-24T13:00:00.000Z',
    'America/Bogota',
    businessHours,
  ), /dentro del horario/i);
});

test('rechaza intervalos inválidos', () => {
  assert.throws(() => buildAppointmentSlots(
    '2026-08-24T14:00:00.000Z',
    '2026-08-24T13:00:00.000Z',
  ), /no es válido/i);
});
