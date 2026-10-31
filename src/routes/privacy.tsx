import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

/** Privacy policy and data-deletion instructions (also the URLs given to Meta for the WhatsApp app). */
export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy | Sanjay Rithik Hospital" }] }),
  component: PrivacyPage,
});

const UPDATED = "31 October 2026";
const PHONE = "+91 93634 71464";

function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-8 scroll-mt-6">
      <h2 className="font-display text-xl">{title}</h2>
      <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-foreground/85">{children}</div>
    </section>
  );
}

function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <a href="/" className="text-sm underline">← Back</a>
      <h1 className="mt-4 font-display text-3xl">Privacy Policy</h1>
      <p className="mt-1 text-sm text-muted-foreground">Sanjay Rithik Hospital, Karur, Tamil Nadu · Last updated {UPDATED}</p>

      <Section title="What we collect">
        <p>When you send an enquiry on this website we collect your name, phone number, optional email, the skin concern and preferred time you choose, your answers to the skin check, and the page or advert that brought you here.</p>
        <p>If we call you or message you on WhatsApp, we keep the call recording, a transcript and summary, and the WhatsApp messages exchanged with the hospital.</p>
      </Section>

      <Section title="How we use it">
        <p>Only to respond to your enquiry: to call you back (including with our AI phone assistant), to send consultation details and reminders on WhatsApp, to book and manage your appointment, and to understand which of our adverts are useful.</p>
        <p>We do not sell your information and do not use it for anything unrelated to your care enquiry.</p>
      </Section>

      <Section title="WhatsApp and calls">
        <p>We message you on WhatsApp only when you tick the consent box on our form or message us first. Reply STOP at any time and we will not message you again.</p>
        <p>WhatsApp messages are delivered through Meta's WhatsApp Business Platform. Calls may be placed by an automated assistant that tells you it is calling from Sanjay Rithik Hospital.</p>
      </Section>

      <Section title="Who can see it">
        <p>Hospital staff who handle appointments, and the service providers that run our website, phone and WhatsApp systems on our behalf, under confidentiality. We share information with others only when the law requires it.</p>
      </Section>

      <Section title="How long we keep it">
        <p>Enquiries that do not become appointments are deleted within 12 months. Medical records of patients who visit are kept as required by Indian medical-record rules.</p>
      </Section>

      <Section id="data-deletion" title="Delete your data">
        <p>To have your enquiry, call recordings and WhatsApp history deleted, send "DELETE MY DATA" with your name on WhatsApp or call {PHONE}. We will confirm and delete it within 30 days, except records the law requires us to keep.</p>
      </Section>

      <Section title="Contact">
        <p>Sanjay Rithik Hospital, Karur, Tamil Nadu · {PHONE} · <a className="underline" href="https://sanjayrithikhospital.com">sanjayrithikhospital.com</a></p>
      </Section>
    </main>
  );
}
