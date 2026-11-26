// What a player plays most, from the matches on their profile.
import assert from "node:assert/strict";
import { test } from "node:test";
import { playerStats } from "../src/lib/playerStats.ts";

const p = (profileId, civName, won) => ({ profileId, name: "x", civName, colorHex: null, team: null, rating: null, ratingDiff: null, won });
const match = (mapName, me, other) => ({ matchId: 1, started: null, finished: null, leaderboardName: null, mapName, teams: [{ teamId: 1, players: [me] }, { teamId: 2, players: [other] }] });

test("civilizations and maps with games and wins, most played first", () => {
  const s = playerStats([
    match("Arabia", p(7, "Franks", true), p(8, "Goths", false)),
    match("Arabia", p(7, "Franks", false), p(9, "Huns", true)),
    match("Arena", p(7, "Britons", true), p(8, "Franks", false)),
    match("Arena", p(5, "Britons", true), p(6, "Franks", false)),
  ], 7);
  assert.deepEqual({ games: s.games, wins: s.wins, losses: s.losses }, { games: 3, wins: 2, losses: 1 });
  assert.deepEqual(s.civs, [{ name: "Franks", games: 2, wins: 1 }, { name: "Britons", games: 1, wins: 1 }]);
  assert.deepEqual(s.maps, [{ name: "Arabia", games: 2, wins: 1 }, { name: "Arena", games: 1, wins: 1 }]);
});
