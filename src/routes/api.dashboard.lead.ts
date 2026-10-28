import { createFileRoute } from "@tanstack/react-router";
import { agentLabsAgentId, getContact, triggerCall, updateContact } from "@/server/agentlabs";
import { isSignedIn, LEAD_TAG, noStore, STAGES } from "@/server/dashboard";

/** Staff actions on one lead: move it through the clinic pipeline, or ask the AI agent to call now. */
export const Route = createFileRoute("/api/dashboard/lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isSignedIn(request))) return noStore({ error: "Please sign in." }, 401);
        const body = (await request.json().catch(() => ({}))) as { id?: string; stage?: string; action?: string };
        if (!body.id) return noStore({ error: "Missing lead." }, 400);
        try {
          const contact = await getContact(body.id);
          if (!contact.tags?.includes(LEAD_TAG)) return noStore({ error: "Lead not found." }, 404);
          const fields = { ...(contact.customFields ?? {}) };
          if (body.stage) {
            if (!(STAGES as readonly string[]).includes(body.stage)) return noStore({ error: "Unknown stage." }, 400);
            fields["clinic_stage"] = body.stage;
            fields["stage_changed_at"] = new Date().toISOString();
          } else if (body.action === "call") {
            const agentId = agentLabsAgentId();
            if (!agentId) return noStore({ error: "No voice agent is set up yet." }, 409);
            const call = await triggerCall({ agentId, toNumber: contact.phone, metadata: { lead: contact.id, source: LEAD_TAG, requested_by: "dashboard" } });
            Object.assign(fields, { call_id: call.callId, call_requested_at: new Date().toISOString(), call_scheduled_for: "", call_error: "" });
          } else {
            return noStore({ error: "Nothing to do." }, 400);
          }
          await updateContact(contact.id, { customFields: fields });
          return noStore({ ok: true });
        } catch (error) {
          console.error("Dashboard lead action failed", error);
          return noStore({ error: "AgentLabs rejected the change. Try again." }, 502);
        }
      },
    },
  },
});
