import { useEffect, useState } from "react";
import { useLang } from "@/comparison/lang";

/** Choices shared by the lead forms, so every form offers the same concerns. */
export const CONCERN_OPTIONS = [
  "Fine lines",
  "Wrinkles",
  "Loss of firmness",
  "Dullness",
  "Pigmentation",
  "Dark circles",
  "Texture / pores",
  "Loss of facial volume",
  "Overall ageing",
  "Acne",
  "Scars",
  "Hair loss",
  "Sensitive skin",
  "Something else",
  "I'm not sure",
];

export const TIME_OPTIONS = ["Morning (10 am–2:30 pm)", "Evening (6–9:30 pm)"];

/** Indian mobile, with or without +91, ignoring spaces and dashes. */
export const isIndianMobile = (phone: string) => /^(?:91)?[6-9]\d{9}$/.test(phone.replace(/[\s()+-]/g, ""));

/** The next 14 days. Built after load: the server and the browser may be on different days. */
export function useConsultDays() {
  const lang = useLang();
  const [days, setDays] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    setDays(
      Array.from({ length: 14 }, (_, i) => {
        const day = new Date();
        day.setDate(day.getDate() + i + 1);
        const value = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
        return { value, label: day.toLocaleDateString(lang === "ta" ? "ta-IN" : "en-IN", { weekday: "short", day: "numeric", month: "short" }) };
      }),
    );
  }, [lang]);
  return days;
}
