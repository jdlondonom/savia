import { dbFirst } from '@/lib/database';
import { decryptSecret } from '@/lib/secrets';

type EmailSettingsRow = {
  provider: 'resend' | 'postmark';
  from_email: string | null;
  from_name: string;
  encrypted_api_key: string | null;
  status: 'disabled' | 'active' | 'error';
};

export type EmailDelivery = { sent: boolean; id: string | null; error: string | null };

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<EmailDelivery> {
  const settings = await dbFirst<EmailSettingsRow>(
    `SELECT provider, from_email, from_name, encrypted_api_key, status
     FROM platform_email_settings WHERE id = 'default'`,
  );
  if (!settings || settings.status !== 'active' || !settings.from_email) {
    return { sent: false, id: null, error: 'El correo transaccional aún no está configurado.' };
  }
  const apiKey = await decryptSecret(settings.encrypted_api_key);
  if (!apiKey) return { sent: false, id: null, error: 'La credencial de correo no está disponible.' };
  const from = `${settings.from_name} <${settings.from_email}>`;

  try {
    if (settings.provider === 'resend') {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text, html: input.html }),
        signal: AbortSignal.timeout(15_000),
      });
      const payload = await response.json().catch(() => ({})) as { id?: string; message?: string };
      if (!response.ok) throw new Error(payload.message || `Resend respondió ${response.status}.`);
      return { sent: true, id: payload.id ?? null, error: null };
    }

    const response = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: { 'X-Postmark-Server-Token': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ From: from, To: input.to, Subject: input.subject, TextBody: input.text, HtmlBody: input.html }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => ({})) as { MessageID?: string; Message?: string };
    if (!response.ok) throw new Error(payload.Message || `Postmark respondió ${response.status}.`);
    return { sent: true, id: payload.MessageID ?? null, error: null };
  } catch (error) {
    return {
      sent: false,
      id: null,
      error: (error instanceof Error ? error.message : 'No fue posible enviar el correo.').slice(0, 300),
    };
  }
}

export async function sendPasswordResetEmail(input: { email: string; name: string; url: string }): Promise<void> {
  const safeName = escapeHtml(input.name);
  const safeUrl = escapeHtml(input.url);
  const delivery = await sendTransactionalEmail({
    to: input.email,
    subject: 'Restablece tu acceso a Savia',
    text: `Hola ${input.name}. Usa este enlace durante la próxima hora para cambiar tu contraseña: ${input.url}`,
    html: `<p>Hola ${safeName},</p><p>Usa el siguiente enlace durante la próxima hora para cambiar tu contraseña:</p><p><a href="${safeUrl}">Restablecer contraseña</a></p><p>Si no solicitaste este cambio, ignora este mensaje.</p>`,
  });
  if (!delivery.sent) throw new Error(delivery.error || 'No fue posible enviar el correo de recuperación.');
}

export async function sendInvitationEmail(input: {
  email: string;
  name: string;
  scopeName: string;
  invitationUrl: string;
}): Promise<EmailDelivery> {
  return sendTransactionalEmail({
    to: input.email,
    subject: `Invitación privada a ${input.scopeName} en Savia`,
    text: `Hola ${input.name}. Tu invitación vence en 72 horas y solo puede utilizarse una vez: ${input.invitationUrl}`,
    html: `<p>Hola ${escapeHtml(input.name)},</p><p>Recibiste acceso a <strong>${escapeHtml(input.scopeName)}</strong> en Savia.</p><p><a href="${escapeHtml(input.invitationUrl)}">Aceptar invitación</a></p><p>El enlace vence en 72 horas y solo puede utilizarse una vez.</p>`,
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}
