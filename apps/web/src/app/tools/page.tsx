"use client";

import { OverlayShowcase } from "@/components/OverlayShowcase";
import { useI18n } from "@/i18n/I18nProvider";

export default function ToolsPage() {
  const { t } = useI18n();
  return (
    <main className="page">
      <section className="section container tools">
        <h1 className="section-title">{t.tools.pageTitle}</h1>
        <div className="ornament" aria-hidden="true">
          ◆
        </div>
        <p className="section-lead">{t.tools.lead}</p>
        <OverlayShowcase placement="tools" />
      </section>
    </main>
  );
}
