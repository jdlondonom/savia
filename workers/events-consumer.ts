import { processWhatsAppEvent, type SaviaQueueEvent } from '@/lib/whatsapp-events';
import { tenantDbFirst, tenantDbRun } from '@/lib/tenant-database';
import { deliverWhatsAppTextNow } from '@/lib/whatsapp';
import { logOperationalEvent } from '@/lib/telemetry';
export { ConversationCoordinator } from '@/workers/conversation-coordinator';

const eventsConsumer = {
  async queue(batch: MessageBatch<SaviaQueueEvent>, env: Cloudflare.Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        if (message.body.type === 'whatsapp.webhook') {
          if (env.CONVERSATION_COORDINATOR) {
            const id = env.CONVERSATION_COORDINATOR.idFromName(`${message.body.tenantId}:${message.body.phoneNumberId}`);
            const response = await env.CONVERSATION_COORDINATOR.get(id).fetch('https://savia.internal/whatsapp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(message.body),
            });
            if (!response.ok) throw new Error(`El coordinador respondió ${response.status}.`);
          } else {
            await processWhatsAppEvent(message.body);
          }
        } else if (message.body.type === 'whatsapp.outbound') {
          const claimed = await tenantDbRun(
            message.body.tenantId,
            `UPDATE messages SET status = 'sending'
             WHERE tenant_id = ? AND id = ? AND status = 'queued'`,
            message.body.tenantId,
            message.body.messageId,
          );
          if (!claimed.meta.changes) {
            const existing = await tenantDbFirst<{ status: string }>(
              message.body.tenantId,
              'SELECT status FROM messages WHERE tenant_id = ? AND id = ?',
              message.body.tenantId,
              message.body.messageId,
            );
            if (!existing) throw new Error('El mensaje de salida no existe.');
            logOperationalEvent(
              existing.status === 'sending' ? 'warn' : 'info',
              existing.status === 'sending' ? 'whatsapp.outbound.reconciliation_required' : 'whatsapp.outbound.duplicate_ignored',
              { tenantId: message.body.tenantId, messageId: message.body.messageId, status: existing.status },
            );
            message.ack();
            continue;
          }
          const delivery = await deliverWhatsAppTextNow(message.body);
          if (delivery.status === 'failed') {
            const finalFailure = delivery.retryable === false || message.attempts >= 5;
            await tenantDbRun(
              message.body.tenantId,
              `UPDATE messages SET status = ?, metadata_json = ?
               WHERE tenant_id = ? AND id = ? AND status = 'sending'`,
              finalFailure ? 'failed' : 'queued',
              JSON.stringify({ deliveryError: delivery.error }),
              message.body.tenantId,
              message.body.messageId,
            );
            if (finalFailure) {
              logOperationalEvent('error', 'whatsapp.outbound.failed', {
                tenantId: message.body.tenantId,
                messageId: message.body.messageId,
                attempts: message.attempts,
              });
              message.ack();
              continue;
            }
            throw new Error(delivery.error || 'Meta rechazó temporalmente el mensaje.');
          }
          const updated = await tenantDbRun(
            message.body.tenantId,
            `UPDATE messages SET status = ?, external_id = ?, metadata_json = '{}'
             WHERE tenant_id = ? AND id = ? AND status = 'sending'`,
            delivery.status,
            delivery.externalId,
            message.body.tenantId,
            message.body.messageId,
          );
          if (!updated.meta.changes) throw new Error('No fue posible confirmar el estado del mensaje de salida.');
        } else {
          throw new Error('Tipo de evento no compatible.');
        }
        message.ack();
      } catch (error) {
        logOperationalEvent('warn', 'queue.event.retry', {
          eventId: message.id,
          attempts: message.attempts,
          error: error instanceof Error ? error.message.slice(0, 300) : 'Error de procesamiento.',
        });
        message.retry({ delaySeconds: 30 });
      }
    }
  },
};

export default eventsConsumer;
