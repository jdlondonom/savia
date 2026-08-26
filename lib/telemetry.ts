type LogLevel = 'info' | 'warn' | 'error';

export function logOperationalEvent(
  level: LogLevel,
  event: string,
  fields: Record<string, string | number | boolean | null | undefined> = {},
): void {
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)),
  });
  if (level === 'error') console.error(record);
  else if (level === 'warn') console.warn(record);
  else console.info(record);
}
