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
  hint: string;
  icon: LucideIcon;
  result: [string, string];
  profile: ResultProfile;
};

const LINES_RESULT: [string, string] = [
  "Your starting point: natural-looking line-softening",
  "A dermatologist can assess whether your concern relates mainly to expression lines, skin quality, hydration, or other changes, then explain suitable options such as Botox, skin boosters, or another approach.",
];

const CONCERNS: Concern[] = [
  {
    value: "Fine lines around the eyes",
    hint: "Crow's feet, under-eye creases",
    icon: Feather,
    result: LINES_RESULT,
    profile: { name: "Line-Softening Profile", dims: { "Fine Lines": 78, Firmness: 40, Texture: 40, Pigmentation: 25 } },
  },
  {
    value: "Forehead or mouth lines",
    hint: "Expression lines that show in photos",
    icon: Feather,
    result: LINES_RESULT,
    profile: { name: "Line-Softening Profile", dims: { "Fine Lines": 75, Firmness: 45, Texture: 40, Pigmentation: 25 } },
  },
  {
    value: "Loss of firmness",
    hint: "Skin looks looser or less lifted",
    icon: Waves,
    result: [
      "Your starting point: a firmness assessment",
      "Your consultation can help determine whether options such as HIFU, MNRF, skin boosters, or another treatment may suit your skin and expectations.",
    ],
    profile: { name: "Firmness Focus Profile", dims: { "Fine Lines": 50, Firmness: 80, Texture: 38, Pigmentation: 24 } },
  },
  {
    value: "Dull or tired-looking skin",
    hint: "Looking tired even after sleeping",
    icon: Sun,
    result: [
      "Your starting point: improving skin quality",
      "Dullness can be linked to hydration, pigmentation, texture, or sun exposure. The first step is understanding the cause before choosing a treatment.",
    ],
    profile: { name: "Freshness & Renewal Profile", dims: { "Fine Lines": 30, Firmness: 35, Texture: 55, Pigmentation: 42 } },
  },
  {
    value: "Pigmentation or uneven tone",
    hint: "Dark patches, uneven colour",
    icon: CircleDot,
    result: [
      "Your starting point: understanding your pigmentation",
      "Different kinds of pigmentation need different approaches. A dermatologist can identify what you are seeing before you spend more on creams or procedures.",
    ],
    profile: { name: "Tone & Clarity Profile", dims: { "Fine Lines": 25, Firmness: 30, Texture: 45, Pigmentation: 82 } },
  },
  {
    value: "Loss of facial volume",
    hint: "Cheeks or temples look hollower",
    icon: Droplets,
    result: [
      "Your starting point: facial balance consultation",
      "A dermatologist can assess whether volume loss is affecting your appearance and explain conservative options. Fillers are not automatically required.",
    ],
    profile: { name: "Facial Balance Profile", dims: { "Fine Lines": 48, Firmness: 75, Texture: 35, Pigmentation: 22 } },
  },
  {
    value: "I am not sure",
    hint: "Something has changed, I can't name it",
    icon: HelpCircle,
    result: [
      "Your starting point: a conversation about what is changing",
      "You do not need to know the treatment name. Describe what you have noticed, and the dermatologist will explain possible causes and suitable options.",
    ],
    profile: { name: "Discovery Profile", dims: { "Fine Lines": 42, Firmness: 42, Texture: 42, Pigmentation: 42 } },
  },
];

const PRIORITIES = [
  "I want to look more rested",
  "I want natural-looking results",
  "I want to improve firmness",
  "I want to reduce fine lines",
  "I want to understand my options first",
  "I am worried about pain or downtime",
];

const WORRIES = [
  "Looking unnatural",
  "Pain or discomfort",
  "Downtime",
  "Cost",
  "Choosing the wrong treatment",
  "I do not know enough yet",
];

const NATURAL_RESULT: [string, string] = [
  "Your starting point: a natural-results consultation",
  "You do not need to choose Botox, fillers, or any procedure today. The consultation helps you understand what may suit you, what should be avoided, and what would still look like you.",
];

const COMFORT_RESULT: [string, string] = [
  "Your starting point: comfort and recovery planning",
  "Ask the dermatologist about treatment comfort, expected recovery, downtime, and whether a lower-intervention option may be appropriate for your concern.",
];

/** The visitor's biggest fear decides the result first; otherwise their concern does. */
function resultFor(answers: Answers): [string, string] {
  if (answers["worry"] === "Looking unnatural") return NATURAL_RESULT;
  if (
    /pain|downtime/i.test(answers["worry"] ?? "") ||
    answers["priority"] === "I am worried about pain or downtime"
  )
    return COMFORT_RESULT;
  return concernFor(answers["concern"]).result;
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
    track("assessment_completed", { concern: withAreas["concern"] });
    track("anti_ageing_result_viewed", { concern: withAreas["concern"], worry: withAreas["worry"] });
    setStage("result");
  }

  function pick(value: string) {
    moved.current = true;
    const id = STEPS[step]!;
    if (step === 0) {
      track("assessment_started");
      track("anti_ageing_quiz_started");
      track("anti_ageing_concern_selected", { concern: value });
    }
    if (id === "worry") track("anti_ageing_objection_selected", { worry: value });
    track("assessment_question_answered", { question: id, answer: value, question_number: step + 1 });
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
    track("skin_profile_lead_captured", { concern: answers["concern"], profile: concern.profile.name });
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
            <p className="skin-game-kicker">Based on your answers</p>
            <p className="skin-game-result-title">{result[0]}</p>
            <p className="skin-game-result-copy">{result[1]}</p>
            <ul className="skin-game-tags" aria-label="Your answers">
              <li>{concern.value}</li>
              {answers["priority"] && <li>{answers["priority"]}</li>}
              {answers["worry"] && <li>Concern: {answers["worry"]}</li>}
            </ul>
            <p className="skin-game-note">
              A consultation doesn't commit you to treatment. You'll hear suitable options,
              sessions, downtime and cost before you decide.
            </p>
          </div>

          <form className="skin-game-form" onSubmit={submit} noValidate>
            <p className="skin-game-offer">
              <Sparkles aria-hidden="true" /> Free anti-ageing consultation · Karur
            </p>
            <p className="skin-game-form-title">A conversation, not a commitment</p>
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
              {sending ? "Booking…" : "Book My Free Anti-Ageing Consultation"} {!sending && <ArrowRight />}
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
            What is changing first?
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
            {id === "priority" ? "What matters most to you?" : "What concerns you most about treatment?"}
          </h3>
          <p className="skin-game-sub">
            {id === "priority"
              ? "There is no right answer. This helps Dr. Kiruthika understand your priorities."
              : "Many people share these worries. Knowing yours helps the dermatologist address it first."}
          </p>
          <div className="skin-game-answers skin-game-answers-two">
            {(id === "priority" ? PRIORITIES : WORRIES).map((option) => (
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
          <span className="skin-game-fine">About 30 seconds · private · not a diagnosis</span>
        )}
      </div>
    </div>
  );
}
