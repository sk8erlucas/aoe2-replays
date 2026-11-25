// Players listed in the sitemap.
import assert from "node:assert/strict";
import { test } from "node:test";
import { sitemapPlayers } from "../src/lib/sitemapPlayers.ts";

test("players of the stored matches, once each, most recent first, capped", () => {
  const matches = [
    { sourceProfileId: "5675276", players: [{ profile_id: 5675276 }, { profile_id: 397671 }, { name: "no id" }] },
    { sourceProfileId: "199325", players: [{ number: 1 }] },
    { sourceProfileId: "397671", players: null },
    { sourceProfileId: "0", players: [{ profile_id: "1; DROP" }, { profile_id: -4 }] },
  ];
  assert.deepEqual(sitemapPlayers(matches), ["5675276", "397671", "199325"]);
  assert.deepEqual(sitemapPlayers(matches, 2), ["5675276", "397671"]);
});
