import { useEffect, useSyncExternalStore } from "react";
import { lookupTamil } from "./ta-dictionary";

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

const ATTRS = ["placeholder", "aria-label", "alt", "title"] as const;
const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA"]);
const norm = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * In Tamil mode, swaps displayed English text under `root` for its Tamil translation
 * (text nodes and a few attributes), keeps doing so as React re-renders, and restores
 * the English when the visitor switches back. Values sent to the clinic are untouched.
 */
export function useDomTranslation(rootId: string) {
  const lang = useLang();
  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root || lang !== "ta") return;
    const texts = new Map<Text, string>();
    const attrs = new Map<Element, Map<string, string>>();

    const translateText = (node: Text) => {
      const raw = node.nodeValue ?? "";
      const ta = lookupTamil(norm(raw));
      if (!ta) return;
      texts.set(node, raw);
      const lead = raw.match(/^\s*/)?.[0] ?? "";
      const trail = raw.match(/\s*$/)?.[0] ?? "";
      node.nodeValue = lead + ta + trail;
    };
    const translateAttrs = (el: Element) => {
      for (const name of ATTRS) {
        const value = el.getAttribute(name);
        const ta = value ? lookupTamil(norm(value)) : undefined;
        if (!value || !ta) continue;
        if (!attrs.has(el)) attrs.set(el, new Map());
        attrs.get(el)!.set(name, value);
        el.setAttribute(name, ta);
      }
    };
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) return translateText(node as Text);
      if (node.nodeType !== Node.ELEMENT_NODE || SKIP.has((node as Element).nodeName)) return;
      translateAttrs(node as Element);
      node.childNodes.forEach(walk);
    };

    walk(root);
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "characterData") translateText(m.target as Text);
        else if (m.type === "attributes") translateAttrs(m.target as Element);
        else m.addedNodes.forEach(walk);
      }
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
    return () => {
      observer.disconnect();
      // Put the English back, unless React has since replaced the text itself.
      texts.forEach((english, node) => {
        if (lookupTamil(norm(english)) === norm(node.nodeValue ?? "")) node.nodeValue = english;
      });
      attrs.forEach((values, el) => values.forEach((english, name) => el.setAttribute(name, english)));
    };
  }, [lang, rootId]);
}
