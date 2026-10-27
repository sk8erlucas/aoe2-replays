"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

type Hit = { profileId: number; name: string; country: string | null; clan: string | null; games: number };

export function PlayerSearch({ size = "small", autoFocus = false }: { size?: "small" | "large"; autoFocus?: boolean }) {
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const box = useRef<HTMLDivElement>(null);

  // Debounced search; the latest query wins.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setHits([]);
      setState("idle");
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setState("loading");
      try {
        const res = await fetch(`/api/players/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message);
        setHits(json.profiles ?? []);
        setActive(-1);
        setState("idle");
      } catch (err) {
        if ((err as Error).name !== "AbortError") setState("error");
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  function go(hit: Hit) {
    setOpen(false);
    setQ("");
    router.push(`/p/${hit.profileId}`);
  }

  const showList = open && q.trim().length >= 2;

  return (
    <div className={`player-search ${size}`} ref={box}>
      <input
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        placeholder="Buscá un jugador…"
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(hits.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(-1, i - 1));
          } else if (e.key === "Enter") {
            const hit = hits[active >= 0 ? active : 0];
            if (hit) go(hit);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {showList && (
        <ul className="search-results" id={listId} role="listbox">
          {state === "loading" && hits.length === 0 && <li className="search-note">Buscando…</li>}
          {state === "error" && <li className="search-note">La búsqueda no responde. Probá en un rato.</li>}
          {state === "idle" && hits.length === 0 && <li className="search-note">Sin resultados.</li>}
          {hits.map((h, i) => (
            <li
              key={h.profileId}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onPointerDown={(e) => {
                e.preventDefault();
                go(h);
              }}
              onPointerEnter={() => setActive(i)}
            >
              <span className="search-name">
                {h.clan && <span className="search-clan">[{h.clan}] </span>}
                {h.name}
              </span>
              <span className="search-meta">
                {[h.country?.toUpperCase(), `${h.games.toLocaleString("es")} partidas`].filter(Boolean).join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
