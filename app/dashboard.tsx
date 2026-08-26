'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import {
  createAppointmentAction,
  createCalendarBlackoutAction,
  createCatalogItemAction,
  createContactAction,
  createKnowledgeAction,
  deleteCatalogItemAction,
  deleteCalendarBlackoutAction,
  deleteKnowledgeAction,
  markConversationReadAction,
  refreshDashboardAction,
  sendAdvisorMessageAction,
  setAppointmentStatusAction,
  setConversationModeAction,
  simulateInboundAction,
  switchTenantAction,
  updateContactAction,
  updateBusinessHoursAction,
  updateTenantSettingsAction,
  uploadKnowledgeAction,
  anonymizeContactAction,
} from '@/app/actions';
import { authClient } from '@/lib/auth-client';
import type {
  Appointment,
  Contact,
  Conversation,
  DashboardData,
  Message,
} from '@/lib/types';

type View = 'overview' | 'conversations' | 'contacts' | 'appointments' | 'knowledge' | 'settings';
type Notice = { kind: 'success' | 'error'; text: string } | null;
type ExecuteOptions = {
  success?: string;
  silent?: boolean;
  after?: (data: DashboardData) => void;
};
type Execute = (work: () => Promise<DashboardData>, options?: ExecuteOptions) => void;

const inputClass = 'w-full rounded-xl border border-[#d9e3dc] bg-white px-3.5 py-2.5 text-sm text-[#183a30] shadow-sm transition placeholder:text-[#9aa7a0] focus:border-[#6e927f]';
const labelClass = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.1em] text-[#718078]';
const primaryButton = 'rounded-xl bg-[#173f34] px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_22px_rgba(23,63,52,.16)] transition hover:bg-[#205445]';
const secondaryButton = 'rounded-xl border border-[#d7e1db] bg-white px-4 py-2.5 text-sm font-bold text-[#284b3f] shadow-sm transition hover:bg-[#f5f8f5]';

const navItems: Array<{ id: View; icon: string; label: string }> = [
  { id: 'overview', icon: '▦', label: 'Resumen' },
  { id: 'conversations', icon: '◉', label: 'Conversaciones' },
  { id: 'contacts', icon: '◇', label: 'Contactos' },
  { id: 'appointments', icon: '□', label: 'Agenda' },
  { id: 'knowledge', icon: '◎', label: 'Conocimiento' },
  { id: 'settings', icon: '⚙', label: 'Configuración' },
];

export function Dashboard({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState(initialData);
  const [activeView, setActiveView] = useState<View>('conversations');
  const [selectedConversationId, setSelectedConversationId] = useState(initialData.conversations[0]?.id ?? '');
  const [notice, setNotice] = useState<Notice>(null);
  const [isPending, startTransition] = useTransition();
  const effectiveSelectedConversationId = data.conversations.some((conversation) => conversation.id === selectedConversationId)
    ? selectedConversationId
    : data.conversations[0]?.id ?? '';

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4_500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const execute: Execute = (work, options = {}) => {
    if (!options.silent) setNotice(null);
    startTransition(async () => {
      try {
        const nextData = await work();
        setData(nextData);
        options.after?.(nextData);
        if (options.success) setNotice({ kind: 'success', text: options.success });
      } catch (error) {
        setNotice({
          kind: 'error',
          text: error instanceof Error ? error.message : 'No fue posible completar la acción.',
        });
      }
    });
  };

  const selectConversation = (conversation: Conversation) => {
    setSelectedConversationId(conversation.id);
    setActiveView('conversations');
    if (conversation.unreadCount > 0) {
      execute(() => markConversationReadAction(conversation.id), { silent: true });
    }
  };

  const switchTenant = (slug: string) => {
    execute(() => switchTenantAction(slug), {
      success: 'Cliente cambiado. Los datos mostrados pertenecen únicamente a este espacio.',
      after: (nextData) => setSelectedConversationId(nextData.conversations[0]?.id ?? ''),
    });
  };

  return (
    <main className="min-h-screen bg-[#f6f7f2] text-[#172720]">
      {isPending && <div className="fixed inset-x-0 top-0 z-[80] h-1 overflow-hidden bg-[#dce5dc]"><div className="h-full w-1/2 animate-pulse bg-[#b9dc35]" /></div>}
      {notice && (
        <div role="status" className={`fixed right-4 top-4 z-[90] max-w-sm rounded-2xl border px-4 py-3 text-sm font-semibold shadow-[0_16px_50px_rgba(20,50,40,.18)] ${notice.kind === 'success' ? 'border-[#b8dfca] bg-[#edfff4] text-[#206642]' : 'border-[#efc3b9] bg-[#fff4f1] text-[#9b3d2e]'}`}>
          {notice.text}
        </div>
      )}

      <div className="grid min-h-screen lg:grid-cols-[248px_minmax(0,1fr)]">
        <Sidebar
          data={data}
          activeView={activeView}
          onView={setActiveView}
          onSwitchTenant={switchTenant}
          isPending={isPending}
        />

        <section className="min-w-0">
          <Topbar data={data} onSwitchTenant={switchTenant} isPending={isPending} />
          <MobileNav activeView={activeView} onView={setActiveView} unread={data.conversations.reduce((sum, item) => sum + item.unreadCount, 0)} />

          <div className="mx-auto max-w-[1560px] p-4 md:p-7">
            {activeView === 'overview' && (
              <OverviewView data={data} onView={setActiveView} onConversation={selectConversation} />
            )}
            {activeView === 'conversations' && (
              <ConversationsView
                key={effectiveSelectedConversationId}
                data={data}
                selectedId={effectiveSelectedConversationId}
                onSelect={selectConversation}
                execute={execute}
                isPending={isPending}
              />
            )}
            {activeView === 'contacts' && (
              <ContactsView data={data} execute={execute} isPending={isPending} onConversation={selectConversation} />
            )}
            {activeView === 'appointments' && (
              <AppointmentsView data={data} execute={execute} isPending={isPending} />
            )}
            {activeView === 'knowledge' && (
              <KnowledgeView data={data} execute={execute} isPending={isPending} />
            )}
            {activeView === 'settings' && (
              <SettingsView data={data} execute={execute} isPending={isPending} />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Sidebar({
  data,
  activeView,
  onView,
  onSwitchTenant,
  isPending,
}: {
  data: DashboardData;
  activeView: View;
  onView: (view: View) => void;
  onSwitchTenant: (slug: string) => void;
  isPending: boolean;
}) {
  const unread = data.conversations.reduce((sum, item) => sum + item.unreadCount, 0);

  return (
    <aside className="sticky top-0 hidden h-screen flex-col overflow-y-auto border-r border-[#dfe7df] bg-[#123d31] px-5 py-6 text-white lg:flex">
      <button onClick={() => onView('overview')} className="mb-8 flex items-center gap-3 px-2 text-left">
        <Image src="/savia-mark.png" alt="Símbolo de Savia" width={44} height={44} className="h-11 w-11 object-contain" priority />
        <span>
          <span className="block text-xl font-extrabold tracking-[-0.045em]">Savia</span>
          <span className="block text-[9px] font-bold uppercase tracking-[.18em] text-[#a6c5ba]">Conversaciones vivas</span>
        </span>
      </button>

      <label className="mb-6 block rounded-2xl border border-white/10 bg-white/[.06] p-3">
        <span className="mb-1 block text-[9px] font-bold uppercase tracking-[.14em] text-[#91b8aa]">Cliente activo</span>
        <select
          aria-label="Cambiar cliente"
          value={data.tenant.slug}
          disabled={isPending}
          onChange={(event) => onSwitchTenant(event.target.value)}
          className="w-full appearance-none bg-transparent text-sm font-bold text-white outline-none"
        >
          {data.tenants.map((tenant) => <option key={tenant.id} value={tenant.slug} className="text-[#173f34]">{tenant.name}</option>)}
        </select>
      </label>

      <nav aria-label="Navegación principal" className="space-y-1.5">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onView(item.id)}
            className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-semibold transition ${activeView === item.id ? 'bg-white/[.12] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]' : 'text-[#b9d2c9] hover:bg-white/[.07] hover:text-white'}`}
          >
            <span className="w-5 text-center text-base text-[#d8f45f]">{item.icon}</span>
            {item.label}
            {item.id === 'conversations' && unread > 0 && (
              <span className="ml-auto rounded-full bg-[#d8f45f] px-2 py-0.5 text-[10px] font-black text-[#123d31]">{unread}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="mt-auto space-y-3 pt-7">
        {data.user.platformRole ? <Link href="/platform" className="block rounded-xl border border-[#d8f45f]/30 bg-[#d8f45f]/10 px-4 py-2.5 text-center text-xs font-black text-[#d8f45f] hover:bg-[#d8f45f]/15">Administración global</Link> : null}
        <div className="rounded-2xl border border-white/10 bg-white/[.06] p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold text-[#d9ebe5]">Asistente IA</span>
            <span className="h-2.5 w-2.5 rounded-full bg-[#d8f45f] shadow-[0_0_0_4px_rgba(216,244,95,.12)]" />
          </div>
          <p className="text-xs leading-5 text-[#9cc0b4]">Activo 24/7 · Conocimiento aislado para {data.tenant.name}.</p>
        </div>
        <button onClick={() => { void authClient.signOut().then(() => window.location.assign('/login')); }} className="w-full rounded-xl px-3 py-2 text-xs font-bold text-[#91b5a8] hover:bg-white/[.06] hover:text-white">Cerrar sesión</button>
        <p className="px-2 text-[10px] text-[#789f91]">Prototipo local · sin sincronización con GitHub</p>
      </div>
    </aside>
  );
}

function Topbar({ data, onSwitchTenant, isPending }: { data: DashboardData; onSwitchTenant: (slug: string) => void; isPending: boolean }) {
  return (
    <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-[#dfe7df] bg-white/90 px-4 backdrop-blur-xl md:px-7">
      <div className="flex items-center gap-3 lg:hidden">
        <Image src="/savia-mark.png" alt="Savia" width={38} height={38} className="h-9 w-9 object-contain" priority />
        <strong className="text-lg tracking-[-0.04em]">Savia</strong>
      </div>
      <div className="hidden lg:block">
        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#7b8981]">Espacio de trabajo</p>
        <p className="text-sm font-bold">{data.tenant.name} <span className="font-normal text-[#849188]">· {data.tenant.industry}</span></p>
      </div>
      <select
        aria-label="Cambiar cliente"
        value={data.tenant.slug}
        disabled={isPending}
        onChange={(event) => onSwitchTenant(event.target.value)}
        className="max-w-[150px] rounded-xl border border-[#d8e2dc] bg-white px-3 py-2 text-xs font-bold lg:hidden"
      >
        {data.tenants.map((tenant) => <option key={tenant.id} value={tenant.slug}>{tenant.name}</option>)}
      </select>
      <div className="flex items-center gap-3">
        {data.user.platformRole ? <Link href="/platform" className="hidden rounded-xl border border-[#d8e2dc] bg-white px-3 py-2 text-xs font-black text-[#2c5949] shadow-sm md:inline-flex">Panel global</Link> : null}
        <span className={`hidden rounded-full px-3 py-1.5 text-xs font-bold sm:inline-flex ${data.runtime.whatsappConfigured ? 'bg-[#e7f7ee] text-[#287451]' : 'bg-[#fff4cf] text-[#705600]'}`}>
          ● {data.runtime.whatsappLabel}
        </span>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#d8e2dc] bg-white text-xs font-black shadow-sm" title={data.user.email}>
          {initials(data.user.name)}
        </span>
      </div>
    </header>
  );
}

function MobileNav({ activeView, onView, unread }: { activeView: View; onView: (view: View) => void; unread: number }) {
  return (
    <nav aria-label="Navegación móvil" className="savia-scrollbar sticky top-[72px] z-20 flex gap-1 overflow-x-auto border-b border-[#dfe7df] bg-[#f6f7f2]/95 px-3 py-2 backdrop-blur lg:hidden">
      {navItems.map((item) => (
        <button key={item.id} onClick={() => onView(item.id)} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold ${activeView === item.id ? 'bg-[#173f34] text-white' : 'text-[#687970]'}`}>
          {item.icon} {item.label}{item.id === 'conversations' && unread > 0 ? ` ${unread}` : ''}
        </button>
      ))}
    </nav>
  );
}

function ViewHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="mb-1 text-[11px] font-black uppercase tracking-[.15em] text-[#718178]">{eyebrow}</p>
        <h1 className="text-2xl font-extrabold tracking-[-0.045em] md:text-[32px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#718078]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function StatsGrid({ data }: { data: DashboardData }) {
  const stats = [
    ['Conversaciones hoy', String(data.stats.conversationsToday), `${data.conversations.filter((item) => item.unreadCount > 0).length} por revisar`, '#c7d8d0'],
    ['Atendidas por IA', `${data.stats.aiHandledPercent}%`, data.runtime.aiLabel, '#d8f45f'],
    ['Citas confirmadas', String(data.stats.confirmedAppointments), `${data.appointments.filter((item) => item.status === 'pending').length} pendientes`, '#b9ded3'],
    ['Seguimientos próximos', String(data.stats.pendingFollowUps), 'En los próximos 3 días', '#f5c9a8'],
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map(([label, value, note, color]) => (
        <article key={label} className="rounded-2xl border border-[#dde5df] bg-white p-4 shadow-[0_8px_28px_rgba(31,55,43,.04)]">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-bold text-[#718178]">{label}</p>
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          </div>
          <p className="mt-2 text-[28px] font-extrabold tracking-[-0.05em]">{value}</p>
          <p className="mt-1 truncate text-[11px] font-semibold text-[#6a8d7a]" title={note}>{note}</p>
        </article>
      ))}
    </div>
  );
}

