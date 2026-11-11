import assert from 'node:assert/strict';
import { test } from 'node:test';

import { analyze } from '../src/analysis.js';
import { isSystemMessage, noticeTimes, playerChat, settleAgeUps } from '../src/notices.js';
import { toGameOrientation } from '../src/orientation.js';

const chat = [
  { t: 1_000, player: 2, channel: 0, message: 'gl hf' },
  { t: 140_000, player: 1, channel: 0, message: '<player_id,1,0> advanced to the Feudal Age.' },
  { t: 150_000, player: 2, channel: 0, message: '<player_id,2,0> ha avanzado a la Edad Feudal.' },
];

test('game notices are told apart from what players write', () => {
  assert.equal(isSystemMessage(chat[0]), false);
  assert.equal(isSystemMessage(chat[1]), true);
  assert.deepEqual(playerChat({ chat }).map((c) => c.message), ['gl hf']);
  assert.deepEqual([...noticeTimes({ chat })], [[1, [140_000]], [2, [150_000]]]);
  assert.equal(noticeTimes({ chat: [chat[0]] }), null);
});

test('age arrival: exact with notices, null when never announced, estimated without notices', () => {
  const clicks = [{ key: 'feudal', clickedAt: 10_000, seconds: 130 }, { key: 'castle', clickedAt: 200_000, seconds: 160 }];
  assert.deepEqual(settleAgeUps(clicks, [5_000, 147_000]).map((a) => [a.reachedAt, a.exact]), [[147_000, true], [null, true]]);
  assert.deepEqual(settleAgeUps(clicks, null).map((a) => [a.reachedAt, a.exact]), [[140_000, false], [360_000, false]]);
});

test('analysis uses the notices for age arrival', () => {
  const data = {
    game: { duration_ms: 600_000, players: [{ number: 1 }, { number: 2 }] },
    timeline: [
      { t: 5_000, type: 'RESEARCH', player: 1, technology_id: 101 },
      { t: 5_000, type: 'RESEARCH', player: 2, technology_id: 101 },
    ],
    chat,
    legend: { objects: {}, technologies: { 101: 'Feudal Age' } },
  };
  const [p1, p2] = analyze(data).players;
  assert.deepEqual(p1.ageUps, [{ key: 'feudal', label: 'Feudal', clickedAt: 5_000, reachedAt: 140_000, exact: true }]);
  assert.equal(p2.ageUps[0].reachedAt, 150_000);
});

test("the map is turned to the game's orientation: (x, y) -> (y, n - x)", () => {
  const n = 3;
  const data = {
    game: { players: [{ number: 1, start: { x: 1, y: 0 } }] },
    // Tile (x, y) holds 10 * x + y.
    map: { size: n, terrain: [0, 10, 20, 1, 11, 21, 2, 12, 22], elevation: [] },
    initial_objects: [{ id: 1, x: 0.5, y: 2.5 }],
    timeline: [
      { t: 0, type: 'WALL', x: 0, y: 1, x_end: 2, y_end: 1 },
      { t: 0, type: 'UNGARRISON', x: -1, y: -1 },
      { t: 0, type: 'RESIGN' },
    ],
  };
  const out = toGameOrientation(data);
  assert.deepEqual(out.game.players[0].start, { x: 0, y: 2 });
  assert.deepEqual(out.initial_objects[0], { id: 1, x: 2.5, y: 2.5 });
  assert.deepEqual(out.timeline[0], { t: 0, type: 'WALL', x: 1, y: 3, x_end: 1, y_end: 1 });
  assert.deepEqual(out.timeline[1], data.timeline[1]); // no position stays as is
  assert.equal(out.timeline[2], data.timeline[2]);
  // Game tile (x, y) ends up at (y, n - 1 - x).
  const at = (vx, vy) => out.map.terrain[vy * n + vx];
  assert.equal(at(0, 2), 0); // game (0, 0)
  assert.equal(at(1, 2), 1); // game (0, 1)
  assert.equal(at(0, 1), 10); // game (1, 0)
  assert.equal(at(2, 0), 22); // game (2, 2)
  assert.deepEqual(out.map.elevation, []);
  assert.deepEqual(data.initial_objects[0], { id: 1, x: 0.5, y: 2.5 }); // the original is untouched
});
