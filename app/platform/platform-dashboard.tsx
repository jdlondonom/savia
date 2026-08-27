'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  useMemo,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  createPlatformTenantAction,
  inviteAccessAction,
  refreshPlatformAction,
  revokeInvitationAction,
  revokeMembershipAction,
  saveProviderConnectionAction,
  setMembershipRoleAction,
  setPlatformRoleAction,
  setProviderStatusAction,
  setTenantStatusAction,
  setUserStatusAction,
  testTenantAiAction,
  updateTenantAiSettingsAction,
} from '@/app/platform/actions';
import { authClient } from '@/lib/auth-client';
import { OperationsPanel } from '@/app/platform/operations-panel';
import {
  redirectIfCurrentSessionExpired,
  useSessionExpiry,
} from '@/lib/session-expiry-client';
import type {
  AiProvider,
  AiPurpose,
  PlatformData,
  ProviderConnection,
  TenantRole,
} from '@/lib/platform';

type View = 'overview' | 'tenants' | 'access' | 'ai' | 'operations' | 'security';
type Notice = { kind: 'success' | 'error'; text: string } | null;

const inputClass = 'w-full rounded-xl border border-[#d7e2db] bg-white px-3.5 py-2.5 text-sm text-[#173a30] shadow-sm placeholder:text-[#98a69f] focus:border-[#688e7a]';
const labelClass = 'mb-1.5 block text-[10px] font-black uppercase tracking-[.11em] text-[#708078]';
const primaryButton = 'rounded-xl bg-[#173f34] px-4 py-2.5 text-sm font-black text-white shadow-[0_8px_24px_rgba(23,63,52,.16)] transition hover:bg-[#205445]';
const secondaryButton = 'rounded-xl border border-[#d6e1da] bg-white px-4 py-2.5 text-sm font-black text-[#294b40] shadow-sm transition hover:bg-[#f4f7f4]';
const dangerButton = 'rounded-xl border border-[#eccac3] bg-[#fff7f5] px-3 py-2 text-xs font-black text-[#974536] transition hover:bg-[#fff0ed]';

const navItems: Array<{ id: View; icon: string; label: string }> = [
  { id: 'overview', icon: '▦', label: 'Resumen' },
  { id: 'tenants', icon: '◇', label: 'Clientes' },
  { id: 'access', icon: '◎', label: 'Accesos' },
  { id: 'ai', icon: '✦', label: 'Proveedores IA' },
  { id: 'operations', icon: '⚙', label: 'Operación' },
  { id: 'security', icon: '⌾', label: 'Seguridad' },
];

