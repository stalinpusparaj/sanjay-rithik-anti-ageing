import { createFileRoute } from "@tanstack/react-router";
import {
  agentLabsAgentId,
  agentLabsConfigured,
  createContact,
  findContactByPhone,
  triggerCall,
  updateContact,
  type AgentLabsContact,
} from "@/server/agentlabs";
import { LEAD_TAG } from "@/server/dashboard";
import { quizAnswers, scoreLead, text, type LeadPayload } from "@/server/scoring";
import { sendWelcomeTemplate, upsertWhatsAppContact, whatsWayConfigured, whatsWayTemplate } from "@/server/whatsway";


function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function splitName(fullName: string) {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  const i = trimmed.indexOf(" ");
  return i === -1 ? { firstName: trimmed, lastName: "" } : { firstName: trimmed.slice(0, i), lastName: trimmed.slice(i + 1) };
}

/** E.164; bare 10-digit numbers are Indian mobiles. */
function e164(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return `+${digits}`;
}

/**
 * The AI agent only calls inside the clinic's day (IST). Outside it, the call is
 * scheduled for the next opening time instead of ringing someone at night.
 */
function callTime(now = new Date()): string | undefined {
  const [open, close] = (process.env["AGENTLABS_CALL_WINDOW"] ?? "10:00-20:30")
    .split("-")
    .map((t) => t.split(":").map(Number))
    .map(([h = 0, m = 0]) => h * 60 + m);
  const ist = new Date(now.getTime() + 330 * 60_000);
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  if (minutes >= open! && minutes < close!) return undefined;
  const next = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + (minutes >= close! ? 1 : 0)));
  return new Date(next.getTime() + open! * 60_000 - 330 * 60_000).toISOString();
}

function leadFields(payload: LeadPayload, previous: Record<string, unknown>, referer: string | null) {
  const submissions = Number(previous["submissions"] ?? 0) + 1;
  const { score, band } = scoreLead(payload, submissions);
  const quiz = quizAnswers(payload);
  const now = new Date().toISOString();
  const fields: Record<string, unknown> = {
    ...previous,
    lead_source: "Anti-ageing 35–55 landing page",
    form: text(payload["source"]) || text(payload.lead_type) || "website",
    concern: text(payload.primary_concern) || quiz["concern"] || "",
    preferred_time: text(payload["preferred_time"]),
    result_profile: text(payload["result_profile"]),
    quiz: Object.entries(quiz).map(([k, v]) => `${k}: ${v}`).join(" · "),
    score,
    band,
    submissions,
    first_enquiry_at: previous["first_enquiry_at"] ?? now,
    last_enquiry_at: now,
    consent_contact: payload["consent_status"] === true,
    consent_whatsapp: payload["consent_whatsapp"] === true,
    utm_source: text(payload["utm_source"]),
    utm_medium: text(payload["utm_medium"]),
    utm_campaign: text(payload["utm_campaign"]),
    landing_url: referer ?? "",
    clinic_stage: previous["clinic_stage"] ?? "new",
  };
  // A repeat enquiry often carries less (no UTMs, skipped quiz): keep what we already knew.
  for (const key of ["concern", "preferred_time", "result_profile", "quiz", "utm_source", "utm_medium", "utm_campaign", "landing_url"]) {
    if (!fields[key] && previous[key]) fields[key] = previous[key];
  }
  return fields;
}

