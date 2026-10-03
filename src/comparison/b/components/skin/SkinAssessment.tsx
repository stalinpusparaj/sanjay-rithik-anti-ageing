import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Waves,
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDot,
  Droplets,
  Feather,
  HelpCircle,
  Lock,
  Sparkles,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { setSkinCheck } from "@/comparison/skinCheckStore";
import { getAttribution, track } from "@/comparison/b/lib/analytics";
import { cn } from "@/comparison/b/lib/utils";

export type Answers = Record<string, string>;

export type ResultProfile = { name: string; dims: Record<string, number> };

/**
 * The skin check is a short game: two taps (plus an optional "when"), then a useful
 * result with the booking form right beside it. Fewer questions and no gate before the
 * result means more visitors reach the form; answers still flow to the CRM and score.
 */
type Concern = {
  value: string;
  /** Short phrase used in the result: "Your questions: <short> and <worry>." */
  short: string;
  hint: string;
  icon: LucideIcon;
  profile: ResultProfile;
};

const CONCERNS: Concern[] = [
  {
    value: "Lines around my eyes.",
    short: "lines around the eyes",
    hint: "Fine lines when you smile or squint",
    icon: Feather,
    profile: { name: "Lines Around the Eyes", dims: { "Fine Lines": 78, Firmness: 40, Texture: 40, Pigmentation: 25 } },
  },
  {
    value: "Lines on my forehead or around my mouth.",
    short: "lines on the forehead or around the mouth",
    hint: "Lines that show in photos",
    icon: Feather,
    profile: { name: "Forehead and Mouth Lines", dims: { "Fine Lines": 75, Firmness: 45, Texture: 40, Pigmentation: 25 } },
  },
  {
    value: "My skin feels less firm.",
    short: "skin that feels less firm",
    hint: "Skin looks or feels looser",
    icon: Waves,
    profile: { name: "Skin Feels Less Firm", dims: { "Fine Lines": 50, Firmness: 80, Texture: 38, Pigmentation: 24 } },
  },
  {
    value: "My skin looks dull or tired.",
    short: "dull or tired-looking skin",
    hint: "Looking tired even after sleeping",
    icon: Sun,
    profile: { name: "Dull or Tired Skin", dims: { "Fine Lines": 30, Firmness: 35, Texture: 55, Pigmentation: 42 } },
  },
  {
    value: "Dark patches or uneven skin colour.",
    short: "dark patches or uneven skin colour",
    hint: "Patches or uneven colour",
    icon: CircleDot,
    profile: { name: "Dark Patches", dims: { "Fine Lines": 25, Firmness: 30, Texture: 45, Pigmentation: 82 } },
  },
  {
    value: "My cheeks look less full.",
    short: "cheeks that look less full",
    hint: "Face looks thinner than before",
    icon: Droplets,
    profile: { name: "Cheeks Look Less Full", dims: { "Fine Lines": 48, Firmness: 75, Texture: 35, Pigmentation: 22 } },
  },
  {
    value: "I am not sure.",
    short: "changes you have noticed",
    hint: "Something has changed",
    icon: HelpCircle,
    profile: { name: "Not Sure Yet", dims: { "Fine Lines": 42, Firmness: 42, Texture: 42, Pigmentation: 42 } },
  },
];

const PRIORITIES = [
  "Looking more rested.",
  "Understanding changes in my skin.",
  "Asking about lines or firmness.",
  "Planning before an important event.",
  "Understanding whether I need treatment.",
];

const WORRIES: Array<[string, string]> = [
  ["Looking different from myself.", "looking different from yourself"],
  ["Pain or side effects.", "pain or side effects"],
  ["Time to recover.", "time to recover"],
  ["Treatment cost.", "treatment cost"],
  ["Being pushed to buy treatment.", "being pushed to buy treatment"],
  ["I need more information.", "getting more information"],
];

/**
 * Reflect the visitor's own concern and worry back to them. It never diagnoses or picks a
 * procedure; it only suggests what to ask the doctor.
 */
function resultFor(answers: Answers): [string, string] {
  const concern = concernFor(answers["concern"]).short;
  const worry = WORRIES.find(([value]) => value === answers["worry"])?.[1];
  if (worry === "being pushed to buy treatment") {
    return [
      `Your questions: ${concern} and ${worry}.`,
      "You can talk to Dr. Kiruthika without agreeing to any treatment. Ask what may help, what the limits are, and take time to decide.",
    ];
  }
  if (worry) {
    return [
      `Your questions: ${concern} and ${worry}.`,
      "You can discuss both with Dr. Kiruthika. Ask what options may help, what their limits are, and how they might fit around your routine.",
    ];
  }
  return [
    `Your question: ${concern}.`,
    "You can discuss this with Dr. Kiruthika. Ask what options may help, what their limits are, and whether you need treatment at all.",
  ];
}

