export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return Response.json(
    { error: 'Cada cliente usa una URL de webhook exclusiva, disponible en el panel global.' },
    { status: 410 },
  );
}

export async function POST(): Promise<Response> {
  return Response.json({ error: 'Webhook global deshabilitado.' }, { status: 410 });
}
