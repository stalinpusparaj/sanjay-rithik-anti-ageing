import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { DashboardData, LeadRow, Stage } from "@/server/dashboard";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [{ title: "Lead Dashboard | Sanjay Rithik Hospital" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: DashboardPage,
});

const STAGE_LABEL: Record<Stage, string> = {
  new: "New",
  contacted: "Contacted",
  booked: "Booked",
  visited: "Visited",
  not_interested: "Not interested",
};
const BAND_STYLE: Record<string, string> = {
  Hot: "bg-[oklch(0.93_0.06_35)] text-[oklch(0.42_0.14_35)]",
  Warm: "bg-[oklch(0.94_0.06_80)] text-[oklch(0.45_0.1_70)]",
  Cold: "bg-[oklch(0.93_0.03_240)] text-[oklch(0.42_0.06_240)]",
};
const CALL_LABEL: Record<string, string> = {
  queued: "Queued",
  ringing: "Ringing",
  "in-progress": "On call",
  completed: "Answered",
  failed: "Failed",
  "no-answer": "No answer",
  busy: "Busy",
};

const fmtDate = (iso: string) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—";
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

function DashboardPage() {
  const [state, setState] = useState<"loading" | "login" | "ready" | "disabled">("loading");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [days, setDays] = useState(30);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/dashboard?days=${days}`, { cache: "no-store" });
      if (res.status === 401) return setState("login");
      if (res.status === 503) return setState("disabled");
      const body = await res.json();
      if (!res.ok) return setError(body.error ?? "Could not load the dashboard.");
      setError("");
      setData(body);
      setState("ready");
    } catch {
      setError("Network error. Retrying shortly.");
    } finally {
      setRefreshing(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  if (state === "loading") return <Shell><p className="py-24 text-center text-muted-foreground">Loading…</p></Shell>;
  if (state === "disabled") return <Shell><p className="py-24 text-center text-muted-foreground">The dashboard is not enabled on this server.</p></Shell>;
  if (state === "login") return <Shell><Login onDone={load} /></Shell>;

  return (
    <Shell
      actions={
        <div className="flex items-center gap-2">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-md border border-border bg-card px-2 py-1.5 text-sm" aria-label="Period">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button onClick={() => void load()} className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted" disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button
            onClick={async () => {
              await fetch("/api/dashboard/session", { method: "DELETE" });
              setState("login");
            }}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            Sign out
          </button>
        </div>
      }
    >
      {error && <Banner tone="error">{error}</Banner>}
      {data && <Body data={data} reload={load} />}
    </Shell>
  );
}

function Shell({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <p className="font-display text-xl leading-tight">Sanjay Rithik Hospital</p>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Anti-ageing consultations · Lead dashboard</p>
          </div>
          {actions}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/dashboard/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    setBusy(false);
    if (res.ok) return onDone();
    setError((await res.json().catch(() => ({}))).error ?? "Sign-in failed.");
  }
  return (
    <form onSubmit={submit} className="mx-auto mt-16 max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
      <h1 className="font-display text-2xl">Sign in</h1>
      <p className="mt-1 text-sm text-muted-foreground">Enter the dashboard password the clinic was given.</p>
      <input type="password" autoFocus required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-4 w-full rounded-md border border-border bg-background px-3 py-2" aria-label="Password" />
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <button disabled={busy} className="mt-4 w-full rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-60">{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}

function Banner({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  return (
    <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-border bg-muted text-foreground"}`}>
      {children}
    </div>
  );
}

function Body({ data, reload }: { data: DashboardData; reload: () => void }) {
  const c = data.connections;
  const setup = [
    !c.voiceAgent && "the AI voice agent is not selected yet, so new leads are not called automatically",
    !c.whatsapp && "WhatsApp (WhatsWay) is not connected",
    c.whatsapp && !c.whatsappTemplate && "no approved WhatsApp welcome template is set, so leads get no automatic WhatsApp",
  ].filter(Boolean);
  const k = data.kpis;
  return (
    <>
      {setup.length > 0 && <Banner tone="info">Setup still pending: {setup.join("; ")}.</Banner>}
      {data.errors.filter((e) => e !== "AgentLabs is not connected").map((e) => <Banner key={e} tone="error">{e}</Banner>)}
      {!k ? (
        <Banner tone="error">Lead storage (AgentLabs) is not connected, so there is nothing to show yet.</Banner>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="New enquiries" value={k.leads} hint={`${k.repeat} enquired more than once`} />
            <Tile label="Hot leads" value={k.hot} hint={`${k.warm} warm · ${k.cold} cold`} />
            <Tile label="AI calls answered" value={k.connected} hint={`${k.called} called · ${pct(k.connected, k.called)} answered · ${k.talkMinutes} min`} />
            <Tile label="Consultations booked" value={k.booked} hint={`${k.visited} visited · ${pct(k.booked, data.leads.length)} of leads`} />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <Card title={`Enquiries per day · last ${data.days} days`} className="lg:col-span-2"><DailyChart daily={data.daily} /></Card>
            <Card title="Lead journey">
              <Funnel
                steps={[
                  ["Enquired", data.leads.length],
                  ["Called by AI agent", k.called],
                  ["Answered the call", k.connected],
                  ["WhatsApp replied", k.whatsappReplied],
                  ["Booked", k.booked],
                  ["Visited clinic", k.visited],
                ]}
              />
            </Card>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <Card title="WhatsApp">
              <Stat label="Welcome sent" value={k.whatsappSent} />
              <Stat label="Read" value={k.whatsappRead} />
              <Stat label="Replied" value={k.whatsappReplied} />
            </Card>
            <Card title="Where leads came from" className="lg:col-span-2"><Sources leads={data.leads} /></Card>
          </div>
          <LeadTable leads={data.leads} canCall={c.voiceAgent} reload={reload} />
        </>
      )}
    </>
  );
}