/** After the lead is saved: AI call and WhatsApp welcome. Failures are recorded, not fatal. */
async function followUp(contact: AgentLabsContact, fields: Record<string, unknown>, phone: string, firstName: string) {
  const updates: Record<string, unknown> = {};
  const agentId = agentLabsAgentId();
  const alreadyCalled = Boolean(fields["call_id"]) && Number(fields["submissions"]) > 1;
  if (fields["consent_contact"] && agentId && !alreadyCalled) {
    try {
      const scheduledAt = callTime();
      const call = await triggerCall({
        agentId,
        toNumber: phone,
        metadata: { lead: contact.id, name: firstName, concern: String(fields["concern"] ?? ""), source: LEAD_TAG },
        dynamicVariables: { name: firstName, concern: String(fields["concern"] || "skin concern") },
        ...(scheduledAt ? { scheduledAt } : {}),
      });
      Object.assign(updates, { call_id: call.callId, call_requested_at: new Date().toISOString(), call_scheduled_for: scheduledAt ?? "", call_error: "" });
    } catch (error) {
      console.error("AgentLabs call request failed", error);
      updates["call_error"] = String((error as Error).message).slice(0, 200);
    }
  }
  if (whatsWayConfigured()) {
    try {
      await upsertWhatsAppContact(phone, [firstName, contact.lastName].filter(Boolean).join(" "));
      if (fields["consent_whatsapp"] && whatsWayTemplate() && !fields["whatsapp_message_id"]) {
        const sent = await sendWelcomeTemplate(phone, firstName, { concern: String(fields["concern"] ?? ""), preferredTime: String(fields["preferred_time"] ?? "") });
        Object.assign(updates, { whatsapp_message_id: sent?.messageId ?? "", whatsapp_sent_at: new Date().toISOString(), whatsapp_error: "" });
      }
    } catch (error) {
      console.error("WhatsWay welcome failed", error);
      updates["whatsapp_error"] = String((error as Error).message).slice(0, 200);
    }
  }
  if (Object.keys(updates).length > 0) {
    await updateContact(contact.id, { customFields: { ...fields, ...updates } }).catch((error) =>
      console.error("AgentLabs follow-up status update failed", error),
    );
  }
}

export const Route = createFileRoute("/api/lead-capture")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Forms post here directly (not as JSON) if the page's script hasn't loaded yet.
        // Those visitors are sent back to the page instead of seeing raw JSON.
        const isFormPost = !(request.headers.get("content-type") ?? "").includes("application/json");
        const respond = (body: Record<string, unknown>, status = 200) =>
          isFormPost
            ? new Response(null, {
                status: 303,
                headers: { Location: `/?enquiry=${status < 300 ? "received" : "failed"}#a-hero-form` },
              })
            : json(body, status);

        if (!agentLabsConfigured()) return respond({ error: "Lead storage is not configured on the server." }, 503);

        let payload: LeadPayload;
        try {
          if (isFormPost) {
            const form = await request.formData();
            const field = (key: string) => String(form.get(key) ?? "").trim();
            payload = {
              lead_type: "consultation_booking",
              source: "form_without_script",
              name: field("name"),
              phone: field("phone"),
              primary_concern: field("concern"),
              consent_status: form.get("consent") !== null,
              consent_whatsapp: form.get("consent") !== null,
            };
          } else {
            payload = await request.json();
          }
        } catch {
          return respond({ error: "Invalid request body." }, 400);
        }

        const name = text(payload.name);
        const rawPhone = text(payload.phone);
        if (!name || !rawPhone) return respond({ error: "name and phone are required." }, 400);
        const phone = e164(rawPhone);
        if (phone.replace(/\D/g, "").length < 10) return respond({ error: "Please enter a valid phone number." }, 400);
        const { firstName, lastName } = splitName(name);
        const email = text(payload.email);

        try {
          const existing = await findContactByPhone(phone);
          const fields = leadFields(payload, existing?.customFields ?? {}, request.headers.get("referer"));
          const tags = [...new Set([...(existing?.tags ?? []), LEAD_TAG])];
          const contact = existing
            ? await updateContact(existing.id, { firstName, lastName, ...(email ? { email } : {}), tags, customFields: fields })
            : await createContact({ phone, firstName, lastName, ...(email ? { email } : {}), tags, customFields: fields });

          // Respond as soon as the lead is stored; the call and WhatsApp run after.
          void followUp(contact, fields, phone, firstName);
          return respond({ ok: true, leadId: contact.id });
        } catch (error) {
          console.error("AgentLabs lead capture failed", error);
          return respond({ error: "Your request could not be saved. Please call or WhatsApp us." }, 502);
        }
      },
    },
  },
});
