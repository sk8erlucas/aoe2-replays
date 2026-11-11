"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReplayData } from "@aoe2-replays/shared";
import {
  FpsWatch,
  PLAYER_COLORS,
  QUALITIES,
  QUALITY_SETTINGS,
  Renderer,
  Replay,
  SpriteSet,
  TerrainSet,
  formatTime,
  lowerQuality,
  pickQuality,
  type FollowMode,
  type LogEntry,
  type GameData,
  type Quality,
  type State,
} from "@aoe2-replays/viewer";
import { AiContextPanel } from "@/components/AiContextPanel";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { ChatPanel } from "@/components/ChatPanel";
import { SaveMoment, type MomentTarget } from "@/components/SaveMoment";
import { usePopup } from "@/components/usePopup";
import { useI18n } from "@/i18n/I18nProvider";

const SPEEDS = [1, 2, 4, 8, 16];
// Range thumb width (px, see .controls .seek), min gap between flags in a row, rows before overlapping.
const THUMB = 16;
const FLAG_GAP = 9;
const MAX_FLAG_ROWS = 4;
const AGE_KEYS: Record<number, "feudal" | "castle" | "imperial"> = { 2: "feudal", 3: "castle", 4: "imperial" };

// Loaded once per page; if it fails the viewer keeps drawing plain shapes.
let spritesPromise: Promise<SpriteSet | null> | null = null;
function loadSprites() {
  spritesPromise ??= SpriteSet.load("/sprites").catch(() => null);
  return spritesPromise;
}

// Terrain textures, also from tools/sprites; without them the ground is flat colour.
let terrainPromise: Promise<TerrainSet | null> | null = null;
function loadTerrain() {
  terrainPromise ??= TerrainSet.load("/sprites").catch(() => null);
  return terrainPromise;
}

type Tooltip = { x: number; y: number; text: string } | null;

// Graphics quality: "auto" picks one for the device and drops a level if playback stutters.
type QualityPref = "auto" | Quality;
const QUALITY_KEY = "viewer-quality";

function readQualityPref(): QualityPref {
  try {
    const v = localStorage.getItem(QUALITY_KEY);
    if (v === "auto" || QUALITIES.includes(v as Quality)) return v as QualityPref;
  } catch {
    // storage blocked: use the default
  }
  return "auto";
}

function deviceQuality(): Quality {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return pickQuality({
    deviceMemory: nav.deviceMemory,
    cores: nav.hardwareConcurrency,
    screenWidth: Math.min(screen.width, screen.height),
    coarse: matchMedia("(pointer: coarse)").matches,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  });
}

// Unit train locations, speeds and build times from the game (tools/sprites).
let gameDataPromise: Promise<GameData | null> | null = null;
function loadGameData() {
  gameDataPromise ??= fetch("/sprites/game-data.json", { cache: "no-cache" })
    .then((res) => (res.ok ? (res.json() as Promise<GameData>) : null))
    .catch(() => null);
  return gameDataPromise;
}

/** Data from outside the replay (online matches): rating and result per player number. */
export type PlayerExtra = { rating: number | null; ratingDiff: number | null; won: boolean | null };

type ViewerProps = {
  data: ReplayData;
  actions?: React.ReactNode;
  extras?: Map<number, PlayerExtra>;
  /** Where saved moments point to; without it there is no "Save moment". */
  moment?: MomentTarget;
};

