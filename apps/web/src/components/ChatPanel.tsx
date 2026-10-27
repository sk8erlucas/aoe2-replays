"use client";

import type { ReplayData } from "@aoe2-replays/shared";
import { PLAYER_COLORS, formatTime } from "@aoe2-replays/viewer";

// Chat is user content: it is only ever rendered as text.
export function ChatPanel({ data, t, onSeek }: { data: ReplayData; t: number; onSeek: (ms: number) => void }) {
  const players = new Map(data.game.players.map((p) => [p.number, p]));
  const chat = data.chat ?? [];

  if (chat.length === 0) return <p className="muted">Nadie escribió en el chat durante esta partida.</p>;

  return (
    <ol className="log chat-log">
      {chat.map((c, i) => {
        const p = c.player == null ? undefined : players.get(c.player);
        return (
          <li key={i} className={c.t > t ? "future" : ""}>
            <button type="button" className="time link" onClick={() => onSeek(c.t)} title="Ir a este momento">
              {formatTime(c.t)}
            </button>
            <span>
              <span className="who">
                {p && <span className="swatch" style={{ background: PLAYER_COLORS[p.color_id] }} aria-hidden="true" />}
                {p?.name ?? "Sistema"}
              </span>
              {c.channel != null && c.channel !== 0 && <span className="muted small"> (equipo)</span>}
              <span className="chat-text">{c.message}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
