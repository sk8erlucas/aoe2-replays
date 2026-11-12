"use client";

import { useEffect, useRef, useState } from "react";
import {
  estimateBytes,
  formatTime,
  videoLengthMs,
  type Quality,
  type Renderer,
  type Replay,
  type SpriteSet,
  type TerrainSet,
  type VideoHeight,
} from "@aoe2-replays/viewer";
import type { VideoFormat } from "@aoe2-replays/viewer/video";
import { usePopup } from "@/components/usePopup";
import { useI18n } from "@/i18n/I18nProvider";

// The encoder (Mediabunny) only loads once someone opens the dialog.
let encoder: Promise<typeof import("@aoe2-replays/viewer/video")> | null = null;
const loadEncoder = () => (encoder ??= import("@aoe2-replays/viewer/video"));

const SPEEDS = [4, 8, 16, 32];

type Props = {
  replay: Replay;
  renderer: React.RefObject<Renderer | null>;
  /** Current game time (ms). */
  now: () => number;
  pause: () => void;
  players: { name: string; color: string }[];
  quality: Quality;
  mapName: string | null;
  loadGraphics: () => Promise<[SpriteSet | null, TerrainSet | null]>;
};

type Status =
  | { kind: "idle" }
  | { kind: "recording"; progress: number }
  | { kind: "done"; url: string; fileName: string; bytes: number }
  | { kind: "error"; message: "failed" | "badRange" };

/** "m:ss" or "h:mm:ss" to ms; null if it doesn't parse. */
function parseClock(text: string): number | null {
  const parts = text.trim().split(":");
  if (parts.length < 1 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  return parts.reduce((total, p) => total * 60 + Number(p), 0) * 1000;
}

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "match";
}

export function VideoExport({ replay, renderer, now, pause, players, quality, mapName, loadGraphics }: Props) {
  const { t } = useI18n();
  const v = t.viewer.video;
  const { open, setOpen, box } = usePopup();
  const [format, setFormat] = useState<VideoFormat | null | undefined>(undefined);
  const [from, setFrom] = useState("0:00");
  const [to, setTo] = useState(() => formatTime(replay.duration));
  const [speed, setSpeed] = useState(16);
  const [height, setHeight] = useState<VideoHeight>(720);
  const [watermark, setWatermark] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const abort = useRef<AbortController | null>(null);

  // What the browser can encode is only known there, and depends on the size.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    loadEncoder()
      .then((m) => m.videoFormat(height))
      .catch(() => null)
      .then((f) => {
        if (alive) setFormat(f);
      });
    return () => {
      alive = false;
    };
  }, [open, height]);

  // Free the last video, and stop a recording if the viewer goes away.
  const lastUrl = useRef<string | null>(null);
  useEffect(
    () => () => {
      abort.current?.abort();
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
    },
    [],
  );

  const range = (() => {
    const a = parseClock(from);
    const b = parseClock(to);
    if (a == null || b == null) return null;
    const end = Math.min(b, replay.duration);
    return a < end ? { from: a, to: end } : null;
  })();

  async function start() {
    if (!range || !format) {
      setStatus({ kind: "error", message: "badRange" });
      return;
    }
    pause();
    const controller = new AbortController();
    abort.current = controller;
    setStatus({ kind: "recording", progress: 0 });
    let shown = 0;
    try {
      const [[sprites, terrain], { recordVideo }] = await Promise.all([loadGraphics(), loadEncoder()]);
      const { blob, extension } = await recordVideo(replay, {
        ...range,
        speed,
        height,
        quality,
        sprites,
        terrain,
        camera: renderer.current,
        overlay: { players, watermark: watermark ? location.host : null, font: getComputedStyle(document.body).fontFamily },
        signal: controller.signal,
        onProgress: (p) => {
          // A re-render per percent is plenty.
          if (p - shown < 0.01 && p < 1) return;
          shown = p;
          setStatus({ kind: "recording", progress: p });
        },
      });
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
      const url = URL.createObjectURL(blob);
      lastUrl.current = url;
      const fileName = `aoe2replays-${slug(mapName ?? "match")}-${formatTime(range.from).replace(/:/g, "")}-${formatTime(range.to).replace(/:/g, "")}.${extension}`;
      setStatus({ kind: "done", url, fileName, bytes: blob.size });
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") setStatus({ kind: "idle" });
      else {
        console.error(err);
        setStatus({ kind: "error", message: "failed" });
      }
    } finally {
      abort.current = null;
    }
  }

  const recording = status.kind === "recording";
  const estimate = range && { ms: videoLengthMs({ ...range, speed }), mb: estimateBytes({ ...range, speed, height }) / 1e6 };

  return (
    <div className="topbar-popup video-export" ref={box}>
      <button
        type="button"
        aria-expanded={open || recording}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
        title={v.title}
      >
        {recording ? v.buttonBusy(Math.floor(status.progress * 100)) : v.button}
      </button>
      {(open || recording) && (
        <div className="topbar-panel video-panel" role="dialog" aria-label={v.title}>
          <h2>{v.title}</h2>
          {format === null ? (
            <p className="muted">{v.unsupported}</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void start();
              }}
            >
              <fieldset disabled={recording}>
                <div className="video-range">
                  <label>
                    {v.from}
                    <input value={from} onChange={(e) => setFrom(e.target.value)} inputMode="numeric" size={7} />
                  </label>
                  <label>
                    {v.to}
                    <input value={to} onChange={(e) => setTo(e.target.value)} inputMode="numeric" size={7} />
                  </label>
                  <button type="button" className="link" onClick={() => setFrom(formatTime(now()))}>
                    {v.fromNow}
                  </button>
                </div>
                <label>
                  {v.speed}{" "}
                  <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                    {SPEEDS.map((s) => (
                      <option key={s} value={s}>
                        {s}×
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {v.resolution}{" "}
                  <select value={height} onChange={(e) => setHeight(Number(e.target.value) as VideoHeight)}>
                    <option value={720}>720p</option>
                    <option value={1080}>1080p</option>
                  </select>
                </label>
                <label className="video-check">
                  <input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} />
                  {v.watermark}
                </label>
              </fieldset>
              {estimate ? (
                <p className="muted">
                  {v.estimate(formatTime(estimate.ms), Math.max(1, Math.round(estimate.mb)), format?.extension.toUpperCase() ?? "")}
                </p>
              ) : (
                <p className="form-error">{v.badRange}</p>
              )}
              <p className="muted">{v.inBrowser}</p>
              {recording ? (
                <div className="video-progress">
                  <progress max={1} value={status.progress} aria-label={v.progress} />
                  <button type="button" onClick={() => abort.current?.abort()}>
                    {v.cancel}
                  </button>
                </div>
              ) : (
                <button type="submit" className="button-primary" disabled={!estimate || !format}>
                  {v.start}
                </button>
              )}
              {status.kind === "done" && (
                <p role="status">
                  {v.done(Math.max(1, Math.round(status.bytes / 1e6)))}{" "}
                  <a href={status.url} download={status.fileName}>
                    {v.download}
                  </a>
                </p>
              )}
              {status.kind === "error" && (
                <p className="form-error" role="alert">
                  {status.message === "badRange" ? v.badRange : v.failed}
                </p>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
