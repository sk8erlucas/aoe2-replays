// Match page description for search engines and link previews.
import assert from "node:assert/strict";
import { test } from "node:test";
import { matchDescription } from "../src/lib/matchMeta.ts";
import { MESSAGES } from "../src/i18n/messages.ts";

const player = (name, rating, won) => ({ profileId: null, name, civName: null, colorHex: null, team: null, rating, ratingDiff: null, won });

test("with aoe2companion: mode, size, duration, ratings and who won", () => {
  const info = {
    matchId: 1,
    started: null,
    finished: null,
    leaderboardName: "RM Team",
    mapName: "Arabia",
    teams: [
      { teamId: 1, players: [player("Ana", 1650, true), player("Beto", 1580, true)] },
      { teamId: 2, players: [player("Caro", 1600, false), player("Dani", null, false)] },
    ],
  };
  assert.equal(
    matchDescription(MESSAGES.en.meta, { map: "Arabia", durationMs: 2_892_000, info, stored: [] }),
    "Arabia · RM Team · 2v2 · 48 min. Ana (1650), Beto (1580) vs Caro (1600), Dani. Winners: Ana, Beto. Watch the match on the map, with its analysis.",
  );
});

test("without it: the replay's teams, and no winner", () => {
  const stored = [{ name: "Ana", team_id: 2 }, { name: "Caro", team_id: 3 }, { team_id: 3 }];
  assert.equal(
    matchDescription(MESSAGES.es.meta, { map: "Arabia", durationMs: 20_000, info: null, stored }),
    "Arabia · 1v1 · 1 min. Ana vs Caro. Mirá la partida en el mapa y su análisis.",
  );
  assert.equal(
    matchDescription(MESSAGES.es.meta, { map: "Arabia", durationMs: 0, info: null, stored: [] }),
    "Arabia. Mirá la partida en el mapa y su análisis.",
  );
});
