"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatTime } from "@aoe2-replays/viewer";
import { PlayerSearch } from "@/components/PlayerSearch";
import { Uploader } from "@/components/Uploader";
import { useI18n } from "@/i18n/I18nProvider";
import { REPO_URL } from "@/i18n/messages";
import { listOwned, rememberOwned, type OwnedReplay } from "@/lib/owned";

const ROMAN = ["I", "II", "III"];

export default function Home() {
  const router = useRouter();
  const { t } = useI18n();
  const h = t.home;
  const [owned, setOwned] = useState<OwnedReplay[]>([]);

  // localStorage only exists in the browser, so read it after mount.
  useEffect(() => setOwned(listOwned()), []);

  return (
    <main className="page home">
      <section className="hero">
        <Image className="hero-art" src="/images/aoe/hero-batalla-1920.webp" alt="" fill priority sizes="100vw" />
        <div className="hero-content">
          <p className="eyebrow">{h.eyebrow}</p>
          <h1>{h.title}</h1>
          <p className="hero-lead">{h.lead}</p>
          <div className="hero-actions">
            <PlayerSearch size="large" />
            <span className="hero-or">{h.or}</span>
            <a className="button-primary" href="#upload">
              {h.uploadCta}
            </a>
          </div>
        </div>
        <p className="hero-credit">{h.artCredit}</p>
      </section>

      <section className="section container">
        <h2 className="section-title">{h.howTitle}</h2>
        <div className="ornament" aria-hidden="true">
          ◆
        </div>
        <ol className="steps">
          {h.steps.map((s, i) => (
            <li key={s.title} className="step">
              <span className="step-number" aria-hidden="true">
                {ROMAN[i]}
              </span>
              <h3>{s.title}</h3>
              <p className="muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section container narrow" id="upload">
        <h2 className="section-title">{h.uploadTitle}</h2>
        <div className="ornament" aria-hidden="true">
          ◆
        </div>
        <Uploader
          onUploaded={(r) => {
            rememberOwned({ ...r, createdAt: new Date().toISOString() });
            router.push(`/r/${r.id}`);
          }}
        />
        {owned.length > 0 && (
          <div className="owned">
            <h3>{h.ownedTitle}</h3>
            <ul>
              {owned.map((r) => (
                <li key={r.id}>
                  <Link href={`/r/${r.id}`}>{r.mapName ?? t.common.unknownMap}</Link>
                  <span className="muted">
                    {" "}
                    · {formatTime(r.durationMs)} · {new Date(r.createdAt).toLocaleDateString(t.common.dateLocale)} ·{" "}
                    {r.fileName}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="section container features">
        <h2 className="section-title">{h.featuresTitle}</h2>
        <div className="ornament" aria-hidden="true">
          ◆
        </div>
        <article className="feature">
          <Image
            className="feature-shot"
            src="/images/visor/cerca.webp"
            alt={h.features.close.alt}
            width={960}
            height={600}
          />
          <div>
            <h3>{h.features.close.title}</h3>
            <p>{h.features.close.text}</p>
          </div>
        </article>
        <article className="feature reverse">
          <Image
            className="feature-shot"
            src="/images/visor/mapa.webp"
            alt={h.features.map.alt}
            width={960}
            height={480}
          />
          <div>
            <h3>{h.features.map.title}</h3>
            <p>{h.features.map.text}</p>
          </div>
        </article>
        <article className="feature">
          <Image
            className="feature-shot"
            src="/images/visor/analisis.webp"
            alt={h.features.analysis.alt}
            width={960}
            height={600}
          />
          <div>
            <h3>{h.features.analysis.title}</h3>
            <p>{h.features.analysis.text}</p>
            <dl className="feature-stats">
              {h.statsCard.map((s) => (
                <div key={s.term}>
                  <dt>{s.term}</dt>
                  <dd>{s.text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </article>
        <article className="feature reverse">
          <div className="feature-card frame">
            <p className="ai-sample">
              <code>
                ## Per-player summary
                <br />| Player | APM | Feudal | Castle |
                <br />| P1 | 24 | 7:13 | 16:24 |
              </code>
            </p>
          </div>
          <div>
            <h3>{h.features.ai.title}</h3>
            <p>{h.features.ai.text}</p>
          </div>
        </article>
      </section>

      <section className="section container narrow">
        <h2 className="section-title">{h.faqTitle}</h2>
        <div className="ornament" aria-hidden="true">
          ◆
        </div>
        <div className="faq">
          {h.faq.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
        <p className="repo-cta">
          <a className="button-primary" href={REPO_URL}>
            GitHub
          </a>
        </p>
      </section>
    </main>
  );
}
