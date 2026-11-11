"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/i18n/I18nProvider";

const OVERLAY_SITE = "https://aoe2overlay.sitemaster.com.ar";
const OVERLAY_REPO = "https://github.com/sk8erlucas/aoe2-overlay";

// Tagged so the overlay's site can tell the visits that come from here.
function tracked(path: string, placement: string) {
  return `${OVERLAY_SITE}${path}?utm_source=aoe2-replays&utm_medium=referral&utm_campaign=${placement}`;
}

/** The AoE2 Overlay (a sibling project) with its demo video. `placement` tags the links: "home" or "tools". */
export function OverlayShowcase({ placement }: { placement: "home" | "tools" }) {
  const { t } = useI18n();
  const o = t.tools.overlay;
  const video = useRef<HTMLVideoElement>(null);

  // Plays only while on screen (the file is fetched then, not with the page), and
  // never on its own for people who ask for reduced motion: they get the controls.
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
    <article className="tool-showcase frame">
      <div className="tool-video">
        <video
          ref={video}
          src="/videos/aoe2-overlay-demo.mp4"
          poster="/videos/aoe2-overlay-demo.webp"
          width={1280}
          height={720}
          muted
          loop
          playsInline
          controls
          preload="none"
          aria-label={o.videoLabel}
        />
        {o.videoLang && <p className="muted small">{o.videoLang}</p>}
      </div>
      <div className="tool-body">
        <h3>{o.name}</h3>
        <p className="tool-tagline">{o.tagline}</p>
        <ul className="tool-points">
          {o.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <p className="muted small">{o.safe}</p>
        <div className="tool-actions">
          <a className="button-primary" href={tracked("/descargar", placement)}>
            {o.download}
          </a>
          <a className="button-secondary" href={tracked("/estrategias", placement)}>
            {o.strategies}
          </a>
          <a href={OVERLAY_REPO}>{o.source}</a>
        </div>
        <p className="muted small">{o.platform}</p>
      </div>
    </article>
  );
}