export function ReplayViewer(props: ViewerProps) {
  const { t } = useI18n();
  // undefined while loading; null if unavailable (the engine then uses its estimates).
  const [gameData, setGameData] = useState<GameData | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    loadGameData().then((g) => {
      if (alive) setGameData(g);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (gameData === undefined) return <main className="page message-page muted">{t.viewer.preparing}</main>;
  return <ReplayStage {...props} gameData={gameData} />;
}

function ReplayStage({ data, actions, extras, moment, gameData }: ViewerProps & { gameData: GameData | null }) {
  const { t: tr } = useI18n();
  const replay = useMemo(() => new Replay(data, { gameData }), [data, gameData]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const minimap = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const time = useRef(0);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const playingRef = useRef(false);
  const speedRef = useRef(2);
  const dirty = useRef(true);

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [follow, setFollowState] = useState<FollowMode>("auto");
  const [tooltip, setTooltip] = useState<Tooltip>(null);
  const [tab, setTab] = useState<"events" | "chat" | "analysis" | "ai">("events");
  const [notice, setNotice] = useState<string | null>(null);
  const [logPlayer, setLogPlayer] = useState<number | null>(null); // events of one player, or all
  const [qualityPref, setQualityPref] = useState<QualityPref>(readQualityPref);
  const [autoQuality, setAutoQuality] = useState<Quality>(deviceQuality);
  const quality: Quality = qualityPref === "auto" ? autoQuality : qualityPref;
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const [loadingGraphics, setLoadingGraphics] = useState(false);
  const { open: helpOpen, setOpen: setHelpOpen, box: helpBox } = usePopup();

  function showNotice(text: string) {
    setNotice(text);
    setTimeout(() => setNotice((n) => (n === text ? null : n)), 4000);
  }

  function chooseQuality(pref: QualityPref) {
    setQualityPref(pref);
    try {
      localStorage.setItem(QUALITY_KEY, pref);
    } catch {
      // storage blocked: the choice lasts this visit
    }
  }

  // Playback too slow (auto only) or drawing failed (out of memory): one level down.
  const lowerRef = useRef<(failed: boolean) => void>(() => {});
  lowerRef.current = (failed) => {
    const next = lowerQuality(quality);
    if (!next || (!failed && qualityPref !== "auto")) return;
    if (qualityPref === "auto") setAutoQuality(next);
    else setQualityPref(next); // not saved: the next visit tries the chosen level again
    showNotice(tr.viewer.qualityLowered(tr.viewer.qualities[next]));
  };

  useEffect(() => {
    const r = renderer.current;
    if (!r || r.quality === quality) return;
    r.setQuality(quality).then(() => {
      dirty.current = true;
    });
    dirty.current = true;
  }, [quality]);

  // Link to this match at the current second. The #fragment is left out: on a
  // private upload it carries the management token.
  async function shareMoment() {
    const seconds = Math.floor(time.current / 1000);
    const url = `${location.origin}${location.pathname}?t=${seconds}`;
    try {
      await navigator.clipboard.writeText(url);
      showNotice(tr.viewer.momentCopied(formatTime(seconds * 1000)));
    } catch {
      window.prompt(tr.common.copyPrompt, url);
    }
  }

  playingRef.current = playing;
  speedRef.current = speed;

  const playerName = (n: number | null) => (n == null ? "" : replay.playerByNumber.get(n)?.name ?? "Gaia");
  const playerColor = (n: number | null) => {
    const p = n == null ? undefined : replay.playerByNumber.get(n);
    return p ? PLAYER_COLORS[p.color_id] : undefined;
  };

  function setFollow(mode: FollowMode) {
    renderer.current?.setFollow(mode);
    setFollowState(mode);
    dirty.current = true;
  }

  // Close-up on a player's town (their starting town center), with the camera left free.
  function goToTown(number: number) {
    const r = renderer.current;
    if (!r) return;
    const home = replay.players.find((p) => p.number === number)?.start ?? replay.focusOf(number, time.current);
    setFollow(null);
    r.centerOn(home.x, home.y, { scale: r.closeScale() });
  }

  function tooltipFor(state: State): Tooltip {
    const r = renderer.current;
    const at = pointer.current;
    const hit = r && at && r.pick(state, at.x, at.y);
    if (!hit || !at) return null;
    const obj = hit.kind === "unit" ? hit.unit : hit.building;
    const parts = [obj.typeId != null ? replay.objectName(obj.typeId) : tr.viewer.unit, playerName(obj.player)];
    if (hit.kind === "building" && hit.progress < 1) parts.push(tr.viewer.built(Math.round(hit.progress * 100)));
    if (hit.kind === "unit" && hit.unit.approx) parts.push(tr.viewer.approx);
    return { x: at.x, y: at.y, text: parts.join(" · ") };
  }

  useEffect(() => {
    const el = canvas.current!;
    const r = new Renderer(el, replay, { quality: qualityRef.current });
    renderer.current = r;
    let spriteSet: SpriteSet | null = null;
    time.current = 0;
    r.resize();
    // Start close, like in-game, on the first action (or the first player's start).
    const first = replay.latestFocus(0) ?? replay.focusOf(replay.players[0]?.number ?? 1, 0);
    r.centerOn(first.x, first.y, { scale: r.closeScale(), instant: true });
    r.setFollow("auto");
    setFollowState("auto");
    // ?t=<seconds> opens the match at that moment (shareable links).
    const startAt = Number(new URLSearchParams(location.search).get("t"));
    if (startAt > 0) time.current = Math.min(replay.duration, startAt * 1000);
    dirty.current = true;
    loadSprites().then(async (sprites) => {
      if (!sprites) return;
      // Below high quality one civilization's buildings stand in for everyone's.
      const shared = QUALITY_SETTINGS[qualityRef.current].sharedCiv;
      await sprites.loadCivs([...replay.players.map((p) => p.civilization_id), shared]);
      if (renderer.current !== r) return;
      sprites.onLoad = () => {
        dirty.current = true;
      };
      r.setSprites(sprites);
      spriteSet = sprites;
      dirty.current = true;
    });
    loadTerrain()
      .then((terrain) => r.setTerrain(terrain))
      .then(() => {
        if (renderer.current === r) dirty.current = true;
      })
      .catch(() => {});

    const onResize = () => {
      r.resize();
      dirty.current = true;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      r.zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
      dirty.current = true;
    };
    window.addEventListener("resize", onResize);
    el.addEventListener("wheel", onWheel, { passive: false });

    let raf = 0;
    let last = performance.now();
    let lastDraw = 0;
    let shownT = -1;
    let shownTip = "";
    let shownLoading = false;
    const fps = new FpsWatch();
    const frame = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      if (playingRef.current) {
        time.current = Math.min(replay.duration, time.current + dt * speedRef.current);
        if (time.current >= replay.duration) setPlaying(false);
      }
      const moving = r.update(dt, time.current);
      // Lower qualities cap the frame rate (phones: battery and heat).
      const targetFps = QUALITY_SETTINGS[r.quality].fps;
      const due = now - lastDraw >= 1000 / targetFps - 2;
      if ((playingRef.current || moving || dirty.current) && due) {
        if (playingRef.current && lastDraw && fps.frame(now - lastDraw, targetFps)) lowerRef.current(false);
        else if (!playingRef.current) fps.reset();
        lastDraw = now;
        dirty.current = false;
        const state = replay.stateAt(time.current);
        try {
          r.draw(state, { pointer: pointer.current });
          if (minimap.current) r.drawMinimap(minimap.current, state);
        } catch (err) {
          // Most likely out of memory on a phone: a lighter quality instead of a frozen map.
          console.error(err);
          lowerRef.current(true);
        }
        const tip = tooltipFor(state);
        const key = tip ? `${tip.text}@${tip.x},${tip.y}` : "";
        if (key !== shownTip) {
          shownTip = key;
          setTooltip(tip);
        }
      }
      // The clock and panels only need ~10 updates per second while playing.
      if (Math.abs(time.current - shownT) >= 100 || (time.current !== shownT && !playingRef.current)) {
        shownT = time.current;
        setT(time.current);
      }
      const busy = (spriteSet?.pending ?? 0) > 0;
      if (busy !== shownLoading) {
        shownLoading = busy;
        setLoadingGraphics(busy);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      el.removeEventListener("wheel", onWheel);
      renderer.current = null;
    };
    // tooltipFor only reads refs and the replay, so it is safe to leave out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      // Leave the browser's own shortcuts (Ctrl+F, Ctrl+1...) alone.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const r = renderer.current;
      const jump = e.shiftKey ? 30_000 : 5000;
      const digit = /^Digit([1-8])$/.exec(e.code);
      if (e.key === "?") setHelpOpen((o) => !o);
      else if (e.code === "Escape") setHelpOpen(false);
      else if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowRight") seek(time.current + jump);
      else if (e.code === "ArrowLeft") seek(time.current - jump);
      else if (e.code === "Home") seek(0);
      else if (e.code === "End") seek(replay.duration);
      else if (e.code === "BracketRight" || e.code === "Period") changeSpeed(1);
      else if (e.code === "BracketLeft" || e.code === "Comma") changeSpeed(-1);
      else if (e.code === "Equal" || e.code === "NumpadAdd") zoom(1.25);
      else if (e.code === "Minus" || e.code === "NumpadSubtract") zoom(0.8);
      else if (e.code === "KeyF") setFollow("auto");
      else if (e.code === "KeyM") showFullMap();
      else if (digit) {
        const p = players[Number(digit[1]) - 1];
        if (p) setFollow(p.number);
      } else if (r) {
        const step = 120;
        const pan = ({ KeyW: [0, step], KeyS: [0, -step], KeyA: [step, 0], KeyD: [-step, 0] } as Record<string, number[]>)[e.code];
        if (pan) {
          r.pan(pan[0], pan[1]);
          setFollowState(null);
          dirty.current = true;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function seek(ms: number) {
    time.current = Math.max(0, Math.min(replay.duration, ms));
    dirty.current = true;
  }

  function togglePlay() {
    if (!playing && time.current >= replay.duration) time.current = 0;
    setPlaying(!playing);
  }

  function zoom(factor: number) {
    const r = renderer.current;
    const el = canvas.current;
    if (!r || !el) return;
    r.zoomAt(el.clientWidth / 2, el.clientHeight / 2, factor);
    dirty.current = true;
  }

  function changeSpeed(step: number) {
    const i = SPEEDS.indexOf(speed);
    const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 1 : i) + step))];
    if (next === speed) return;
    setSpeed(next);
    showNotice(tr.viewer.speedNotice(next));
  }

  function showFullMap() {
    renderer.current?.fit();
    setFollowState(null);
    dirty.current = true;
  }

  // Panel data only changes when the visible log or resign set changes.
  const log = replay.logUntil(t);
  const logKey = log.length;
  const resigned = new Set([...replay.resignedAt].filter(([, rt]) => rt <= t).map(([p]) => p));
  const logItems = useMemo(
    () => (logPlayer == null ? log : log.filter((e) => e.player === logPlayer)).slice(-200).reverse(),
    [logKey, logPlayer], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const players = useMemo(
    () => [...replay.players].sort((a, b) => a.team_id - b.team_id || a.number - b.number),
    [replay],
  );
  // Age flags over the timeline, stacked in rows where they would overlap.
  const seekTrack = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  useEffect(() => {
    const el = seekTrack.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setTrackWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const ageFlags = useMemo(() => {
    const ends: number[] = []; // right edge (px) of the last flag in each row
    const flags = replay.ageMarks().map((m) => {
      const at = m.t / Math.max(1, replay.duration);
      const x = THUMB / 2 + (trackWidth - THUMB) * at;
      let row = ends.findIndex((end) => end <= x);
      if (row < 0) row = ends.length < MAX_FLAG_ROWS ? ends.length : ends.indexOf(Math.min(...ends));
      ends[row] = x + FLAG_GAP;
      return { ...m, at, row };
    });
    return { flags, rows: Math.max(1, ends.length) };
  }, [replay, trackWidth]);

  const drag = useRef<{ x: number; y: number } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>()); // pointers down, for pinch zoom
  const pinch = useRef<number | null>(null); // last distance between two fingers
  const logText = (e: LogEntry) => {
    const l = tr.viewer.log;
    if (e.kind === "chat") return `: “${e.text ?? ""}”`;
    if (e.kind === "resign") return ` ${l.resign}`;
    if (e.kind === "queue") return ` ${l.queue(e.amount ?? 1, e.name ?? "")}`;
    if (e.kind === "research") return ` ${l.research(e.name ?? "")}`;
    return ` ${l.build(e.name ?? "", e.segments)}`;
  };
  const g = data.game;
  const teams = new Set(g.players.map((p) => p.team_id)).size;

  return (
    <div className="viewer">
      <div className="viewer-info">
        <p className="muted">
          {tr.viewer.summary(data.map.name ?? tr.common.mapNumber(data.map.id), g.players.length, teams)} ·{" "}
          {formatTime(replay.duration)} · {g.game_version} (save {g.save_version})
          {g.untested_version && tr.viewer.untested}
        </p>
        {actions}
      </div>

      <div className="viewer-body">
        <section className="stage">
          <canvas
            ref={canvas}
            aria-label={tr.viewer.mapLabel}
            onPointerDown={(e) => {
              touches.current.set(e.pointerId, { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
              drag.current = touches.current.size === 1 ? { x: e.clientX, y: e.clientY } : null;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              pointer.current = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
              // Two fingers: pinch to zoom around their midpoint.
              if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, pointer.current);
              if (touches.current.size === 2 && renderer.current) {
                const [a, b] = [...touches.current.values()];
                const dist = Math.hypot(a.x - b.x, a.y - b.y);
                if (pinch.current && dist > 0) {
                  renderer.current.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / pinch.current);
                }
                pinch.current = dist;
                dirty.current = true;
                return;
              }
              if (drag.current && renderer.current) {
                const dx = e.clientX - drag.current.x;
                const dy = e.clientY - drag.current.y;
                // Small jitters on click should not drop the camera out of follow mode.
                if (Math.abs(dx) + Math.abs(dy) > 2) {
                  renderer.current.pan(dx, dy);
                  drag.current = { x: e.clientX, y: e.clientY };
                  if (follow !== null) setFollowState(null);
                }
              }
              dirty.current = true;
            }}
            onPointerUp={(e) => {
              touches.current.delete(e.pointerId);
              pinch.current = null;
              drag.current = null;
            }}
            onPointerCancel={(e) => {
              touches.current.delete(e.pointerId);
              pinch.current = null;
              drag.current = null;
            }}
            onPointerLeave={() => {
              pointer.current = null;
              dirty.current = true;
            }}
          />
          <canvas
            ref={minimap}
            className="minimap"
            aria-label={tr.viewer.minimapLabel}
            onPointerDown={(e) => {
              const r = renderer.current;
              if (!r || !minimap.current) return;
              const [x, y] = r.minimapToWorld(minimap.current, e.nativeEvent.offsetX, e.nativeEvent.offsetY);
              setFollow(null);
              r.centerOn(x, y);
            }}
          />
          {loadingGraphics && (
            <div className="stage-loading" role="status">
              {tr.viewer.loadingGraphics}
            </div>
          )}
          {tooltip && (
            <div className="tooltip" style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}>
              {tooltip.text}
            </div>
          )}
        </section>

        <aside className="sidebar">
          <h2>{tr.viewer.players}</h2>
          <ul className="players">
            {players.map((p) => {
              const out = resigned.has(p.number);
              const extra = extras?.get(p.number);
              return (
                <li key={p.number} className={out ? "resigned" : ""}>
                  <button type="button" className="player-jump" title={tr.viewer.goToTown(p.name)} onClick={() => goToTown(p.number)}>
                    <span className="swatch" style={{ background: PLAYER_COLORS[p.color_id] ?? "#fff" }} />
                    <span className="name">{p.name}</span>
                    <span className="meta">
                      {p.civilization ?? `civ ${p.civilization_id}`} · {tr.viewer.team(p.team_id)}
                      {out && tr.viewer.resignedAt(formatTime(replay.resignedAt.get(p.number) ?? 0))}
                      {extra?.rating != null && ` · ${extra.rating}`}
                      {extra?.ratingDiff ? ` (${extra.ratingDiff > 0 ? "+" : ""}${extra.ratingDiff})` : ""}
                    </span>
                    {extra?.won != null && (
                      <span className={`result ${extra.won ? "win" : "loss"}`}>{extra.won ? tr.profile.win : tr.profile.loss}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="tabs" role="tablist">
            {(["events", "chat", "analysis", "ai"] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={tab === key ? "active" : ""}
                onClick={() => setTab(key)}
              >
                {tr.viewer.tabs[key]}
                {key === "chat" && data.chat?.length ? ` (${data.chat.length})` : ""}
              </button>
            ))}
          </div>
          {tab === "analysis" && <AnalysisPanel data={data} onSeek={seek} />}
          {tab === "ai" && <AiContextPanel data={data} />}
          {tab === "chat" && <ChatPanel data={data} t={t} onSeek={seek} />}
          {tab === "events" && (
            <label className="log-filter">
              <span className="sr-only">{tr.viewer.eventsOf}</span>
              <select
                value={logPlayer ?? ""}
                onChange={(e) => setLogPlayer(e.target.value === "" ? null : Number(e.target.value))}
              >
                <option value="">{tr.viewer.allPlayers}</option>
                {players.map((p) => (
                  <option key={p.number} value={p.number}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <ol className="log" hidden={tab !== "events"}>
            {logItems.map((e: LogEntry, i: number) => (
              <li key={`${e.t}-${i}`}>
                <span className="time">{formatTime(e.t)}</span>
                <span className={e.kind}>
                  <span className="who">
                    {playerColor(e.player) && (
                      <span className="swatch" style={{ background: playerColor(e.player) }} aria-hidden="true" />
                    )}
                    {playerName(e.player)}
                  </span>
                  {logText(e)}
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      <footer className="controls">
        <button type="button" className="play" onClick={togglePlay} aria-label={playing ? tr.viewer.pause : tr.viewer.play}>
          {playing ? "❚❚" : "▶"}
        </button>
        <button type="button" className="share-moment" onClick={shareMoment} title={tr.viewer.shareMomentHint}>
          {tr.viewer.shareMoment}
        </button>
        {moment && <SaveMoment {...moment} now={() => time.current} onNotice={showNotice} />}
        {notice && (
          <span className="share-notice" role="status">
            {notice}
          </span>
        )}
        <span className="clock">
          {formatTime(t)} / {formatTime(replay.duration)}
        </span>
        <div className="seek-track" ref={seekTrack} style={{ "--rows": ageFlags.rows } as React.CSSProperties}>
          {ageFlags.flags.map((m) => {
            const age = tr.analysis.ages[AGE_KEYS[m.age] ?? "feudal"];
            const label = tr.viewer.ageFlag(playerName(m.player), age, formatTime(m.t));
            return (
              <button
                key={`${m.player}-${m.age}`}
                type="button"
                className="age-flag"
                style={{ "--at": m.at, "--row": m.row } as React.CSSProperties}
                title={label}
                aria-label={label}
                onClick={() => seek(m.t)}
              >
                <span className="swatch" style={{ background: playerColor(m.player) ?? "#fff" }} />
              </button>
            );
          })}
          <input
            className="seek"
            type="range"
            min={0}
            max={replay.duration}
            step={100}
            value={t}
            aria-label={tr.viewer.time}
            onChange={(e) => seek(Number(e.target.value))}
          />
        </div>
        <label>
          {tr.viewer.speed}{" "}
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr.viewer.camera}{" "}
          <select
            value={follow === null ? "free" : String(follow)}
            onChange={(e) => {
              const v = e.target.value;
              setFollow(v === "free" ? null : v === "auto" ? "auto" : Number(v));
            }}
          >
            <option value="auto">{tr.viewer.cameraAuto}</option>
            <option value="free">{tr.viewer.cameraFree}</option>
            {players.map((p) => (
              <option key={p.number} value={p.number}>
                {tr.viewer.follow(p.name)}
              </option>
            ))}
          </select>
        </label>
        <label title={tr.viewer.qualityHint}>
          {tr.viewer.quality}{" "}
          <select value={qualityPref} onChange={(e) => chooseQuality(e.target.value as QualityPref)}>
            <option value="auto">{tr.viewer.qualityAuto(tr.viewer.qualities[autoQuality])}</option>
            {QUALITIES.map((q) => (
              <option key={q} value={q}>
                {tr.viewer.qualities[q]}
              </option>
            ))}
          </select>
        </label>
        <div className="zoom-buttons">
          <button type="button" onClick={() => zoom(1.25)} aria-label={tr.viewer.zoomIn} title={`${tr.viewer.zoomIn} (+)`}>
            +
          </button>
          <button type="button" onClick={() => zoom(0.8)} aria-label={tr.viewer.zoomOut} title={`${tr.viewer.zoomOut} (−)`}>
            −
          </button>
          <button type="button" onClick={showFullMap} title={`${tr.viewer.fullMapTitle} (M)`}>
            {tr.viewer.fullMap}
          </button>
        </div>
        <div className="topbar-popup keys-help" ref={helpBox}>
          <button
            type="button"
            aria-expanded={helpOpen}
            aria-haspopup="dialog"
            onClick={() => setHelpOpen(!helpOpen)}
            aria-label={tr.viewer.keys.title}
            title={`${tr.viewer.keys.title} (?)`}
          >
            ?
          </button>
          {helpOpen && (
            <div className="topbar-panel keys-panel" role="dialog" aria-label={tr.viewer.keys.title}>
              <h2>{tr.viewer.keys.title}</h2>
              <dl>
                {tr.viewer.keys.list.map(([keys, what]) => (
                  <div key={keys}>
                    <dt>
                      <kbd>{keys}</kbd>
                    </dt>
                    <dd>{what}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
