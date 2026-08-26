import { DurableObject } from 'cloudflare:workers';
import { processWhatsAppEvent, type WhatsAppQueueEvent } from '@/lib/whatsapp-events';

export class ConversationCoordinator extends DurableObject<Cloudflare.Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Método no permitido', { status: 405 });
    const event = await request.json<WhatsAppQueueEvent>();
    if (event.type !== 'whatsapp.webhook') return new Response('Evento inválido', { status: 400 });
    await processWhatsAppEvent(event);
    return Response.json({ processed: true });
  }
}
