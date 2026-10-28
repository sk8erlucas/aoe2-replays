"use client";

import { useMemo, useState } from "react";
import type { ReplayData } from "@aoe2-replays/shared";
import { buildAiContext } from "@aoe2-replays/viewer";
import { useI18n } from "@/i18n/I18nProvider";

export function AiContextPanel({ data }: { data: ReplayData }) {
  const { t, locale } = useI18n();
  const summary = useMemo(() => buildAiContext(data, { locale }), [data, locale]);
  const full = useMemo(() => buildAiContext(data, { full: true, locale }), [data, locale]);
  const [notice, setNotice] = useState<string | null>(null);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(t.ai.copied(what));
    } catch {
      setNotice(t.ai.copyFailed);
    }
  }

  function download() {
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aoe2-${(data.map.name ?? "map").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="ai-panel">
      <p>{t.ai.intro}</p>
      <div className="ai-actions">
        <button type="button" className="primary" onClick={() => copy(summary.text, t.ai.summaryName)}>
          {t.ai.copySummary}
        </button>
        <p className="muted small">{t.ai.summaryNote(t.ai.thousands(summary.tokens))}</p>
        <button type="button" onClick={() => copy(full.text, t.ai.fullName)}>
          {t.ai.copyFull}
        </button>
        <p className="muted small">{t.ai.fullNote(t.ai.thousands(full.tokens))}</p>
        <button type="button" onClick={download}>
          {t.ai.download}
        </button>
        <p className="muted small">{t.ai.downloadNote}</p>
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <details className="ai-preview">
        <summary>{t.ai.preview}</summary>
        <textarea readOnly value={summary.text} rows={14} aria-label={t.ai.previewLabel} />
      </details>
    </div>
  );
}
