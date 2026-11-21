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
  type VideoZoom,
} from "@aoe2-replays/viewer";
import type { Player } from "@aoe2-replays/shared";
import type { VideoFormat, VideoTable } from "@aoe2-replays/viewer/video";
import { TRACKS } from "@/components/MusicControl";
import { usePopup } from "@/components/usePopup";
import { useI18n } from "@/i18n/I18nProvider";
import { panelCell, panelTable, readPanelTab } from "@/lib/panelTable";

// The encoder (Mediabunny) only loads once someone opens the dialog.
let encoder: Promise<typeof import("@aoe2-replays/viewer/video")> | null = null;
const loadEncoder = () => (encoder ??= import("@aoe2-replays/viewer/video"));

const SPEEDS = [4, 8, 16, 32];
const ZOOMS: VideoZoom[] = ["close", "medium", "far", "map", "viewer"];
// Above this the dialog warns: the file is made and kept on the person's device.
const HEAVY_MB = 300;

type Props = {
  replay: Replay;
  renderer: React.RefObject<Renderer | null>;
  /** Current game time (ms). */
  now: () => number;
  pause: () => void;
  /** By team, as in the viewer. */
  players: Player[];
  color: (n: number) => string | undefined;
  /** The players panel is shown in the viewer: the video draws it too unless unticked. */
  panels: boolean;
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

// The soundtrack from a random track, so videos don't all sound the same.
function startingAtRandom(tracks: string[]): string[] {
  const k = Math.floor(Math.random() * tracks.length);
  return [...tracks.slice(k), ...tracks.slice(0, k)];
}

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "match";
}

export function VideoExport({ replay, renderer, now, pause, players, color, panels, quality, mapName, loadGraphics }: Props) {
  const { t } = useI18n();
  const v = t.viewer.video;
  const { open, setOpen, box } = usePopup();
  const [format, setFormat] = useState<VideoFormat | null | undefined>(undefined);
  const [from, setFrom] = useState("0:00");
  const [to, setTo] = useState(() => formatTime(replay.duration));
  const [speed, setSpeed] = useState(16);
  const [height, setHeight] = useState<VideoHeight>(720);
  const [watermark, setWatermark] = useState(true);
  const [zoom, setZoom] = useState<VideoZoom>("medium");
  const [vertical, setVertical] = useState(false);
  const [music, setMusic] = useState(true);
  // Who the camera follows (never free: it would never move) and whose fog, as in the viewer when opened.
  const [follow, setFollow] = useState<"auto" | number>("auto");
  const [fog, setFog] = useState<number | null>(null);
  const fogHides = replay.data.game.reveal_map !== "all_visible";
  useEffect(() => {
    if (!open) return;
    const r = renderer.current;
    setFollow(typeof r?.follow === "number" ? r.follow : "auto");
    setFog(r?.fogPlayer ?? null);
  }, [open, renderer]);
  const [withPanel, setWithPanel] = useState(panels);
  useEffect(() => setWithPanel(panels), [panels]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const abort = useRef<AbortController | null>(null);

  // What the browser can encode is only known there, and depends on the size.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    loadEncoder()
      .then((m) => m.videoFormat(height, vertical))
      .catch(() => null)
      .then((f) => {
        if (alive) setFormat(f);
      });
    return () => {
      alive = false;
    };
  }, [open, height, vertical]);

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

  // The players panel with the tab picked in the viewer, cells as the panel shows them.
  function videoTable(): VideoTable {
    const p = t.viewer.panels;
    const tab = readPanelTab();
    const { columns } = panelTable(replay, tab, 0, p, players);
    return {
      caption: p.captions[tab],
      columns,
      players: players.map((pl, i) => ({
        number: pl.number,
        name: pl.name,
        color: color(pl.number) ?? "#fff",
        newTeam: i > 0 && pl.team_id > 1 && pl.team_id !== players[i - 1].team_id,
      })),
      rows: (at) => {
        const { rows } = panelTable(replay, tab, Math.floor(at / 1000) * 1000, p, players);
        return new Map([...rows].map(([n, row]) => [n, Object.fromEntries(columns.map((c) => [c.key, panelCell(c.key, row[c.key])]))]));
      },
    };
  }

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
        follow,
        fog: fogHides ? fog : null,
        zoom,
        vertical,
        music: music ? startingAtRandom(TRACKS) : null,
        overlay: {
          players: players.map((p) => ({ name: p.name, color: color(p.number) ?? "#fff" })),
          watermark: watermark ? location.host : null,
          font: getComputedStyle(document.body).fontFamily,
          table: withPanel ? videoTable() : null,
        },
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
  const estimate = range && { ms: videoLengthMs({ ...range, speed }), mb: estimateBytes({ ...range, speed, height, music }) / 1e6 };

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
                <label>
                  {v.follow}{" "}
                  <select value={String(follow)} onChange={(e) => setFollow(e.target.value === "auto" ? "auto" : Number(e.target.value))}>
                    <option value="auto">{v.followAuto}</option>
                    {players.map((p) => (
                      <option key={p.number} value={p.number}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                {fogHides && (
                  <label>
                    {v.fog}{" "}
                    <select value={fog === null ? "none" : String(fog)} onChange={(e) => setFog(e.target.value === "none" ? null : Number(e.target.value))}>
                      <option value="none">{v.fogNone}</option>
                      {players.map((p) => (
                        <option key={p.number} value={p.number}>
                          {v.fogOf(p.name)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  {v.zoom}{" "}
                  <select value={zoom} onChange={(e) => setZoom(e.target.value as VideoZoom)}>
                    {ZOOMS.map((z) => (
                      <option key={z} value={z}>
                        {v.zooms[z]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {v.shape}{" "}
                  <select value={vertical ? "v" : "h"} onChange={(e) => setVertical(e.target.value === "v")}>
                    <option value="h">{v.landscape}</option>
                    <option value="v">{v.portrait}</option>
                  </select>
                </label>
                <label className="video-check">
                  <input type="checkbox" checked={music} onChange={(e) => setMusic(e.target.checked)} />
                  {v.music}
                </label>
                <label className="video-check">
                  <input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} />
                  {v.watermark}
                </label>
                <label className="video-check">
                  <input type="checkbox" checked={withPanel} onChange={(e) => setWithPanel(e.target.checked)} />
                  {v.panel}
                </label>
              </fieldset>
              {estimate ? (
                <>
                  <p className="muted">
                    {v.estimate(formatTime(estimate.ms), Math.max(1, Math.round(estimate.mb)), format?.extension.toUpperCase() ?? "")}
                  </p>
                  {estimate.mb > HEAVY_MB && <p className="form-warning">{v.heavy(Math.round(estimate.mb))}</p>}
                </>
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
