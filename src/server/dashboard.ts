import {
  agentLabsAgentId,
  agentLabsConfigured,
  listCalls,
  listContacts,
  phoneKey,
  updateContact,
  type AgentLabsCall,
  type AgentLabsContact,
} from "./agentlabs";
import { conversation, whatsWayConfigured, whatsWayTemplate, type WhatsWayMessage } from "./whatsway";

export const LEAD_TAG = "anti-ageing-lp";
export const STAGES = ["new", "contacted", "booked", "visited", "not_interested"] as const;
export type Stage = (typeof STAGES)[number];

// ---------- session (signed cookie, no server state) ----------

const COOKIE = "srh_dashboard";
const SESSION_HOURS = 12;

function secret() {
  const password = process.env["DASHBOARD_PASSWORD"] ?? "";
  return process.env["DASHBOARD_SESSION_SECRET"] || (password ? `srh:${password}` : "");
}

export const dashboardEnabled = () => Boolean(process.env["DASHBOARD_PASSWORD"]);

async function hmac(value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

function sameString(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function checkPassword(attempt: string) {
  const expected = process.env["DASHBOARD_PASSWORD"] ?? "";
  if (!expected) return false;
  return sameString(await hmac(`pw:${attempt}`), await hmac(`pw:${expected}`));
}

export async function sessionCookie(request: Request) {
  const expires = Date.now() + SESSION_HOURS * 3_600_000;
  const value = `${expires}.${await hmac(`session:${expires}`)}`;
  const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}${secure ? "; Secure" : ""}`;
}

export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

export async function isSignedIn(request: Request) {
  if (!dashboardEnabled()) return false;
  const raw = (request.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  const [expires, sig] = (raw?.slice(COOKIE.length + 1) ?? "").split(".");
  if (!expires || !sig || Number(expires) < Date.now()) return false;
  return sameString(sig, await hmac(`session:${expires}`));
}

export const noStore = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

// ---------- data ----------

const NEXT_ACTION: Record<string, string> = {
  Hot: "Call today and book the consultation",
  Warm: "Follow up on WhatsApp in 2–3 days",
  Cold: "Send the monthly offer / reminder",
};

/**
 * Mirrors the live temperature into AgentLabs' CRM (Lead Intelligence board), which only
 * shows leads that have a score and an AI category. Writes only leads whose score changed.
 */
async function syncCrm(leads: LeadRow[], contacts: AgentLabsContact[]) {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const changed = leads.filter((l) => byId.get(l.id)?.leadScore !== l.score);
  await mapLimit(changed.slice(0, 40), 4, async (l) => {
    const category = l.stage === "booked" || l.stage === "visited" ? "appointment_booked" : l.band.toLowerCase();
    await updateContact(l.id, {
      leadScore: l.score,
      aiCategory: category,
      aiNextAction: NEXT_ACTION[l.band] ?? "",
      ...(byId.get(l.id)?.aiSummary ? {} : { aiSummary: `${l.band} lead (${l.reasons.join(", ")}). Concern: ${l.concern || "not given"}.` }),
    }).catch((e) => console.error("CRM sync failed", l.id, e));
  });
}

/**
 * Live temperature: the form score, moved by what happened since. Booking makes a lead Hot,
 * "not interested" makes it Cold; WhatsApp replies and answered calls warm it up, unanswered
 * calls and silence cool it down. Hot ≥ 70 · Warm 45–69 · Cold < 45.
 */
function applyTemperature(l: LeadRow) {
  const reasons = [`Form ${l.formScore}`];
  let score = l.formScore;
  const add = (n: number, why: string) => {
    score += n;
    reasons.push(`${n > 0 ? "+" : ""}${n} ${why}`);
  };
  if ((l.whatsapp?.replies ?? 0) > 0) add(15, "replied on WhatsApp");
  else if (l.whatsapp?.lastStatus === "read") add(5, "read WhatsApp");
  if (l.call) {
    const answered = CONNECTED.has(l.call.status) && l.call.duration > 0;
    if (answered && /positive/i.test(l.call.sentiment)) add(20, "positive AI call");
    else if (answered && /negative/i.test(l.call.sentiment)) add(-20, "negative AI call");
    else if (answered) add(10, "answered AI call");
    else if (l.call.count >= 2) add(-15, `${l.call.count} calls unanswered`);
    else add(-5, "call not answered");
  }
  const ageDays = (Date.now() - Date.parse(l.lastEnquiryAt)) / 86_400_000;
  if (l.stage === "new" && ageDays > 7 && !(l.whatsapp?.replies ?? 0)) add(-15, "no response for 7+ days");
  if (l.stage === "booked" || l.stage === "visited") {
    score = Math.max(score, 90);
    reasons.push(l.stage === "booked" ? "Booked" : "Visited");
  }
  if (l.stage === "not_interested") {
    score = Math.min(score, 20);
    reasons.push("Not interested");
  }
  l.score = Math.max(0, Math.min(100, score));
  l.band = l.score >= 70 ? "Hot" : l.score >= 45 ? "Warm" : "Cold";
  l.reasons = reasons;
}

export type LeadRow = {
  id: string;
  name: string;
  phone: string;
  email: string;
  concern: string;
  preferredTime: string;
  quiz: string;
  form: string;
  score: number;
  band: string;
  formScore: number;
  reasons: string[];
  language: string;
  submissions: number;
  receivedAt: string;
  lastEnquiryAt: string;
  stage: Stage;
  source: string;
  consentWhatsapp: boolean;
  call: null | {
    status: string;
    duration: number;
    summary: string;
    sentiment: string;
    transcript: string;
    recordingUrl: string;
    at: string;
    count: number;
  };
  callNote: string;
  whatsapp: null | { sent: number; replies: number; lastStatus: string; lastReply: string; lastAt: string };
  whatsappNote: string;
};

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

function sourceLabel(f: Record<string, unknown>) {
  const s = str(f["utm_source"]);
  if (!s) return "Direct / organic";
  return [s, str(f["utm_medium"])].filter(Boolean).join(" / ") + (f["utm_campaign"] ? ` (${str(f["utm_campaign"])})` : "");
}

const CONNECTED = new Set(["completed"]);

function summariseWhatsApp(messages: WhatsWayMessage[]) {
  const outbound = messages.filter((m) => m.direction === "outbound" || m.fromUser === true);
  const inbound = messages.filter((m) => m.direction === "inbound" || m.fromUser === false);
  const when = (m: WhatsWayMessage) => m.timestamp ?? m.createdAt ?? "";
  const latest = <T extends WhatsWayMessage>(list: T[]) => [...list].sort((a, b) => when(b).localeCompare(when(a)))[0];
  const lastOut = latest(outbound);
  const lastIn = latest(inbound);
  const last = latest(messages);
  return {
    sent: outbound.length,
    replies: inbound.length,
    lastStatus: str(lastOut?.status),
    lastReply: str(lastIn?.content).slice(0, 160),
    lastAt: last ? when(last) : "",
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

function toLead(c: AgentLabsContact, calls: AgentLabsCall[]): LeadRow {
  const f = c.customFields ?? {};
  const mine = calls
    .filter((call) => phoneKey(call.toNumber) === phoneKey(c.phone))
    .sort((a, b) => str(b.createdAt).localeCompare(str(a.createdAt)));
  const latest = mine[0];
  const stage = (STAGES as readonly string[]).includes(str(f["clinic_stage"])) ? (str(f["clinic_stage"]) as Stage) : "new";
  return {
    id: c.id,
    name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.phone,
    phone: c.phone,
    email: str(c.email),
    concern: str(f["concern"]),
    preferredTime: str(f["preferred_time"]),
    quiz: str(f["quiz"]),
    form: str(f["form"]),
    score: Number(f["score"] ?? c.leadScore ?? 0),
    band: str(f["band"]) || "Warm",
    formScore: Number(f["score"] ?? c.leadScore ?? 0),
    reasons: [],
    language: str(f["language"]) || "en",
    submissions: Number(f["submissions"] ?? 1),
    receivedAt: str(f["first_enquiry_at"]) || str(c.createdAt),
    lastEnquiryAt: str(f["last_enquiry_at"]) || str(c.createdAt),
    stage,
    source: sourceLabel(f),
    consentWhatsapp: f["consent_whatsapp"] === true,
    call: latest
      ? {
          status: str(latest.status),
          duration: Number(latest.duration ?? 0),
          summary: str(latest.aiSummary) || str(c.aiSummary),
          sentiment: str(latest.sentiment) || str(c.sentiment),
          transcript: str(latest.transcript).slice(0, 6000),
          recordingUrl: str(latest.recordingUrl),
          at: str(latest.createdAt),
          count: mine.length,
        }
      : null,
    callNote: f["call_scheduled_for"] && !latest ? `Scheduled for ${str(f["call_scheduled_for"])}` : str(f["call_error"]) ? "Call could not be started" : "",
    whatsapp: null,
    whatsappNote: str(f["whatsapp_error"]) ? "WhatsApp message failed" : "",
  };
}

export async function dashboardData(days: number) {
  const since = Date.now() - days * 86_400_000;
  const connections = {
    agentlabs: agentLabsConfigured(),
    voiceAgent: Boolean(agentLabsAgentId()),
    whatsapp: whatsWayConfigured(),
    whatsappTemplate: Boolean(whatsWayTemplate()),
  };
  const errors: string[] = [];
  if (!connections.agentlabs) return { connections, errors: ["AgentLabs is not connected"], days, kpis: null, daily: [], leads: [] };

  const [contacts, calls] = await Promise.all([
    listContacts(),
    listCalls().catch((e) => {
      errors.push("Call history unavailable");
      console.error(e);
      return [] as AgentLabsCall[];
    }),
  ]);
  const all = contacts
    .filter((c) => c.tags?.includes(LEAD_TAG))
    .map((c) => toLead(c, calls))
    .sort((a, b) => b.lastEnquiryAt.localeCompare(a.lastEnquiryAt));
  const leads = all.filter((l) => Date.parse(l.lastEnquiryAt) >= since);

  if (connections.whatsapp) {
    let failed = 0;
    await mapLimit(leads.slice(0, 80), 6, async (lead) => {
      try {
        const messages = await conversation(lead.phone);
        if (messages.length) lead.whatsapp = summariseWhatsApp(messages);
      } catch (e) {
        failed++;
        if (failed === 1) console.error(e);
      }
    });
    if (failed) errors.push(`WhatsApp history unavailable for ${failed} lead(s)`);
  }

  leads.forEach(applyTemperature);
  await syncCrm(leads, contacts);
  const inPeriod = leads.filter((l) => Date.parse(l.receivedAt) >= since);
  const called = leads.filter((l) => l.call);
  const kpis = {
    leads: inPeriod.length,
    repeat: leads.filter((l) => l.submissions > 1).length,
    hot: leads.filter((l) => l.band === "Hot").length,
    warm: leads.filter((l) => l.band === "Warm").length,
    cold: leads.filter((l) => l.band === "Cold").length,
    called: called.length,
    connected: called.filter((l) => CONNECTED.has(l.call!.status) && l.call!.duration > 0).length,
    talkMinutes: Math.round(called.reduce((s, l) => s + (l.call?.duration ?? 0), 0) / 60),
    whatsappSent: leads.filter((l) => (l.whatsapp?.sent ?? 0) > 0).length,
    whatsappRead: leads.filter((l) => l.whatsapp?.lastStatus === "read").length,
    whatsappReplied: leads.filter((l) => (l.whatsapp?.replies ?? 0) > 0).length,
    contacted: leads.filter((l) => l.stage !== "new").length,
    booked: leads.filter((l) => l.stage === "booked" || l.stage === "visited").length,
    visited: leads.filter((l) => l.stage === "visited").length,
  };

  const daily: Array<{ date: string; leads: number }> = [];
  for (let d = days - 1; d >= 0; d--) {
    const day = new Date(Date.now() + 330 * 60_000 - d * 86_400_000).toISOString().slice(0, 10);
    daily.push({ date: day, leads: 0 });
  }
  for (const l of inPeriod) {
    const day = new Date(Date.parse(l.receivedAt) + 330 * 60_000).toISOString().slice(0, 10);
    const bucket = daily.find((x) => x.date === day);
    if (bucket) bucket.leads++;
  }
  return { connections, errors, days, kpis, daily, leads };
}

export type DashboardData = Awaited<ReturnType<typeof dashboardData>>;
