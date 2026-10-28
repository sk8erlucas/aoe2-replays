// Plain-text context about a match, meant to be pasted into an AI chat.
// The raw JSON is mostly map tiles and gaia objects, useless for questions
// about play, so this keeps players, analysis, build orders and commands.
import { analyze } from './analysis.js';
import { formatTime } from './engine.js';

// Commands without a decision worth reading in the summary.
const NOISE = new Set(['GAME', 'DE_TRANSFORM']);
const QUEUE_MERGE_MS = 60_000;

const STRINGS = {
  es: {
    title: '# Partida de Age of Empires II: Definitive Edition',
    intro: [
      'Contexto para analizar la partida. Los datos salen del replay, que guarda solo las órdenes de cada jugador.',
      'Exacto: quién dio cada orden y cuándo, qué construyó, entrenó e investigó, abandonos y chat.',
      'No incluido / estimado: posiciones exactas de las unidades, combates, recursos recolectados y cuándo terminó cada investigación.',
      'Tiempos en mm:ss de juego. Coordenadas en tiles del mapa (x, y). "J3" es el jugador 3.',
    ],
    general: '## Datos generales',
    map: (name, size) => `- Mapa: ${name} (${size}×${size} tiles)`,
    duration: (d) => `- Duración: ${d}`,
    version: (v) => `- Versión: ${v}`,
    pop: (n) => `- Población máxima: ${n}`,
    players: '## Jugadores',
    team: (n) => `Equipo ${n}:`,
    starts: (x, y) => `, empieza en (${x},${y})`,
    ai: ' (IA)',
    summary: '## Resumen por jugador',
    tableHead: '| Jugador | APM | Feudal (clic) | Castillo (clic) | Imperial (clic) | Activo hasta |',
    ageNote: 'Llegada estimada a cada edad: clic + 130 s (Feudal), 160 s (Castillo), 190 s (Imperial), si no se canceló.',
    buildOrder: '## Build order por jugador',
    trains: (amount, name) => `entrena ${amount}× ${name}`,
    until: (t) => ` (hasta ${t})`,
    chat: '## Chat',
    commands: '## Todas las órdenes',
    commandsNote: 'Formato: tiempo, jugador, orden. Las órdenes sin unidades listadas repiten la selección anterior del jugador.',
    outro: 'Preguntá lo que quieras sobre esta partida (por ejemplo: qué hizo distinto el ganador, cómo mejorar el build order de un jugador, en qué momento se definió).',
    player: 'J',
    units: (n) => ` [${n} unid.]`,
    at: (x, y) => ` en (${x},${y})`,
    build: (name) => `construye ${name}`,
    wall: (name, x1, y1, x2, y2) => `construye ${name} de (${x1},${y1}) a (${x2},${y2})`,
    research: (name) => `investiga ${name}`,
    resign: 'abandona',
    tribute: (parts, to) => `tributa ${parts} a J${to}`,
    resources: { food: 'comida', wood: 'madera', gold: 'oro', stone: 'piedra' },
    move: 'mueve',
    order: 'ordena',
    onObject: (id) => ` sobre objeto ${id}`,
    gather: 'punto de reunión',
    patrol: 'patrulla',
    attackGround: 'ataca el suelo',
    del: 'elimina',
    sell: 'vende en el mercado',
    buy: 'compra en el mercado',
    ungarrison: 'desguarnece',
    special: 'habilidad especial',
  },
  en: {
    title: '# Age of Empires II: Definitive Edition match',
    intro: [
      'Context to analyze this match. The data comes from the replay, which stores only each player\'s commands.',
      'Exact: who gave each command and when, what they built, trained and researched, resignations and chat.',
      'Not included / estimated: exact unit positions, fights, resources gathered and when each research finished.',
      'Times in game mm:ss. Coordinates in map tiles (x, y). "P3" is player 3.',
    ],
    general: '## Overview',
    map: (name, size) => `- Map: ${name} (${size}×${size} tiles)`,
    duration: (d) => `- Duration: ${d}`,
    version: (v) => `- Version: ${v}`,
    pop: (n) => `- Population limit: ${n}`,
    players: '## Players',
    team: (n) => `Team ${n}:`,
    starts: (x, y) => `, starts at (${x},${y})`,
    ai: ' (AI)',
    summary: '## Per-player summary',
    tableHead: '| Player | APM | Feudal (click) | Castle (click) | Imperial (click) | Active until |',
    ageNote: 'Estimated arrival in each age: click + 130 s (Feudal), 160 s (Castle), 190 s (Imperial), unless cancelled.',
    buildOrder: '## Build order per player',
    trains: (amount, name) => `trains ${amount}× ${name}`,
    until: (t) => ` (until ${t})`,
    chat: '## Chat',
    commands: '## All commands',
    commandsNote: 'Format: time, player, command. Commands without listed units reuse the player\'s previous selection.',
    outro: 'Ask anything about this match (for example: what the winner did differently, how to improve a player\'s build order, when the game was decided).',
    player: 'P',
    units: (n) => ` [${n} units]`,
    at: (x, y) => ` at (${x},${y})`,
    build: (name) => `builds ${name}`,
    wall: (name, x1, y1, x2, y2) => `builds ${name} from (${x1},${y1}) to (${x2},${y2})`,
    research: (name) => `researches ${name}`,
    resign: 'resigns',
    tribute: (parts, to) => `tributes ${parts} to P${to}`,
    resources: { food: 'food', wood: 'wood', gold: 'gold', stone: 'stone' },
    move: 'moves',
    order: 'orders',
    onObject: (id) => ` on object ${id}`,
    gather: 'gather point',
    patrol: 'patrols',
    attackGround: 'attacks ground',
    del: 'deletes',
    sell: 'sells at the market',
    buy: 'buys at the market',
    ungarrison: 'ungarrisons',
    special: 'special ability',
  },
};

