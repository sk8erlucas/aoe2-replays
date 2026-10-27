"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatTime } from "@aoe2-replays/viewer";
import { PlayerSearch } from "@/components/PlayerSearch";
import { Uploader } from "@/components/Uploader";
import { listOwned, rememberOwned, type OwnedReplay } from "@/lib/owned";

const STEPS = [
  {
    title: "Elegí la partida",
    text: "Subí el archivo .aoe2record o buscá a un jugador y abrí cualquiera de sus partidas online.",
  },
  {
    title: "La leemos",
    text: "Extraemos el mapa, los jugadores y cada orden que dieron: construir, entrenar, investigar, mover.",
  },
  {
    title: "Mirala y analizala",
    text: "Reproducila en el mapa con la cámara siguiendo la acción, y revisá build orders, APM y avances de edad.",
  },
];

const FAQ = [
  {
    q: "¿Dónde encuentro mis replays?",
    a: "En Windows: Usuarios\\<vos>\\Games\\Age of Empires 2 DE\\<id de tu cuenta>\\savegame. Son los archivos .aoe2record. Para partidas online no hace falta: buscá tu nombre arriba.",
  },
  {
    q: "¿Es exactamente lo que pasó en la partida?",
    a: "El replay guarda las órdenes de cada jugador, no las posiciones de las unidades. Las órdenes, los tiempos y las construcciones son exactos; el recorrido de las unidades, la tala de árboles y la llegada a cada edad son estimaciones. Lo aproximado está marcado.",
  },
  {
    q: "¿Quién puede ver lo que subo?",
    a: "Nadie más que vos, hasta que lo hagas público. Guardamos los datos de la partida (no el archivo) y se borran solos después de 30 días. Las partidas online son públicas por naturaleza.",
  },
  {
    q: "¿Qué versiones del juego funcionan?",
    a: "Age of Empires II: Definitive Edition, versiones recientes. Si una actualización del juego cambia el formato, puede fallar hasta que actualicemos el lector.",
  },
  {
    q: "¿Es gratis? ¿Puedo colaborar?",
    a: "Sí y sí: es un proyecto de fans, de código abierto. Las mejoras llegan por pull requests en GitHub.",
  },
];

export default function Home() {
  const router = useRouter();
  const [owned, setOwned] = useState<OwnedReplay[]>([]);

  // localStorage only exists in the browser, so read it after mount.
  useEffect(() => setOwned(listOwned()), []);

  return (
    <main className="page home">
      <section className="hero">
        <Image
          className="hero-art"
          src="/images/aoe/hero-batalla-1920.webp"
          alt=""
          fill
          priority
          sizes="100vw"
        />
        <div className="hero-content">
          <p className="eyebrow">Visor y análisis de partidas</p>
          <h1>Reviví tus partidas de Age of Empires II</h1>
          <p className="hero-lead">
            Mirá cualquier partida en el mapa, como si estuvieras en el juego, y entendé qué hizo cada jugador y
            cuándo.
          </p>
          <div className="hero-actions">
            <PlayerSearch size="large" />
            <span className="hero-or">o</span>
            <a className="button-primary" href="#subir">
              Subir un replay
            </a>
          </div>
        </div>
        <p className="hero-credit">Arte: Age of Empires II: Definitive Edition © Microsoft</p>
      </section>

      <section className="section container">
        <h2 className="section-title">Cómo funciona</h2>
        <div className="ornament" aria-hidden="true">
          ◆
        </div>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="step">
              <span className="step-number" aria-hidden="true">
                {["I", "II", "III"][i]}
              </span>
              <h3>{s.title}</h3>
              <p className="muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section container narrow" id="subir">
        <h2 className="section-title">Subí tu replay</h2>
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
            <h3>Tus replays en este navegador</h3>
            <ul>
              {owned.map((r) => (
                <li key={r.id}>
                  <Link href={`/r/${r.id}`}>{r.mapName ?? "Mapa desconocido"}</Link>
                  <span className="muted">
                    {" "}
                    · {formatTime(r.durationMs)} · {new Date(r.createdAt).toLocaleDateString("es")} · {r.fileName}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="section container features">
        <h2 className="section-title">Qué podés hacer</h2>
        <div className="ornament" aria-hidden="true">
          ◆
        </div>
        <article className="feature">
          <Image
            className="feature-shot"
            src="/images/visor/cerca.webp"
            alt="Vista cercana del visor: edificios, bosque, oro y aldeanos"
            width={960}
            height={640}
          />
          <div>
            <h3>Mirala como en el juego</h3>
            <p>
              Vista isométrica con relieve, edificios que se levantan, aldeanos que van a talar y recolectar, y bosques
              que se van achicando. La cámara sigue la acción sola, o elegís seguir a un jugador.
            </p>
          </div>
        </article>
        <article className="feature reverse">
          <Image
            className="feature-shot"
            src="/images/visor/mapa.webp"
            alt="Mapa completo de una partida de ocho jugadores en vista isométrica"
            width={960}
            height={463}
          />
          <div>
            <h3>Todo el mapa de un vistazo</h3>
            <p>
              Alejate para ver cómo se reparte el mapa, usá el minimapa para saltar a cualquier lugar y la línea de
              tiempo para ir a cualquier momento.
            </p>
          </div>
        </article>
        <article className="feature">
          <div className="feature-card frame">
            <dl className="feature-stats">
              <div>
                <dt>APM</dt>
                <dd>acciones por minuto de cada jugador</dd>
              </div>
              <div>
                <dt>Feudal · Castillo · Imperial</dt>
                <dd>cuándo hizo clic en cada edad</dd>
              </div>
              <div>
                <dt>Build order</dt>
                <dd>qué construyó, entrenó e investigó, en orden</dd>
              </div>
            </dl>
          </div>
          <div>
            <h3>Analizá a cada jugador</h3>
            <p>
              Comparalos lado a lado, mirá la actividad de cada uno a lo largo de la partida y saltá al momento exacto
              de cada decisión desde el build order.
            </p>
          </div>
        </article>
      </section>

      <section className="section container narrow">
        <h2 className="section-title">Preguntas frecuentes</h2>
        <div className="ornament" aria-hidden="true">
          ◆
        </div>
        <div className="faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
