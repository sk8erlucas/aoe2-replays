"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReplayData } from "@aoe2-replays/shared";
import {
  PLAYER_COLORS,
  Renderer,
  Replay,
  SpriteSet,
  TerrainSet,
  formatTime,
  type FollowMode,
  type LogEntry,
  type GameData,
  type State,
} from "@aoe2-replays/viewer";
import { AiContextPanel } from "@/components/AiContextPanel";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { ChatPanel } from "@/components/ChatPanel";
import { useI18n } from "@/i18n/I18nProvider";

const SPEEDS = [1, 2, 4, 8, 16];

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

// Unit train locations, speeds and build times from the game (tools/sprites).
let gameDataPromise: Promise<GameData | null> | null = null;
function loadGameData() {
  gameDataPromise ??= fetch("/sprites/game-data.json", { cache: "no-cache" })
    .then((res) => (res.ok ? (res.json() as Promise<GameData>) : null))
    .catch(() => null);
  return gameDataPromise;
}

type ViewerProps = { data: ReplayData; actions?: React.ReactNode };

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

function ReplayStage({ data, actions, gameData }: ViewerProps & { gameData: GameData | null }) {
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
    const r = new Renderer(el, replay);
    renderer.current = r;
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
    loadSprites().then((sprites) => {
      if (!sprites || renderer.current !== r) return;
      sprites.onLoad = () => {
        dirty.current = true;
      };
      r.setSprites(sprites);
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
    let shownT = -1;
    let shownTip = "";
    const frame = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      if (playingRef.current) {
        time.current = Math.min(replay.duration, time.current + dt * speedRef.current);
        if (time.current >= replay.duration) setPlaying(false);
      }
      const moving = r.update(dt, time.current);
      if (playingRef.current || moving || dirty.current) {
        dirty.current = false;
        const state = replay.stateAt(time.current);
        r.draw(state);
        if (minimap.current) r.drawMinimap(minimap.current, state);
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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const r = renderer.current;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowRight") seek(time.current + 5000);
      else if (e.code === "ArrowLeft") seek(time.current - 5000);
      else if (e.code === "Equal" || e.code === "NumpadAdd") zoom(1.25);
      else if (e.code === "Minus" || e.code === "NumpadSubtract") zoom(0.8);
      else if (r) {
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

  // Panel data only changes when the visible log or resign set changes.
  const log = replay.logUntil(t);
  const logKey = log.length;
  const resigned = new Set([...replay.resignedAt].filter(([, rt]) => rt <= t).map(([p]) => p));
  const logItems = useMemo(() => log.slice(-200).reverse(), [logKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const players = useMemo(
    () => [...replay.players].sort((a, b) => a.team_id - b.team_id || a.number - b.number),
    [replay],
  );

  const drag = useRef<{ x: number; y: number } | null>(null);
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
              drag.current = { x: e.clientX, y: e.clientY };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              pointer.current = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
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
            onPointerUp={() => {
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
              return (
                <li key={p.number} className={out ? "resigned" : ""}>
                  <button type="button" className="player-jump" title={tr.viewer.goToTown(p.name)} onClick={() => goToTown(p.number)}>
                    <span className="swatch" style={{ background: PLAYER_COLORS[p.color_id] ?? "#fff" }} />
                    <span className="name">{p.name}</span>
                    <span className="meta">
                      {p.civilization ?? `civ ${p.civilization_id}`} · {tr.viewer.team(p.team_id)}
                      {out && tr.viewer.resignedAt(formatTime(replay.resignedAt.get(p.number) ?? 0))}
                    </span>
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
        <span className="clock">
          {formatTime(t)} / {formatTime(replay.duration)}
        </span>
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
        <div className="zoom-buttons">
          <button type="button" onClick={() => zoom(1.25)} aria-label={tr.viewer.zoomIn} title={`${tr.viewer.zoomIn} (+)`}>
            +
          </button>
          <button type="button" onClick={() => zoom(0.8)} aria-label={tr.viewer.zoomOut} title={`${tr.viewer.zoomOut} (−)`}>
            −
          </button>
          <button
            type="button"
            onClick={() => {
              renderer.current?.fit();
              setFollowState(null);
              dirty.current = true;
            }}
            title={tr.viewer.fullMapTitle}
          >
            {tr.viewer.fullMap}
          </button>
        </div>
      </footer>
    </div>
  );
}
