"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../src/engine.js");

// Three people, a daily cooking chore and a weekly bins chore.
const PEOPLE = [{ id: "a", name: "Ana" }, { id: "b", name: "Ben" }, { id: "c", name: "Cas" }];
const CHORES = [
  { id: "cook", name: "Cook dinner", minutes: 30, often: "daily" },
  { id: "bins", name: "Bins", minutes: 5, often: "weekly" }
];

function doer(rota, choreId) {
  return rota.jobs.filter((j) => j.choreId === choreId).map((j) => j.personId);
}

test("an owned chore always goes to its owner", () => {
  const people = [{ id: "a", name: "Ana", owns: ["cook"] }, { id: "b", name: "Ben" }, { id: "c", name: "Cas" }];
  const rota = E.makeRota(people, CHORES, { weeks: 2 });
  const cooks = doer(rota, "cook");
  assert.ok(cooks.length > 0);
  assert.ok(cooks.every((id) => id === "a"), "every cooking job is Ana's");
});

test("owning one chore does not stop the rest being shared fairly", () => {
  const people = [{ id: "a", name: "Ana", owns: ["cook"] }, { id: "b", name: "Ben" }, { id: "c", name: "Cas" }];
  const rota = E.makeRota(people, CHORES, { weeks: 4 });
  // Bins rotates among everyone, not stuck on the cook.
  const bins = new Set(doer(rota, "bins"));
  assert.ok(bins.size >= 2, "bins is shared, not pinned to one person");
});

test("two owners share the owned chore between just the two of them", () => {
  const people = [
    { id: "a", name: "Ana", owns: ["cook"] },
    { id: "b", name: "Ben", owns: ["cook"] },
    { id: "c", name: "Cas" }
  ];
  const rota = E.makeRota(people, CHORES, { weeks: 2 });
  const cooks = new Set(doer(rota, "cook"));
  assert.ok(!cooks.has("c"), "Cas never cooks");
  assert.ok(cooks.has("a") && cooks.has("b"), "Ana and Ben both cook");
});

test("if the owner is away all week, someone else covers the chore", () => {
  const people = [{ id: "a", name: "Ana", owns: ["cook"], awayWeeks: [0] }, { id: "b", name: "Ben" }, { id: "c", name: "Cas" }];
  const rota = E.makeRota(people, CHORES, { weeks: 1 });
  const cooks = doer(rota, "cook");
  assert.ok(cooks.length > 0);
  assert.ok(cooks.every((id) => id !== "a"), "Ana is away, so she cooks nothing");
});

test("a can't-do still beats an owns, so a contradiction is safe", () => {
  // Ana both owns and can't do it: the can't wins and she is never assigned.
  const people = [{ id: "a", name: "Ana", owns: ["cook"], cannot: ["cook"] }, { id: "b", name: "Ben" }, { id: "c", name: "Cas" }];
  const rota = E.makeRota(people, CHORES, { weeks: 1 });
  assert.ok(doer(rota, "cook").every((id) => id !== "a"));
});

test("with no owners set the rota is unchanged", () => {
  const rota = E.makeRota(PEOPLE, CHORES, { weeks: 2 });
  assert.equal(rota.jobs.length, 2 * (7 + 1)); // daily cook + weekly bins over 2 weeks
});
