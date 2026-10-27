"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReplayData } from "@aoe2-replays/shared";
import { PLAYER_COLORS, Renderer, Replay, formatTime, type LogEntry } from "@aoe2-replays/viewer";

const SPEEDS = [1, 2, 4, 8, 16];

type Tooltip = { x: number; y: number; text: string } | null;

export function ReplayViewer({ data }: { data: ReplayData }) {
  const replay = useMemo(() => new Replay(data), [data]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const time = useRef(0);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const playingRef = useRef(false);
  const speedRef = useRef(2);

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [tooltip, setTooltip] = useState<Tooltip>(null);

  playingRef.current = playing;
  speedRef.current = speed;

  const playerName = (n: number | null) => (n == null ? "" : replay.playerByNumber.get(n)?.name ?? "Gaia");
  const playerColor = (n: number | null) => {
    const p = n == null ? undefined : replay.playerByNumber.get(n);
    return p ? PLAYER_COLORS[p.color_id] : undefined;
  };

  // Draw the current frame and refresh what React shows (clock, tooltip).
  const draw = () => {
    const r = renderer.current;
    if (!r) return;
    const state = replay.stateAt(time.current);
    r.draw(state);
    setT(time.current);
    const hit = pointer.current && r.pick(state, pointer.current.x, pointer.current.y);
    if (!hit || !pointer.current) {
      setTooltip(null);
      return;
    }
    const obj = hit.kind === "unit" ? hit.unit : hit.building;
    const parts = [obj.typeId != null ? replay.objectName(obj.typeId) : "Unidad", playerName(obj.player)];
    if (hit.kind === "building" && hit.progress < 1) parts.push(`${Math.round(hit.progress * 100)}% construido`);
    if (hit.kind === "unit" && hit.unit.approx) parts.push("posición aproximada");
    setTooltip({ x: pointer.current.x, y: pointer.current.y, text: parts.join(" · ") });
  };

  useEffect(() => {
    const el = canvas.current!;
    const r = new Renderer(el, replay);
    renderer.current = r;
    time.current = 0;
    r.resize();
    r.fit();
    draw();

    const onResize = () => {
      r.resize();
      draw();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      r.zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
      draw();
    };
    window.addEventListener("resize", onResize);
    el.addEventListener("wheel", onWheel, { passive: false });

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      if (playingRef.current) {
        time.current = Math.min(replay.duration, time.current + (now - last) * speedRef.current);
        if (time.current >= replay.duration) setPlaying(false);
        draw();
      }
      last = now;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      el.removeEventListener("wheel", onWheel);
      renderer.current = null;
    };
    // draw only reads refs and the replay, so it is safe to leave out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowRight") seek(time.current + 5000);
      else if (e.code === "ArrowLeft") seek(time.current - 5000);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function seek(ms: number) {
    time.current = Math.max(0, Math.min(replay.duration, ms));
    draw();
  }

  function togglePlay() {
    if (!playing && time.current >= replay.duration) time.current = 0;
    setPlaying(!playing);
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
      <p className="viewer-info muted">
        {data.map.name ?? `Mapa #${data.map.id}`} · {g.players.length} jugadores en {teams} equipos ·{" "}
        {formatTime(replay.duration)} · {g.game_version} (save {g.save_version})
        {g.untested_version && " · versión no probada, puede haber errores"}
      </p>

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
                renderer.current.pan(e.clientX - drag.current.x, e.clientY - drag.current.y);
                drag.current = { x: e.clientX, y: e.clientY };
              }
              if (!playingRef.current) draw();
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerLeave={() => {
              pointer.current = null;
              if (!playingRef.current) draw();
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
          <h2>Eventos</h2>
          <ol className="log">
            {logItems.map((e: LogEntry, i: number) => (
              <li key={`${e.t}-${i}`}>
                <span className="time">{formatTime(e.t)}</span>
                <span className={e.kind}>
                  <span className="who" style={{ color: playerColor(e.player) }}>
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
        <button
          type="button"
          onClick={() => {
            renderer.current?.fit();
            draw();
          }}
        >
          Encuadrar
        </button>
      </footer>
    </div>
  );
}
