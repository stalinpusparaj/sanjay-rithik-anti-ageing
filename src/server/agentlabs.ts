/**
 * AgentLabs REST API (v1, REST-API add-on). AgentLabs is the lead store for this page:
 * every enquiry is an AgentLabs contact tagged LEAD_TAG, and the AI voice agent calls it.
 * Server-only: the key never reaches the browser.
 */

export type AgentLabsContact = {
  id: string;
  phone: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  tags?: string[] | null;
  customFields?: Record<string, unknown> | null;
  stage?: string | null;
  leadScore?: number | null;
  aiSummary?: string | null;
  sentiment?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AgentLabsCall = {
  id: string;
  agentId?: string;
  toNumber?: string;
  status?: string;
  duration?: number | null;
  transcript?: string | null;
  aiSummary?: string | null;
  recordingUrl?: string | null;
  sentiment?: string | null;
  createdAt?: string;
  endedAt?: string | null;
};

export class AgentLabsError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function config() {
  return {
    url: (process.env["AGENTLABS_API_URL"] ?? "").trim().replace(/\/$/, ""),
    key: (process.env["AGENTLABS_API_KEY"] ?? "").trim(),
    agentId: (process.env["AGENTLABS_AGENT_ID"] ?? "").trim(),
  };
}

export const agentLabsConfigured = () => Boolean(config().url && config().key);
export const agentLabsAgentId = () => config().agentId;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = config();
  if (!url || !key) throw new AgentLabsError(503, "AgentLabs is not configured");
  const response = await fetch(`${url}/api/v1${path}`, {
    ...init,
    headers: { "X-API-Key": key, "Content-Type": "application/json", Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new AgentLabsError(response.status, `AgentLabs ${path} responded ${response.status}: ${detail.slice(0, 240)}`);
  }
  return (await response.json()) as T;
}

type Page<T> = { data: T[]; meta?: { pagination?: { hasNext?: boolean } } };

async function listAll<T>(path: string, maxPages: number): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await request<Page<T>>(`${path}?page=${page}&pageSize=100`);
    items.push(...(res.data ?? []));
    if (!res.meta?.pagination?.hasNext) break;
  }
  return items;
}

/** Last 10 digits: matches "+91 98400 00001", "919840000001" and "9840000001" alike. */
export const phoneKey = (phone: string | undefined | null) => (phone ?? "").replace(/\D/g, "").slice(-10);

export const listContacts = (maxPages = 20) => listAll<AgentLabsContact>("/contacts", maxPages);
export const listCalls = (maxPages = 10) => listAll<AgentLabsCall>("/calls", maxPages);

export async function findContactByPhone(phone: string) {
  const key = phoneKey(phone);
  return (await listContacts()).find((c) => phoneKey(c.phone) === key);
}

export async function createContact(body: {
  phone: string;
  firstName: string;
  lastName?: string;
  email?: string;
  tags: string[];
  customFields: Record<string, unknown>;
}) {
  return (await request<{ data: AgentLabsContact }>("/contacts", { method: "POST", body: JSON.stringify(body) })).data;
}

export async function getContact(id: string) {
  return (await request<{ data: AgentLabsContact }>(`/contacts/${encodeURIComponent(id)}`)).data;
}

export async function updateContact(id: string, body: Partial<Omit<AgentLabsContact, "id">>) {
  return (
    await request<{ data: AgentLabsContact }>(`/contacts/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    })
  ).data;
}

export async function triggerCall(body: {
  agentId: string;
  toNumber: string;
  metadata?: Record<string, string>;
  /** Fills {{name}} / {{concern}} in the agent's script. */
  dynamicVariables?: Record<string, string>;
  scheduledAt?: string;
}) {
  return (
    await request<{ data: { callId: string; status: string } }>("/calls", { method: "POST", body: JSON.stringify(body) })
  ).data;
}
