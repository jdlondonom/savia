import { runAutomaticRetention } from '@/lib/retention';
import { publishPendingOutboxEvents } from '@/lib/outbox';
import { purgeExpiredAuthSessions } from '@/lib/session-maintenance';
import { logOperationalEvent } from '@/lib/telemetry';

const maintenanceWorker = {
  async scheduled(controller: ScheduledController, _env: Cloudflare.Env, ctx: ExecutionContext): Promise<void> {
    if (controller.cron === '17 5 * * *') {
      ctx.waitUntil(Promise.all([
        runAutomaticRetention(),
        purgeExpiredAuthSessions(),
      ]).then(([results, removed]) => {
        logOperationalEvent('info', 'auth.sessions.expired_purged', { removed });
        const failures = results.filter((result) => result.error);
        if (failures.length) throw new Error(`Falló la retención de ${failures.length} tenant(s).`);
      }));
      return;
    }
    ctx.waitUntil(publishPendingOutboxEvents().then((result) => {
      logOperationalEvent(result.failed ? 'warn' : 'info', 'outbox.publish.completed', result);
      if (result.failed) throw new Error(`Falló la publicación de ${result.failed} evento(s) outbox.`);
    }));
  },
};

export default maintenanceWorker;
