import { getAppContext } from '@/lib/context';
import { receiveInboundMessage } from '@/lib/conversation-service';
import { tenantDbFirst } from '@/lib/tenant-database';

export const dynamic = 'force-dynamic';

type DemoRequest = {
  conversationId?: string;
  body?: string;
};

export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV !== 'development') {
    return new Response('No disponible', { status: 404 });
  }

  let payload: DemoRequest;
  try {
    payload = await request.json() as DemoRequest;
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const conversationId = String(payload.conversationId ?? '').trim();
  const body = String(payload.body ?? '').trim();
  if (!conversationId || !body) {
    return Response.json({ error: 'conversationId y body son obligatorios.' }, { status: 400 });
  }

  const context = await getAppContext();
  const conversation = await tenantDbFirst<{ phone: string; name: string }>(context.tenant.id,
    `SELECT c.phone, c.name
     FROM conversations cv
     JOIN contacts c ON c.tenant_id = cv.tenant_id AND c.id = cv.contact_id
     WHERE cv.tenant_id = ? AND cv.id = ?`,
    context.tenant.id,
    conversationId,
  );
  if (!conversation) {
    return Response.json({ error: 'La conversación no existe en este cliente.' }, { status: 404 });
  }

  const result = await receiveInboundMessage({
    tenant: context.tenant,
    phone: conversation.phone,
    contactName: conversation.name,
    body: body.slice(0, 4_000),
    externalId: `demo_api_${crypto.randomUUID()}`,
    channel: 'demo',
  });

  return Response.json(result, { status: 201 });
}
