"use client";

import { useI18n } from "@/i18n/I18nProvider";

export default function PrivacyPage() {
  const { t } = useI18n();
  return (
    <main className="page">
      <article className="prose-page">
        <h1>{t.privacy.title}</h1>
        <p className="small">{t.privacy.updated}</p>
        {t.privacy.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.text}</p>
          </section>
        ))}
      </article>
    </main>
  );
}
