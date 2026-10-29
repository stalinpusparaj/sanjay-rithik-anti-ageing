/** Lead scoring for the anti-ageing page (moved unchanged from the old Twenty route). */

export type LeadPayload = { lead_type?: string; name?: string; phone?: string; email?: string; primary_concern?: string; [key: string]: unknown };

export function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const HIGH_VALUE_TREATMENTS =
  /laser|hair removal|botox|filler|prp|hydra|hifu|mnrf|booster|tattoo|scar|pigment|peel|anti.?ag|lines|firmness|volume/i;
const PAID_SOURCES = /^(facebook|fb|instagram|ig|meta|google|youtube)$/i;
const PAID_MEDIUMS = /^(cpc|ppc|paid|paid_social|paidsocial|ads|display)$/i;

type LeadTemperature = "HOT" | "WARM" | "COLD";

/**
 * Score an enquiry 0–100 from what the visitor told us, and band it:
 * Hot ≥ 80 · Warm 50–79 · Cold < 50 (AgentLabs CRM thresholds). A plain consultation request starts Warm;
 * detail, buying signals and repeat enquiries push it towards Hot.
 */
export const QUIZ_LABELS: Record<string, string> = {
  concern: "Main concern",
  impact: "How it affects them",
  timing: "Wants to start",
  priority: "What matters most",
  worry: "Main worry about treatment",
  area: "Area noticed most",
  duration: "Noticed since",
  tried: "Already tried",
  goal: "Desired result",
  comfort: "Comfortable with",
};

/** Skin-check answers as a plain string map (empty when the visitor skipped the quiz). */
export function quizAnswers(payload: LeadPayload): Record<string, string> {
  const raw = payload["assessment_responses"];
  if (!raw || typeof raw !== "object") return {};
  const answers: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (text(value)) answers[key] = text(value);
  }
  return answers;
}

export function scoreLead(payload: LeadPayload, submissions: number) {
  const concern = text(payload.primary_concern);
  const answers = payload["assessment_responses"];
  let score = payload.lead_type === "age_transform_interest" ? 25 : 50;
  if (concern && !/not sure/i.test(concern)) score += 10;
  const intentText = [concern, JSON.stringify(answers ?? ""), text(payload["result_profile"])].join(" ");
  if (HIGH_VALUE_TREATMENTS.test(intentText)) score += 10;
  if (text(payload["preferred_time"])) score += 10;
  if (
    (answers && typeof answers === "object" && Object.keys(answers).length > 0) ||
    text(payload["result_profile"])
  )
    score += 10;
  if (
    PAID_SOURCES.test(text(payload["utm_source"])) ||
    PAID_MEDIUMS.test(text(payload["utm_medium"]))
  )
    score += 5;
  if (text(payload.email)) score += 5;
  // Skin-check signals: has already paid for clinic treatment, or is open to whatever
  // the dermatologist recommends — both convert better than "just browsing".
  const quiz = quizAnswers(payload);
  if (/previous clinical/i.test(quiz["tried"] ?? "")) score += 5;
  if (/open to dermatologist/i.test(quiz["comfort"] ?? "")) score += 5;
  // Skin-check game signals: urgency and "products keep failing" are the strongest intent.
  if (/this week/i.test(quiz["timing"] ?? "")) score += 10;
  else if (/month/i.test(quiz["timing"] ?? "")) score += 5;
  if (/keeps coming back|confidence/i.test(quiz["impact"] ?? "")) score += 5;
  if (submissions > 1) score += 20;
  score = Math.min(100, score);
  const temperature: LeadTemperature = score >= 80 ? "HOT" : score >= 50 ? "WARM" : "COLD";
  const band = temperature === "HOT" ? "Hot" : temperature === "WARM" ? "Warm" : "Cold";
  return { score, temperature, band };
}

