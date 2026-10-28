import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { buildAiContext } from '../src/aiContext.js';

const data = {
  game: {
    duration_ms: 600_000, game_version: 'VER 9.4', save_version: 68.9, build: 1, population_limit: 200,
    players: [
      { number: 1, name: 'Ana', civilization: 'Franks', civilization_id: 1, team_id: 1, is_ai: false, start: { x: 10, y: 10 } },
      { number: 2, name: 'Beto', civilization: 'Mayans', civilization_id: 2, team_id: 2, is_ai: false, start: null },
    ],
  },
  map: { id: 9, name: 'Arabia', size: 120 },
  timeline: [
    { t: 1000, type: 'DE_QUEUE', player: 1, amount: 1, unit_id: 83 },
    { t: 20_000, type: 'DE_QUEUE', player: 1, amount: 2, unit_id: 83 },
    { t: 30_000, type: 'BUILD', player: 1, building_id: 70, x: 12, y: 14, object_ids: [5] },
    { t: 40_000, type: 'MOVE', player: 2, object_ids: [7, 8], x: 50, y: 60 },
    { t: 41_000, type: 'GAME', player: 2, command_id: 16 },
    { t: 400_000, type: 'RESEARCH', player: 1, technology_id: 101, object_ids: [1] },
    { t: 500_000, type: 'RESIGN', player: 2 },
  ],
  chat: [{ t: 550_000, player: 2, channel: 0, message: 'gg' }],
  legend: { objects: { 83: { name: 'Villager' }, 70: { name: 'House' } }, technologies: { 101: 'Feudal Age' }, terrain: {} },
};

test('summary has players, analysis, merged build order and chat', () => {
  const { text, tokens } = buildAiContext(data);
  assert.match(text, /- J1: Ana — Franks, empieza en \(10,10\)/);
  assert.match(text, /\| J1 \| \d+ \| 6:40 \|/);
  assert.match(text, /- 0:01 entrena 3× Villager \(hasta 0:20\)/);
  assert.match(text, /- 0:30 construye House en \(12,14\)/);
  assert.match(text, /- 9:10 Beto: gg/);
  assert.doesNotMatch(text, /Todas las órdenes/);
  assert.ok(tokens > 0);
});

test('full version adds every command but skips noise', () => {
  const { text } = buildAiContext(data, { full: true });
  assert.match(text, /0:40 J2 mueve \[2 unid\.\] en \(50,60\)/);
  assert.doesNotMatch(text, /J2 game/);
});

const LONG = new URL('../../../fixtures/sample.json', import.meta.url);

test('sample replay context stays small', { skip: !existsSync(LONG) && 'missing fixtures/sample.json' }, () => {
  const sample = JSON.parse(readFileSync(LONG, 'utf8'));
  const { tokens } = buildAiContext(sample);
  assert.ok(tokens < 20_000, `${tokens}`);
});

test('English context', () => {
  const { text } = buildAiContext(data, { locale: 'en' });
  assert.match(text, /- P1: Ana — Franks, starts at \(10,10\)/);
  assert.match(text, /- 0:01 trains 3× Villager \(until 0:20\)/);
  assert.match(text, /- 0:30 builds House at \(12,14\)/);
});
