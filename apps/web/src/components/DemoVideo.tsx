"use client";

import { useEffect, useRef } from "react";

/**
 * A muted demo video that plays only while on screen (the file is fetched then,
 * not with the page) and never on its own for people who ask for reduced motion:
 * they get the controls.
 */
export function DemoVideo({ src, poster, label }: { src: string; poster: string; label: string }) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = video.current;
    if (!v || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.4 },
    );
    seen.observe(v);
    return () => seen.disconnect();
  }, []);

  return (
    <video
      ref={video}
      key={src}
      src={src}
      poster={poster}
      width={1280}
      height={720}
      muted
      loop
      playsInline
      controls
      preload="none"
      aria-label={label}
    />
  );
}
