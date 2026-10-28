// UI wiring: loading, playback controls, map interaction and side panel.
// Player names and chat come from the replay, so they only go through textContent.

import { Replay, formatTime } from '../../../packages/viewer/src/engine.js';
import { PLAYER_COLORS } from '../../../packages/viewer/src/palette.js';
import { Renderer } from '../../../packages/viewer/src/render.js';
import { SpriteSet } from '../../../packages/viewer/src/sprites.js';

// Game sprites made by tools/sprites; without them the viewer draws plain shapes.
const spritesReady = SpriteSet.load('../web/public/sprites').catch(() => null);
const gameDataReady = fetch('../web/public/sprites/game-data.json', { cache: 'no-cache' })
  .then((res) => (res.ok ? res.json() : null))
  .catch(() => null);

const DEFAULT_SRC = '../../fixtures/sample.json';

const $ = (id) => document.getElementById(id);
const els = {
  canvas: $('map'), info: $('game-info'), players: $('players'), log: $('log'),
  play: $('play'), clock: $('clock'), seek: $('seek'), speed: $('speed'), fit: $('fit'),
  file: $('file-input'), tooltip: $('tooltip'), drop: $('drop-hint'),
};

let replay = null;
let renderer = null;
let t = 0;
let playing = false;
let lastFrame = 0;
let shownLog = -1;
let shownResigned = null;
let pointer = null;

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

async function load(data) {
  replay = new Replay(data, { gameData: await gameDataReady });
  renderer = new Renderer(els.canvas, replay);
  renderer.resize();
  const first = replay.latestFocus(0) ?? replay.focusOf(replay.players[0]?.number ?? 1, 0);
  renderer.centerOn(first.x, first.y, { scale: renderer.closeScale(), instant: true });
  renderer.setFollow('auto');
  // Handy for debugging from the browser console.
  window.viewerDebug = { replay, renderer };
  const current = renderer;
  spritesReady.then((sprites) => {
    if (!sprites || renderer !== current) return;
    sprites.onLoad = () => render();
    renderer.setSprites(sprites);
    render();
  });
  t = 0;
  shownLog = -1;
  shownResigned = null;
  els.seek.max = String(replay.duration);
  const g = data.game;
  const mapName = data.map.name ?? `mapa #${data.map.id}`;
  const teams = new Set(g.players.map((p) => p.team_id)).size;
  els.info.textContent = `${mapName} · ${g.players.length} jugadores en ${teams} equipos · ${formatTime(replay.duration)} · ${g.game_version} (save ${g.save_version})`;
  setPlaying(false);
  render();
}

function playerLabel(number) {
  const p = replay.playerByNumber.get(number);
  return p ? p.name : 'Gaia';
}

function renderPlayers(state) {
  const key = [...state.resigned].join(',');
  if (key === shownResigned) return;
  shownResigned = key;
  const rows = [...replay.players]
    .sort((a, b) => a.team_id - b.team_id || a.number - b.number)
    .map((p) => {
      const resignT = replay.resignedAt.get(p.number);
      const status = state.resigned.has(p.number) ? ` · abandonó ${formatTime(resignT)}` : '';
      return el('li', { className: state.resigned.has(p.number) ? 'resigned' : '' }, [
        el('span', { className: 'swatch', style: `background:${PLAYER_COLORS[p.color_id] ?? '#fff'}` }),
        el('span', { className: 'name', textContent: p.name, title: p.name }),
        el('span', { className: 'meta', textContent: `${p.civilization ?? `civ ${p.civilization_id}`} · E${p.team_id}${status}` }),
      ]);
    });
  els.players.replaceChildren(...rows);
}

// Debug page: Spanish wording of the engine's structured log entries.
function describeLog(e) {
  if (e.kind === 'chat') return `: "${e.text}"`;
  if (e.kind === 'resign') return ' abandona';
  if (e.kind === 'queue') return ` entrena ${e.amount}× ${e.name}`;
  if (e.kind === 'research') return ` investiga ${e.name}`;
  return ` construye ${e.name}${e.segments ? ` (${e.segments} tramos)` : ''}`;
}

function renderLog() {
  const entries = replay.logUntil(t);
  if (entries.length === shownLog) return;
  shownLog = entries.length;
  const items = entries.slice(-200).reverse().map((e) => {
    const who = el('span', { className: 'who', textContent: playerLabel(e.player) });
    const p = replay.playerByNumber.get(e.player);
    if (p) who.style.color = PLAYER_COLORS[p.color_id] ?? '';
    const text = describeLog(e);
    return el('li', {}, [
      el('span', { className: 'time', textContent: formatTime(e.t) }),
      el('span', { className: e.kind }, [who, text]),
    ]);
  });
  els.log.replaceChildren(...items);
}

