import { useEffect, useSyncExternalStore } from "react";

/**
 * English / Tamil switch for the Karur audience. The server always renders English;
 * after load the page switches to Tamil when the link has ?lang=ta (for Tamil ads)
 * or the visitor chose Tamil before. The choice is kept in localStorage.
 */
export type Lang = "en" | "ta";

const STORAGE_KEY = "srh-lang";
let current: Lang = "en";
const listeners = new Set<() => void>();

function apply(next: Lang) {
  current = next;
  document.documentElement.lang = next;
  listeners.forEach((listener) => listener());
}

export function setLang(next: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private mode / blocked storage: the switch still works for this visit.
  }
  apply(next);
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => "en",
  );
}

/** t("English", "தமிழ்") picks the visitor's language. */
export function useT() {
  const lang = useLang();
  return <T,>(en: T, ta: T): T => (lang === "ta" ? ta : en);
}

/** Reads ?lang= or the saved choice once, after hydration. */
export function useInitLang() {
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("lang");
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      saved = null;
    }
    const next = fromUrl === "ta" || fromUrl === "en" ? fromUrl : saved === "ta" ? "ta" : "en";
    if (next !== current) apply(next);
  }, []);
}

export function LangToggle({ className = "" }: { className?: string }) {
  const lang = useLang();
  return (
    <div className={`lang-toggle ${className}`} role="group" aria-label="Language / மொழி">
      {(
        [
          ["en", "EN"],
          ["ta", "தமிழ்"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          lang={value}
          aria-pressed={lang === value}
          onClick={() => setLang(value)}
          className={lang === value ? "is-active" : ""}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
