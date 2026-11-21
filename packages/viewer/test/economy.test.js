import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile } from '../src/economy.js';
import { Replay } from '../src/engine.js';

test('reconcile adds what is missing where the income was', () => {
  const stock = [100, 200, 100, 200];
  reconcile(stock, 700, [0, 50, 0, 0]);
  assert.deepEqual(stock, [100, 300, 100, 200]);
});

test('reconcile takes what is too much off the income first, never below zero', () => {
  const stock = [-30, 300, 100, 200];
  reconcile(stock, 500, [0, 80, 20, 0]);
  assert.equal(stock.reduce((a, b) => a + b, 0), 500);
  assert.equal(stock[0], 0);
  assert.equal(stock[3], 200, 'stone nobody touched stays');
  assert.ok(stock[1] < 300 && stock[2] < 100);
});

test('the split follows costs and always adds up to the game total', () => {
  const gameData = {
    units: { 83: { speed: 0.8, class: 4, train: [[109, 25]], cost: [50, 0, 0, 0] } },
    buildings: { 109: { size: 4, buildTime: 0 }, 70: { size: 2, buildTime: 25, cost: [0, 25, 0, 0] } },
    techs: {},
  };
  const data = {
    game: { duration_ms: 60_000, players: [{ number: 1, name: 'A', color_id: 0, team_id: 2, start: { x: 10, y: 10 } }] },
    map: { size: 40, terrain: [], elevation: [] },
    initial_objects: [{ id: 100, player: 1, type_id: 109, x: 10, y: 10 }],
    timeline: [
      { t: 1000, type: 'DE_QUEUE', player: 1, object_ids: [100], unit_id: 83, amount: 2 },
      { t: 2000, type: 'BUILD', player: 1, building_id: 70, object_ids: [], x: 15, y: 15 },
    ],
    chat: [],
    resource_totals: [{ t: 5000, players: { 1: 575 } }],
    legend: { objects: { 109: { name: 'Town Center', category: 'building' }, 83: { name: 'Villager', category: 'unit' }, 70: { name: 'House', category: 'building' } } },
  };
  const r = new Replay(data, { gameData });
  assert.equal(r.stockAt(4000).get(1), null, 'before the first sync');
  assert.deepEqual(r.stockAt(6000).get(1), { total: 575, food: 100, wood: 175, gold: 100, stone: 200 });
});

test('units the player could not pay for never come out', () => {
  const gameData = {
    units: { 83: { speed: 0.8, class: 4, train: [[109, 25]], cost: [50, 0, 0, 0] } },
    buildings: { 109: { size: 4, buildTime: 0, pop: 0 } },
    techs: {},
  };
  const r = new Replay({
    game: { duration_ms: 400_000, players: [{ number: 1, name: 'A', color_id: 0, team_id: 2, start: { x: 10, y: 10 } }] },
    map: { size: 40, terrain: [], elevation: [] },
    initial_objects: [{ id: 100, player: 1, type_id: 109, x: 10, y: 10 }],
    // 200 food pays for 4 villagers: the other 2 clicks are refused.
    timeline: [{ t: 1000, type: 'DE_QUEUE', player: 1, object_ids: [100], unit_id: 83, amount: 6 }],
    chat: [],
    resource_totals: [{ t: 300_000, players: { 1: 500 } }],
    legend: { objects: { 109: { name: 'Town Center', category: 'building' }, 83: { name: 'Villager', category: 'unit' } } },
  }, { gameData });
  const trained = r.units.filter((u) => u.key);
  assert.equal(trained.filter((u) => !u.stalled).length, 4);
  assert.equal(trained.filter((u) => u.unaffordable).length, 2);
});
