import { useT } from "@/comparison/lang";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check } from "lucide-react";
import { WhatsAppIcon as MessageCircle } from "../../../SiteChrome";
import { Button } from "@/comparison/a/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAttribution, track } from "@/comparison/a/lib/analytics";
import { deliverLead } from "@/comparison/a/lib/lead-delivery";
import { getSkinCheck, skinCheckPayload } from "@/comparison/skinCheckStore";
import type { AgeJourneySelection } from "./AgeJourney";

export function LeadForm({
  ageJourney,
  faceAreas = [],
  source = "a-consultation",
  onSuccess,
}: {
  ageJourney?: AgeJourneySelection | undefined;
  faceAreas?: string[] | undefined;
  source?: string;
  onSuccess?: (() => void) | undefined;
}) {
  const t = useT();
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const sending = useRef(false);
  const started = useRef(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    // Returning from the no-script fallback post: show the confirmation and tidy the URL.
    if (source !== "hero") return;
    const params = new URLSearchParams(window.location.search);
    const result = params.get("enquiry");
    if (result !== "received" && result !== "failed") return;
    if (result === "received") setSubmitted(true);
    else
      setErrors({
        form: "We couldn’t confirm delivery. Your appointment is not booked. Please retry or WhatsApp the clinic.",
      });
    params.delete("enquiry");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}#a-hero-form`);
  }, [source]);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const phone = String(data.get("phone") ?? "").trim();
    const digits = phone.replace(/[\s()+-]/g, "");
    const next: Record<string, string> = {};
    if (name.length < 2 || name.length > 100)
      next["name"] = t("Please enter your name (at least 2 characters).", "உங்கள் பெயரை உள்ளிடவும் (குறைந்தது 2 எழுத்துகள்).");
    if (!/^(?:91)?[6-9]\d{9}$/.test(digits))
      next["phone"] = t("Enter a valid 10-digit Indian mobile number, with or without +91.", "சரியான 10 இலக்க மொபைல் எண்ணை உள்ளிடவும் (+91 உடன் அல்லது இல்லாமல்).");
    if (data.get("consent") !== "on")
      next["consent"] = t("Please agree to be contacted about this enquiry.", "இந்த விசாரணை குறித்து தொடர்புகொள்ள ஒப்புக்கொள்ளவும்.");
    setErrors(next);
    if (Object.keys(next).length) {
      track("booking_form_validation_failed", { source });
      formRef.current
        ?.querySelector<HTMLInputElement>('[name="' + Object.keys(next)[0] + '"]')
        ?.focus();
      return;
    }
    sending.current = true;
    setSubmitting(true);
    try {
      await deliverLead({
        lead_type: source === "age_preview" ? "age_transform_interest" : "consultation_booking",
        name,
        phone,
        primary_concern:
          String(data.get("concern") ?? "").trim() || getSkinCheck()?.answers["concern"] || "",
        face_areas: faceAreas,
        age_journey_selection: ageJourney ?? null,
        source,
        consent_status: true,
        consent_whatsapp: true,
        ...skinCheckPayload(),
        photo_processing_consent: false,
        landing_page_identifier: "anti-ageing-35-55-karur",
        timestamp: new Date().toISOString(),
        ...getAttribution(),
      });
      setSubmitted(true);
      track("booking_form_completed", { source });
      track("anti_ageing_form_submitted", { source });
      onSuccess?.();
    } catch {
      setErrors({
        form: t("We couldn’t confirm delivery. Your appointment is not booked. Please retry, call or WhatsApp the clinic.", "உங்கள் விசாரணை சென்றடைந்ததா என உறுதிசெய்ய முடியவில்லை. மீண்டும் முயற்சிக்கவும் அல்லது கிளினிக்கை அழைக்கவும் / வாட்ஸ்அப் செய்யவும்."),
      });
      track("booking_form_failed", { source });
    } finally {
      sending.current = false;
      setSubmitting(false);
    }
  }

  if (submitted)
    return (
      <div
        className="rounded-3xl border border-border bg-card p-7 text-foreground sm:p-9"
        role="status"
      >
        <Check className="size-9 text-foreground" />
        <h3 className="mt-5 text-3xl">{t("Your enquiry has reached the clinic.", "உங்கள் விசாரணை கிளினிக்கை வந்தடைந்தது.")}</h3>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          {t("The clinic will call you to arrange your free consultation with Dr. S. Kiruthika (open daily 10 am–2:30 pm and 6–9:30 pm). Your appointment is confirmed on that call.", "டாக்டர் எஸ். கிருத்திகாவுடன் உங்கள் இலவச ஆலோசனையை ஏற்பாடு செய்ய கிளினிக் உங்களை அழைக்கும் (தினமும் காலை 10 – மதியம் 2:30, மாலை 6 – இரவு 9:30). அந்த அழைப்பில் உங்கள் சந்திப்பு உறுதி செய்யப்படும்.")}
        </p>
        <a
          className="mt-6 inline-flex items-center gap-2 underline"
          href="https://wa.me/918903009723"
          target="_blank"
          rel="noreferrer"
          onClick={() => track("whatsapp_clicked", { source: "confirmation" })}
        >
          <MessageCircle className="size-4" /> {t("Questions while you wait? WhatsApp us", "காத்திருக்கும் போது கேள்விகளா? வாட்ஸ்அப் செய்யுங்கள்")}
        </a>
      </div>
    );

  return (
    <form
      ref={formRef}
      // Fallback before the page's script loads: post to the API (never a GET with the
      // visitor's details in the address bar). The API redirects back with ?enquiry=received.
      method="post"
      action="/api/lead-capture"
      onSubmit={submit}
      noValidate
      aria-busy={submitting}
      onInput={() => {
        if (!started.current) {
          started.current = true;
          track("booking_form_started", { source });
          track("anti_ageing_form_started", { source });
        }
      }}
      className="rounded-3xl border border-border bg-card p-6 text-foreground shadow-lift sm:p-8"
    >
      <p className="eyebrow text-muted-foreground">{t("Takes 30 seconds · No payment online", "30 வினாடிகள் போதும் · ஆன்லைனில் பணம் இல்லை")}</p>
      <h3 className="mt-3 text-3xl">{t("Book your free consultation", "உங்கள் இலவச ஆலோசனையை பதிவு செய்யுங்கள்")}</h3>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {t("Just your name and mobile number. The clinic calls you back during clinic hours (10 am–2:30 pm, 6–9:30 pm) to fix a time that suits you.", "உங்கள் பெயரும் மொபைல் எண்ணும் போதும். கிளினிக் நேரத்தில் (காலை 10 – மதியம் 2:30, மாலை 6 – இரவு 9:30) உங்களை அழைத்து வசதியான நேரத்தை உறுதி செய்வோம்.")}
      </p>
      <div className="mt-6 grid gap-4">
        {(
          [
            ["name", t("Your name", "உங்கள் பெயர்"), "text", "name", t("Your full name", "உங்கள் முழுப் பெயர்")],
            ["phone", t("Mobile / WhatsApp number", "மொபைல் / வாட்ஸ்அப் எண்"), "tel", "tel", t("10-digit mobile number", "10 இலக்க மொபைல் எண்")],
          ] as const
        ).map(([field, label, type, autoComplete, placeholder]) => (
          <div key={field}>
            <label htmlFor={id + "-" + field} className="text-sm font-medium">
              {label} <span className="text-muted-foreground">{t("(required)", "(கட்டாயம்)")}</span>
            </label>
            <Input
              id={id + "-" + field}
              name={field}
              type={type}
              autoComplete={autoComplete}
              placeholder={placeholder}
              required
              maxLength={field === "phone" ? 20 : 100}
              aria-invalid={Boolean(errors[field])}
              aria-describedby={errors[field] ? id + "-" + field + "-error" : undefined}
              className="mt-2 h-12 rounded-xl bg-background"
            />
            {errors[field] && (
              <p id={id + "-" + field + "-error"} className="mt-2 text-xs text-destructive">
                {errors[field]}
              </p>
            )}
          </div>
        ))}
        <details className="rounded-xl border border-border px-4 py-3">
          <summary className="cursor-pointer text-sm">
            {t("Add a skin concern", "சரும பிரச்சனையைச் சேர்க்க")} <span className="text-muted-foreground">{t("(optional)", "(விருப்பம்)")}</span>
          </summary>
          <label htmlFor={id + "-concern"} className="mt-3 block text-xs text-muted-foreground">
            {t("What would you like to discuss?", "எதைப் பற்றி பேச விரும்புகிறீர்கள்?")}
          </label>
          <Input
            id={id + "-concern"}
            name="concern"
            maxLength={300}
            placeholder={t("e.g. I look tired in photos, lines around my eyes", "எ.கா. புகைப்படங்களில் சோர்வாகத் தெரிகிறேன், கண்களைச் சுற்றி சுருக்கங்கள்")}
            className="mt-2 h-12 rounded-xl"
          />
        </details>
        {faceAreas.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Selected facial areas: {faceAreas.join(", ")}
          </p>
        )}
        <label className="flex items-start gap-3 text-xs leading-relaxed text-muted-foreground">
          <input
            name="consent"
            type="checkbox"
            required
            aria-invalid={Boolean(errors["consent"])}
            aria-describedby={errors["consent"] ? id + "-consent-error" : undefined}
            className="mt-0.5 size-4 shrink-0 accent-[var(--ink)]"
          />
          <span>
            {t("I agree to Sanjay Rithik Hospital contacting me about this enquiry by phone or WhatsApp.", "இந்த விசாரணை குறித்து சஞ்சய் ரித்திக் மருத்துவமனை என்னை தொலைபேசி அல்லது வாட்ஸ்அப் மூலம் தொடர்புகொள்ள ஒப்புக்கொள்கிறேன்.")}
          </span>
        </label>
        {errors["consent"] && (
          <p id={id + "-consent-error"} className="text-xs text-destructive">
            {errors["consent"]}
          </p>
        )}
      </div>
      {errors["form"] && (
        <p role="alert" className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          {errors["form"]}
        </p>
      )}
      <Button
        type="submit"
        variant="ink"
        size="xl"
        disabled={submitting}
        className="mt-5 h-auto min-h-14 w-full whitespace-normal px-3 py-3 text-sm"
      >
        {submitting
          ? t("Sending your enquiry…", "அனுப்புகிறோம்…")
          : source === "age_preview"
            ? t("Send enquiry & continue", "விசாரணையை அனுப்பி தொடரவும்")
            : t("Book My Free Consultation", "இலவச ஆலோசனையை பதிவு செய்யுங்கள்")}
        <ArrowRight />
      </Button>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        {t("Consultation is free. Any treatment cost is explained before you decide. Nothing to pay online.", "ஆலோசனை இலவசம். எந்த சிகிச்சைக்கும் செலவு முடிவெடுக்கும் முன்பே சொல்லப்படும். ஆன்லைனில் பணம் இல்லை.")}
      </p>
      <a
        href="https://wa.me/918903009723?text=Hello%2C%20I%20would%20like%20to%20ask%20about%20a%20skin%20consultation."
        target="_blank"
        rel="noreferrer"
        onClick={() => track("anti_ageing_whatsapp_clicked", { source })}
        className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#25D366] text-sm font-semibold text-white hover:bg-[#1ebe5a]"
      >
        <MessageCircle className="size-4" /> {t("Prefer to chat? Ask on WhatsApp", "சாட் செய்ய விருப்பமா? வாட்ஸ்அப்பில் கேளுங்கள்")}
      </a>
    </form>
  );
}
