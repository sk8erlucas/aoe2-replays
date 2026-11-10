// Share links: the page URL and title always go encoded, to fixed sites.
import assert from "node:assert/strict";
import { test } from "node:test";
import { shareLinks } from "../src/lib/share.ts";

test("share links encode the url and title for each site", () => {
  const url = "https://example.com/m/123?t=60";
  const links = shareLinks(url, "Arabia: Ana & Bo");
  assert.deepEqual(links.map((l) => l.site), ["whatsapp", "x", "reddit", "telegram"]);
  for (const { href } of links) {
    const parsed = new URL(href);
    assert.equal(parsed.protocol, "https:");
    assert.ok(!href.includes("Ana & Bo"), "title is encoded");
    assert.ok([...parsed.searchParams.values()].some((v) => v.includes(url)), `${href} carries the url`);
  }
  assert.equal(new URL(links[0].href).searchParams.get("text"), `Arabia: Ana & Bo ${url}`);
});
