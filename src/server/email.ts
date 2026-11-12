/** Gmail API transactional email. Server-only; sends only after the lead opts in. */
function config() {
  return {
    clientId: (process.env["GMAIL_OAUTH_CLIENT_ID"] ?? "").trim(),
    clientSecret: (process.env["GMAIL_OAUTH_CLIENT_SECRET"] ?? "").trim(),
    refreshToken: (process.env["GMAIL_OAUTH_REFRESH_TOKEN"] ?? "").trim(),
    from: (process.env["GMAIL_FROM_EMAIL"] ?? "sanjayrithikhosp2017@gmail.com").trim(),
  };
}

export const emailConfigured = () => {
  const { clientId, clientSecret, refreshToken, from } = config();
  return Boolean(clientId && clientSecret && refreshToken && from);
};

function base64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function accessToken() {
  const { clientId, clientSecret, refreshToken } = config();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(12000),
  });
  const result = (await response.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!response.ok || !result.access_token) throw new Error(`Gmail OAuth failed: ${result.error_description ?? response.status}`);
  return result.access_token;
}

export async function sendLeadConfirmation(to: string, firstName: string) {
  const { from } = config();
  if (!emailConfigured()) throw new Error("Gmail email delivery is not configured");
  const safeName = firstName.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  const boundary = `srh_${crypto.randomUUID().replace(/-/g, "")}`;
  const subject = "We received your consultation enquiry | Sanjay Rithik Hospital";
  const text = `Hello ${firstName},\n\nWe received your consultation enquiry. The clinic team will contact you to discuss your request and arrange a free consultation with Dr. S. Kiruthika. Your appointment is not confirmed until the clinic calls you.\n\nSanjay Rithik Hospital\n77A, Sengunthapuram Main Road, Karur\nPhone / WhatsApp: +91 93634 71464\n\nIf you did not make this enquiry, you can ignore this email.`;
  const html = `<p>Hello ${safeName},</p><p>We received your consultation enquiry. The clinic team will contact you to discuss your request and arrange a free consultation with Dr. S. Kiruthika. Your appointment is not confirmed until the clinic calls you.</p><p><strong>Sanjay Rithik Hospital</strong><br>77A, Sengunthapuram Main Road, Karur<br>Phone / WhatsApp: +91 93634 71464</p><p>If you did not make this enquiry, you can ignore this email.</p>`;
  const raw = [
    `From: Sanjay Rithik Hospital <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    `--${boundary}--`,
  ].join("\r\n");

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64Url(raw) }),
    signal: AbortSignal.timeout(12000),
  });
  const result = (await response.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(`Gmail send failed: ${result.error?.message ?? response.status}`);
  return { id: result.id };
}
