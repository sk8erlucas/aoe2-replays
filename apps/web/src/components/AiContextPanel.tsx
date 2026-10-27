"use client";

import { useMemo, useState } from "react";
import type { ReplayData } from "@aoe2-replays/shared";
import { buildAiContext } from "@aoe2-replays/viewer";

const thousands = (n: number) => `${Math.max(1, Math.round(n / 1000))} mil`;

export function AiContextPanel({ data }: { data: ReplayData }) {
  const summary = useMemo(() => buildAiContext(data), [data]);
  const full = useMemo(() => buildAiContext(data, { full: true }), [data]);
  const [notice, setNotice] = useState<string | null>(null);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${what} copiado. Pegalo en el chat de tu IA y hacé tu pregunta.`);
    } catch {
      setNotice("Tu navegador no dejó copiar. Seleccioná el texto de abajo y copialo a mano.");
    }
  }

  function download() {
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `partida-${(data.map.name ?? "mapa").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="ai-panel">
      <p>
        Copiá la partida como texto y pegala en ChatGPT, Claude, Gemini u otra IA para hacerle preguntas: qué hizo
        mejor el ganador, cómo mejorar un build order, en qué momento se definió.
      </p>
      <div className="ai-actions">
        <button type="button" className="primary" onClick={() => copy(summary.text, "Resumen")}>
          Copiar resumen
        </button>
        <p className="muted small">
          Jugadores, APM, edades, build orders y chat. ≈ {thousands(summary.tokens)} tokens: entra en cualquier IA.
        </p>
        <button type="button" onClick={() => copy(full.text, "Detalle completo")}>
          Copiar completo
        </button>
        <p className="muted small">
          Agrega cada orden de la partida. ≈ {thousands(full.tokens)} tokens: necesita una IA con contexto largo.
        </p>
        <button type="button" onClick={download}>
          Descargar JSON
        </button>
        <p className="muted small">Todos los datos en crudo, incluido el mapa, para procesarlos con otras herramientas.</p>
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <details className="ai-preview">
        <summary>Ver el resumen</summary>
        <textarea readOnly value={summary.text} rows={14} aria-label="Resumen de la partida para IA" />
      </details>
    </div>
  );
}
