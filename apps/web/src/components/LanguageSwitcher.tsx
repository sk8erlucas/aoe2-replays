"use client";

import { useI18n } from "@/i18n/I18nProvider";
import { LOCALES } from "@/i18n/messages";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label={t.nav.language}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          className={l === locale ? "active" : ""}
          aria-pressed={l === locale}
          onClick={() => l !== locale && setLocale(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
