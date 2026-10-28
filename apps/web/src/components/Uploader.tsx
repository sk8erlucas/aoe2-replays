"use client";

import { useRef, useState } from "react";
import { errorText, useI18n } from "@/i18n/I18nProvider";

const MAX_BYTES = 30 * 1024 * 1024;

type Status = { kind: "idle" } | { kind: "busy"; name: string } | { kind: "error"; message: string };

export type Uploaded = { id: string; token: string; fileName: string; mapName: string | null; durationMs: number };

export function Uploader({ onUploaded }: { onUploaded: (result: Uploaded) => void }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [over, setOver] = useState(false);

  async function upload(file: File) {
    if (!file.name.toLowerCase().endsWith(".aoe2record")) {
      setStatus({ kind: "error", message: t.upload.wrongType });
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus({ kind: "error", message: t.errors.too_large });
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
        setStatus({ kind: "error", message: errorText(t, err?.code, res.status) });
        return;
      }
      onUploaded({ id: json.id, token: json.token, fileName: file.name, mapName: json.mapName, durationMs: json.durationMs });
    } catch {
      setStatus({ kind: "error", message: t.upload.sendFailed });
    }
  }

  const busy = status.kind === "busy";

  return (
    <div
      className={`dropzone frame${over ? " over" : ""}${busy ? " busy" : ""}`}
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
      <div className="dropzone-inner">
        <p className="dropzone-title">{busy ? t.upload.busy(status.name) : t.upload.title}</p>
        <p className="muted">{t.upload.hint}</p>
        <button type="button" className="primary" disabled={busy} onClick={() => input.current?.click()}>
          {t.upload.choose}
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
          {t.upload.privacy} <code>{t.upload.path}</code>.
        </p>
      </div>
    </div>
  );
}