function renderTooltip(state) {
  if (!pointer) {
    els.tooltip.hidden = true;
    return;
  }
  const hit = renderer.pick(state, pointer.x, pointer.y);
  if (!hit) {
    els.tooltip.hidden = true;
    return;
  }
  const obj = hit.kind === 'unit' ? hit.unit : hit.building;
  const name = obj.typeId != null ? replay.objectName(obj.typeId) : 'Unidad';
  const parts = [name, playerLabel(obj.player)];
  if (hit.kind === 'building' && hit.progress < 1) parts.push(`${Math.round(hit.progress * 100)}% construido`);
  if (hit.kind === 'unit' && obj.approx) parts.push('posición aproximada');
  els.tooltip.textContent = parts.join(' · ');
  els.tooltip.style.left = `${pointer.x + 14}px`;
  els.tooltip.style.top = `${pointer.y + 14}px`;
  els.tooltip.hidden = false;
}

function render() {
  if (!replay) return;
  const state = replay.stateAt(t);
  renderer.draw(state);
  els.clock.textContent = `${formatTime(t)} / ${formatTime(replay.duration)}`;
  els.seek.value = String(t);
  renderPlayers(state);
  renderLog();
  renderTooltip(state);
}

function setPlaying(value) {
  playing = value && !!replay;
  if (playing && t >= replay.duration) t = 0;
  els.play.textContent = playing ? '❚❚' : '▶';
  els.play.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
  lastFrame = performance.now();
}

function seek(value) {
  t = Math.min(replay?.duration ?? 0, Math.max(0, value));
  render();
}

function frame(now) {
  const dt = Math.min(100, now - lastFrame);
  if (playing) {
    t += dt * Number(els.speed.value);
    if (t >= replay.duration) {
      t = replay.duration;
      setPlaying(false);
    }
  }
  const moving = renderer?.update(dt, t);
  if (playing || moving) render();
  lastFrame = now;
  requestAnimationFrame(frame);
}

async function loadFromUrl(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await load(await res.json());
  } catch (err) {
    els.info.textContent = `No se pudo cargar ${url} (${err.message}). Abrí un JSON generado por el parser.`;
  }
}

async function loadFromFile(file) {
  try {
    await load(JSON.parse(await file.text()));
  } catch (err) {
    els.info.textContent = `Archivo inválido: ${err.message}`;
  }
}

// Controls
els.play.addEventListener('click', () => setPlaying(!playing));
els.seek.addEventListener('input', () => seek(Number(els.seek.value)));
els.fit.addEventListener('click', () => { renderer?.fit(); render(); });
els.file.addEventListener('change', () => els.file.files[0] && loadFromFile(els.file.files[0]));

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
  if (e.code === 'ArrowRight') seek(t + 5000);
  if (e.code === 'ArrowLeft') seek(t - 5000);
});

// Map interaction: wheel zoom around the cursor, drag to pan.
let drag = null;
els.canvas.addEventListener('wheel', (e) => {
  if (!renderer) return;
  e.preventDefault();
  renderer.zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  render();
}, { passive: false });

els.canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY };
  els.canvas.setPointerCapture(e.pointerId);
  els.canvas.classList.add('dragging');
});
els.canvas.addEventListener('pointermove', (e) => {
  pointer = { x: e.offsetX, y: e.offsetY };
  if (drag && renderer) {
    renderer.pan(e.clientX - drag.x, e.clientY - drag.y);
    drag = { x: e.clientX, y: e.clientY };
  }
  if (!playing) render();
});
els.canvas.addEventListener('pointerup', () => { drag = null; els.canvas.classList.remove('dragging'); });
els.canvas.addEventListener('pointerleave', () => { pointer = null; if (!playing) render(); });

window.addEventListener('resize', () => { renderer?.resize(); render(); });

// Drag and drop a JSON anywhere on the page.
window.addEventListener('dragover', (e) => { e.preventDefault(); els.drop.hidden = false; });
window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) els.drop.hidden = true; });
window.addEventListener('drop', (e) => {
  e.preventDefault();
  els.drop.hidden = true;
  const file = e.dataTransfer?.files?.[0];
  if (file) loadFromFile(file);
});

// ?src=<json url>&t=<seconds> open a given replay at a given moment.
const params = new URLSearchParams(location.search);
loadFromUrl(params.get('src') ?? DEFAULT_SRC).then(() => {
  if (params.has('t')) seek(Number(params.get('t')) * 1000);
});
requestAnimationFrame(frame);