function Tile({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-4xl tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Card({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-border bg-card p-4 ${className}`}>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function DailyChart({ daily }: { daily: Array<{ date: string; leads: number }> }) {
  const max = Math.max(1, ...daily.map((d) => d.leads));
  const w = 100 / daily.length;
  return (
    <div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-40 w-full" role="img" aria-label="Enquiries per day">
        {daily.map((d, i) => {
          const h = (d.leads / max) * 36;
          return (
            <rect key={d.date} x={i * w + w * 0.15} y={40 - h} width={w * 0.7} height={Math.max(h, d.leads ? 0.8 : 0.2)} rx={0.4} className="fill-[oklch(0.62_0.09_52)]">
              <title>{`${d.date}: ${d.leads} enquiries`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{daily[0]?.date.slice(5)}</span>
        <span>Peak {max} / day</span>
        <span>Today</span>
      </div>
    </div>
  );
}

function Funnel({ steps }: { steps: Array<[string, number]> }) {
  const top = Math.max(1, steps[0]?.[1] ?? 1);
  return (
    <div className="space-y-2">
      {steps.map(([label, n]) => (
        <div key={label}>
          <div className="flex justify-between text-sm"><span>{label}</span><span className="tabular-nums">{n}</span></div>
          <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-[oklch(0.62_0.09_52)]" style={{ width: `${(n / top) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function Sources({ leads }: { leads: LeadRow[] }) {
  const rows = useMemo(() => {
    const m = new Map<string, { n: number; booked: number }>();
    for (const l of leads) {
      const r = m.get(l.source) ?? { n: 0, booked: 0 };
      r.n++;
      if (l.stage === "booked" || l.stage === "visited") r.booked++;
      m.set(l.source, r);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6);
  }, [leads]);
  if (!rows.length) return <p className="text-sm text-muted-foreground">No enquiries in this period yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-xs text-muted-foreground"><th className="pb-1 font-normal">Source</th><th className="pb-1 text-right font-normal">Leads</th><th className="pb-1 text-right font-normal">Booked</th></tr></thead>
      <tbody>{rows.map(([s, r]) => <tr key={s} className="border-t border-border"><td className="py-1.5">{s}</td><td className="text-right tabular-nums">{r.n}</td><td className="text-right tabular-nums">{r.booked}</td></tr>)}</tbody>
    </table>
  );
}

function LeadTable({ leads, canCall, reload }: { leads: LeadRow[]; canCall: boolean; reload: () => void }) {
  const [query, setQuery] = useState("");
  const [band, setBand] = useState("all");
  const [stage, setStage] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  const shown = leads.filter(
    (l) =>
      (band === "all" || l.band === band) &&
      (stage === "all" || l.stage === stage) &&
      (!query || `${l.name} ${l.phone} ${l.concern}`.toLowerCase().includes(query.toLowerCase())),
  );
  return (
    <section className="mt-3 rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
        <h2 className="mr-auto text-sm font-semibold">Leads ({shown.length})</h2>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, concern" className="w-56 rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
        <select value={band} onChange={(e) => setBand(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" aria-label="Lead temperature">
          <option value="all">All temperatures</option><option>Hot</option><option>Warm</option><option>Cold</option>
        </select>
        <select value={stage} onChange={(e) => setStage(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" aria-label="Stage">
          <option value="all">All stages</option>
          {Object.entries(STAGE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {shown.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">No leads match.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">Lead</th><th className="px-2 py-2 font-medium">Concern</th><th className="px-2 py-2 font-medium">Score</th>
                <th className="px-2 py-2 font-medium">AI call</th><th className="px-2 py-2 font-medium">WhatsApp</th><th className="px-2 py-2 font-medium">Stage</th><th className="px-4 py-2 font-medium">Received</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => (
                <LeadRowView key={l.id} lead={l} open={open === l.id} toggle={() => setOpen(open === l.id ? null : l.id)} canCall={canCall} reload={reload} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function LeadRowView({ lead: l, open, toggle, canCall, reload }: { lead: LeadRow; open: boolean; toggle: () => void; canCall: boolean; reload: () => void }) {
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  async function act(body: Record<string, string>, label: string) {
    setBusy(label);
    setNote("");
    const res = await fetch("/api/dashboard/lead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: l.id, ...body }) });
    setBusy("");
    if (!res.ok) return setNote((await res.json().catch(() => ({}))).error ?? "Failed.");
    if (body["action"] === "call") setNote("Call requested.");
    reload();
  }
  const callText = l.call ? `${CALL_LABEL[l.call.status] ?? l.call.status}${l.call.duration ? ` · ${Math.ceil(l.call.duration / 60)} min` : ""}` : l.callNote || "Not called";
  const waText = l.whatsapp ? (l.whatsapp.replies ? `Replied (${l.whatsapp.replies})` : l.whatsapp.lastStatus ? l.whatsapp.lastStatus[0]!.toUpperCase() + l.whatsapp.lastStatus.slice(1) : "Sent") : l.whatsappNote || (l.consentWhatsapp ? "Not sent" : "No consent");
  return (
    <>
      <tr className="cursor-pointer border-t border-border hover:bg-muted/50" onClick={toggle}>
        <td className="px-4 py-2.5">
          <p className="font-medium">{l.name}{l.submissions > 1 && <span className="ml-1 text-xs text-muted-foreground">×{l.submissions}</span>}</p>
          <p className="text-xs text-muted-foreground">{l.phone}</p>
        </td>
        <td className="max-w-[220px] truncate px-2" title={l.concern}>{l.concern || "—"}</td>
        <td className="px-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BAND_STYLE[l.band] ?? ""}`}>{l.band} · {l.score}</span></td>
        <td className="px-2">{callText}</td>
        <td className="px-2">{waText}</td>
        <td className="px-2" onClick={(e) => e.stopPropagation()}>
          <select value={l.stage} disabled={Boolean(busy)} onChange={(e) => void act({ stage: e.target.value }, "stage")} className="rounded-md border border-border bg-background px-1.5 py-1 text-sm" aria-label={`Stage for ${l.name}`}>
            {Object.entries(STAGE_LABEL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </td>
        <td className="px-4 text-xs text-muted-foreground">{fmtDate(l.lastEnquiryAt)}</td>
      </tr>
      {open && (
        <tr className="bg-muted/40">
          <td colSpan={7} className="px-4 py-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1 text-sm">
                <p className="font-semibold">Enquiry</p>
                <p>Form: {l.form || "—"}</p>
                <p>Preferred time: {l.preferredTime || "—"}</p>
                <p>Source: {l.source}</p>
                {l.email && <p>Email: {l.email}</p>}
                {l.quiz && <p className="text-muted-foreground">Skin check: {l.quiz}</p>}
                <p className="text-muted-foreground">First enquiry {fmtDate(l.receivedAt)}</p>
              </div>
              <div className="space-y-1 text-sm">
                <p className="font-semibold">AI voice call</p>
                {l.call ? (
                  <>
                    <p>{callText} · {fmtDate(l.call.at)}{l.call.count > 1 ? ` · ${l.call.count} calls` : ""}</p>
                    {l.call.summary && <p className="text-muted-foreground">{l.call.summary}</p>}
                    {l.call.sentiment && <p>Sentiment: {l.call.sentiment}</p>}
                    {l.call.recordingUrl && <a href={l.call.recordingUrl} target="_blank" rel="noreferrer" className="underline">Play recording</a>}
                    {l.call.transcript && (
                      <details><summary className="cursor-pointer">Transcript</summary><pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap text-xs">{l.call.transcript}</pre></details>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">{l.callNote || "No call yet."}</p>
                )}
              </div>
              <div className="space-y-2 text-sm">
                <p className="font-semibold">WhatsApp</p>
                {l.whatsapp ? (
                  <p>{l.whatsapp.sent} sent · {l.whatsapp.replies} replies{l.whatsapp.lastReply && <span className="block text-muted-foreground">Last reply: “{l.whatsapp.lastReply}”</span>}</p>
                ) : (
                  <p className="text-muted-foreground">{waText}</p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <a href={`https://wa.me/${l.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="rounded-md border border-border bg-card px-3 py-1.5">Open WhatsApp</a>
                  <a href={`tel:${l.phone}`} className="rounded-md border border-border bg-card px-3 py-1.5">Call from phone</a>
                  {canCall && (
                    <button disabled={Boolean(busy)} onClick={() => void act({ action: "call" }, "call")} className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground disabled:opacity-60">
                      {busy === "call" ? "Requesting…" : "AI agent: call now"}
                    </button>
                  )}
                </div>
                {note && <p className="text-xs">{note}</p>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
