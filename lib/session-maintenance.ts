import { dbRun } from '@/lib/database';

export async function purgeExpiredAuthSessions(cutoff = new Date()): Promise<number> {
  const result = await dbRun(
    'DELETE FROM auth_sessions WHERE expiresAt <= ?',
    cutoff.toISOString(),
  );
  return Number(result.meta.changes ?? 0);
}