const STEPS = ["concern", "priority", "worry"] as const;

type Stage = "quiz" | "result" | "done";

function concernFor(value?: string) {
  return CONCERNS.find((item) => item.value === value) ?? CONCERNS[CONCERNS.length - 1]!;
}

const WHATSAPP =
  "https://wa.me/918903009723?text=" +
  encodeURIComponent("Hello, I completed the anti-ageing skin check and would like to ask what may suit my skin.");

export function SkinAssessment({
  initialAreas = [],
  onComplete,
  onProfile,
}: {
  initialAreas?: string[];
  onComplete: (answers: Answers) => void;
  onProfile?: (profile: ResultProfile) => void;
}) {
  const [step, setStep] = useState(0);
  const [stage, setStage] = useState<Stage>("quiz");
  const [answers, setAnswers] = useState<Answers>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
  }, [step, stage]);

  function finish(next: Answers) {
    const withAreas = initialAreas.length ? { ...next, area: initialAreas.join(", ") } : next;
    const profile = concernFor(withAreas["concern"]).profile;
    setAnswers(withAreas);
    onComplete(withAreas);
    onProfile?.(profile);
    setSkinCheck({ answers: withAreas, profile });
    // Skin answers stay out of analytics; only progress through the quiz is tracked.
    track("assessment_completed");
    track("anti_ageing_result_viewed");
    setStage("result");
  }

  function pick(value: string) {
    moved.current = true;
    const id = STEPS[step]!;
    if (step === 0) {
      track("assessment_started");
      track("anti_ageing_quiz_started");
      track("anti_ageing_concern_selected");
    }
    if (id === "worry") track("anti_ageing_objection_selected");
    track("assessment_question_answered", { question: id, question_number: step + 1 });
    const next = { ...answers, [id]: value };
    setAnswers(next);
    if (step === STEPS.length - 1) finish(next);
    else setStep(step + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length < 2 || phone.replace(/\D/g, "").length < 10) {
      setError("Please add your name and 10-digit mobile number.");
      return;
    }
    setError("");
    setSending(true);
    const concern = concernFor(answers["concern"]);
    const endpoint =
      (import.meta.env["VITE_LEAD_ENDPOINT"] as string | undefined)?.trim() || "/api/lead-capture";
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          lead_type: "skin_profile_result",
          source: "skin_check",
          name: name.trim(),
          phone: phone.trim(),
          primary_concern: answers["concern"] ?? "",
          result_profile: concern.profile.name,
          result_dimensions: concern.profile.dims,
          assessment_responses: answers,
          consent_status: true,
          consent_whatsapp: true,
          landing_page_identifier: "anti-ageing-35-55-karur",
          timestamp: new Date().toISOString(),
          ...getAttribution(),
        }),
        signal: AbortSignal.timeout(15000),
      });
      const receipt = response.ok ? await response.json() : null;
      if (receipt?.ok !== true) throw new Error("Lead not confirmed");
    } catch {
      setError("We couldn't save your details. Please try again, or message us on WhatsApp.");
      setSending(false);
      return;
    }
    track("skin_profile_lead_captured");
    track("anti_ageing_form_submitted", { source: "skin_check" });
    setSending(false);
    setStage("done");
  }

  function restart() {
    moved.current = true;
    setAnswers({});
    setStep(0);
    setStage("quiz");
    setError("");
  }

  const dots = (
    <div className="skin-game-progress" aria-hidden="true">
      {[0, 1, 2, 3].map((index) => (
        <i key={index} className={cn((stage !== "quiz" || index <= step) && "on")} />
      ))}
    </div>
  );

  if (stage === "done") {
    return (
      <div className="skin-game skin-game-done" aria-live="polite">
        <span className="skin-game-done-check" aria-hidden="true">
          <Check />
        </span>
        <h3 ref={headingRef} tabIndex={-1} className="skin-game-heading">
          You've taken the right first step.
        </h3>
        <p className="skin-game-sub">
          The clinic will call or WhatsApp you to arrange your free consultation with Dr. S.
          Kiruthika. Want to pick a time now?
        </p>
        <a
          className="skin-game-btn"
          href={WHATSAPP}
          target="_blank"
          rel="noreferrer"
          onClick={() => track("anti_ageing_whatsapp_clicked", { source: "skin_check_done" })}
        >
          Ask a Question on WhatsApp <ArrowRight />
        </a>
        <p className="skin-game-fine">
          77A, Sengunthapuram Main Road, Karur · Open daily 10 am–2:30 pm and 6–9:30 pm
        </p>
      </div>
    );
  }

  if (stage === "result") {
    const concern = concernFor(answers["concern"]);
    const Icon = concern.icon;
    const result = resultFor(answers);
    return (
      <div className="skin-game" aria-live="polite">
        {dots}
        <p className="skin-game-step">Your result</p>
        <h3 ref={headingRef} tabIndex={-1} className="skin-game-heading">
          Your calm next step
        </h3>
        <div className="skin-game-result">
          <div className="skin-game-result-card">
            <span className="skin-game-result-icon" aria-hidden="true">
              <Icon />
            </span>
            <p className="skin-game-kicker">What you could ask the doctor</p>
            <p className="skin-game-result-title">{result[0]}</p>
            <p className="skin-game-result-copy">{result[1]}</p>
            <ul className="skin-game-tags" aria-label="Your answers">
              <li>{concern.value}</li>
              {answers["priority"] && <li>{answers["priority"]}</li>}
              {answers["worry"] && <li>Worry: {answers["worry"]}</li>}
            </ul>
            <p className="skin-game-note">
              A consultation doesn't commit you to treatment. You'll hear suitable options,
              sessions, downtime and cost before you decide.
            </p>
          </div>

          <form className="skin-game-form" onSubmit={submit} noValidate>
            <p className="skin-game-offer">
              <Sparkles aria-hidden="true" /> Free consultation · Karur
            </p>
            <p className="skin-game-form-title">Want to ask Dr. Kiruthika?</p>
            <p className="skin-game-form-sub">
              Leave your name and WhatsApp number. The clinic will arrange a time that suits you.
            </p>
            <label className="skin-game-field">
              <span>Your name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </label>
            <label className="skin-game-field">
              <span>Mobile / WhatsApp number</span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="10-digit number"
                inputMode="tel"
                autoComplete="tel"
              />
            </label>
            {error && <p className="skin-game-error">{error}</p>}
            <button type="submit" className="skin-game-btn skin-game-btn-full" disabled={sending}>
              {sending ? "Sending…" : "Ask the Doctor About My Concern"} {!sending && <ArrowRight />}
            </button>
            <p className="skin-game-fine">
              <Lock aria-hidden="true" /> No payment online. By booking you agree to be contacted
              about this consultation.
            </p>
          </form>
        </div>
        <button type="button" className="skin-game-back" onClick={restart}>
          <ArrowLeft /> Change answers
        </button>
      </div>
    );
  }

  const id = STEPS[step]!;
  return (
    <div className="skin-game">
      {dots}
      <p className="skin-game-step">
        Step {step + 1} of 3{id === "worry" && " · optional"}
      </p>
      {id === "concern" && (
        <>
          <h3 ref={headingRef} tabIndex={-1} className="skin-game-heading">
            What changes have you noticed?
          </h3>
          <p className="skin-game-sub">
            Choose what you have noticed. This is not a diagnosis. It simply helps you start a more
            useful conversation with the dermatologist.
          </p>
          <div className="skin-game-choices">
            {CONCERNS.map(({ value, hint, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={answers["concern"] === value}
                className={cn("skin-game-choice", answers["concern"] === value && "selected")}
                onClick={() => pick(value)}
              >
                <span className="skin-game-choice-icon" aria-hidden="true">
                  <Icon />
                </span>
                <strong>{value}</strong>
                <span className="skin-game-choice-hint">{hint}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {id !== "concern" && (
        <>
          <h3 ref={headingRef} tabIndex={-1} className="skin-game-heading">
            {id === "priority" ? "What would you like help with?" : "What worries you most?"}
          </h3>
          <p className="skin-game-sub">
            {id === "priority"
              ? "There is no right answer. Pick the one closest to you."
              : "Many people have the same worry. You can ask the doctor about it."}
          </p>
          <div className="skin-game-answers skin-game-answers-two">
            {(id === "priority" ? PRIORITIES : WORRIES.map(([value]) => value)).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={answers[id] === option}
                className={cn("skin-game-answer", answers[id] === option && "selected")}
                onClick={() => pick(option)}
              >
                {option} <ArrowRight aria-hidden="true" />
              </button>
            ))}
          </div>
          {id === "worry" && (
            <button type="button" className="skin-game-skip" onClick={() => finish(answers)}>
              Skip and see my result
            </button>
          )}
        </>
      )}
      <div className="skin-game-actions">
        {step > 0 ? (
          <button
            type="button"
            className="skin-game-back"
            onClick={() => {
              moved.current = true;
              setStep(step - 1);
            }}
          >
            <ArrowLeft /> Back
          </button>
        ) : (
          <span className="skin-game-fine">About 30 seconds · not a diagnosis</span>
        )}
      </div>
    </div>
  );
}
