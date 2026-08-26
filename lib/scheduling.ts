import type { Tenant } from '@/lib/types';

const WEEKDAY_KEYS: Record<string, string> = {
  Monday: 'lunes',
  Tuesday: 'martes',
  Wednesday: 'miercoles',
  Thursday: 'jueves',
  Friday: 'viernes',
  Saturday: 'sabado',
  Sunday: 'domingo',
};

type LocalParts = {
  date: string;
  weekday: string;
  minutes: number;
};

export function assertAppointmentWithinBusinessHours(
  startsAt: string,
  endsAt: string,
  timezone: string,
  businessHours: Tenant['businessHours'],
): void {
  const start = localParts(startsAt, timezone);
  const end = localParts(endsAt, timezone);
  if (start.date !== end.date) throw new Error('La reserva debe iniciar y terminar el mismo día local.');
  const hours = businessHours[start.weekday];
  if (!hours?.enabled) throw new Error('El negocio no atiende en el día seleccionado.');
  const opening = timeToMinutes(hours.open);
  const closing = timeToMinutes(hours.close);
  if (start.minutes < opening || end.minutes > closing || end.minutes <= start.minutes) {
    throw new Error(`La reserva debe quedar dentro del horario ${hours.open}–${hours.close}.`);
  }
  if (start.minutes % 15 !== 0) throw new Error('Las reservas deben iniciar en intervalos de 15 minutos.');
}

export function buildAppointmentSlots(startsAt: string, endsAt: string): string[] {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error('El intervalo de la reserva no es válido.');
  }
  const slotMs = 15 * 60_000;
  const slots: string[] = [];
  for (let cursor = start; cursor < end; cursor += slotMs) slots.push(new Date(cursor).toISOString());
  return slots;
}

function localParts(value: string, timezone: string): LocalParts {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('La fecha de la reserva no es válida.');
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const weekday = WEEKDAY_KEYS[parts.weekday];
  if (!weekday) throw new Error('No fue posible interpretar el día de la reserva.');
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function timeToMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('El horario comercial configurado no es válido.');
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error('El horario comercial configurado no es válido.');
  return hours * 60 + minutes;
}
