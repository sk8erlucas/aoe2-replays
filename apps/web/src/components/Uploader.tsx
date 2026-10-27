"use client";

import { useRef, useState } from "react";

const MAX_BYTES = 30 * 1024 * 1024;

const MESSAGES: Record<string, string> = {
  unsupported_version: "Esta versión del juego todavía no está soportada.",
  corrupt_replay: "El archivo está dañado o no es un replay de AoE2: DE.",
  invalid_replay: "El archivo no es un replay válido.",
  too_large: "El archivo supera los 30 MB.",
  timeout: "El replay tardó demasiado en procesarse.",
  parser_unavailable: "El servicio de parseo no responde. Probá en un rato.",
  rate_limited: "Subiste muchos replays en la última hora. Probá más tarde.",
};

type Status = { kind: "idle" } | { kind: "busy"; name: string } | { kind: "error"; message: string };

export type Uploaded = { id: string; token: string; fileName: string; mapName: string | null; durationMs: number };

export function Uploader({ onUploaded }: { onUploaded: (result: Uploaded) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [over, setOver] = useState(false);

  async function upload(file: File) {
    if (!file.name.toLowerCase().endsWith(".aoe2record")) {
      setStatus({ kind: "error", message: "Elegí un archivo .aoe2record." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus({ kind: "error", message: MESSAGES.too_large });
      return;
    }
    setStatus({ kind: "busy", name: file.name });
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/replays", { method: "POST", body });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.id) {
        const err = json?.error;
        setStatus({ kind: "error", message: (err && (MESSAGES[err.code] ?? err.message)) || `Error ${res.status}` });
        return;
      }
      onUploaded({ id: json.id, token: json.token, fileName: file.name, mapName: json.mapName, durationMs: json.durationMs });
    } catch {
      setStatus({ kind: "error", message: "No se pudo enviar el archivo." });
    }
  }

  const busy = status.kind === "busy";

  return (
    <div
      className={`dropzone${over ? " over" : ""}${busy ? " busy" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file && !busy) upload(file);
      }}
    >
      <p className="dropzone-title">{busy ? `Analizando ${status.name}…` : "Arrastrá tu replay acá"}</p>
      <p className="muted">
        Archivo <code>.aoe2record</code> de Age of Empires II: DE. No hace falta cuenta.
      </p>
      <button type="button" className="primary" disabled={busy} onClick={() => input.current?.click()}>
        Elegir archivo
      </button>
      <input
        ref={input}
        type="file"
        accept=".aoe2record"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload(file);
        }}
      />
      {status.kind === "error" && (
        <p className="error" role="alert">
          {status.message}
        </p>
      )}
      <p className="muted small">
        Guardamos solo los datos de la partida, no el archivo. Es privado: solo lo ve quien tenga el enlace de gestión,
        hasta que lo hagas público. En Windows los replays están en{" "}
        <code>Usuarios\&lt;vos&gt;\Games\Age of Empires 2 DE\&lt;id&gt;\savegame</code>.
      </p>
    </div>
  );
}
