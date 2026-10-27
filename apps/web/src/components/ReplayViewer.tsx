"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReplayData } from "@aoe2-replays/shared";
import {
  PLAYER_COLORS,
  Renderer,
  Replay,
  formatTime,
  type FollowMode,
  type LogEntry,
  type State,
} from "@aoe2-replays/viewer";
import { AiContextPanel } from "@/components/AiContextPanel";
import { AnalysisPanel } from "@/components/AnalysisPanel";

const SPEEDS = [1, 2, 4, 8, 16];

type Tooltip = { x: number; y: number; text: string } | null;

export function ReplayViewer({ data, actions }: { data: ReplayData; actions?: React.ReactNode }) {
  const replay = useMemo(() => new Replay(data), [data]);
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
  const [tab, setTab] = useState<"events" | "analysis" | "ai">("events");

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

  function tooltipFor(state: State): Tooltip {
    const r = renderer.current;
    const at = pointer.current;
    const hit = r && at && r.pick(state, at.x, at.y);
    if (!hit || !at) return null;
    const obj = hit.kind === "unit" ? hit.unit : hit.building;
    const parts = [obj.typeId != null ? replay.objectName(obj.typeId) : "Unidad", playerName(obj.player)];
    if (hit.kind === "building" && hit.progress < 1) parts.push(`${Math.round(hit.progress * 100)}% construido`);
    if (hit.kind === "unit" && hit.unit.approx) parts.push("posición aproximada");
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
    dirty.current = true;

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
  const g = data.game;
  const teams = new Set(g.players.map((p) => p.team_id)).size;

  return (
    <div className="viewer">
      <div className="viewer-info">
        <p className="muted">
          {data.map.name ?? `Mapa #${data.map.id}`} · {g.players.length} jugadores en {teams} equipos ·{" "}
          {formatTime(replay.duration)} · {g.game_version} (save {g.save_version})
          {g.untested_version && " · versión no probada, puede haber errores"}
        </p>
        {actions}
      </div>

      <div className="viewer-body">
        <section className="stage">
          <canvas
            ref={canvas}
            aria-label="Mapa de la partida"
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
            aria-label="Minimapa: clic para mover la cámara"
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
          <h2>Jugadores</h2>
          <ul className="players">
            {players.map((p) => {
              const out = resigned.has(p.number);
              return (
                <li key={p.number} className={out ? "resigned" : ""}>
                  <span className="swatch" style={{ background: PLAYER_COLORS[p.color_id] ?? "#fff" }} />
                  <span className="name" title={p.name}>
                    {p.name}
                  </span>
                  <span className="meta">
                    {p.civilization ?? `civ ${p.civilization_id}`} · E{p.team_id}
                    {out && ` · abandonó ${formatTime(replay.resignedAt.get(p.number) ?? 0)}`}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="tabs" role="tablist">
            {(["events", "analysis", "ai"] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={tab === key ? "active" : ""}
                onClick={() => setTab(key)}
              >
                {{ events: "Eventos", analysis: "Análisis", ai: "IA" }[key]}
              </button>
            ))}
          </div>
          {tab === "analysis" && <AnalysisPanel data={data} onSeek={seek} />}
          {tab === "ai" && <AiContextPanel data={data} />}
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
                  {e.kind === "chat" ? `: “${e.text}”` : ` ${e.text}`}
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      <footer className="controls">
        <button type="button" className="play" onClick={togglePlay} aria-label={playing ? "Pausar" : "Reproducir"}>
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
          aria-label="Tiempo"
          onChange={(e) => seek(Number(e.target.value))}
        />
        <label>
          Velocidad{" "}
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
        <label>
          Cámara{" "}
          <select
            value={follow === null ? "free" : String(follow)}
            onChange={(e) => {
              const v = e.target.value;
              setFollow(v === "free" ? null : v === "auto" ? "auto" : Number(v));
            }}
          >
            <option value="auto">Auto (sigue la acción)</option>
            <option value="free">Libre</option>
            {players.map((p) => (
              <option key={p.number} value={p.number}>
                Seguir a {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="zoom-buttons">
          <button type="button" onClick={() => zoom(1.25)} aria-label="Acercar" title="Acercar (+)">
            +
          </button>
          <button type="button" onClick={() => zoom(0.8)} aria-label="Alejar" title="Alejar (−)">
            −
          </button>
          <button
            type="button"
            onClick={() => {
              renderer.current?.fit();
              setFollowState(null);
              dirty.current = true;
            }}
            title="Ver el mapa completo"
          >
            Mapa
          </button>
        </div>
      </footer>
    </div>
  );
}