function OverviewView({ data, onView, onConversation }: { data: DashboardData; onView: (view: View) => void; onConversation: (conversation: Conversation) => void }) {
  const upcoming = data.appointments.filter((appointment) => !['cancelled', 'completed', 'no_show'].includes(appointment.status)).slice(0, 4);
  return (
    <section className="savia-enter">
      <ViewHeading eyebrow="Resumen comercial" title={`Buenos días, ${firstName(data.user.name)}`} description={`Esta es la actividad de ${data.tenant.name}. Todo lo que ves está aislado del resto de clientes.`} />
      <StatsGrid data={data} />

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <article className="rounded-[22px] border border-[#dbe4de] bg-white shadow-[0_16px_50px_rgba(31,55,43,.05)]">
          <div className="flex items-center justify-between border-b border-[#e7ece8] p-5">
            <div><p className="text-sm font-extrabold">Conversaciones recientes</p><p className="mt-0.5 text-xs text-[#7c8982]">Prioriza los contactos que necesitan atención.</p></div>
            <button onClick={() => onView('conversations')} className="text-xs font-black text-[#2d6b55]">Ver bandeja →</button>
          </div>
          <div className="divide-y divide-[#edf1ed]">
            {data.conversations.slice(0, 5).map((conversation) => (
              <button key={conversation.id} onClick={() => onConversation(conversation)} className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-[#f8faf7]">
                <Avatar name={conversation.contactName} seed={conversation.contactId} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-3"><strong className="truncate text-sm">{conversation.contactName}</strong><small className="text-[10px] text-[#849188]">{formatTime(conversation.lastMessageAt, data.tenant.timezone)}</small></span>
                  <span className="mt-1 block truncate text-xs text-[#718078]">{conversation.lastMessage || conversation.summary}</span>
                </span>
                <ModeBadge mode={conversation.mode} />
              </button>
            ))}
            {data.conversations.length === 0 && <EmptyState compact title="Aún no hay conversaciones" text="Crea un contacto o conecta WhatsApp para comenzar." />}
          </div>
        </article>

        <article className="rounded-[22px] border border-[#dbe4de] bg-[#173f34] p-5 text-white shadow-[0_16px_50px_rgba(31,55,43,.08)]">
          <div className="flex items-center justify-between"><p className="text-sm font-extrabold">Próximas reservas</p><span className="rounded-full bg-[#d8f45f] px-2 py-1 text-[9px] font-black text-[#173f34]">AGENDA</span></div>
          <div className="mt-5 space-y-3">
            {upcoming.map((appointment) => (
              <div key={appointment.id} className="rounded-2xl border border-white/10 bg-white/[.07] p-3.5">
                <div className="flex items-start justify-between gap-3"><strong className="text-sm">{appointment.contactName}</strong><AppointmentBadge status={appointment.status} /></div>
                <p className="mt-1 text-xs text-[#b9d2c9]">{appointment.serviceName}</p>
                <p className="mt-2 text-[11px] font-bold text-[#d8f45f]">{formatDateTime(appointment.startsAt, data.tenant.timezone)}</p>
              </div>
            ))}
            {upcoming.length === 0 && <p className="rounded-2xl bg-white/[.06] p-4 text-sm text-[#b9d2c9]">No hay reservas próximas.</p>}
          </div>
          <button onClick={() => onView('appointments')} className="mt-5 w-full rounded-xl bg-white px-4 py-2.5 text-sm font-black text-[#173f34]">Abrir agenda</button>
        </article>
      </div>

      <article className="mt-5 rounded-[22px] border border-[#dbe4de] bg-white p-5">
        <div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-extrabold">Actividad reciente</p><p className="mt-0.5 text-xs text-[#7c8982]">Trazabilidad por cliente.</p></div><span className="text-[10px] font-bold uppercase tracking-[.12em] text-[#73907f]">Auditoría</span></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.activities.slice(0, 6).map((activity) => (
            <div key={activity.id} className="rounded-2xl bg-[#f5f7f3] p-3.5">
              <p className="text-xs font-bold">{activity.detail}</p>
              <p className="mt-1.5 text-[10px] text-[#7b8981]">{activity.action} · {formatDateTime(activity.createdAt, data.tenant.timezone)}</p>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

function ConversationsView({
  data,
  selectedId,
  onSelect,
  execute,
  isPending,
}: {
  data: DashboardData;
  selectedId: string;
  onSelect: (conversation: Conversation) => void;
  execute: Execute;
  isPending: boolean;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'human'>('all');
  const [advisorMessage, setAdvisorMessage] = useState('');
  const [simulatedMessage, setSimulatedMessage] = useState('');
  const conversation = data.conversations.find((item) => item.id === selectedId) ?? data.conversations[0];
  const messages = conversation ? data.messages.filter((message) => message.conversationId === conversation.id) : [];
  const contact = conversation ? data.contacts.find((item) => item.id === conversation.contactId) : undefined;
  const contactAppointment = conversation ? data.appointments.find((item) => item.contactId === conversation.contactId && !['cancelled', 'completed'].includes(item.status)) : undefined;
  const filteredConversations = data.conversations.filter((item) => {
    const matchesSearch = `${item.contactName} ${item.contactPhone} ${item.lastMessage}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'all' || (filter === 'unread' && item.unreadCount > 0) || (filter === 'human' && item.mode === 'human');
    return matchesSearch && matchesFilter;
  });

  const sendAdvisor = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!conversation || !advisorMessage.trim()) return;
    execute(() => sendAdvisorMessageAction(conversation.id, advisorMessage), {
      success: conversation.channel === 'whatsapp' ? 'Respuesta enviada por WhatsApp.' : 'Respuesta guardada en el simulador.',
      after: () => setAdvisorMessage(''),
    });
  };

  const simulate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!conversation || !simulatedMessage.trim()) return;
    execute(() => simulateInboundAction(conversation.id, simulatedMessage), {
      success: conversation.mode === 'ai' ? 'Mensaje recibido y respondido por la IA.' : 'Mensaje recibido; espera respuesta del asesor.',
      after: () => setSimulatedMessage(''),
    });
  };

  return (
    <section className="savia-enter">
      <ViewHeading
        eyebrow="Centro de conversaciones"
        title="Tu negocio sigue conversando"
        description="Prueba el flujo completo con el simulador o toma un chat para responder manualmente."
        action={<span className="rounded-xl border border-[#d9e3dc] bg-white px-3.5 py-2 text-xs font-bold text-[#577064]">{data.runtime.whatsappLabel}</span>}
      />
      <StatsGrid data={data} />

      <div className="mt-5 grid min-h-[620px] overflow-hidden rounded-[22px] border border-[#dbe4de] bg-white shadow-[0_18px_60px_rgba(31,55,43,.07)] xl:grid-cols-[350px_minmax(0,1fr)_292px]">
        <section className="min-w-0 border-b border-[#e4eae6] xl:border-b-0 xl:border-r">
          <div className="border-b border-[#e9eeea] p-4">
            <label className="flex items-center gap-2 rounded-xl bg-[#f3f5f1] px-3 py-2.5 text-sm text-[#78867f]">
              <span aria-hidden="true">⌕</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conversación..." className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#88968e]" />
            </label>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold">
              {([['all', 'Todas'], ['unread', 'Sin leer'], ['human', 'Mías']] as const).map(([value, label]) => (
                <button key={value} onClick={() => setFilter(value)} className={`rounded-full px-3 py-1.5 ${filter === value ? 'bg-[#173f34] text-white' : 'text-[#6f7d76] hover:bg-[#f3f5f1]'}`}>{label}</button>
              ))}
            </div>
          </div>
          <div className="savia-scrollbar max-h-[360px] divide-y divide-[#edf0ed] overflow-y-auto xl:max-h-[550px]">
            {filteredConversations.map((item) => (
              <button key={item.id} onClick={() => onSelect(item)} className={`flex w-full gap-3 p-4 text-left transition ${conversation?.id === item.id ? 'bg-[#eef6ef]' : 'hover:bg-[#fafbf9]'}`}>
                <Avatar name={item.contactName} seed={item.contactId} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2"><strong className="truncate text-sm">{item.contactName}</strong><small className="shrink-0 text-[10px] text-[#849188]">{formatTime(item.lastMessageAt, data.tenant.timezone)}</small></span>
                  <span className="mt-1 flex items-center gap-2"><span className="truncate text-xs text-[#718078]">{item.lastMessage || item.summary || 'Conversación nueva'}</span>{item.unreadCount > 0 && <span className="ml-auto rounded-full bg-[#d8f45f] px-1.5 py-0.5 text-[9px] font-black">{item.unreadCount}</span>}</span>
                  <span className="mt-2 inline-flex"><ModeBadge mode={item.mode} /></span>
                </span>
              </button>
            ))}
            {filteredConversations.length === 0 && <EmptyState compact title="Sin resultados" text="Prueba con otro filtro o crea un contacto." />}
          </div>
        </section>

        {conversation ? (
          <section className="flex min-h-[620px] min-w-0 flex-col bg-[#fbfcfa]">
            <div className="flex items-center justify-between gap-3 border-b border-[#e4eae6] bg-white px-4 py-3.5 md:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={conversation.contactName} seed={conversation.contactId} size="small" />
                <div className="min-w-0"><p className="truncate text-sm font-extrabold">{conversation.contactName}</p><p className="text-[11px] text-[#5f8c74]">● {conversation.channel === 'whatsapp' ? 'WhatsApp' : 'Simulador'} · {conversation.mode === 'ai' ? `${data.tenant.assistantName} responde` : 'asesor activo'}</p></div>
              </div>
              <button
                disabled={isPending}
                onClick={() => execute(() => setConversationModeAction(conversation.id, conversation.mode === 'ai' ? 'human' : 'ai'), { success: conversation.mode === 'ai' ? 'Tomaste el chat. La IA quedó pausada.' : 'La conversación volvió a la IA.' })}
                className={conversation.mode === 'ai' ? secondaryButton : primaryButton}
              >
                {conversation.mode === 'ai' ? 'Tomar chat' : 'Devolver a IA'}
              </button>
            </div>

            <div className="savia-scrollbar flex max-h-[455px] flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-5">
              <div className="mx-auto rounded-full bg-[#edf1ed] px-3 py-1 text-[10px] font-bold text-[#718078]">HISTORIAL</div>
              {messages.map((message) => <MessageBubble key={message.id} message={message} timezone={data.tenant.timezone} />)}
              {messages.length === 0 && <EmptyState title="Conversación nueva" text="Usa el simulador de abajo para enviar el primer mensaje del cliente." />}
            </div>

            <div className="space-y-2 border-t border-[#e5ebe7] bg-white p-3 md:p-4">
              <form onSubmit={sendAdvisor} className="flex items-center gap-2 rounded-2xl border border-[#dce5df] bg-white p-2 shadow-sm">
                <span className="hidden rounded-lg bg-[#edf3ee] px-2 py-1 text-[9px] font-black text-[#587366] sm:inline">ASESOR</span>
                <input value={advisorMessage} onChange={(event) => setAdvisorMessage(event.target.value)} placeholder={conversation.mode === 'ai' ? 'Responder manualmente tomará el chat…' : 'Escribe una respuesta…'} maxLength={4000} className="min-w-0 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-[#9aa49f]" />
                <button disabled={isPending || !advisorMessage.trim()} className="h-9 rounded-xl bg-[#173f34] px-4 text-xs font-black text-white">Enviar</button>
              </form>
              <form onSubmit={simulate} className="flex items-center gap-2 rounded-xl bg-[#f2f5f1] p-2">
                <span className="hidden px-1 text-[9px] font-black text-[#6e7d75] sm:inline">SIMULAR CLIENTE</span>
                <input value={simulatedMessage} onChange={(event) => setSimulatedMessage(event.target.value)} placeholder="Ej.: ¿Cuánto cuesta y puedo reservar mañana?" maxLength={4000} className="min-w-0 flex-1 bg-transparent px-1 text-xs outline-none placeholder:text-[#8c9991]" />
                <button disabled={isPending || !simulatedMessage.trim()} className="rounded-lg border border-[#d3ded6] bg-white px-3 py-2 text-[10px] font-black text-[#315546]">Recibir</button>
              </form>
            </div>
          </section>
        ) : (
          <section className="flex min-h-[620px] items-center justify-center bg-[#fbfcfa]"><EmptyState title="No hay conversaciones" text="Crea un contacto desde el CRM para iniciar una prueba." /></section>
        )}

        <aside className="hidden border-l border-[#e4eae6] bg-white p-5 xl:block">
          {conversation && contact ? (
            <>
              <p className="text-[10px] font-black uppercase tracking-[.14em] text-[#829087]">Ficha del contacto</p>
              <div className="mt-4 flex items-center gap-3"><Avatar name={contact.name} seed={contact.id} /><div><p className="text-sm font-extrabold">{contact.name}</p><p className="text-xs text-[#7b8981]">{stageLabel(contact.pipelineStage)}</p></div></div>
              <dl className="mt-6 space-y-4 text-xs">
                <div><dt className="text-[#89948e]">Teléfono</dt><dd className="mt-1 font-bold">{contact.phone}</dd></div>
                <div><dt className="text-[#89948e]">Etiquetas</dt><dd className="mt-2 flex flex-wrap gap-1">{contact.tags.length ? contact.tags.map((tag) => <span key={tag} className="rounded-full bg-[#edf3ef] px-2 py-1 text-[10px] font-bold">{tag}</span>) : <span className="font-semibold">Sin etiquetas</span>}</dd></div>
                <div><dt className="text-[#89948e]">Resumen</dt><dd className="mt-1 leading-5 font-semibold">{conversation.summary || 'Sin resumen todavía.'}</dd></div>
              </dl>
              <div className="mt-6 rounded-2xl bg-[#f4f6f2] p-4">
                <div className="flex items-center justify-between"><p className="text-xs font-extrabold">Próxima acción</p>{contactAppointment && <AppointmentBadge status={contactAppointment.status} />}</div>
                {contactAppointment ? <><p className="mt-3 text-sm font-bold">{contactAppointment.serviceName}</p><p className="mt-1 text-xs leading-5 text-[#718078]">{formatDateTime(contactAppointment.startsAt, data.tenant.timezone)}</p></> : <p className="mt-3 text-xs leading-5 text-[#718078]">No hay una reserva activa.</p>}
              </div>
              <div className="mt-4 rounded-2xl border border-[#e0e7e2] p-4"><p className="text-xs font-extrabold">Aislamiento activo</p><p className="mt-1.5 text-[11px] leading-5 text-[#718078]">Este chat y su conocimiento están limitados a <strong>{data.tenant.name}</strong>.</p></div>
            </>
          ) : <EmptyState compact title="Sin contacto" text="Selecciona una conversación." />}
        </aside>
      </div>
    </section>
  );
}

function MessageBubble({ message, timezone }: { message: Message; timezone: string }) {
  const outbound = message.direction === 'outbound';
  return (
    <div className={`max-w-[86%] md:max-w-[76%] ${outbound ? 'ml-auto' : ''}`}>
      <div className={`rounded-2xl p-3.5 text-sm leading-5 shadow-sm ${outbound ? message.senderType === 'ai' ? 'rounded-tr-[4px] bg-[#dff3d6] text-[#244137]' : 'rounded-tr-[4px] bg-[#173f34] text-white' : 'rounded-tl-[4px] bg-white ring-1 ring-[#e2e8e3]'}`}>
        <p className="whitespace-pre-wrap">{message.body}</p>
        <p className={`mt-1.5 text-right text-[9px] ${outbound && message.senderType === 'human' ? 'text-[#b9d2c9]' : 'text-[#789083]'}`}>
          {formatTime(message.createdAt, timezone)} · {message.senderType === 'ai' ? 'IA' : message.senderType === 'human' ? 'asesor' : 'cliente'}
        </p>
      </div>
      {message.senderType === 'ai' && (message.ragSources.length > 0 || message.generationId) && (
        <div className="mt-1.5 flex flex-wrap justify-end gap-1">
          {message.ragSources.slice(0, 3).map((source) => <span key={source} title={`Fuente RAG: ${source}`} className="rounded-full bg-[#e9efea] px-2 py-0.5 text-[9px] font-bold text-[#64766c]">↳ {source}</span>)}
          {message.generationId && <a href={`/generations/${message.generationId}`} className="rounded-full bg-[#173f34] px-2 py-0.5 text-[9px] font-bold text-white">ver detalle</a>}
        </div>
      )}
    </div>
  );
}

function ContactsView({ data, execute, isPending, onConversation }: { data: DashboardData; execute: Execute; isPending: boolean; onConversation: (conversation: Conversation) => void }) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(data.contacts[0]?.id ?? '');
  const [showNew, setShowNew] = useState(false);
  const filtered = data.contacts.filter((contact) => `${contact.name} ${contact.phone} ${contact.email ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const effectiveSelectedId = data.contacts.some((contact) => contact.id === selectedId)
    ? selectedId
    : data.contacts[0]?.id ?? '';
  const selected = data.contacts.find((contact) => contact.id === effectiveSelectedId) ?? filtered[0];
  const conversation = selected ? data.conversations.find((item) => item.contactId === selected.id) : undefined;

  const createContact = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    execute(() => createContactAction({ name: String(values.get('name') ?? ''), phone: String(values.get('phone') ?? ''), email: String(values.get('email') ?? '') }), {
      success: 'Contacto creado con una conversación lista para probar.',
      after: (nextData) => {
        const created = nextData.contacts.find((contact) => !data.contacts.some((current) => current.id === contact.id));
        if (created) setSelectedId(created.id);
        setShowNew(false);
        form.reset();
      },
    });
  };

  return (
    <section className="savia-enter">
      <ViewHeading eyebrow="CRM básico" title="Contactos y oportunidades" description="Actualiza la etapa comercial, registra notas y programa el siguiente seguimiento." action={<button onClick={() => setShowNew((value) => !value)} className={primaryButton}>{showNew ? 'Cerrar formulario' : '+ Nuevo contacto'}</button>} />

      {showNew && (
        <form onSubmit={createContact} className="mb-5 grid gap-3 rounded-[22px] border border-[#dbe4de] bg-white p-5 shadow-sm md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
          <label><span className={labelClass}>Nombre</span><input name="name" required maxLength={120} className={inputClass} placeholder="Laura Martínez" /></label>
          <label><span className={labelClass}>Teléfono</span><input name="phone" required maxLength={40} className={inputClass} placeholder="+57 300 000 0000" /></label>
          <label><span className={labelClass}>Correo opcional</span><input name="email" type="email" maxLength={180} className={inputClass} placeholder="cliente@correo.com" /></label>
          <button disabled={isPending} className={primaryButton}>Crear contacto</button>
        </form>
      )}

      <div className="grid min-h-[650px] overflow-hidden rounded-[22px] border border-[#dbe4de] bg-white shadow-[0_18px_60px_rgba(31,55,43,.06)] xl:grid-cols-[minmax(0,1.25fr)_390px]">
        <div className="min-w-0 border-b border-[#e4eae6] xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between gap-3 border-b border-[#e8ede9] p-4">
            <label className="flex max-w-sm flex-1 items-center gap-2 rounded-xl bg-[#f3f5f1] px-3 py-2.5 text-sm text-[#78867f]"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar contacto…" className="min-w-0 flex-1 bg-transparent outline-none" /></label>
            <span className="text-xs font-bold text-[#718078]">{filtered.length} contactos</span>
          </div>
          <div className="savia-scrollbar overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead><tr className="border-b border-[#e8ede9] bg-[#fafbf9] text-[10px] font-black uppercase tracking-[.1em] text-[#7a8981]"><th className="px-5 py-3">Contacto</th><th className="px-4 py-3">Etapa</th><th className="px-4 py-3">Último contacto</th><th className="px-4 py-3">Seguimiento</th><th className="px-4 py-3"></th></tr></thead>
              <tbody className="divide-y divide-[#edf1ed]">
                {filtered.map((contact) => (
                  <tr key={contact.id} onClick={() => setSelectedId(contact.id)} className={`cursor-pointer transition ${selected?.id === contact.id ? 'bg-[#eef6ef]' : 'hover:bg-[#fafbf9]'}`}>
                    <td className="px-5 py-4"><div className="flex items-center gap-3"><Avatar name={contact.name} seed={contact.id} size="small" /><div><p className="text-sm font-extrabold">{contact.name}</p><p className="mt-0.5 text-xs text-[#7b8981]">{contact.phone}</p></div></div></td>
                    <td className="px-4 py-4"><StageBadge stage={contact.pipelineStage} /></td>
                    <td className="px-4 py-4 text-xs font-semibold text-[#64766c]">{formatDate(contact.lastContactAt, data.tenant.timezone)}</td>
                    <td className="px-4 py-4 text-xs font-semibold text-[#64766c]">{contact.nextFollowUpAt ? formatDate(contact.nextFollowUpAt, data.tenant.timezone) : '—'}</td>
                    <td className="px-4 py-4 text-right"><span className="text-xs font-black text-[#2e6b55]">Editar →</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <EmptyState title="No encontramos contactos" text="Cambia la búsqueda o crea un contacto nuevo." />}
          </div>
        </div>
        <aside className="bg-[#fbfcfa] p-5">
          {selected ? (
            <ContactEditor key={`${selected.id}-${selected.pipelineStage}-${selected.nextFollowUpAt}`} contact={selected} conversation={conversation} timezone={data.tenant.timezone} execute={execute} isPending={isPending} onConversation={onConversation} />
          ) : <EmptyState title="Selecciona un contacto" text="Aquí podrás editar su etapa y seguimiento." />}
        </aside>
      </div>
    </section>
  );
}

function ContactEditor({ contact, conversation, timezone, execute, isPending, onConversation }: { contact: Contact; conversation?: Conversation; timezone: string; execute: Execute; isPending: boolean; onConversation: (conversation: Conversation) => void }) {
  const [stage, setStage] = useState(contact.pipelineStage);
  const [notes, setNotes] = useState(contact.notes);
  const [followUp, setFollowUp] = useState(toDateTimeLocal(contact.nextFollowUpAt));

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    execute(() => updateContactAction({ contactId: contact.id, pipelineStage: stage, notes, nextFollowUpAt: followUp ? new Date(followUp).toISOString() : null }), { success: 'Ficha del contacto actualizada.' });
  };

  return (
    <form onSubmit={save}>
      <div className="flex items-center gap-3"><Avatar name={contact.name} seed={contact.id} /><div><h2 className="text-lg font-extrabold tracking-[-0.03em]">{contact.name}</h2><p className="text-xs text-[#7b8981]">{contact.phone}</p></div></div>
      <div className="mt-6 space-y-4">
        <label><span className={labelClass}>Etapa comercial</span><select value={stage} onChange={(event) => setStage(event.target.value as Contact['pipelineStage'])} className={inputClass}>{(['new', 'qualified', 'proposal', 'won', 'lost'] as const).map((value) => <option key={value} value={value}>{stageLabel(value)}</option>)}</select></label>
        <label><span className={labelClass}>Próximo seguimiento</span><input type="datetime-local" value={followUp} onChange={(event) => setFollowUp(event.target.value)} className={inputClass} /></label>
        <label><span className={labelClass}>Notas del asesor</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={6} maxLength={2000} className={`${inputClass} resize-none`} placeholder="Contexto, objeciones, preferencias…" /></label>
      </div>
      <button disabled={isPending} className={`${primaryButton} mt-4 w-full`}>Guardar cambios</button>
      {conversation && <button type="button" onClick={() => onConversation(conversation)} className={`${secondaryButton} mt-2 w-full`}>Abrir conversación</button>}
      <div className="mt-5 rounded-2xl border border-[#dfe7e2] bg-white p-4 text-xs text-[#687970]"><p className="font-extrabold text-[#294a3e]">Datos del cliente</p><p className="mt-1.5 leading-5">Creado {formatDate(contact.createdAt, timezone)}. {contact.email || 'Sin correo registrado.'}</p></div>
    </form>
  );
}

function AppointmentsView({ data, execute, isPending }: { data: DashboardData; execute: Execute; isPending: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<'all' | Appointment['status']>('all');
  const filtered = data.appointments.filter((appointment) => filter === 'all' || appointment.status === filter);
  const bookable = data.catalog.filter((item) => item.active && item.bookable);

  const createBlackout = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    execute(() => createCalendarBlackoutAction({
      startsAt: new Date(String(values.get('blackoutStartsAt') ?? '')).toISOString(),
      endsAt: new Date(String(values.get('blackoutEndsAt') ?? '')).toISOString(),
      reason: String(values.get('blackoutReason') ?? ''),
    }), { success: 'Franja bloqueada en la agenda.', after: () => form.reset() });
  };

  const createAppointment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const startsAt = String(values.get('startsAt') ?? '');
    execute(() => createAppointmentAction({
      contactId: String(values.get('contactId') ?? ''),
      catalogItemId: String(values.get('catalogItemId') ?? '') || undefined,
      serviceName: String(values.get('serviceName') ?? '') || undefined,
      startsAt: new Date(startsAt).toISOString(),
      notes: String(values.get('notes') ?? ''),
    }), {
      success: 'Reserva creada como pendiente.',
      after: () => { form.reset(); setShowForm(false); },
    });
  };

  return (
    <section className="savia-enter">
      <ViewHeading eyebrow="Agenda comercial" title="Reservas y asesorías" description="Administra citas, servicios y estados sin mezclar información entre clientes." action={<button onClick={() => setShowForm((value) => !value)} className={primaryButton}>{showForm ? 'Cerrar formulario' : '+ Nueva reserva'}</button>} />

      {showForm && (
        <form onSubmit={createAppointment} className="mb-5 rounded-[22px] border border-[#dbe4de] bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label><span className={labelClass}>Contacto</span><select name="contactId" required className={inputClass}><option value="">Selecciona…</option>{data.contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
            <label><span className={labelClass}>Servicio agendable</span><select name="catalogItemId" className={inputClass}><option value="">Servicio libre…</option>{bookable.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.durationMinutes} min</option>)}</select></label>
            <label><span className={labelClass}>Nombre si es libre</span><input name="serviceName" maxLength={160} className={inputClass} placeholder="Asesoría inicial" /></label>
            <label><span className={labelClass}>Inicio</span><input name="startsAt" required type="datetime-local" className={inputClass} /></label>
          </div>
          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end"><label className="flex-1"><span className={labelClass}>Notas</span><input name="notes" maxLength={1000} className={inputClass} placeholder="Información útil para la reserva" /></label><button disabled={isPending} className={primaryButton}>Crear reserva</button></div>
        </form>
      )}

      {data.user.role !== 'advisor' && <details className="mb-5 rounded-[22px] border border-[#dbe4de] bg-white p-5"><summary className="cursor-pointer text-sm font-extrabold">Bloqueos de calendario ({data.blackouts.length})</summary><form onSubmit={createBlackout} className="mt-4 grid gap-3 md:grid-cols-4 md:items-end"><label><span className={labelClass}>Desde</span><input required name="blackoutStartsAt" type="datetime-local" className={inputClass} /></label><label><span className={labelClass}>Hasta</span><input required name="blackoutEndsAt" type="datetime-local" className={inputClass} /></label><label><span className={labelClass}>Motivo</span><input name="blackoutReason" maxLength={300} className={inputClass} placeholder="Festivo, mantenimiento…" /></label><button disabled={isPending} className={secondaryButton}>Bloquear franja</button></form><div className="mt-4 space-y-2">{data.blackouts.map((blackout) => <div key={blackout.id} className="flex flex-col justify-between gap-2 rounded-xl bg-[#f5f7f3] p-3 text-xs sm:flex-row sm:items-center"><span><strong>{formatDateTime(blackout.startsAt, data.tenant.timezone)}</strong> – {formatDateTime(blackout.endsAt, data.tenant.timezone)}{blackout.reason ? ` · ${blackout.reason}` : ''}</span><button disabled={isPending} onClick={() => execute(() => deleteCalendarBlackoutAction(blackout.id), { success: 'Bloqueo eliminado.' })} className="font-black text-[#8b5549]">Eliminar</button></div>)}</div></details>}

      <div className="mb-4 flex flex-wrap gap-2">
        {([['all', 'Todas'], ['pending', 'Pendientes'], ['confirmed', 'Confirmadas'], ['completed', 'Completadas'], ['cancelled', 'Canceladas']] as const).map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={`rounded-full px-3 py-2 text-xs font-bold ${filter === value ? 'bg-[#173f34] text-white' : 'border border-[#dbe4de] bg-white text-[#60736a]'}`}>{label}</button>)}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((appointment) => (
          <article key={appointment.id} className="rounded-[22px] border border-[#dbe4de] bg-white p-5 shadow-[0_10px_35px_rgba(31,55,43,.04)]">
            <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><Avatar name={appointment.contactName} seed={appointment.contactId} size="small" /><div><p className="text-sm font-extrabold">{appointment.contactName}</p><p className="mt-0.5 text-xs text-[#738078]">{appointment.serviceName}</p></div></div><AppointmentBadge status={appointment.status} /></div>
            <div className="mt-5 rounded-2xl bg-[#f5f7f3] p-4"><p className="text-[10px] font-black uppercase tracking-[.12em] text-[#78877f]">Fecha y hora</p><p className="mt-1.5 text-sm font-extrabold text-[#24483a]">{formatDateTime(appointment.startsAt, data.tenant.timezone)}</p><p className="mt-1 text-xs text-[#74827b]">Hasta {formatTime(appointment.endsAt, data.tenant.timezone)}</p></div>
            {appointment.notes && <p className="mt-4 text-xs leading-5 text-[#687970]">{appointment.notes}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {appointment.status === 'pending' && <button disabled={isPending} onClick={() => execute(() => setAppointmentStatusAction(appointment.id, 'confirmed'), { success: 'Reserva confirmada.' })} className="rounded-lg bg-[#d8f45f] px-3 py-2 text-[10px] font-black text-[#173f34]">Confirmar</button>}
              {appointment.status === 'confirmed' && <button disabled={isPending} onClick={() => execute(() => setAppointmentStatusAction(appointment.id, 'completed'), { success: 'Reserva completada.' })} className="rounded-lg bg-[#e5f4eb] px-3 py-2 text-[10px] font-black text-[#276148]">Completar</button>}
              {!['cancelled', 'completed'].includes(appointment.status) && <button disabled={isPending} onClick={() => execute(() => setAppointmentStatusAction(appointment.id, 'cancelled'), { success: 'Reserva cancelada.' })} className="rounded-lg border border-[#e3d5d0] px-3 py-2 text-[10px] font-black text-[#8b5549]">Cancelar</button>}
            </div>
          </article>
        ))}
      </div>
      {filtered.length === 0 && <div className="rounded-[22px] border border-[#dbe4de] bg-white"><EmptyState title="No hay reservas en este estado" text="Crea una nueva reserva o cambia el filtro." /></div>}
    </section>
  );
}

function KnowledgeView({ data, execute, isPending }: { data: DashboardData; execute: Execute; isPending: boolean }) {
  const [tab, setTab] = useState<'catalog' | 'sources'>('catalog');
  const [showCatalogForm, setShowCatalogForm] = useState(false);
  const [showSourceForm, setShowSourceForm] = useState(false);

  const createCatalog = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    execute(() => createCatalogItemAction({
      name: String(values.get('name') ?? ''),
      kind: String(values.get('kind')) as 'product' | 'service',
      category: String(values.get('category') ?? ''),
      description: String(values.get('description') ?? ''),
      price: Number(values.get('price') ?? 0),
      durationMinutes: Number(values.get('durationMinutes') ?? 0),
      bookable: values.get('bookable') === 'on',
      keywords: String(values.get('keywords') ?? ''),
    }), { success: 'Elemento agregado al catálogo RAG.', after: () => { form.reset(); setShowCatalogForm(false); } });
  };

  const createSource = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    execute(() => createKnowledgeAction({ title: String(values.get('title') ?? ''), content: String(values.get('content') ?? '') }), { success: 'Documento agregado a la base RAG.', after: () => { form.reset(); setShowSourceForm(false); } });
  };

  const uploadSource = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    execute(() => uploadKnowledgeAction(new FormData(form)), { success: 'Archivo guardado e indexado localmente.', after: () => form.reset() });
  };

  return (
    <section className="savia-enter">
      <ViewHeading eyebrow="RAG por cliente" title="Conocimiento del negocio" description={`La IA de ${data.tenant.name} solo recupera información de este catálogo y estas fuentes.`} action={<div className="rounded-xl bg-[#eaf1eb] px-3.5 py-2 text-xs font-black text-[#315948]">{data.catalog.filter((item) => item.active).length + data.knowledge.length} fuentes activas</div>} />

      <div className="mb-5 flex gap-2 rounded-2xl bg-[#e9efea] p-1.5 sm:w-fit">
        <button onClick={() => setTab('catalog')} className={`flex-1 rounded-xl px-4 py-2 text-xs font-black sm:flex-none ${tab === 'catalog' ? 'bg-white text-[#173f34] shadow-sm' : 'text-[#6c7d74]'}`}>Productos y servicios</button>
        <button onClick={() => setTab('sources')} className={`flex-1 rounded-xl px-4 py-2 text-xs font-black sm:flex-none ${tab === 'sources' ? 'bg-white text-[#173f34] shadow-sm' : 'text-[#6c7d74]'}`}>Documentos</button>
      </div>

      {tab === 'catalog' ? (
        <>
          <div className="mb-4 flex items-center justify-between"><p className="text-sm font-bold text-[#6a7a72]">Información estructurada para asesoría y precios.</p><button onClick={() => setShowCatalogForm((value) => !value)} className={primaryButton}>{showCatalogForm ? 'Cerrar' : '+ Agregar elemento'}</button></div>
          {showCatalogForm && (
            <form onSubmit={createCatalog} className="mb-5 rounded-[22px] border border-[#dbe4de] bg-white p-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label><span className={labelClass}>Nombre</span><input name="name" required maxLength={160} className={inputClass} /></label>
                <label><span className={labelClass}>Tipo</span><select name="kind" className={inputClass}><option value="service">Servicio</option><option value="product">Producto</option></select></label>
                <label><span className={labelClass}>Categoría</span><input name="category" maxLength={120} className={inputClass} /></label>
                <label><span className={labelClass}>Precio COP</span><input name="price" type="number" min="0" step="100" required className={inputClass} /></label>
              </div>
              <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr_1fr]">
                <label><span className={labelClass}>Descripción verificable</span><textarea name="description" required rows={3} maxLength={2500} className={`${inputClass} resize-none`} /></label>
                <label><span className={labelClass}>Palabras clave</span><textarea name="keywords" rows={3} maxLength={500} className={`${inputClass} resize-none`} placeholder="facial, piel, limpieza" /></label>
                <div><label><span className={labelClass}>Duración (min)</span><input name="durationMinutes" type="number" min="0" max="1440" defaultValue="60" className={inputClass} /></label><label className="mt-3 flex items-center gap-2 text-xs font-bold text-[#52675c]"><input name="bookable" type="checkbox" className="h-4 w-4 accent-[#173f34]" /> Se puede agendar</label></div>
              </div>
              <button disabled={isPending} className={`${primaryButton} mt-4`}>Guardar en catálogo</button>
            </form>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.catalog.filter((item) => item.active).map((item) => (
              <article key={item.id} className="rounded-[22px] border border-[#dbe4de] bg-white p-5 shadow-[0_10px_35px_rgba(31,55,43,.04)]">
                <div className="flex items-start justify-between gap-3"><span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[.08em] ${item.kind === 'service' ? 'bg-[#e7f5ed] text-[#286047]' : 'bg-[#fff0c9] text-[#765900]'}`}>{item.kind === 'service' ? 'Servicio' : 'Producto'}</span>{item.bookable && <span className="text-[10px] font-black text-[#5b7b6c]">Agendable</span>}</div>
                <h2 className="mt-4 text-lg font-extrabold tracking-[-0.035em]">{item.name}</h2>
                <p className="mt-1 text-xs font-bold text-[#73907f]">{item.category || 'Sin categoría'}</p>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#64736b]">{item.description}</p>
                <div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-lg font-black text-[#173f34]">{formatMoney(item.priceCents, item.currency)}</p>{item.durationMinutes > 0 && <p className="text-[10px] text-[#7b8981]">{item.durationMinutes} minutos</p>}</div><button disabled={isPending} onClick={() => { if (window.confirm(`¿Desactivar ${item.name}?`)) execute(() => deleteCatalogItemAction(item.id), { success: 'Elemento desactivado.' }); }} className="text-[10px] font-black text-[#a05848]">Desactivar</button></div>
              </article>
            ))}
          </div>
          {data.catalog.filter((item) => item.active).length === 0 && <div className="rounded-[22px] border border-[#dbe4de] bg-white"><EmptyState title="Catálogo vacío" text="Agrega el primer producto o servicio de este cliente." /></div>}
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><p className="text-sm font-bold text-[#6a7a72]">Políticas, preguntas frecuentes y material de apoyo.</p><button onClick={() => setShowSourceForm((value) => !value)} className={primaryButton}>{showSourceForm ? 'Cerrar' : '+ Texto manual'}</button></div>
          {showSourceForm && <form onSubmit={createSource} className="mb-5 rounded-[22px] border border-[#dbe4de] bg-white p-5"><div className="grid gap-4 md:grid-cols-[1fr_2fr]"><label><span className={labelClass}>Título</span><input name="title" required maxLength={180} className={inputClass} placeholder="Política de cambios" /></label><label><span className={labelClass}>Contenido</span><textarea name="content" required rows={5} maxLength={20000} className={`${inputClass} resize-none`} placeholder="Información confirmada que la IA puede utilizar…" /></label></div><button disabled={isPending} className={`${primaryButton} mt-4`}>Guardar fuente</button></form>}

          <form onSubmit={uploadSource} className="mb-5 flex flex-col gap-3 rounded-[22px] border border-dashed border-[#adc4b7] bg-[#f2f7f2] p-5 sm:flex-row sm:items-center">
            <div className="flex-1"><p className="text-sm font-extrabold">Cargar archivo de texto</p><p className="mt-1 text-xs text-[#6b7c73]">TXT, MD, CSV o JSON · máximo 1 MB · guardado localmente en R2.</p></div>
            <input name="file" required type="file" accept=".txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json" className="text-xs font-semibold text-[#5b6d64] file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-black file:text-[#315546]" />
            <button disabled={isPending} className={secondaryButton}>Cargar e indexar</button>
          </form>

          <div className="grid gap-4 md:grid-cols-2">
            {data.knowledge.map((source) => (
              <article key={source.id} className="rounded-[22px] border border-[#dbe4de] bg-white p-5">
                <div className="flex items-start justify-between gap-3"><div><span className="rounded-full bg-[#e8f0ea] px-2.5 py-1 text-[9px] font-black uppercase text-[#426251]">{source.sourceType === 'file' ? 'Archivo' : 'Manual'}</span><h2 className="mt-3 text-base font-extrabold">{source.title}</h2></div><button disabled={isPending} onClick={() => { if (window.confirm(`¿Eliminar la fuente ${source.title}?`)) execute(() => deleteKnowledgeAction(source.id), { success: 'Fuente eliminada de este cliente.' }); }} className="text-[10px] font-black text-[#a05848]">Eliminar</button></div>
                <p className="mt-3 line-clamp-4 text-sm leading-6 text-[#687970]">{source.content}</p>
                <div className="mt-4 flex items-center justify-between border-t border-[#edf1ed] pt-3 text-[10px] font-bold text-[#829087]"><span>{source.fileName || 'Entrada directa'}</span><span>Lista para RAG</span></div>
              </article>
            ))}
          </div>
          {data.knowledge.length === 0 && <div className="rounded-[22px] border border-[#dbe4de] bg-white"><EmptyState title="Sin documentos" text="Agrega políticas o preguntas frecuentes para enriquecer las respuestas." /></div>}
        </>
      )}
    </section>
  );
}

function SettingsView({ data, execute, isPending }: { data: DashboardData; execute: Execute; isPending: boolean }) {
  const updateSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    execute(() => updateTenantSettingsAction({
      name: String(values.get('name') ?? ''),
      industry: String(values.get('industry') ?? ''),
      assistantName: String(values.get('assistantName') ?? ''),
      assistantTone: String(values.get('assistantTone') ?? ''),
      assistantPrompt: String(values.get('assistantPrompt') ?? ''),
    }), { success: 'Configuración del cliente actualizada.' });
  };
  const updateHours = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const hours = Object.fromEntries(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].map((day) => [day, {
      enabled: values.get(`${day}-enabled`) === 'on',
      open: String(values.get(`${day}-open`) ?? '08:00'),
      close: String(values.get(`${day}-close`) ?? '18:00'),
    }]));
    execute(() => updateBusinessHoursAction(hours), { success: 'Horario comercial actualizado.' });
  };

  return (
    <section className="savia-enter">
      <ViewHeading eyebrow="Configuración" title="Negocio y asistente" description="Personaliza este tenant. Los usuarios y proveedores de IA se administran exclusivamente desde el panel global." action={data.user.platformRole ? <Link href="/platform" className={secondaryButton}>Administración global</Link> : undefined} />

      <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <form key={data.tenant.id} onSubmit={updateSettings} className="rounded-[22px] border border-[#dbe4de] bg-white p-5 shadow-[0_14px_45px_rgba(31,55,43,.04)] md:p-6">
          <div className="mb-5"><h2 className="text-lg font-extrabold tracking-[-0.035em]">Perfil del cliente</h2><p className="mt-1 text-xs leading-5 text-[#718078]">Estas instrucciones se usan únicamente dentro de {data.tenant.name}.</p></div>
          <div className="grid gap-4 md:grid-cols-2"><label><span className={labelClass}>Nombre del negocio</span><input name="name" required defaultValue={data.tenant.name} maxLength={160} className={inputClass} /></label><label><span className={labelClass}>Sector</span><input name="industry" required defaultValue={data.tenant.industry} maxLength={160} className={inputClass} /></label></div>
          <div className="mt-4 grid gap-4 md:grid-cols-2"><label><span className={labelClass}>Nombre del asistente</span><input name="assistantName" required defaultValue={data.tenant.assistantName} maxLength={80} className={inputClass} /></label><label><span className={labelClass}>Tono</span><input name="assistantTone" required defaultValue={data.tenant.assistantTone} maxLength={240} className={inputClass} /></label></div>
          <label className="mt-4 block"><span className={labelClass}>Reglas adicionales</span><textarea name="assistantPrompt" defaultValue={data.tenant.assistantPrompt} rows={7} maxLength={4000} className={`${inputClass} resize-none`} placeholder="Qué debe priorizar, qué no debe afirmar y cuándo escalar…" /></label>
          <button disabled={isPending} className={`${primaryButton} mt-4`}>Guardar configuración</button>
        </form>

        <div className="space-y-5">
          <article className="rounded-[22px] border border-[#dbe4de] bg-white p-5">
            <h2 className="text-base font-extrabold">Estado local</h2>
            <div className="mt-4 space-y-3">
              <StatusRow label="Inteligencia artificial" value={data.runtime.aiLabel} active={data.runtime.aiConfigured} />
              <StatusRow label="Canal" value={data.runtime.whatsappLabel} active={data.runtime.whatsappConfigured} />
              <StatusRow label="Persistencia" value={data.runtime.persistenceLabel} active />
            </div>
            <button disabled={isPending} onClick={() => execute(refreshDashboardAction, { success: 'Estado actualizado.' })} className={`${secondaryButton} mt-4 w-full`}>Comprobar estado</button>
          </article>

          <article className="rounded-[22px] border border-[#dbe4de] bg-[#173f34] p-5 text-white">
            <div className="flex items-center justify-between"><h2 className="text-base font-extrabold">WhatsApp Cloud API</h2><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${data.runtime.whatsappConfigured ? 'bg-[#d8f45f] text-[#173f34]' : 'bg-white/10 text-[#c4d8d0]'}`}>{data.runtime.whatsappConfigured ? 'CONECTADO' : 'PENDIENTE'}</span></div>
            <p className="mt-3 text-xs leading-5 text-[#b9d2c9]">Webhook preparado para verificación, recepción de mensajes, estados de entrega y respuestas de texto.</p>
            <div className="mt-4 rounded-xl bg-black/10 p-3 font-mono text-[10px] text-[#d8f45f]">http://localhost:3000{data.runtime.webhookPath}</div>
            <p className="mt-3 text-[10px] leading-4 text-[#91b3a7]">Meta necesita una URL HTTPS pública. En desarrollo local se usa un túnel seguro; las credenciales permanecen fuera de la interfaz.</p>
          </article>

          <article className="rounded-[22px] border border-[#dbe4de] bg-white p-5">
            <h2 className="text-base font-extrabold">Marca Savia</h2><p className="mt-1 text-xs text-[#718078]">Paleta principal del producto.</p>
            <div className="mt-4 grid grid-cols-4 gap-2">{[['#123D31', 'Bosque'], ['#D8F45F', 'Hoja'], ['#F6F7F2', 'Marfil'], ['#B9DED3', 'Salvia']].map(([color, name]) => <div key={color}><div className="h-12 rounded-xl border border-black/5" style={{ backgroundColor: color }} /><p className="mt-1 text-center text-[9px] font-bold text-[#6d7d75]">{name}</p></div>)}</div>
          </article>
        </div>
      </div>

      {data.user.role !== 'advisor' && <form onSubmit={updateHours} className="mt-5 rounded-[22px] border border-[#dbe4de] bg-white p-5"><div className="mb-4"><h2 className="text-sm font-extrabold">Horario comercial</h2><p className="mt-1 text-xs text-[#718078]">Las reservas se validan en la zona {data.tenant.timezone}.</p></div><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">{['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].map((day) => { const hours = data.tenant.businessHours[day] ?? { open: '08:00', close: '18:00', enabled: false }; return <div key={day} className="rounded-xl bg-[#f5f7f3] p-3"><label className="flex items-center justify-between text-xs font-extrabold capitalize">{day}<input name={`${day}-enabled`} type="checkbox" defaultChecked={hours.enabled} /></label><div className="mt-2 grid grid-cols-2 gap-2"><input aria-label={`Apertura ${day}`} name={`${day}-open`} type="time" defaultValue={hours.open} className={inputClass} /><input aria-label={`Cierre ${day}`} name={`${day}-close`} type="time" defaultValue={hours.close} className={inputClass} /></div></div>; })}</div><button disabled={isPending} className={`${primaryButton} mt-4`}>Guardar horario</button></form>}

      <article className="mt-5 rounded-[22px] border border-[#cdded2] bg-[#edf7ef] p-5">
        <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-center"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#173f34] text-xl text-[#d8f45f]">✓</div><div><h2 className="text-sm font-extrabold">Separación multitenant aplicada</h2><p className="mt-1 text-xs leading-5 text-[#5d7066]">Las acciones no aceptan un tenant desde el navegador: el servidor lo obtiene de la membresía activa y todas las lecturas, actualizaciones y relaciones se validan con ese identificador.</p></div></div>
      </article>
      {data.user.role !== 'advisor' && <article className="mt-5 rounded-[22px] border border-[#dbe4de] bg-white p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-sm font-extrabold">Privacidad y portabilidad</h2><p className="mt-1 text-xs leading-5 text-[#687970]">Exporta la información del tenant o anonimiza un contacto y su contenido personal.</p></div><a href="/api/privacy/export" download className={secondaryButton}>Exportar tenant</a></div><div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{data.contacts.map((contact) => <div key={contact.id} className="rounded-xl bg-[#f5f7f3] p-3"><p className="truncate text-xs font-extrabold">{contact.name}</p><div className="mt-2 flex gap-2"><a href={`/api/privacy/export?contactId=${encodeURIComponent(contact.id)}`} download className="text-[10px] font-black text-[#356451]">Exportar</a><button disabled={isPending} onClick={() => { if (window.confirm(`¿Anonimizar permanentemente los datos personales de ${contact.name}?`)) execute(() => anonymizeContactAction(contact.id), { success: 'Datos personales anonimizados.' }); }} className="text-[10px] font-black text-[#91483b]">Anonimizar</button></div></div>)}</div></article>}
    </section>
  );
}

function StatusRow({ label, value, active }: { label: string; value: string; active: boolean }) {
  return <div className="flex items-center gap-3 rounded-2xl bg-[#f5f7f3] p-3"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${active ? 'bg-[#62b47d]' : 'bg-[#d5a83e]'}`} /><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.09em] text-[#7d8b83]">{label}</p><p className="mt-0.5 truncate text-xs font-extrabold" title={value}>{value}</p></div></div>;
}

function Avatar({ name, seed, size = 'normal' }: { name: string; seed: string; size?: 'normal' | 'small' }) {
  const colors = ['bg-[#f5c9a8]', 'bg-[#b9ded3]', 'bg-[#d9d0f0]', 'bg-[#f2dda6]', 'bg-[#bfd7ed]'];
  const color = colors[hash(seed) % colors.length];
  return <span className={`flex shrink-0 items-center justify-center rounded-full ${color} font-black text-[#294339] ${size === 'small' ? 'h-10 w-10 text-[10px]' : 'h-11 w-11 text-xs'}`}>{initials(name)}</span>;
}

function ModeBadge({ mode }: { mode: Conversation['mode'] }) {
  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[.06em] ${mode === 'ai' ? 'bg-[#e4f2de] text-[#3b6a48]' : 'bg-[#e8edf5] text-[#4e617f]'}`}>{mode === 'ai' ? 'IA' : 'Asesor'}</span>;
}

function StageBadge({ stage }: { stage: Contact['pipelineStage'] }) {
  const styles: Record<Contact['pipelineStage'], string> = { new: 'bg-[#edf1ed] text-[#5d6d64]', qualified: 'bg-[#e5f4eb] text-[#296147]', proposal: 'bg-[#fff0c8] text-[#745800]', won: 'bg-[#dff3d6] text-[#2f6b3f]', lost: 'bg-[#f4e5e1] text-[#8f4f41]' };
  return <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[.06em] ${styles[stage]}`}>{stageLabel(stage)}</span>;
}

function AppointmentBadge({ status }: { status: Appointment['status'] }) {
  const labels: Record<Appointment['status'], string> = { pending: 'Pendiente', confirmed: 'Confirmada', cancelled: 'Cancelada', completed: 'Completada', no_show: 'No asistió' };
  const styles: Record<Appointment['status'], string> = { pending: 'bg-[#fff0c5] text-[#735700]', confirmed: 'bg-[#dff3d6] text-[#2e663e]', cancelled: 'bg-[#f4e5e1] text-[#8f4f41]', completed: 'bg-[#e3edf5] text-[#486278]', no_show: 'bg-[#eee8f2] text-[#675574]' };
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[.05em] ${styles[status]}`}>{labels[status]}</span>;
}

function EmptyState({ title, text, compact = false }: { title: string; text: string; compact?: boolean }) {
  return <div className={`text-center ${compact ? 'p-6' : 'p-10'}`}><div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#edf2ed] text-[#688075]">◇</div><p className="text-sm font-extrabold">{title}</p><p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-[#7a8881]">{text}</p></div>;
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? 'S'}${parts[1]?.[0] ?? ''}`.toUpperCase();
}

function firstName(value: string): string {
  return value.trim().split(/\s+/)[0] || 'equipo';
}

function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) result = ((result << 5) - result + value.charCodeAt(index)) | 0;
  return Math.abs(result);
}

function formatTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }).format(new Date(value));
}

function formatDate(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: timezone }).format(new Date(value));
}

function formatDateTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }).format(new Date(value));
}

function formatMoney(priceCents: number, currency: string): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(priceCents / 100);
}

function stageLabel(stage: Contact['pipelineStage']): string {
  return { new: 'Nuevo', qualified: 'Calificado', proposal: 'Propuesta', won: 'Ganado', lost: 'Perdido' }[stage];
}

function toDateTimeLocal(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
