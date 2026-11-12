/** Transactional email via Resend. Server-only; sends only after the lead opts in. */
function config() {
  return {
    key: (process.env["RESEND_API_KEY"] ?? "").trim(),
    from: (process.env["RESEND_FROM_EMAIL"] ?? "").trim(),
  };
}

export const emailConfigured = () => Boolean(config().key && config().from);

export async function sendLeadConfirmation(to: string, firstName: string) {
  const { key, from } = config();
  if (!key || !from) throw new Error("Email delivery is not configured");
  const safeName = firstName.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "We received your consultation enquiry | Sanjay Rithik Hospital",
      text: `Hello ${firstName},\n\nWe received your consultation enquiry. The clinic team will contact you to discuss your request and arrange a free consultation with Dr. S. Kiruthika. Your appointment is not confirmed until the clinic calls you.\n\nSanjay Rithik Hospital\n77A, Sengunthapuram Main Road, Karur\nPhone / WhatsApp: +91 93634 71464\n\nIf you did not make this enquiry, you can ignore this email.`,
      html: `<p>Hello ${safeName},</p><p>We received your consultation enquiry. The clinic team will contact you to discuss your request and arrange a free consultation with Dr. S. Kiruthika. Your appointment is not confirmed until the clinic calls you.</p><p><strong>Sanjay Rithik Hospital</strong><br>77A, Sengunthapuram Main Road, Karur<br>Phone / WhatsApp: +91 93634 71464</p><p>If you did not make this enquiry, you can ignore this email.</p>`,
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Email provider responded ${response.status}: ${detail.slice(0, 180)}`);
  }
  return (await response.json()) as { id?: string };
}
