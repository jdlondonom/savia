'use client';

import { useMemo, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import {
  generatePasswordRecoveryAction,
  resetUserMfaAction,
  rotateEncryptedSecretsAction,
  saveEmailSettingsAction,
  saveTenantResourceBindingsAction,
  saveWhatsAppSettingsAction,
  testEmailSettingsAction,
  testWhatsAppSettingsAction,
  updateRetentionSettingsAction,
  updateTenantAiLimitsAction,
  validateTenantResourcesAction,
} from '@/app/platform/actions';
import type { PlatformData } from '@/lib/platform';

type Props = {
  data: PlatformData;
  canManage: boolean;
  pending: boolean;
  run: (work: () => Promise<PlatformData>, success?: string, after?: (data: PlatformData) => void) => void;
};

const inputClass = 'w-full rounded-xl border border-[#d7e2db] bg-white px-3.5 py-2.5 text-sm text-[#173a30] shadow-sm';
const primaryButton = 'rounded-xl bg-[#173f34] px-4 py-2.5 text-sm font-black text-white disabled:opacity-60';
const secondaryButton = 'rounded-xl border border-[#d6e1da] bg-white px-4 py-2.5 text-sm font-black text-[#294b40] disabled:opacity-60';
const labelClass = 'mb-1.5 block text-[10px] font-black uppercase tracking-[.11em] text-[#708078]';

export function OperationsPanel({ data, canManage, pending, run }: Props) {
  const [tenantId, setTenantId] = useState(data.tenants[0]?.id ?? '');
  const [recoveryUrl, setRecoveryUrl] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryPending, startRecoveryTransition] = useTransition();
  const effectiveTenantId = data.tenants.some((tenant) => tenant.id === tenantId)
    ? tenantId
    : data.tenants[0]?.id ?? '';
  const tenant = data.tenants.find((item) => item.id === effectiveTenantId);
  const ai = data.aiSettings.find((item) => item.tenantId === effectiveTenantId);
  const users = useMemo(() => data.users.filter((user) => user.hasCredentials), [data.users]);

  if (!tenant) return <Empty title="Sin clientes" text="Crea un tenant antes de configurar operaciones." />;

  function saveResources(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    run(() => saveTenantResourceBindingsAction({
      tenantId: effectiveTenantId,
      databaseBinding: String(values.get('databaseBinding') ?? ''),
      filesBinding: String(values.get('filesBinding') ?? ''),
      vectorBinding: String(values.get('vectorBinding') ?? ''),
    }), 'Bindings guardados en estado pendiente.');
  }

  function saveWhatsApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    run(() => saveWhatsAppSettingsAction({
      tenantId: effectiveTenantId,
      phoneNumberId: String(values.get('phoneNumberId') ?? ''),
      whatsappBusinessAccountId: String(values.get('wabaId') ?? ''),
      accessToken: String(values.get('accessToken') ?? ''),
      appSecret: String(values.get('appSecret') ?? ''),
      verifyToken: String(values.get('verifyToken') ?? ''),
      graphVersion: String(values.get('graphVersion') ?? 'v23.0'),
    }), 'WhatsApp guardado con credenciales cifradas.');
  }

  function saveRetention(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    run(() => updateRetentionSettingsAction({
      tenantId: effectiveTenantId,
      messageRetentionDays: Number(values.get('messageDays')),
      documentRetentionDays: Number(values.get('documentDays')),
      auditRetentionDays: Number(values.get('auditDays')),
      automaticCleanup: values.get('automaticCleanup') === 'on',
    }), 'Política de retención actualizada.');
  }

  function saveLimits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    run(() => updateTenantAiLimitsAction({
      tenantId: effectiveTenantId,
      dailyRequestLimit: Number(values.get('dailyRequests')),
      monthlyTokenLimit: Number(values.get('monthlyTokens')),
      monthlyCostLimitCents: Math.round(Number(values.get('monthlyCost')) * 100),
      inputCostCentsPerMillion: Math.round(Number(values.get('inputCost')) * 100),
      outputCostCentsPerMillion: Math.round(Number(values.get('outputCost')) * 100),
    }), 'Límites de IA actualizados.');
  }

  function saveEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    run(() => saveEmailSettingsAction({
      provider: String(values.get('provider')) as 'resend' | 'postmark',
      fromEmail: String(values.get('fromEmail') ?? ''),
      fromName: String(values.get('fromName') ?? ''),
      apiKey: String(values.get('apiKey') ?? ''),
    }), 'Correo transaccional configurado.');
  }

  function generateRecovery(userId: string) {
    setRecoveryError('');
    setRecoveryUrl('');
    startRecoveryTransition(async () => {
      try {
        const result = await generatePasswordRecoveryAction(userId);
        setRecoveryUrl(result.recoveryUrl);
      } catch (error) {
        setRecoveryError(error instanceof Error ? error.message : 'No fue posible generar la recuperación.');
      }
    });
  }

  return <div className="space-y-6 savia-enter">
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end"><div><h2 className="text-xl font-black tracking-tight">Operación y continuidad</h2><p className="mt-1 text-sm text-[#6d7d75]">Recursos dedicados, canales, límites, retención y recuperación de acceso.</p></div><Field label="Cliente"><select value={effectiveTenantId} onChange={(event) => setTenantId(event.target.value)} className={`${inputClass} min-w-72`}>{data.tenants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></div>

    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Aislamiento físico" description="En producción cada tenant debe validar su D1, R2 y Vectorize dedicados."><div className="mb-4 flex flex-wrap gap-2"><Badge active={tenant.isolationMode === 'dedicated'}>{tenant.isolationMode === 'dedicated' ? 'Dedicado' : 'Solo local compartido'}</Badge><Badge active={tenant.provisioningStatus === 'ready'}>{tenant.provisioningStatus}</Badge></div><form key={`${tenant.id}-resources`} onSubmit={saveResources} className="space-y-3"><Field label="Binding D1"><input name="databaseBinding" defaultValue={tenant.databaseBinding ?? `TENANT_${safeBinding(tenant.slug)}_DB`} disabled={!canManage} className={inputClass} /></Field><Field label="Binding R2"><input name="filesBinding" defaultValue={tenant.filesBinding ?? `TENANT_${safeBinding(tenant.slug)}_FILES`} disabled={!canManage} className={inputClass} /></Field><Field label="Binding Vectorize"><input name="vectorBinding" defaultValue={tenant.vectorBinding ?? `TENANT_${safeBinding(tenant.slug)}_VECTORS`} disabled={!canManage} className={inputClass} /></Field>{tenant.resourceError ? <ErrorText>{tenant.resourceError}</ErrorText> : null}{canManage ? <div className="flex flex-wrap gap-2"><button disabled={pending} className={primaryButton}>Guardar bindings</button><button type="button" disabled={pending || tenant.isolationMode !== 'dedicated'} onClick={() => run(() => validateTenantResourcesAction(tenant.id), 'Recursos dedicados validados.')} className={secondaryButton}>Validar recursos</button></div> : null}</form></Panel>

      <Panel title="WhatsApp Cloud API" description="Solo el superadministrador puede ver este formulario; los secretos nunca se vuelven a mostrar."><form key={`${tenant.id}-wa`} onSubmit={saveWhatsApp} className="grid gap-3 md:grid-cols-2"><Field label="Phone number ID"><input required name="phoneNumberId" defaultValue={tenant.whatsappPhoneNumberId ?? ''} disabled={!canManage} className={inputClass} /></Field><Field label="WABA ID"><input name="wabaId" disabled={!canManage} className={inputClass} /></Field><Field label="Token de acceso"><input name="accessToken" type="password" autoComplete="new-password" placeholder={tenant.whatsappTokenHint ?? 'Obligatorio la primera vez'} disabled={!canManage} className={inputClass} /></Field><Field label="Secreto de la app"><input name="appSecret" type="password" autoComplete="new-password" placeholder="Sin cambios si queda vacío" disabled={!canManage} className={inputClass} /></Field><Field label="Token de verificación"><input name="verifyToken" type="password" autoComplete="new-password" placeholder="Sin cambios si queda vacío" disabled={!canManage} className={inputClass} /></Field><Field label="Graph API"><input name="graphVersion" defaultValue="v23.0" disabled={!canManage} className={inputClass} /></Field><div className="md:col-span-2 rounded-xl bg-[#f4f7f4] p-3"><p className="text-[10px] font-black uppercase text-[#708078]">Webhook HTTPS exclusivo</p><code className="mt-1 block break-all text-xs">{tenant.whatsappWebhookUrl}</code><button type="button" onClick={() => void navigator.clipboard.writeText(tenant.whatsappWebhookUrl)} className="mt-2 text-[10px] font-black text-[#356451]">Copiar URL</button></div>{canManage ? <div className="flex gap-2 md:col-span-2"><button disabled={pending} className={primaryButton}>Guardar WhatsApp</button><button type="button" disabled={pending || tenant.whatsappStatus === 'disabled'} onClick={() => run(() => testWhatsAppSettingsAction(tenant.id), 'Meta validó el número configurado.')} className={secondaryButton}>Probar conexión</button></div> : null}</form></Panel>

      <Panel title="Límites de IA" description="La atención pasa automáticamente a un asesor al alcanzar un límite. Las tarifas permiten estimar el costo real por modelo."><form key={`${tenant.id}-limits`} onSubmit={saveLimits} className="grid gap-3 md:grid-cols-3"><Field label="Solicitudes / día"><input name="dailyRequests" type="number" min="1" defaultValue={ai?.dailyRequestLimit ?? 500} disabled={!canManage} className={inputClass} /></Field><Field label="Tokens / mes"><input name="monthlyTokens" type="number" min="1000" defaultValue={ai?.monthlyTokenLimit ?? 1000000} disabled={!canManage} className={inputClass} /></Field><Field label="Costo / mes (USD)"><input name="monthlyCost" type="number" min="0.01" step="0.01" defaultValue={((ai?.monthlyCostLimitCents ?? 5000) / 100).toFixed(2)} disabled={!canManage} className={inputClass} /></Field><Field label="Entrada USD / 1M"><input name="inputCost" type="number" min="0" step="0.01" defaultValue={((ai?.inputCostCentsPerMillion ?? 0) / 100).toFixed(2)} disabled={!canManage} className={inputClass} /></Field><Field label="Salida USD / 1M"><input name="outputCost" type="number" min="0" step="0.01" defaultValue={((ai?.outputCostCentsPerMillion ?? 0) / 100).toFixed(2)} disabled={!canManage} className={inputClass} /></Field>{canManage ? <button disabled={pending} className={primaryButton}>Guardar límites</button> : null}</form></Panel>

      <Panel title="Privacidad y retención" description="La limpieza automática se ejecuta en tareas programadas y deja trazabilidad."><form key={`${tenant.id}-retention`} onSubmit={saveRetention} className="grid gap-3 md:grid-cols-3"><Field label="Mensajes (días)"><input name="messageDays" type="number" min="30" defaultValue={tenant.messageRetentionDays} disabled={!canManage} className={inputClass} /></Field><Field label="Documentos (días)"><input name="documentDays" type="number" min="30" defaultValue={tenant.documentRetentionDays} disabled={!canManage} className={inputClass} /></Field><Field label="Auditoría (días)"><input name="auditDays" type="number" min="365" defaultValue={tenant.auditRetentionDays} disabled={!canManage} className={inputClass} /></Field><label className="flex items-center gap-2 text-sm font-bold md:col-span-3"><input name="automaticCleanup" type="checkbox" defaultChecked={tenant.automaticCleanup} disabled={!canManage} /> Activar limpieza automática</label>{canManage ? <button disabled={pending} className={`${primaryButton} md:col-span-3`}>Guardar retención</button> : null}</form></Panel>
    </div>

    <Panel title="Correo y bóveda" description="Invitaciones y recuperación mediante Resend o Postmark; rotación versionada de todos los secretos."><form onSubmit={saveEmail} className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><Field label="Proveedor"><select name="provider" defaultValue={data.email?.provider ?? 'resend'} disabled={!canManage} className={inputClass}><option value="resend">Resend</option><option value="postmark">Postmark</option></select></Field><Field label="Remitente"><input required name="fromName" defaultValue={data.email?.fromName ?? 'Savia'} disabled={!canManage} className={inputClass} /></Field><Field label="Correo remitente"><input required name="fromEmail" type="email" defaultValue={data.email?.fromEmail ?? ''} disabled={!canManage} className={inputClass} /></Field><Field label="Llave API"><input name="apiKey" type="password" autoComplete="new-password" placeholder={data.email?.keyHint ?? 'Obligatoria la primera vez'} disabled={!canManage} className={inputClass} /></Field>{canManage ? <div className="flex items-end gap-2"><button disabled={pending} className={primaryButton}>Guardar</button><button type="button" disabled={pending || !data.email} onClick={() => run(testEmailSettingsAction, 'Correo de prueba enviado.')} className={secondaryButton}>Probar</button></div> : null}</form>{canManage ? <button disabled={pending} onClick={() => { if (window.confirm('¿Rotar todos los secretos a la llave maestra activa?')) run(rotateEncryptedSecretsAction, 'Bóveda rotada a la llave activa.'); }} className={`${secondaryButton} mt-4`}>Rotar bóveda cifrada</button> : null}</Panel>

    <Panel title="Recuperación administrativa" description="Los enlaces duran una hora, son de un solo uso y revocan sesiones. El reinicio de MFA obliga a enrolar uno nuevo.">{recoveryUrl ? <div className="mb-4 rounded-xl border border-[#c8ddcf] bg-[#eff8f1] p-3"><p className="text-xs font-black">Enlace mostrado una sola vez</p><code className="mt-2 block break-all text-xs">{recoveryUrl}</code><button onClick={() => void navigator.clipboard.writeText(recoveryUrl)} className={`${secondaryButton} mt-3`}>Copiar</button></div> : null}{recoveryError ? <ErrorText>{recoveryError}</ErrorText> : null}<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{users.map((user) => <article key={user.id} className="rounded-2xl border border-[#e0e7e2] p-4"><p className="text-sm font-black">{user.name}</p><p className="mt-1 truncate text-xs text-[#718078]">{user.email}</p><div className="mt-3 flex gap-2"><button disabled={!canManage || pending || recoveryPending} onClick={() => generateRecovery(user.id)} className={`${secondaryButton} flex-1`}>Recuperar clave</button><button disabled={!canManage || pending || user.id === data.currentUser.id} onClick={() => { if (window.confirm(`¿Reiniciar el MFA de ${user.name}?`)) run(() => resetUserMfaAction(user.id), 'MFA reiniciado; las sesiones fueron revocadas.'); }} className={secondaryButton}>MFA</button></div></article>)}</div></Panel>
  </div>;
}

function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) { return <section className="rounded-[24px] border border-[#dbe4de] bg-white p-5 shadow-[0_14px_45px_rgba(31,55,43,.04)] md:p-6"><div className="mb-5"><h3 className="text-lg font-black tracking-tight">{title}</h3><p className="mt-1 text-xs leading-5 text-[#718078]">{description}</p></div>{children}</section>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className={labelClass}>{label}</span>{children}</label>; }
function Badge({ active, children }: { active: boolean; children: ReactNode }) { return <span className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${active ? 'bg-[#e3f3db] text-[#356b43]' : 'bg-[#f1ebe4] text-[#80634a]'}`}>{children}</span>; }
function ErrorText({ children }: { children: ReactNode }) { return <p className="rounded-xl bg-[#fff3f1] p-3 text-xs font-semibold text-[#923e32]">{children}</p>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="rounded-[22px] border border-dashed border-[#ccd9d0] bg-white p-8 text-center"><p className="text-sm font-black">{title}</p><p className="mt-1 text-xs text-[#78877f]">{text}</p></div>; }
function safeBinding(value: string): string { return value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 36); }
