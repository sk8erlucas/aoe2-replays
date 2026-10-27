// Plain-text context about a match, meant to be pasted into an AI chat.
// The raw JSON is mostly map tiles and gaia objects, useless for questions
// about play, so this keeps players, analysis, build orders and commands.
import { analyze } from './analysis.js';
import { formatTime } from './engine.js';

// Commands without a decision worth reading in the summary.
const NOISE = new Set(['GAME', 'DE_TRANSFORM']);
const QUEUE_MERGE_MS = 60_000;

const objectName = (data, id) => data.legend?.objects?.[id]?.name ?? `#${id}`;
const techName = (data, id) => data.legend?.technologies?.[id] ?? `tech #${id}`;
const at = (e) => (e.x != null && e.y != null ? ` en (${Math.round(e.x)},${Math.round(e.y)})` : '');
const count = (e) => (e.object_ids?.length ? ` [${e.object_ids.length} unid.]` : '');

/** One readable line per command; null for commands not worth a line. */
function describe(data, e) {
  switch (e.type) {
    case 'BUILD': return `construye ${objectName(data, e.building_id)}${at(e)}`;
    case 'WALL': return `construye ${objectName(data, e.building_id)} de (${e.x},${e.y}) a (${e.x_end},${e.y_end})`;
    case 'DE_QUEUE': return `entrena ${e.amount}× ${objectName(data, e.unit_id)}`;
    case 'RESEARCH': return `investiga ${techName(data, e.technology_id)}`;
    case 'RESIGN': return 'abandona';
    case 'DE_TRIBUTE': {
      const parts = ['food', 'wood', 'gold', 'stone'].filter((k) => e[k] > 0).map((k) => `${Math.round(e[k])} ${{ food: 'comida', wood: 'madera', gold: 'oro', stone: 'piedra' }[k]}`);
      return `tributa ${parts.join(', ')} a J${e.target_player_id}`;
    }
    case 'MOVE': return `mueve${count(e)}${at(e)}`;
    case 'ORDER': return `ordena${count(e)}${e.target_id != null ? ` sobre objeto ${e.target_id}` : ''}${at(e)}`;
    case 'GATHER_POINT': return `punto de reunión${at(e)}`;
    case 'PATROL': return `patrulla${count(e)}${at(e)}`;
    case 'ATTACK_GROUND': return `ataca el suelo${count(e)}${at(e)}`;
    case 'DELETE': return `elimina${count(e)}`;
    case 'SELL': return `vende en el mercado`;
    case 'BUY': return `compra en el mercado`;
    case 'UNGARRISON': return `desguarnece${count(e)}`;
    case 'SPECIAL': return `habilidad especial${count(e)}`;
    default: return NOISE.has(e.type) ? null : `${e.type.toLowerCase()}${count(e)}${at(e)}`;
  }
}

function header(data) {
  const g = data.game;
  const teams = [...new Set(g.players.map((p) => p.team_id))].sort((a, b) => a - b);
  const lines = [
    '# Partida de Age of Empires II: Definitive Edition',
    '',
    'Contexto para analizar la partida. Los datos salen del replay, que guarda solo las órdenes de cada jugador.',
    'Exacto: quién dio cada orden y cuándo, qué construyó, entrenó e investigó, abandonos y chat.',
    'No incluido / estimado: posiciones exactas de las unidades, combates, recursos recolectados y cuándo terminó cada investigación.',
    'Tiempos en mm:ss de juego. Coordenadas en tiles del mapa (x, y). "J3" es el jugador 3.',
    '',
    '## Datos generales',
    `- Mapa: ${data.map.name ?? `#${data.map.id}`} (${data.map.size}×${data.map.size} tiles)`,
    `- Duración: ${formatTime(g.duration_ms)}`,
    `- Versión: ${g.game_version}, save ${g.save_version}${g.build ? `, build ${g.build}` : ''}`,
    `- Población máxima: ${g.population_limit}`,
    '',
    '## Jugadores',
  ];
  for (const team of teams) {
    lines.push(`Equipo ${team}:`);
    for (const p of g.players.filter((x) => x.team_id === team)) {
      const start = p.start ? `, empieza en (${Math.round(p.start.x)},${Math.round(p.start.y)})` : '';
      lines.push(`- J${p.number}: ${p.name} — ${p.civilization ?? `civ ${p.civilization_id}`}${p.is_ai ? ' (IA)' : ''}${start}`);
    }
  }
  return lines;
}

