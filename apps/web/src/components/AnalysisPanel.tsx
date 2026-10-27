"use client";

import { useMemo, useState } from "react";
import type { Player, ReplayData } from "@aoe2-replays/shared";
import { AGES, PLAYER_COLORS, analyze, formatTime, type PlayerAnalysis } from "@aoe2-replays/viewer";

const KIND_LABEL = { build: "construye", queue: "entrena", research: "investiga", age: "avanza a" } as const;

function ActivityChart({
  player,
  stats,
  bucketMs,
  max,
}: {
  player: Player;
  stats: PlayerAnalysis;
  bucketMs: number;
  max: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = stats.activity.length;
  const h = 28;
  const color = PLAYER_COLORS[player.color_id] ?? "#888";
  const hovered = hover == null ? null : stats.activity[hover];

  return (
    <div className="activity-row">
      <div className="activity-label">
        <span className="name" title={player.name}>
          {player.name}
        </span>
        <span className="muted small">
          {hover == null
            ? `${stats.actions} acciones`
            : `${formatTime(hover * bucketMs)}–${formatTime((hover + 1) * bucketMs)} · ${hovered} acciones`}
        </span>
      </div>
      <svg
        className="activity-chart"
        viewBox={`0 0 ${n * 10} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Acciones de ${player.name} cada ${bucketMs / 1000} segundos`}
        onMouseLeave={() => setHover(null)}
      >
        {stats.activity.map((count, i) => {
          const bh = max > 0 ? Math.max(count > 0 ? 2 : 0, (count / max) * h) : 0;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              {/* Full-height hit target, larger than the bar. */}
              <rect x={i * 10} y={0} width={10} height={h} fill="transparent" />
              <rect
                x={i * 10 + 1}
                y={h - bh}
                width={8}
                height={bh}
                fill={color}
                opacity={hover == null || hover === i ? 1 : 0.45}
              />
            </g>
          );
        })}
        <line x1={0} x2={n * 10} y1={h - 0.5} y2={h - 0.5} className="activity-baseline" />
      </svg>
    </div>
  );
}

export function AnalysisPanel({ data, onSeek }: { data: ReplayData; onSeek: (ms: number) => void }) {
  const analysis = useMemo(() => analyze(data), [data]);
  const players = useMemo(
    () => [...data.game.players].sort((a, b) => a.team_id - b.team_id || a.number - b.number),
    [data],
  );
  const byNumber = new Map(analysis.players.map((p) => [p.number, p]));
  const max = Math.max(0, ...analysis.players.flatMap((p) => p.activity));
  const [selected, setSelected] = useState(players[0]?.number ?? 1);
  const selectedStats = byNumber.get(selected);

  return (
    <div className="analysis">
      <table className="stats">
        <colgroup>
          <col />
          <col className="apm" />
          {AGES.map((a) => (
            <col key={a.key} className="num" />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Jugador</th>
            <th scope="col" title="Acciones por minuto mientras jugó">
              APM
            </th>
            {AGES.map((a) => (
              <th key={a.key} scope="col" title={`Clic en ${a.label} (llegada estimada en el tooltip)`}>
                {a.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const s = byNumber.get(p.number);
            return (
              <tr key={p.number}>
                <th scope="row">
                  <span className="swatch" style={{ background: PLAYER_COLORS[p.color_id] ?? "#fff" }} />
                  <span title={p.name}>{p.name}</span>
                </th>
                <td>{s?.apm ?? "—"}</td>
                {AGES.map((a) => {
                  const up = s?.ageUps.find((u) => u.key === a.key);
                  return (
                    <td key={a.key} title={up ? `Llegada estimada: ${formatTime(up.reachedAt)}` : undefined}>
                      {up ? formatTime(up.clickedAt) : "—"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Actividad</h2>
      <p className="muted small">Acciones cada {analysis.bucketMs / 1000} s, misma escala para todos.</p>
      {players.map((p) => {
        const s = byNumber.get(p.number);
        return s ? <ActivityChart key={p.number} player={p} stats={s} bucketMs={analysis.bucketMs} max={max} /> : null;
      })}

      <h2>Build order</h2>
      <select value={selected} onChange={(e) => setSelected(Number(e.target.value))} aria-label="Jugador">
        {players.map((p) => (
          <option key={p.number} value={p.number}>
            {p.name}
          </option>
        ))}
      </select>
      {selectedStats && selectedStats.trained.length > 0 && (
        <p className="muted small">
          Encolado: {selectedStats.trained.map((t) => `${t.amount}× ${t.name}`).join(", ")}
        </p>
      )}
      <ol className="log build-order">
        {selectedStats?.buildOrder.length === 0 && <li className="muted">Sin construcciones ni investigaciones.</li>}
        {selectedStats?.buildOrder.map((b, i) => (
          <li key={i}>
            <button type="button" className="time link" onClick={() => onSeek(b.t)} title="Ir a este momento">
              {formatTime(b.t)}
            </button>
            <span className={b.kind}>
              {KIND_LABEL[b.kind]} {b.amount && b.amount > 1 ? `${b.amount}× ` : ""}
              {b.name}
            </span>
          </li>
        ))}
      </ol>

      <p className="muted small footnote">
        Exacto: cuándo se dio cada orden. Estimado: la llegada a cada edad (clic + tiempo de investigación). APM excluye
        comandos automáticos y se calcula hasta que el jugador abandona.
      </p>
    </div>
  );
}
