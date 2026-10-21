import assert from "node:assert/strict";
import { test } from "node:test";
import { searchCatalogWords, validCatalogQuery } from "../utils/catalog-search";
import type { PublicSong } from "../utils/moment-search";

function song(id: string, title: string, changes: Partial<PublicSong> = {}): PublicSong {
  return { id, title, visibility: "collective", description: null, lyrics: null, genre: [], mood: [], metadata: {}, ...changes };
}

test("literal word search excludes substrings and requires all requested words", () => {
  const songs = [song("1", "Love and courage"), song("2", "A glove for courage"), song("3", "Love again")];
  assert.deepEqual(searchCatalogWords("love courage", songs).map(result => result.id), ["1"]);
});

test("words can match across title, lyrics, genre, mood, and development metadata", () => {
  const songs = [song("1", "A fresh start", { lyrics: "Learning every day", genre: ["Soul"], mood: ["Hopeful"], metadata: { development_goal: "Build confidence", emotional_progression: "From doubt to courage" } })];
  assert.deepEqual(searchCatalogWords("learning SOUL hopeful confidence courage", songs).map(result => result.id), ["1"]);
});

test("case, accents, and non-Latin words are normalized without an English-only tokenizer", () => {
  const songs = [song("1", "CAFÉ Mañana"), song("2", "ΝΕΑ ΑΡΧΗ"), song("3", "新的开始")];
  assert.deepEqual(searchCatalogWords("cafe manana", songs).map(result => result.id), ["1"]);
  assert.deepEqual(searchCatalogWords("νεα αρχη", songs).map(result => result.id), ["2"]);
  assert.deepEqual(searchCatalogWords("新的开始", songs).map(result => result.id), ["3"]);
});

test("a private song cannot be returned and returned results omit raw lyrics and other internal fields", () => {
  const results = searchCatalogWords("confidence", [
    song("hidden", "Private confidence", { visibility: "private", lyrics: "PRIVATE_LYRICS", metadata: { development_goal: "PRIVATE_FOCUS" } }),
    song("visible", "Confidence", { lyrics: "COLLECTIVE_LYRICS", metadata: { development_goal: "Learn new skills" } }),
  ]);
  assert.deepEqual(results, [{ id: "visible", title: "Confidence", description: null, focus: "Learn new skills" }]);
  assert.ok(!JSON.stringify(results).includes("LYRICS"));
});

test("empty or punctuation-only input never becomes a catalog listing", () => {
  for (const value of [undefined, null, {}, "", "  ", "?! — ...", "a".repeat(501)]) assert.equal(validCatalogQuery(value), false);
  assert.equal(validCatalogQuery("明日"), true);
  assert.throws(() => searchCatalogWords("?!", [song("1", "Anything")]), /Invalid catalog query/);
});

test("title matches rank before lyric-only matches and result count stays bounded", () => {
  const songs = [song("lyrics", "A new day", { lyrics: "Courage to start" }), ...Array.from({ length: 14 }, (_, index) => song(String(index), `Courage ${String(index).padStart(2, "0")}`))];
  const results = searchCatalogWords("courage", songs);
  assert.equal(results.length, 10);
  assert.ok(results.every(result => result.id !== "lyrics"));
  assert.deepEqual(results.map(result => result.title), results.map(result => result.title).toSorted());
  assert.throws(() => searchCatalogWords("courage", Array.from({ length: 101 }, (_, index) => song(String(index), "Courage"))), /capacity/);
});