const objectName = (data, id) => data.legend?.objects?.[id]?.name ?? `#${id}`;
const techName = (data, id) => data.legend?.technologies?.[id] ?? `tech #${id}`;

/** One readable line per command; null for commands not worth a line. */
function describe(S, data, e) {
  const at = e.x != null && e.y != null ? S.at(Math.round(e.x), Math.round(e.y)) : '';
  const count = e.object_ids?.length ? S.units(e.object_ids.length) : '';
  switch (e.type) {
    case 'BUILD': return `${S.build(objectName(data, e.building_id))}${at}`;
    case 'WALL': return S.wall(objectName(data, e.building_id), e.x, e.y, e.x_end, e.y_end);
    case 'DE_QUEUE': return S.trains(e.amount, objectName(data, e.unit_id));
    case 'RESEARCH': return S.research(techName(data, e.technology_id));
    case 'RESIGN': return S.resign;
    case 'DE_TRIBUTE': {
      const parts = ['food', 'wood', 'gold', 'stone'].filter((k) => e[k] > 0).map((k) => `${Math.round(e[k])} ${S.resources[k]}`);
      return S.tribute(parts.join(', '), e.target_player_id);
    }
    case 'MOVE': return `${S.move}${count}${at}`;
    case 'ORDER': return `${S.order}${count}${e.target_id != null ? S.onObject(e.target_id) : ''}${at}`;
    case 'GATHER_POINT': return `${S.gather}${at}`;
    case 'PATROL': return `${S.patrol}${count}${at}`;
    case 'ATTACK_GROUND': return `${S.attackGround}${count}${at}`;
    case 'DELETE': return `${S.del}${count}`;
    case 'SELL': return S.sell;
    case 'BUY': return S.buy;
    case 'UNGARRISON': return `${S.ungarrison}${count}`;
    case 'SPECIAL': return `${S.special}${count}`;
    default: return NOISE.has(e.type) ? null : `${e.type.toLowerCase()}${count}${at}`;
  }
}

function header(S, data) {
  const g = data.game;
  const teams = [...new Set(g.players.map((p) => p.team_id))].sort((a, b) => a - b);
  const lines = [
    S.title,
    '',
    ...S.intro,
    '',
    S.general,
    S.map(data.map.name ?? `#${data.map.id}`, data.map.size),
    S.duration(formatTime(g.duration_ms)),
    S.version(`${g.game_version}, save ${g.save_version}${g.build ? `, build ${g.build}` : ''}`),
    S.pop(g.population_limit),
    '',
    S.players,
  ];
  for (const team of teams) {
    lines.push(S.team(team));
    for (const p of g.players.filter((x) => x.team_id === team)) {
      const start = p.start ? S.starts(Math.round(p.start.x), Math.round(p.start.y)) : '';
      lines.push(`- ${S.player}${p.number}: ${p.name} — ${p.civilization ?? `civ ${p.civilization_id}`}${p.is_ai ? S.ai : ''}${start}`);
    }
  }
  return lines;
}

function analysisLines(S, analysis) {
  const lines = ['', S.summary, S.tableHead, '|---|---|---|---|---|---|'];
  for (const s of analysis.players) {
    const age = (key) => {
      const a = s.ageUps.find((u) => u.key === key);
      return a ? formatTime(a.clickedAt) : '—';
    };
    lines.push(`| ${S.player}${s.number} | ${s.apm ?? '—'} | ${age('feudal')} | ${age('castle')} | ${age('imperial')} | ${formatTime(s.activeMs)} |`);
  }
  lines.push('', S.ageNote);
  return lines;
}

// Build order with consecutive queues of the same unit merged.
function buildOrderLines(S, data) {
  const lines = ['', S.buildOrder];
  for (const p of data.game.players) {
    lines.push('', `### ${S.player}${p.number} ${p.name}`);
    let pending = null;
    const flush = () => {
      if (!pending) return;
      const span = pending.last > pending.t ? S.until(formatTime(pending.last)) : '';
      lines.push(`- ${formatTime(pending.t)} ${S.trains(pending.amount, pending.name)}${span}`);
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
      lines.push(`- ${formatTime(e.t)} ${describe(S, data, e)}`);
    }
    flush();
  }
  return lines;
}

function chatLines(S, data) {
  if (!data.chat?.length) return [];
  const name = (n) => data.game.players.find((p) => p.number === n)?.name ?? `${S.player}${n}`;
  return ['', S.chat, ...data.chat.map((c) => `- ${formatTime(c.t)} ${name(c.player)}: ${c.message}`)];
}

function commandLines(S, data) {
  const lines = ['', S.commands, S.commandsNote];
  for (const e of data.timeline) {
    const text = describe(S, data, e);
    if (text) lines.push(`${formatTime(e.t)} ${S.player}${e.player} ${text}`);
  }
  return lines;
}

/**
 * Builds the context in `locale` ('es' or 'en'). `full` adds every command
 * (much longer). Returns the text and a rough token estimate (~4 characters per token).
 */
export function buildAiContext(data, { full = false, locale = 'es' } = {}) {
  const S = STRINGS[locale] ?? STRINGS.es;
  const analysis = analyze(data);
  const lines = [
    ...header(S, data),
    ...analysisLines(S, analysis),
    ...buildOrderLines(S, data),
    ...chatLines(S, data),
    ...(full ? commandLines(S, data) : []),
    '',
    '---',
    S.outro,
  ];
  const text = lines.join('\n');
  return { text, tokens: Math.round(text.length / 4) };
}
