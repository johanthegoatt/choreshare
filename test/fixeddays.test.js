"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../src/engine.js");

test("cleanDays tidies a weekday list", () => {
  assert.deepEqual(E.cleanDays([2, 0, 2, 9, -1, 4]), [0, 2, 4]);
  assert.deepEqual(E.cleanDays(null), []);
});

test("a fixed-day chore lands only on its chosen weekdays, every week", () => {
  // Bins out on Tuesday (1) and Friday (4), whatever the how-often preset says.
  const jobs = E.jobsFor([{ id: "bins", minutes: 5, often: "monthly", fixedDays: [1, 4] }], 2);
  const days = jobs.map((j) => j.day).sort();
  // 2 weeks x {Tue, Fri} = 4 jobs on days 1 and 4 only.
  assert.equal(jobs.length, 4);
  assert.deepEqual([...new Set(days)].sort((a, b) => a - b), [1, 4]);
  // Present in both weeks (fixed days ignore the monthly everyWeeks).
  assert.deepEqual([...new Set(jobs.map((j) => j.week))].sort(), [0, 1]);
});

test("without fixed days the how-often preset still drives it", () => {
  const jobs = E.jobsFor([{ id: "x", minutes: 10, often: "weekly" }], 1);
  assert.equal(jobs.length, 1); // weekly = one day a week
});

test("empty fixed days fall back to the preset", () => {
  const a = E.jobsFor([{ id: "x", minutes: 10, often: "twice", fixedDays: [] }], 1);
  assert.equal(a.length, 2); // twice a week
});
