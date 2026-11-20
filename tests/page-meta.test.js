/** Stage D, judge fix 4: the page has a title, a description and a 1200 x 630 link preview image (open graph and twitter tags). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const meta = (attr, name) => new RegExp(`<meta ${attr}="${name}" content="([^"]+)"`).exec(html)?.[1];

function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

test("the page has a title and a description", () => {
  const title = /<title>([^<]+)<\/title>/.exec(html)?.[1] ?? "";
  assert.match(title, /^Cheat Seat/);
  assert.ok(title.length >= 12 && title.length <= 70, `title length ${title.length}`);
  const d = meta("name", "description");
  assert.ok(d && d.length >= 60 && d.length <= 200, `description ${d?.length}`);
});

test("open graph and twitter tags point at one 1200 x 630 image that exists in public/", () => {
  const og = meta("property", "og:image"), tw = meta("name", "twitter:image");
  assert.equal(og, tw);
  assert.match(og, /^https:\/\/.+\/cheat-seat-preview\.jpg$/);
  assert.equal(meta("property", "og:image:width"), "1200");
  assert.equal(meta("property", "og:image:height"), "630");
  assert.equal(meta("name", "twitter:card"), "summary_large_image");
  for (const k of ["og:title", "og:description", "og:type", "og:url"]) assert.ok(meta("property", k), k);
  const file = new URL("../public/cheat-seat-preview.jpg", import.meta.url);
  assert.ok(existsSync(file), "public/cheat-seat-preview.jpg exists");
  const size = jpegSize(readFileSync(file));
  assert.deepEqual(size, { w: 1200, h: 630 });
});
