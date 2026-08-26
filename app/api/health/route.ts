import { dbFirst, ensureDatabase } from '@/lib/database';
import { env } from 'cloudflare:workers';

export async function GET(): Promise<Response> {
  try {
    await ensureDatabase();
    const check = await dbFirst<{ ok: number }>('SELECT 1 AS ok');
    return Response.json({
      status: check?.ok === 1 ? 'healthy' : 'degraded',
      service: 'savia',
      environment: env.SAVIA_ENVIRONMENT ?? 'local',
      release: env.SAVIA_RELEASE ?? 'development',
      timestamp: new Date().toISOString(),
    }, { status: check?.ok === 1 ? 200 : 503 });
  } catch {
    return Response.json({ status: 'unhealthy', service: 'savia' }, { status: 503 });
  }
}
