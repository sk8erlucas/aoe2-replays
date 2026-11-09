// Accounts: passwords, input checks and which matches become notifications.
import assert from "node:assert/strict";
import { test } from "node:test";
import { NOTIFICATION_RETENTION_MS, pickNotifications } from "../src/lib/notificationRules.ts";
import { burnPasswordCheck, hashPassword, verifyPassword } from "../src/lib/password.ts";
import { isSameOrigin, isSessionToken, isValidPassword, normalizeEmail, safeNextPath } from "../src/lib/validate.ts";

test("passwords verify only with the right one, and hashes are salted", async () => {
  const a = await hashPassword("correct horse");
  const b = await hashPassword("correct horse");
  assert.notEqual(a, b);
  assert.ok(!a.includes("correct"));
  assert.ok(await verifyPassword("correct horse", a));
  assert.equal(await verifyPassword("Correct horse", a), false);
});

test("a malformed stored hash fails closed", async () => {
  for (const bad of ["", "nope", "scrypt$1$2$3", "scrypt$x$8$1$AAAA$AAAA", "scrypt$32768$8$1$AAAA$", "md5$1$1$1$AAAA$AAAA"]) {
    assert.equal(await verifyPassword("x", bad), false, JSON.stringify(bad));
  }
  await burnPasswordCheck("anything");
});

test("password length limits", () => {
  assert.ok(isValidPassword("12345678"));
  assert.ok(isValidPassword("x".repeat(200)));
  for (const bad of ["1234567", "x".repeat(201), 12345678, null, undefined, ["12345678"]]) {
    assert.equal(isValidPassword(bad), false, String(bad));
  }
});

test("emails are normalized and malformed ones rejected", () => {
  assert.equal(normalizeEmail("  Ana@Example.COM "), "ana@example.com");
  for (const bad of ["", "ana", "ana@", "@x.com", "ana@x", "a b@x.com", "a@b@x.com", "a@.com", `${"x".repeat(250)}@x.com`, 5, null, { a: 1 }]) {
    assert.equal(normalizeEmail(bad), null, JSON.stringify(bad));
  }
});

test("session tokens have the generated shape", () => {
  assert.ok(isSessionToken("a".repeat(43)));
  for (const bad of ["", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}/`]) assert.equal(isSessionToken(bad), false);
});

test("the next path after login never leaves the site", () => {
  assert.equal(safeNextPath("/account"), "/account");
  assert.equal(safeNextPath("/p/196240?x=1"), "/p/196240?x=1");
  for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "/a\\b", "javascript:alert(1)", " /x", "", null, undefined]) {
    assert.equal(safeNextPath(bad), "/", String(bad));
  }
});

test("only same-site origins pass the CSRF check", () => {
  const hosts = ["aoe2.example", null, undefined];
  assert.ok(isSameOrigin("https://aoe2.example", hosts));
  for (const bad of [null, "", "null", "https://evil.example", "https://aoe2.example.evil.net", "not a url"]) {
    assert.equal(isSameOrigin(bad, hosts), false, String(bad));
  }
});

const NOW = Date.parse("2026-11-09T12:00:00Z");
const ago = (ms) => new Date(NOW - ms).toISOString();
const HOUR = 3600_000;
const player = (profileId, won = true, name = `p${profileId}`) => ({ profileId, name, civName: null, colorHex: null, team: 1, rating: null, ratingDiff: null, won });
const match = (matchId, finished, ...ids) => ({
  matchId,
  started: null,
  finished,
  leaderboardName: "1v1",
  mapName: "Arabia",
  teams: [{ teamId: 1, players: ids.map((id) => player(id)) }],
});
const me = { profileId: "1", since: NOW - 24 * HOUR, mine: true };
const friend = { profileId: "2", since: NOW - 24 * HOUR, mine: false };

test("finished matches of watched players become notifications", () => {
  const rows = pickNotifications([match(10, ago(HOUR), 1, 9)], [me, friend], NOW);
  assert.equal(rows.length, 1);
  assert.deepEqual(
    { id: rows[0].matchId, who: rows[0].profileId, mine: rows[0].mine, won: rows[0].won },
    { id: "10", who: "1", mine: true, won: true },
  );
});

test("matches still running, or nobody's we watch, are skipped", () => {
  assert.deepEqual(pickNotifications([match(10, null, 1)], [me], NOW), []);
  assert.deepEqual(pickNotifications([match(10, ago(HOUR), 7, 8)], [me, friend], NOW), []);
  assert.deepEqual(pickNotifications([match(0, ago(HOUR), 1)], [me], NOW), []);
  assert.deepEqual(pickNotifications([match(10, "garbage", 1)], [me], NOW), []);
});

test("matches from before the player was watched are skipped", () => {
  assert.deepEqual(pickNotifications([match(10, ago(25 * HOUR), 1)], [me], NOW), []);
});

test("a match with me and a friend counts once, as mine, whatever the order", () => {
  for (const watched of [[me, friend], [friend, me]]) {
    const rows = pickNotifications([match(10, ago(HOUR), 2, 1), match(10, ago(HOUR), 2, 1)], watched, NOW);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].mine, true);
  }
});

test("if I joined later, the friend's notification still applies", () => {
  const recent = { ...me, since: NOW - HOUR / 2 };
  const rows = pickNotifications([match(10, ago(HOUR), 1, 2)], [recent, friend], NOW);
  assert.equal(rows[0].mine, false);
  assert.equal(rows[0].profileId, "2");
});

test("matches past retention never come back as new", () => {
  const old = { ...me, since: 0 };
  assert.deepEqual(pickNotifications([match(10, ago(NOTIFICATION_RETENTION_MS + HOUR), 1)], [old], NOW), []);
});

test("text Postgres can't store is cleaned", () => {
  const m = match(10, ago(HOUR), 1);
  m.teams[0].players[0].name = "a\0b";
  m.mapName = "x\0y";
  const [row] = pickNotifications([m], [me], NOW);
  assert.equal(row.playerName, "ab");
  assert.equal(row.mapName, "xy");
});
