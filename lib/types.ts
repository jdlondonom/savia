export type MemberTenant = {
  id: string;
  slug: string;
  name: string;
  role: 'owner' | 'admin' | 'advisor';
};

export type Tenant = {
  id: string;
  slug: string;
  name: string;
  industry: string;
  timezone: string;
  assistantName: string;
  assistantTone: string;
  assistantPrompt: string;
  businessHours: Record<string, { open: string; close: string; enabled: boolean }>;
};

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: MemberTenant['role'];
  platformRole: 'superadmin' | 'support' | null;
  mfaEnabled: boolean;
  sessionExpiresAt: string;
};

export type Contact = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  pipelineStage: 'new' | 'qualified' | 'proposal' | 'won' | 'lost';
  tags: string[];
  notes: string;
  lastContactAt: string;
  nextFollowUpAt: string | null;
  createdAt: string;
};

export type Conversation = {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  contactStage: Contact['pipelineStage'];
  channel: 'whatsapp' | 'demo';
  status: 'open' | 'closed';
  mode: 'ai' | 'human';
  assignedUserId: string | null;
  lastMessageAt: string;
  unreadCount: number;
  summary: string;
  lastMessage: string;
};

export type Message = {
  id: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  senderType: 'contact' | 'ai' | 'human';
  body: string;
  status: 'received' | 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'simulated';
  externalId: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  generationId: string | null;
  ragSources: string[];
  createdAt: string;
};

export type CatalogItem = {
  id: string;
  name: string;
  kind: 'product' | 'service';
  category: string;
  description: string;
  priceCents: number;
  currency: string;
  durationMinutes: number;
  bookable: boolean;
  active: boolean;
  keywords: string;
  createdAt: string;
};

export type KnowledgeSource = {
  id: string;
  title: string;
  content: string;
  sourceType: 'manual' | 'file';
  fileName: string | null;
  status: 'ready' | 'processing' | 'failed';
  createdAt: string;
  updatedAt: string;
};

export type Appointment = {
  id: string;
  contactId: string;
  contactName: string;
  catalogItemId: string | null;
  serviceName: string;
  startsAt: string;
  endsAt: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  notes: string;
  createdAt: string;
};

export type CalendarBlackout = {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  createdAt: string;
};

export type Activity = {
  id: string;
  action: string;
  entityType: string;
  detail: string;
  createdAt: string;
};

export type DashboardStats = {
  conversationsToday: number;
  aiHandledPercent: number;
  confirmedAppointments: number;
  pendingFollowUps: number;
};

export type RuntimeStatus = {
  isDeployed: boolean;
  environmentLabel: string;
  releaseLabel: string;
  aiConfigured: boolean;
  aiLabel: string;
  whatsappConfigured: boolean;
  whatsappLabel: string;
  persistenceLabel: string;
  webhookPath: string;
  webhookUrl: string;
};

export type DashboardData = {
  user: AppUser;
  tenant: Tenant;
  tenants: MemberTenant[];
  conversations: Conversation[];
  messages: Message[];
  contacts: Contact[];
  catalog: CatalogItem[];
  knowledge: KnowledgeSource[];
  appointments: Appointment[];
  blackouts: CalendarBlackout[];
  activities: Activity[];
  stats: DashboardStats;
  runtime: RuntimeStatus;
};
