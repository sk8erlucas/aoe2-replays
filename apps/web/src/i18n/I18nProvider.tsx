"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { MESSAGES, type Locale, type Messages } from "@/i18n/messages";

type I18n = { locale: Locale; t: Messages; setLocale: (locale: Locale) => void };

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ initial, children }: { initial: Locale; children: React.ReactNode }) {
  const router = useRouter();
  const [locale, setState] = useState<Locale>(initial);

  function setLocale(next: Locale) {
    // Remembered for a year; the server reads it to render in this language.
    document.cookie = `lang=${next}; path=/; max-age=31536000; samesite=lax`;
    setState(next);
    router.refresh();
  }

  return <I18nContext.Provider value={{ locale, t: MESSAGES[locale], setLocale }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}

/** Text for an API error code, falling back to a generic message with the status. */
export function errorText(t: Messages, code: string | undefined, status: number): string {
  const known = code && (t.errors as Record<string, unknown>)[code];
  return typeof known === "string" ? known : t.errors.generic(status);
}
