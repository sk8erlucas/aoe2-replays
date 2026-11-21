"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";

// The game's soundtrack (public/music, see public/images/CREDITS.md). Never starts on
// its own: the files are only fetched after the first press of the button. Once on,
// it plays while the replay plays and pauses with it, keeping its place.
export const TRACKS = ["01", "02", "03", "04", "05", "06"].map((n) => `/music/track-${n}.m4a`);
const VOLUME_KEY = "viewer-music-volume";

function readVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    if (localStorage.getItem(VOLUME_KEY) !== null && v >= 0 && v <= 1) return v;
  } catch {
    // storage blocked: default volume
  }
  return 0.5;
}

/** Random order, a different one each visit. */
function shuffled<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function MusicControl({ playing }: { playing: boolean }) {
  const { t } = useI18n();
  const audio = useRef<HTMLAudioElement | null>(null);
  const order = useRef<string[]>([]);
  const index = useRef(0);
  const [on, setOn] = useState(false);
  const [volume, setVolume] = useState(readVolume);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    return () => {
      audio.current?.pause();
      audio.current = null;
    };
  }, []);

  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    const a = audio.current;
    if (!a || !on) return;
    if (playing) a.play().catch(() => setOn(false));
    else a.pause();
  }, [playing, on]);

  // play() is called inside the click so browsers (Safari) allow audio from then on;
  // with the replay paused it stops right away, muted, and waits for it.
  function start(a: HTMLAudioElement) {
    if (playingRef.current) {
      a.play().catch(() => setOn(false));
      return;
    }
    a.muted = true;
    a.play()
      .then(() => {
        if (!playingRef.current) a.pause();
      })
      .catch(() => {})
      .finally(() => {
        a.muted = false;
      });
  }

  function playCurrent() {
    const a = audio.current;
    if (!a) return;
    a.src = order.current[index.current];
    if (playingRef.current) a.play().catch(() => setOn(false));
  }

  function toggle() {
    if (on) {
      audio.current?.pause();
      setOn(false);
      return;
    }
    if (!audio.current) {
      const a = new Audio();
      a.preload = "auto";
      a.volume = volume;
      // At the end of a track (or if one fails to load), the next one.
      const next = () => {
        index.current = (index.current + 1) % order.current.length;
        playCurrent();
      };
      a.addEventListener("ended", next);
      a.addEventListener("error", next, { once: true });
      audio.current = a;
      order.current = shuffled(TRACKS);
      index.current = 0;
      a.src = order.current[0];
      start(a);
    } else {
      start(audio.current);
    }
    setOn(true);
  }

  function changeVolume(v: number) {
    setVolume(v);
    try {
      localStorage.setItem(VOLUME_KEY, String(v));
    } catch {
      // storage blocked: lasts this visit
    }
  }

  return (
    <div className="music-control">
      <button type="button" aria-pressed={on} onClick={toggle} title={on ? t.viewer.musicOffTitle : t.viewer.musicOnTitle}>
        <span aria-hidden="true">♪</span> {t.viewer.music}
      </button>
      {on && (
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          aria-label={t.viewer.musicVolume}
          onChange={(e) => changeVolume(Number(e.target.value))}
        />
      )}
    </div>
  );
}
