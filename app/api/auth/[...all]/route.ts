import { auth } from '@/lib/auth';
import { ensureDatabase } from '@/lib/database';
import { toNextJsHandler } from 'better-auth/next-js';

const handlers = toNextJsHandler(auth);

export async function GET(request: Request): Promise<Response> {
  await ensureDatabase();
  return handlers.GET(request);
}

export async function POST(request: Request): Promise<Response> {
  await ensureDatabase();
  return handlers.POST(request);
}