export function PlatformDashboard({ initialData }: { initialData: PlatformData }) {
  const [data, setData] = useState(initialData);
  const [view, setView] = useState<View>('overview');
  const [notice, setNotice] = useState<Notice>(null);
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  useSessionExpiry(data.currentUser.sessionExpiresAt, '/platform');
  const canManage = data.currentUser.role === 'superadmin';

  function run(work: () => Promise<PlatformData>, success?: string, after?: (data: PlatformData) => void) {
    setNotice(null);
    startTransition(async () => {
      try {
        const next = await work();
        setData(next);
        after?.(next);
        if (success) setNotice({ kind: 'success', text: success });
      } catch (error) {
        if (redirectIfCurrentSessionExpired(data.currentUser.sessionExpiresAt, '/platform')) return;
        setNotice({ kind: 'error', text: errorMessage(error) });
      }
    });
  }

  return (
    <main className="min-h-screen bg-[#f5f7f2] text-[#172720]">
      {pending ? <div className="fixed inset-x-0 top-0 z-[80] h-1 bg-[#d8f45f]" /> : null}
      {notice ? <NoticeCard notice={notice} onClose={() => setNotice(null)} /> : null}
      <div className="grid min-h-screen lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-r border-[#dfe7df] bg-[#123d31] px-5 py-6 text-white lg:sticky lg:top-0 lg:h-screen">
          <Link href="/" className="flex items-center gap-3 px-2">
            <Image src="/savia-mark.png" alt="Savia" width={44} height={44} priority />
            <span><span className="block text-xl font-black tracking-tight">Savia</span><span className="text-[9px] font-bold uppercase tracking-[.17em] text-[#9fc0b4]">Control global</span></span>
          </Link>
          <div className="mt-7 rounded-2xl border border-white/10 bg-white/[.07] p-4">
            <p className="text-sm font-extrabold">{data.currentUser.name}</p>
            <p className="mt-1 truncate text-[10px] text-[#a9c7bc]">{data.currentUser.email}</p>
            <span className="mt-3 inline-flex rounded-full bg-[#d8f45f] px-2.5 py-1 text-[9px] font-black uppercase tracking-[.08em] text-[#123d31]">{data.currentUser.role === 'superadmin' ? 'Superadministrador' : 'Soporte · lectura'}</span>
          </div>
          <nav aria-label="Administración global" className="mt-7 grid grid-cols-2 gap-2 lg:block lg:space-y-1.5">
            {navItems.map((item) => <button key={item.id} onClick={() => setView(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-bold transition ${view === item.id ? 'bg-white/[.13] text-white' : 'text-[#b6d0c7] hover:bg-white/[.07]'}`}><span className="text-[#d8f45f]">{item.icon}</span>{item.label}</button>)}
          </nav>
          <div className="mt-6 space-y-2 lg:absolute lg:inset-x-5 lg:bottom-6">
            {data.currentUser.role === 'superadmin' || data.users.find((user) => user.id === data.currentUser.id)?.memberships.length ? <Link href="/" className="block rounded-xl border border-white/10 px-4 py-2.5 text-center text-xs font-black text-[#d6e8e1] hover:bg-white/[.07]">Ir al CRM</Link> : null}
            <button onClick={() => { void authClient.signOut().then(() => window.location.assign('/login')); }} className="w-full rounded-xl px-4 py-2 text-xs font-bold text-[#8fb2a5] hover:text-white">Cerrar sesión</button>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="border-b border-[#dfe7df] bg-white/90 px-5 py-5 backdrop-blur md:px-8">
            <div className="mx-auto flex max-w-[1500px] flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-[#6e8479]">Administración de la plataforma</p><h1 className="mt-1 text-2xl font-black tracking-[-.04em]">{navItems.find((item) => item.id === view)?.label}</h1></div>
              <button disabled={pending} onClick={() => run(refreshPlatformAction, 'Información actualizada.')} className={secondaryButton}>Actualizar datos</button>
            </div>
          </header>

          {!canManage ? <div className="mx-auto mt-6 max-w-[1500px] px-5 md:px-8"><div className="rounded-2xl border border-[#e7d7a8] bg-[#fff9e9] p-4 text-sm font-semibold text-[#705c22]">Tu rol de soporte permite consultar información, pero no modificar tenants, accesos ni proveedores.</div></div> : null}

          <div className="mx-auto max-w-[1500px] p-5 md:p-8">
            {view === 'overview' ? <Overview data={data} onView={setView} /> : null}
            {view === 'tenants' ? <Tenants data={data} canManage={canManage} pending={pending} run={run} /> : null}
            {view === 'access' ? <Access data={data} canManage={canManage} pending={pending} run={run} setData={setData} setNotice={setNotice} invitationUrl={invitationUrl} setInvitationUrl={setInvitationUrl} /> : null}
            {view === 'ai' ? <AiSettings data={data} canManage={canManage} pending={pending} run={run} /> : null}
            {view === 'operations' ? <OperationsPanel data={data} canManage={canManage} pending={pending} run={run} /> : null}
            {view === 'security' ? <Security data={data} canManage={canManage} pending={pending} run={run} /> : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function Overview({ data, onView }: { data: PlatformData; onView: (view: View) => void }) {
  const activeTenants = data.tenants.filter((tenant) => tenant.status === 'active').length;
  const realUsers = data.users.filter((user) => user.hasCredentials).length;
  const protectedUsers = data.users.filter((user) => user.hasCredentials && user.mfaEnabled).length;
  const configuredTenants = new Set(data.aiSettings.filter((setting) => setting.llmConnectionId).map((setting) => setting.tenantId)).size;
  return <div className="space-y-6 savia-enter">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Clientes activos" value={activeTenants} note={`${data.tenants.length - activeTenants} suspendidos`} />
      <Metric label="Usuarios con acceso" value={realUsers} note={`${protectedUsers}/${realUsers} con MFA activo`} />
      <Metric label="Conexiones IA" value={data.providers.length} note={`${data.providers.filter((item) => item.status === 'active').length} activas`} />
      <Metric label="Tenants con LLM" value={configuredTenants} note={`de ${data.tenants.length} espacios`} />
    </div>
    <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
      <Panel title="Estado de los clientes" description="Cada espacio mantiene sus datos y configuración separados.">
        <div className="space-y-3">{data.tenants.slice(0, 6).map((tenant) => <div key={tenant.id} className="flex items-center gap-3 rounded-2xl bg-[#f5f7f3] p-3"><StatusDot active={tenant.status === 'active'} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{tenant.name}</p><p className="text-[10px] text-[#75847c]">{tenant.memberCount} usuarios · {tenant.knowledgeCount} fuentes</p></div><span className="text-[10px] font-black uppercase text-[#688075]">{tenant.status === 'active' ? 'Activo' : 'Suspendido'}</span></div>)}</div>
        <button onClick={() => onView('tenants')} className={`${secondaryButton} mt-4 w-full`}>Administrar clientes</button>
      </Panel>
      <Panel title="Controles aplicados" description="Protecciones centrales de identidad, secretos y aislamiento de Savia.">
        <div className="space-y-3"><Control label="MFA obligatorio" detail="TOTP o código de recuperación en cada acceso" active /><Control label="Llaves cifradas" detail="AES-GCM; nunca se muestran nuevamente" active /><Control label="Aislamiento multitenant" detail="Membresía y tenant validados en el servidor" active /><Control label="Registro de auditoría" detail="Cambios globales con actor y fecha" active /></div>
      </Panel>
    </div>
  </div>;
}

function Tenants({ data, canManage, pending, run }: SectionProps) {
  const [showForm, setShowForm] = useState(false);
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    run(
      () => createPlatformTenantAction({ name: String(values.get('name') ?? ''), industry: String(values.get('industry') ?? ''), slug: String(values.get('slug') ?? '') }),
      'Cliente creado. Ahora puedes invitar a su propietario.',
      () => { form.reset(); setShowForm(false); },
    );
  }
  return <div className="space-y-5 savia-enter">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-xl font-black tracking-tight">Espacios de clientes</h2><p className="mt-1 text-sm text-[#6c7c74]">Alta, suspensión y visibilidad del aislamiento por tenant.</p></div>{canManage ? <button onClick={() => setShowForm((value) => !value)} className={primaryButton}>{showForm ? 'Cerrar' : '+ Nuevo cliente'}</button> : null}</div>
    {showForm ? <form onSubmit={create} className="rounded-[24px] border border-[#cbded0] bg-[#edf7ef] p-5"><div className="grid gap-4 md:grid-cols-3"><Field label="Nombre"><input name="name" required maxLength={160} className={inputClass} /></Field><Field label="Sector"><input name="industry" required maxLength={160} className={inputClass} /></Field><Field label="Identificador opcional"><input name="slug" pattern="[a-z0-9-]+" maxLength={80} className={inputClass} placeholder="mi-cliente" /></Field></div><button disabled={pending} className={`${primaryButton} mt-4`}>Crear tenant aislado</button></form> : null}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.tenants.map((tenant) => <article key={tenant.id} className="rounded-[24px] border border-[#dbe4de] bg-white p-5 shadow-[0_12px_40px_rgba(31,55,43,.04)]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-lg font-black tracking-tight">{tenant.name}</p><p className="mt-1 text-xs font-semibold text-[#74847b]">{tenant.industry || 'Sin sector'}</p></div><Badge active={tenant.status === 'active'}>{tenant.status === 'active' ? 'Activo' : 'Suspendido'}</Badge></div><div className="mt-5 grid grid-cols-3 gap-2"><SmallStat label="Usuarios" value={tenant.memberCount} /><SmallStat label="Dueños" value={tenant.ownerCount} /><SmallStat label="Fuentes" value={tenant.knowledgeCount} /></div><div className="mt-4 rounded-xl bg-[#f5f7f3] px-3 py-2 font-mono text-[10px] text-[#65776d]">/{tenant.slug}</div>{canManage ? <button disabled={pending} onClick={() => run(() => setTenantStatusAction(tenant.id, tenant.status === 'active' ? 'suspended' : 'active'), tenant.status === 'active' ? 'Tenant suspendido.' : 'Tenant reactivado.')} className={`${tenant.status === 'active' ? dangerButton : secondaryButton} mt-4 w-full`}>{tenant.status === 'active' ? 'Suspender acceso' : 'Reactivar cliente'}</button> : null}</article>)}</div>
  </div>;
}

function Access({ data, canManage, pending, run, setData, setNotice, invitationUrl, setInvitationUrl }: SectionProps & { setData: (data: PlatformData) => void; setNotice: (notice: Notice) => void; invitationUrl: string | null; setInvitationUrl: (value: string | null) => void }) {
  const [mode, setMode] = useState<'tenant' | 'platform'>('tenant');
  const [query, setQuery] = useState('');
  const [invitePending, startInviteTransition] = useTransition();
  const visibleUsers = useMemo(() => data.users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase())), [data.users, query]);

  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setInvitationUrl(null);
    startInviteTransition(async () => {
      try {
        const result = await inviteAccessAction({
          name: String(values.get('name') ?? ''),
          email: String(values.get('email') ?? ''),
          tenantId: mode === 'tenant' ? String(values.get('tenantId') ?? '') : null,
          tenantRole: mode === 'tenant' ? String(values.get('tenantRole') ?? 'advisor') as TenantRole : null,
          platformRole: mode === 'platform' ? String(values.get('platformRole') ?? 'support') as 'superadmin' | 'support' : null,
        });
        setData(result.data);
        setInvitationUrl(result.invitationUrl);
        setNotice({ kind: 'success', text: result.message });
        form.reset();
      } catch (error) {
        setNotice({ kind: 'error', text: errorMessage(error) });
      }
    });
  }

  return <div className="space-y-5 savia-enter">
    {canManage ? <Panel title="Dar acceso" description="Las cuentas nuevas reciben un enlace de activación y deben configurar MFA antes de entrar.">
      <div className="mb-4 flex gap-2"><button onClick={() => setMode('tenant')} className={`rounded-xl px-3 py-2 text-xs font-black ${mode === 'tenant' ? 'bg-[#173f34] text-white' : 'bg-[#eef2ee] text-[#607269]'}`}>Usuario de cliente</button><button onClick={() => setMode('platform')} className={`rounded-xl px-3 py-2 text-xs font-black ${mode === 'platform' ? 'bg-[#173f34] text-white' : 'bg-[#eef2ee] text-[#607269]'}`}>Equipo global</button></div>
      <form onSubmit={invite} className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><Field label="Nombre"><input name="name" required maxLength={120} className={inputClass} /></Field><Field label="Correo"><input name="email" required type="email" maxLength={180} className={inputClass} /></Field>{mode === 'tenant' ? <><Field label="Cliente"><select name="tenantId" required className={inputClass}>{data.tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></Field><Field label="Rol"><select name="tenantRole" className={inputClass}><option value="advisor">Asesor</option><option value="admin">Administrador</option><option value="owner">Propietario</option></select></Field></> : <Field label="Rol global"><select name="platformRole" className={inputClass}><option value="support">Soporte (lectura)</option><option value="superadmin">Superadministrador</option></select></Field>}<div className="flex items-end"><button disabled={pending || invitePending} className={`${primaryButton} w-full`}>{invitePending ? 'Creando…' : 'Crear acceso'}</button></div></form>
      {invitationUrl ? <div className="mt-5 rounded-2xl border border-[#bcdcc8] bg-[#effbf3] p-4"><p className="text-xs font-black text-[#265d42]">Enlace de activación — se muestra una sola vez</p><div className="mt-2 flex flex-col gap-2 sm:flex-row"><input readOnly value={invitationUrl} onFocus={(event) => event.currentTarget.select()} className={`${inputClass} font-mono text-xs`} /><button type="button" onClick={() => { void navigator.clipboard.writeText(invitationUrl); setNotice({ kind: 'success', text: 'Enlace copiado.' }); }} className={secondaryButton}>Copiar</button></div><p className="mt-2 text-[10px] text-[#60776a]">Compártelo por un canal privado. Caduca en 72 horas.</p></div> : null}
    </Panel> : null}

    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-xl font-black">Usuarios y membresías</h2><p className="mt-1 text-sm text-[#6d7d75]">El acceso se resuelve en el servidor para cada tenant.</p></div><input value={query} onChange={(event) => setQuery(event.target.value)} className={`${inputClass} sm:max-w-xs`} placeholder="Buscar nombre o correo" /></div>
    <div className="space-y-4">{visibleUsers.map((user) => <article key={user.id} className="rounded-[24px] border border-[#dbe4de] bg-white p-5"><div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-black">{user.name}</h3><Badge active={user.status === 'active'}>{user.status === 'active' ? 'Activo' : 'Suspendido'}</Badge>{user.hasCredentials ? <Badge active={user.mfaEnabled}>{user.mfaEnabled ? 'MFA activo' : 'MFA pendiente'}</Badge> : <Badge>Registro demo</Badge>}</div><p className="mt-1 text-xs text-[#6c7c74]">{user.email}</p></div>{canManage && user.hasCredentials ? <div className="flex flex-wrap gap-2"><select aria-label={`Rol global de ${user.name}`} value={user.platformRole ?? ''} disabled={pending} onChange={(event) => run(() => setPlatformRoleAction({ userId: user.id, role: (event.target.value || null) as 'superadmin' | 'support' | null }), 'Rol global actualizado.')} className="rounded-xl border border-[#d7e2db] px-3 py-2 text-xs font-bold"><option value="">Sin rol global</option><option value="support">Soporte</option><option value="superadmin">Superadministrador</option></select><button disabled={pending || user.id === data.currentUser.id} onClick={() => run(() => setUserStatusAction(user.id, user.status === 'active' ? 'suspended' : 'active'), user.status === 'active' ? 'Cuenta suspendida y sesiones revocadas.' : 'Cuenta reactivada.')} className={user.status === 'active' ? dangerButton : secondaryButton}>{user.status === 'active' ? 'Suspender' : 'Reactivar'}</button></div> : null}</div>
          <div className="mt-4 flex flex-wrap gap-2">{user.memberships.length ? user.memberships.map((membership) => <div key={membership.tenantId} className="flex items-center gap-2 rounded-2xl border border-[#e0e7e2] bg-[#f7f8f5] p-2 pl-3"><span className="text-xs font-extrabold">{membership.tenantName}</span>{canManage ? <><select aria-label={`Rol de ${user.name} en ${membership.tenantName}`} value={membership.role} disabled={pending} onChange={(event) => run(() => setMembershipRoleAction({ tenantId: membership.tenantId, userId: user.id, role: event.target.value as TenantRole }), 'Rol del tenant actualizado.')} className="rounded-lg border border-[#d8e2dc] bg-white px-2 py-1.5 text-[10px] font-black"><option value="advisor">Asesor</option><option value="admin">Admin</option><option value="owner">Propietario</option></select><button disabled={pending} title="Retirar acceso" onClick={() => { if (window.confirm(`¿Retirar a ${user.name} de ${membership.tenantName}?`)) run(() => revokeMembershipAction({ tenantId: membership.tenantId, userId: user.id }), 'Acceso al tenant retirado.'); }} className="px-1.5 text-sm font-black text-[#a05243]">×</button></> : <span className="text-[10px] font-black uppercase text-[#6d8076]">{membership.role}</span>}</div>) : <span className="text-xs font-semibold text-[#89968f]">Sin tenant asignado</span>}</div>
        </article>)}</div>

    {data.invitations.length ? <Panel title="Invitaciones pendientes" description="Enlaces aún vigentes y no utilizados."><div className="space-y-2">{data.invitations.map((invitation) => <div key={invitation.id} className="flex flex-col justify-between gap-3 rounded-2xl bg-[#f6f8f5] p-3 sm:flex-row sm:items-center"><div><p className="text-sm font-extrabold">{invitation.name} · {invitation.email}</p><p className="mt-1 text-[10px] text-[#74847b]">{invitation.tenantName ?? 'Plataforma'} · {invitation.tenantRole ?? invitation.platformRole} · vence {formatDate(invitation.expiresAt)}</p></div>{canManage ? <button disabled={pending} onClick={() => run(() => revokeInvitationAction(invitation.id), 'Invitación revocada.')} className={dangerButton}>Revocar</button> : null}</div>)}</div></Panel> : null}
  </div>;
}

function AiSettings({ data, canManage, pending, run }: SectionProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState(data.tenants[0]?.id ?? '');
  const effectiveTenantId = data.tenants.some((tenant) => tenant.id === tenantId) ? tenantId : data.tenants[0]?.id ?? '';
  const selectedTenant = data.tenants.find((tenant) => tenant.id === effectiveTenantId);
  const setting = data.aiSettings.find((item) => item.tenantId === effectiveTenantId);
  const editingProvider = data.providers.find((provider) => provider.id === editing);
  const llmConnections = data.providers.filter((item) => item.status === 'active' && item.provider !== 'voyage' && ['llm', 'both'].includes(item.purpose));
  const embeddingConnections = data.providers.filter((item) => item.status === 'active' && item.provider !== 'anthropic' && ['embedding', 'both'].includes(item.purpose));

  function saveProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    run(
      () => saveProviderConnectionAction({ id: editing, name: String(values.get('name') ?? ''), provider: String(values.get('provider')) as AiProvider, purpose: String(values.get('purpose')) as AiPurpose, baseUrl: String(values.get('baseUrl') ?? ''), apiKey: String(values.get('apiKey') ?? '') }),
      editing ? 'Conexión actualizada.' : 'Conexión creada y llave cifrada.',
      () => setEditing(null),
    );
  }

  function saveTenantAi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    run(() => updateTenantAiSettingsAction({ tenantId: effectiveTenantId, llmConnectionId: String(values.get('llmConnectionId') ?? ''), llmModel: String(values.get('llmModel') ?? ''), llmTemperatureMilli: Number(values.get('temperature') ?? 200), llmMaxTokens: Number(values.get('maxTokens') ?? 420), llmFallbackConnectionId: String(values.get('fallbackConnectionId') ?? ''), llmFallbackModel: String(values.get('fallbackModel') ?? ''), embeddingConnectionId: String(values.get('embeddingConnectionId') ?? ''), embeddingModel: String(values.get('embeddingModel') ?? ''), embeddingDimensions: String(values.get('embeddingDimensions') ?? '') ? Number(values.get('embeddingDimensions')) : null, retrievalMode: String(values.get('retrievalMode') ?? 'keyword') as 'keyword' | 'semantic' | 'hybrid', dailyRequestLimit: setting?.dailyRequestLimit ?? 500, monthlyTokenLimit: setting?.monthlyTokenLimit ?? 1_000_000, monthlyCostLimitCents: setting?.monthlyCostLimitCents ?? 5_000 }), 'Configuración de IA guardada. El conocimiento pendiente se reindexará con el nuevo modelo.');
  }

  return <div className="space-y-6 savia-enter">
    <div><h2 className="text-xl font-black tracking-tight">Bóveda de proveedores</h2><p className="mt-1 text-sm text-[#6d7d75]">Las conexiones se crean una vez y luego se asignan por tenant. Ningún cliente ve estas opciones.</p></div>
    {canManage ? <Panel title={editingProvider ? 'Editar conexión' : 'Nueva conexión'} description="OpenAI, Anthropic, Hugging Face, Voyage o una API compatible con OpenAI.">
      <form key={editingProvider?.id ?? 'new'} onSubmit={saveProvider} className="grid gap-4 md:grid-cols-2 xl:grid-cols-6"><Field label="Nombre"><input name="name" required defaultValue={editingProvider?.name ?? ''} className={inputClass} placeholder="OpenAI principal" /></Field><Field label="Proveedor"><select name="provider" defaultValue={editingProvider?.provider ?? 'openai'} className={inputClass}><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="huggingface">Hugging Face</option><option value="voyage">Voyage</option><option value="openai_compatible">Compatible OpenAI / local</option></select></Field><Field label="Uso"><select name="purpose" defaultValue={editingProvider?.purpose ?? 'llm'} className={inputClass}><option value="llm">LLM</option><option value="embedding">Embeddings</option><option value="both">Ambos</option></select></Field><Field label="URL base opcional"><input name="baseUrl" type="url" defaultValue={editingProvider?.baseUrl ?? ''} className={inputClass} placeholder="https://…" /></Field><Field label={editingProvider ? 'Nueva llave (opcional)' : 'Llave API'}><input name="apiKey" type="password" autoComplete="new-password" className={inputClass} placeholder={editingProvider?.keyHint ?? 'sk-…'} /></Field><div className="flex items-end gap-2"><button disabled={pending} className={`${primaryButton} flex-1`}>{editingProvider ? 'Guardar' : 'Crear'}</button>{editingProvider ? <button type="button" onClick={() => setEditing(null)} className={secondaryButton}>Cancelar</button> : null}</div></form>
    </Panel> : null}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.providers.map((provider) => <article key={provider.id} className="rounded-[22px] border border-[#dbe4de] bg-white p-5"><div className="flex items-start justify-between"><div><p className="text-base font-black">{provider.name}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[.08em] text-[#71847a]">{providerLabel(provider.provider)} · {purposeLabel(provider.purpose)}</p></div><Badge active={provider.status === 'active'}>{provider.status === 'active' ? 'Activa' : 'Desactivada'}</Badge></div><div className="mt-4 space-y-2 rounded-xl bg-[#f5f7f3] p-3 text-xs"><p><span className="font-bold text-[#73837b]">Llave:</span> {provider.keyHint ?? 'Sin llave'}</p><p className="truncate" title={provider.baseUrl ?? 'URL oficial'}><span className="font-bold text-[#73837b]">Endpoint:</span> {provider.baseUrl ?? 'Oficial del proveedor'}</p>{provider.lastTestStatus ? <p className={provider.lastTestStatus === 'ok' ? 'text-[#39704a]' : 'text-[#98483a]'}><span className="font-bold">Última prueba:</span> {provider.lastTestStatus === 'ok' ? 'Correcta' : provider.lastTestMessage || 'Fallida'}</p> : null}</div>{canManage ? <div className="mt-4 flex gap-2"><button onClick={() => setEditing(provider.id)} className={`${secondaryButton} flex-1`}>Editar / rotar</button><button disabled={pending} onClick={() => run(() => setProviderStatusAction(provider.id, provider.status === 'active' ? 'disabled' : 'active'), provider.status === 'active' ? 'Conexión desactivada.' : 'Conexión reactivada.')} className={provider.status === 'active' ? dangerButton : secondaryButton}>{provider.status === 'active' ? 'Desactivar' : 'Activar'}</button></div> : null}</article>)}</div>
    {!data.providers.length ? <Empty title="Aún no hay proveedores" text="Crea una conexión para poder asignar modelos a cada tenant." /> : null}

    <Panel title="Asignación por tenant" description="El LLM y el modelo de embeddings pueden provenir de proveedores distintos.">
      <Field label="Cliente"><select value={effectiveTenantId} onChange={(event) => setTenantId(event.target.value)} className={`${inputClass} max-w-md`}>{data.tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></Field>
      {selectedTenant ? <form key={`${tenantId}-${setting?.configVersion ?? 0}`} onSubmit={saveTenantAi} className="mt-5 space-y-5"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Field label="Conexión LLM principal"><select name="llmConnectionId" defaultValue={setting?.llmConnectionId ?? ''} disabled={!canManage} className={inputClass}><option value="">Respaldo local sin API</option>{llmConnections.map(connectionOption)}</select></Field><Field label="ID del modelo LLM"><input name="llmModel" defaultValue={setting?.llmModel ?? ''} disabled={!canManage} className={inputClass} placeholder="Escríbelo según tu proveedor" /></Field><Field label="Temperatura (0–2000)"><input name="temperature" type="number" min="0" max="2000" defaultValue={setting?.llmTemperatureMilli ?? 200} disabled={!canManage} className={inputClass} /></Field><Field label="Máximo de tokens"><input name="maxTokens" type="number" min="64" max="8192" defaultValue={setting?.llmMaxTokens ?? 420} disabled={!canManage} className={inputClass} /></Field></div><div className="grid gap-4 md:grid-cols-2"><Field label="Conexión LLM de respaldo"><select name="fallbackConnectionId" defaultValue={setting?.llmFallbackConnectionId ?? ''} disabled={!canManage} className={inputClass}><option value="">Sin respaldo externo</option>{llmConnections.map(connectionOption)}</select></Field><Field label="Modelo LLM de respaldo"><input name="fallbackModel" defaultValue={setting?.llmFallbackModel ?? ''} disabled={!canManage} className={inputClass} /></Field></div><div className="rounded-2xl border border-[#cfe0d4] bg-[#f1f8f2] p-4"><p className="mb-4 text-xs font-black uppercase tracking-[.1em] text-[#496959]">RAG del tenant</p><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Field label="Conexión de embeddings"><select name="embeddingConnectionId" defaultValue={setting?.embeddingConnectionId ?? ''} disabled={!canManage} className={inputClass}><option value="">Sin embeddings</option>{embeddingConnections.map(connectionOption)}</select></Field><Field label="ID del modelo"><input name="embeddingModel" defaultValue={setting?.embeddingModel ?? ''} disabled={!canManage} className={inputClass} /></Field><Field label="Dimensiones opcionales"><input name="embeddingDimensions" type="number" min="1" max="8192" defaultValue={setting?.embeddingDimensions ?? ''} disabled={!canManage} className={inputClass} placeholder="Predeterminado" /></Field><Field label="Recuperación"><select name="retrievalMode" defaultValue={setting?.retrievalMode ?? 'keyword'} disabled={!canManage} className={inputClass}><option value="keyword">Palabras clave</option><option value="semantic">Semántica</option><option value="hybrid">Híbrida</option></select></Field></div></div>{canManage ? <div className="flex flex-wrap gap-2"><button disabled={pending} className={primaryButton}>Guardar IA de {selectedTenant.name}</button>{setting?.llmConnectionId ? <button type="button" disabled={pending} onClick={() => run(() => testTenantAiAction(tenantId, 'llm'), 'El LLM respondió correctamente.')} className={secondaryButton}>Probar LLM</button> : null}{setting?.embeddingConnectionId ? <button type="button" disabled={pending} onClick={() => run(() => testTenantAiAction(tenantId, 'embedding'), 'El modelo de embeddings respondió correctamente.')} className={secondaryButton}>Probar embeddings</button> : null}</div> : null}</form> : <Empty title="Sin clientes" text="Crea el primer tenant antes de asignar IA." />}
    </Panel>
  </div>;
}

function Security({ data }: SectionProps) {
  const credentialUsers = data.users.filter((user) => user.hasCredentials);
  return <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr] savia-enter"><div className="space-y-5"><Panel title="MFA obligatorio" description="Una contraseña por sí sola nunca habilita el acceso al CRM."><div className="space-y-3">{credentialUsers.map((user) => <div key={user.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#f5f7f3] p-3"><div className="min-w-0"><p className="truncate text-sm font-extrabold">{user.name}</p><p className="truncate text-[10px] text-[#7a8981]">{user.email}</p></div><Badge active={user.mfaEnabled}>{user.mfaEnabled ? 'Protegido' : 'Debe enrolar'}</Badge></div>)}</div></Panel><Panel title="Reglas de acceso" description="Controles que se aplican automáticamente."><div className="space-y-3"><Control label="Alta solo por invitación" detail="El registro público está deshabilitado" active /><Control label="MFA sin dispositivo confiable" detail="Se solicita el segundo factor en cada inicio" active /><Control label="Bloqueo por intentos" detail="5 fallos bloquean temporalmente la verificación" active /><Control label="Suspensión inmediata" detail="Revoca todas las sesiones del usuario" active /></div></Panel></div><Panel title="Auditoría global" description="Últimos cambios administrativos realizados en la plataforma."><div className="max-h-[720px] space-y-2 overflow-y-auto pr-1 savia-scrollbar">{data.audit.map((entry) => <div key={entry.id} className="rounded-2xl border border-[#e2e8e3] p-3"><div className="flex justify-between gap-3"><p className="text-xs font-black">{auditLabel(entry.action)}</p><time className="shrink-0 text-[9px] font-bold text-[#87938d]">{formatDateTime(entry.createdAt)}</time></div><p className="mt-1 text-xs leading-5 text-[#66776e]">{entry.detail}</p><p className="mt-1 text-[9px] font-bold uppercase tracking-[.08em] text-[#8b9791]">{entry.actorName ?? 'Sistema'} · {entry.entityType}</p></div>)}</div>{!data.audit.length ? <Empty title="Sin eventos" text="Los cambios administrativos aparecerán aquí." /> : null}</Panel></div>;
}

type SectionProps = {
  data: PlatformData;
  canManage: boolean;
  pending: boolean;
  run: (work: () => Promise<PlatformData>, success?: string, after?: (data: PlatformData) => void) => void;
};

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="rounded-[24px] border border-[#dbe4de] bg-white p-5 shadow-[0_14px_45px_rgba(31,55,43,.04)] md:p-6"><div className="mb-5"><h2 className="text-lg font-black tracking-tight">{title}</h2>{description ? <p className="mt-1 text-xs leading-5 text-[#718078]">{description}</p> : null}</div>{children}</section>;
}

function Metric({ label, value, note }: { label: string; value: number; note: string }) { return <article className="rounded-[22px] border border-[#dbe4de] bg-white p-5"><p className="text-[10px] font-black uppercase tracking-[.12em] text-[#718078]">{label}</p><p className="mt-3 text-4xl font-black tracking-[-.06em] text-[#173f34]">{value}</p><p className="mt-2 text-xs text-[#7a8981]">{note}</p></article>; }
function SmallStat({ label, value }: { label: string; value: number }) { return <div className="rounded-xl bg-[#f5f7f3] p-2.5 text-center"><p className="text-lg font-black text-[#254d3f]">{value}</p><p className="text-[9px] font-bold uppercase text-[#7b8a82]">{label}</p></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className={labelClass}>{label}</span>{children}</label>; }
function Badge({ active = false, children }: { active?: boolean; children: ReactNode }) { return <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[.06em] ${active ? 'bg-[#e3f3db] text-[#356b43]' : 'bg-[#f1ebe4] text-[#80634a]'}`}>{children}</span>; }
function StatusDot({ active }: { active: boolean }) { return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${active ? 'bg-[#69b87e]' : 'bg-[#d5a54b]'}`} />; }
function Control({ label, detail, active }: { label: string; detail: string; active: boolean }) { return <div className="flex gap-3 rounded-2xl border border-[#e2e8e3] p-3"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-black ${active ? 'bg-[#e4f4dd] text-[#356f45]' : 'bg-[#f4eee4] text-[#806846]'}`}>✓</span><div><p className="text-xs font-extrabold">{label}</p><p className="mt-1 text-[10px] leading-4 text-[#75847c]">{detail}</p></div></div>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="rounded-[22px] border border-dashed border-[#ccd9d0] bg-white p-8 text-center"><p className="text-sm font-black">{title}</p><p className="mt-1 text-xs text-[#78877f]">{text}</p></div>; }
function NoticeCard({ notice, onClose }: { notice: Exclude<Notice, null>; onClose: () => void }) { return <div role="status" className={`fixed right-4 top-4 z-[90] max-w-md rounded-2xl border px-4 py-3 text-sm font-semibold shadow-[0_16px_50px_rgba(20,50,40,.18)] ${notice.kind === 'success' ? 'border-[#b8dfca] bg-[#edfff4] text-[#206642]' : 'border-[#efc3b9] bg-[#fff4f1] text-[#9b3d2e]'}`}><div className="flex gap-3"><span className="flex-1">{notice.text}</span><button onClick={onClose} aria-label="Cerrar">×</button></div></div>; }

function connectionOption(provider: ProviderConnection) { return <option key={provider.id} value={provider.id}>{provider.name} · {providerLabel(provider.provider)}</option>; }
function providerLabel(provider: AiProvider): string { return { openai: 'OpenAI', anthropic: 'Anthropic', huggingface: 'Hugging Face', voyage: 'Voyage', openai_compatible: 'Compatible OpenAI' }[provider]; }
function purposeLabel(purpose: AiPurpose): string { return { llm: 'LLM', embedding: 'Embeddings', both: 'LLM + embeddings' }[purpose]; }
function auditLabel(action: string): string { return ({ 'platform.bootstrapped': 'Plataforma inicializada', 'tenant.created': 'Cliente creado', 'tenant.status_changed': 'Estado del cliente', 'access.assigned': 'Acceso asignado', 'invitation.created': 'Invitación creada', 'invitation.accepted': 'Invitación aceptada', 'invitation.revoked': 'Invitación revocada', 'membership.role_changed': 'Rol del tenant', 'membership.revoked': 'Acceso retirado', 'user.status_changed': 'Estado del usuario', 'platform_role.changed': 'Rol global', 'ai_connection.created': 'Conexión IA creada', 'ai_connection.updated': 'Conexión IA actualizada', 'ai_connection.status_changed': 'Estado de conexión IA', 'tenant.ai_config_updated': 'IA del tenant actualizada' } as Record<string, string>)[action] ?? action; }
function formatDate(value: string): string { return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(value)); }
function formatDateTime(value: string): string { return new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'No fue posible completar la acción.'; }
