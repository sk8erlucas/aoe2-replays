// Input checks and rate limits of the API. Runs with Node's TypeScript type
// stripping, so it can only load files without `@/` imports.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { zipSync } from "fflate";
import { allow, hasRoom } from "../src/lib/ratelimit.ts";
import { MAX_REPLAY_BYTES, extractReplay, replayUrl } from "../src/lib/replayZip.ts";
import { cleanLine, envInt, isManageToken, isMatchId, isReplayId, parseFavorite, parsePage } from "../src/lib/validate.ts";

test("replay ids and tokens match what the server generates", () => {
  for (let i = 0; i < 50; i++) {
    assert.ok(isReplayId(randomBytes(16).toString("base64url")));
    assert.ok(isManageToken(randomBytes(24).toString("base64url")));
  }
});

test("malformed replay ids and tokens are rejected", () => {
  for (const bad of ["", "short", "a".repeat(23), "Q2hYAqpboRVV1RGDGb7Ew/", "Q2hYAqpboRVV1RGDGb7Ew%", "../../etc/passwd", "Q2hYAqpboRVV1RGDGb7Ewg\n"]) {
    assert.equal(isReplayId(bad), false, JSON.stringify(bad));
  }
  for (const bad of ["", "x".repeat(31), "x".repeat(33), `${"x".repeat(31)}=`, `${"x".repeat(31)} `]) {
    assert.equal(isManageToken(bad), false, JSON.stringify(bad));
  }
});

test("match and profile ids are short plain numbers", () => {
  assert.ok(isMatchId("516586396"));
  for (const bad of ["", "-1", "1.5", "1e9", "0x10", "1234567890123", "12 ", "１２"]) {
    assert.equal(isMatchId(bad), false, JSON.stringify(bad));
  }
});

test("limits from the environment fall back when unset or invalid", () => {
  assert.equal(envInt("X", 7, {}), 7);
  assert.equal(envInt("X", 7, { X: "" }), 7);
  assert.equal(envInt("X", 7, { X: "abc" }), 7);
  assert.equal(envInt("X", 7, { X: "-3" }), 7);
  assert.equal(envInt("X", 7, { X: "2.5" }), 7);
  assert.equal(envInt("X", 7, { X: " 12 " }), 12);
  assert.equal(envInt("X", 7, { X: "0" }), 0);
});

test("rate limit: fixed window per key", () => {
  const t0 = 1_000_000;
  assert.ok(allow("t:a", 2, 1000, t0));
  assert.ok(allow("t:a", 2, 1000, t0 + 10));
  assert.equal(allow("t:a", 2, 1000, t0 + 20), false);
  assert.ok(allow("t:b", 2, 1000, t0 + 20), "other keys are independent");
  assert.ok(allow("t:a", 2, 1000, t0 + 1000), "a new window starts over");
});

test("rate limit: 0 means no limit, hasRoom does not use a hit", () => {
  for (let i = 0; i < 100; i++) assert.ok(allow("t:free", 0, 1000, 5));
  assert.ok(hasRoom("t:c", 1, 1000, 5));
  assert.ok(hasRoom("t:c", 1, 1000, 5));
  assert.ok(allow("t:c", 1, 1000, 5));
  assert.equal(hasRoom("t:c", 1, 1000, 6), false);
  assert.ok(hasRoom("t:c", 1, 1000, 1005));
});

test("the replay URL only ever points at Microsoft, with numeric ids", () => {
  const url = new URL(replayUrl("516586396", "196240"));
  assert.equal(url.origin, "https://api.ageofempires.com");
  assert.equal(url.searchParams.get("gameId"), "516586396");
  for (const [m, p] of [["1&x=2", "1"], ["1", "../../evil"], ["1", "1@evil.example"], ["", "1"], ["1", "1\n"]]) {
    assert.equal(replayUrl(m, p), null, JSON.stringify([m, p]));
  }
});

test("the replay comes out of a normal ZIP, whatever other files it holds", () => {
  const replay = new Uint8Array([1, 2, 3]);
  const out = extractReplay(zipSync({ "readme.txt": new Uint8Array([9]), "Game.AOE2RECORD": replay }));
  assert.deepEqual(out, replay);
  assert.equal(extractReplay(zipSync({ "readme.txt": new Uint8Array([9]) })), null);
});

test("an entry larger than the limit is not inflated", () => {
  const bomb = new Uint8Array(MAX_REPLAY_BYTES + 1);
  assert.equal(extractReplay(zipSync({ "a.aoe2record": bomb }, { level: 9 })), null);
});

test("a ZIP with many replays only inflates one", () => {
  const entries = {};
  for (let i = 0; i < 2000; i++) entries[`${i}.aoe2record`] = new Uint8Array([i & 255]);
  assert.equal(extractReplay(zipSync(entries)).length, 1);
});

test("a damaged ZIP throws instead of returning something", () => {
  assert.throws(() => extractReplay(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0])));
});

test("an entry lying about its size can't inflate past what it declared", () => {
  const zip = zipSync({ "a.aoe2record": new Uint8Array(1024 * 1024) }, { level: 9 });
  // Rewrites the uncompressed size in the central directory: says 16 bytes, holds 1 MB.
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let central = zip.length - 22;
  while (view.getUint32(central, true) !== 0x02014b50) central--;
  view.setUint32(central + 24, 16, true);
  let out = null;
  try {
    out = extractReplay(zip);
  } catch {
    return; // refusing it outright is fine too
  }
  assert.ok(out === null || out.length <= 16, `inflated ${out?.length} bytes`);
});

test("list pages: 1 by default, small positive numbers only", () => {
  assert.equal(parsePage(null), 1);
  assert.equal(parsePage(""), 1);
  assert.equal(parsePage("3"), 3);
  assert.equal(parsePage("50"), 50);
  for (const bad of ["0", "51", "-1", "1.5", "abc", "1e2", "9999", " 2"]) assert.equal(parsePage(bad), null, bad);
});

test("user text: one trimmed line, no control characters, bounded", () => {
  assert.equal(cleanLine("  la pelea del centro  ", 140), "la pelea del centro");
  assert.equal(cleanLine("a\u0000b\nc", 140), "a b c");
  assert.equal(cleanLine("   ", 140), null);
  assert.equal(cleanLine("x".repeat(141), 140), null);
  assert.equal(cleanLine(42, 140), null);
});

test("favorites and saved moments from a request body", () => {
  const replayId = randomBytes(16).toString("base64url");
  assert.deepEqual(parseFavorite({ kind: "match", targetId: "516586396" }), {
    kind: "match",
    targetId: "516586396",
    second: 0,
    note: null,
  });
  assert.deepEqual(parseFavorite({ kind: "replay", targetId: replayId, second: 754, note: " rush " }), {
    kind: "replay",
    targetId: replayId,
    second: 754,
    note: "rush",
  });
  assert.equal(parseFavorite({ kind: "replay", targetId: replayId, note: "" })?.note, null);
  for (const bad of [
    null,
    {},
    { kind: "player", targetId: "1" },
    { kind: "match", targetId: replayId },
    { kind: "replay", targetId: "516586396" },
    { kind: "match", targetId: "1", second: -1 },
    { kind: "match", targetId: "1", second: 1.5 },
    { kind: "match", targetId: "1", second: "10" },
    { kind: "match", targetId: "1", second: 86_401 },
    { kind: "match", targetId: "1", note: "x".repeat(141) },
    { kind: "match", targetId: "1", note: 5 },
  ]) {
    assert.equal(parseFavorite(bad), null, JSON.stringify(bad));
  }
});
