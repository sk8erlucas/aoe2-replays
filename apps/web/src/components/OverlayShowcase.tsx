"use client";

import { DemoVideo } from "@/components/DemoVideo";
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

  return (
    <article className="tool-showcase frame">
      <div className="tool-video">
        <DemoVideo src="/videos/aoe2-overlay-demo.mp4" poster="/videos/aoe2-overlay-demo.webp" label={o.videoLabel} />
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
