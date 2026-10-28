/**
 * WhatsWay REST API (v1). Sends the approved WhatsApp welcome template to leads who
 * ticked WhatsApp consent, and reads each lead's conversation for the dashboard.
 * Server-only.
 */

export type WhatsWayMessage = {
  id: string;
  direction?: "inbound" | "outbound" | string;
  fromUser?: boolean;
  content?: string | null;
  status?: string | null;
  type?: string | null;
  timestamp?: string | null;
  createdAt?: string | null;
};

function config() {
  return {
    url: (process.env["WHATSWAY_API_URL"] ?? "").trim().replace(/\/$/, ""),
    key: (process.env["WHATSWAY_API_KEY"] ?? "").trim(),
    secret: (process.env["WHATSWAY_API_SECRET"] ?? "").trim(),
    channelId: (process.env["WHATSWAY_CHANNEL_ID"] ?? "").trim(),
    template: (process.env["WHATSWAY_WELCOME_TEMPLATE"] ?? "").trim(),
    language: (process.env["WHATSWAY_TEMPLATE_LANGUAGE"] ?? "en").trim(),
    // "false" for templates without a {{1}} name variable (e.g. Meta's hello_world).
    nameParam: (process.env["WHATSWAY_TEMPLATE_NAME_PARAM"] ?? "true").trim() !== "false",
  };
}

export const whatsWayConfigured = () => Boolean(config().url && config().key && config().secret);
export const whatsWayTemplate = () => config().template;

async function request<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const { url, key, secret, channelId } = config();
  const response = await fetch(`${url}/api/v1${path}`, {
    ...init,
    headers: {
      "x-api-key": key,
      "x-api-secret": secret,
      ...(channelId ? { "x-channel-id": channelId } : {}),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(12000),
  });
  const body = (await response.json().catch(() => ({}))) as T;
  if (!response.ok && response.status !== 404 && response.status !== 409) {
    throw new Error(`WhatsWay ${path} responded ${response.status}: ${JSON.stringify(body).slice(0, 240)}`);
  }
  return { status: response.status, body };
}

/** Adds the lead to the WhatsApp inbox with their name (409 = already there). */
export async function upsertWhatsAppContact(phone: string, name: string) {
  await request("/contacts", { method: "POST", body: JSON.stringify({ phone, name }) });
}

/** Sends the welcome template; its first body variable is the lead's first name. */
export async function sendWelcomeTemplate(phone: string, firstName: string) {
  const { template, language, nameParam } = config();
  const { body } = await request<{ data?: { messageId?: string; status?: string } }>("/messages/template", {
    method: "POST",
    body: JSON.stringify({
      to: phone,
      templateName: template,
      language,
      components: nameParam ? [{ type: "body", parameters: [{ type: "text", text: firstName }] }] : [],
    }),
  });
  return body.data;
}

export async function conversation(phone: string): Promise<WhatsWayMessage[]> {
  const { status, body } = await request<{ data?: { messages?: WhatsWayMessage[] } }>(
    `/messages/${encodeURIComponent(phone.replace(/\D/g, ""))}?limit=50`,
  );
  return status === 404 ? [] : (body.data?.messages ?? []);
}