function analysisLines(data, analysis) {
  const lines = ['', '## Resumen por jugador', '| Jugador | APM | Feudal (clic) | Castillo (clic) | Imperial (clic) | Activo hasta |', '|---|---|---|---|---|---|'];
  for (const s of analysis.players) {
    const age = (key) => {
      const a = s.ageUps.find((u) => u.key === key);
      return a ? formatTime(a.clickedAt) : '—';
    };
    lines.push(`| J${s.number} | ${s.apm ?? '—'} | ${age('feudal')} | ${age('castle')} | ${age('imperial')} | ${formatTime(s.activeMs)} |`);
  }
  lines.push('', 'Llegada estimada a cada edad: clic + 130 s (Feudal), 160 s (Castillo), 190 s (Imperial), si no se canceló.');
  return lines;
}

// Build order with consecutive queues of the same unit merged.
function buildOrderLines(data) {
  const lines = ['', '## Build order por jugador'];
  for (const p of data.game.players) {
    lines.push('', `### J${p.number} ${p.name}`);
    let pending = null;
    const flush = () => {
      if (!pending) return;
      const span = pending.last > pending.t ? ` (hasta ${formatTime(pending.last)})` : '';
      lines.push(`- ${formatTime(pending.t)} entrena ${pending.amount}× ${pending.name}${span}`);
      pending = null;
    };
    for (const e of data.timeline) {
      if (e.player !== p.number) continue;
      if (e.type === 'DE_QUEUE') {
        const name = objectName(data, e.unit_id);
        if (pending && pending.name === name && e.t - pending.last <= QUEUE_MERGE_MS) {
          pending.amount += e.amount;
          pending.last = e.t;
        } else {
          flush();
          pending = { t: e.t, last: e.t, name, amount: e.amount };
        }
        continue;
      }
      if (!['BUILD', 'WALL', 'RESEARCH', 'RESIGN', 'DE_TRIBUTE'].includes(e.type)) continue;
      flush();
      lines.push(`- ${formatTime(e.t)} ${describe(data, e)}`);
    }
    flush();
  }
  return lines;
}

function chatLines(data) {
  if (!data.chat?.length) return [];
  const name = (n) => data.game.players.find((p) => p.number === n)?.name ?? `J${n}`;
  return ['', '## Chat', ...data.chat.map((c) => `- ${formatTime(c.t)} ${name(c.player)}: ${c.message}`)];
}

function commandLines(data) {
  const lines = ['', '## Todas las órdenes', 'Formato: tiempo, jugador, orden. Las órdenes sin unidades listadas repiten la selección anterior del jugador.'];
  for (const e of data.timeline) {
    const text = describe(data, e);
    if (text) lines.push(`${formatTime(e.t)} J${e.player} ${text}`);
  }
  return lines;
}

/**
 * Builds the context. `full` adds every command (much longer).
 * Returns the text and a rough token estimate (~4 characters per token).
 */
export function buildAiContext(data, { full = false } = {}) {
  const analysis = analyze(data);
  const lines = [
    ...header(data),
    ...analysisLines(data, analysis),
    ...buildOrderLines(data),
    ...chatLines(data),
    ...(full ? commandLines(data) : []),
    '',
    '---',
    'Preguntá lo que quieras sobre esta partida (por ejemplo: qué hizo distinto el ganador, cómo mejorar el build order de un jugador, en qué momento se definió).',
  ];
  const text = lines.join('\n');
  return { text, tokens: Math.round(text.length / 4) };
}
