const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../src/engine.js");

const flat = [
  { id: "a", name: "Ana" },
  { id: "b", name: "Ben" },
  { id: "c", name: "Cy" }
];

const chores = [
  { id: "dishes", name: "Dishes", minutes: 20, often: "daily" },
  { id: "bins", name: "Bins out", minutes: 5, often: "twice" },
  { id: "bath", name: "Clean the bathroom", minutes: 45, often: "weekly" },
  { id: "floors", name: "Hoover and mop", minutes: 40, often: "weekly" },
  { id: "kitchen", name: "Deep clean kitchen", minutes: 60, often: "fortnightly" },
  { id: "fridge", name: "Clear the fridge", minutes: 25, often: "monthly" }
];

test("jobs follow how often each chore comes round", () => {
  const jobs = E.jobsFor(chores, 4);
  const count = (id) => jobs.filter((j) => j.choreId === id).length;
  assert.equal(count("dishes"), 28);
  assert.equal(count("bins"), 8);
  assert.equal(count("bath"), 4);
  assert.equal(count("kitchen"), 2);
  assert.equal(count("fridge"), 1);
});

test("over four weeks everyone ends within 10% of a fair share", () => {
  const rota = E.makeRota(flat, chores, { weeks: 4 });
  const f = E.fairness(flat, rota);
  assert.equal(rota.jobs.length, E.jobsFor(chores, 4).length);
  assert.ok(Math.abs(f.worst) < 0.1, `worst ${f.worst}`);
});

test("the worst job rotates instead of sticking to one person", () => {
  const rota = E.makeRota(flat, chores, { weeks: 4 });
  const who = new Set(rota.jobs.filter((j) => j.choreId === "bath").map((j) => j.personId));
  assert.ok(who.size >= 2, "bathroom should not always be the same person");
});

test("a weekly chore never lands on the same person two weeks running", () => {
  const rota = E.makeRota(flat, chores, { weeks: 4 });
  ["bath", "floors"].forEach((cid) => {
    const byWeek = {};
    rota.jobs.filter((j) => j.choreId === cid).forEach((j) => { byWeek[j.week] = j.personId; });
    const weeks = Object.keys(byWeek).map(Number).sort((a, b) => a - b);
    for (let i = 1; i < weeks.length; i++) {
      assert.notEqual(byWeek[weeks[i]], byWeek[weeks[i - 1]], `${cid} repeated in weeks ${weeks[i - 1]}->${weeks[i]}`);
    }
  });
});

test("a half share gets about half the minutes", () => {
  const family = [
    { id: "m", name: "Mum" },
    { id: "d", name: "Dad" },
    { id: "k", name: "Kid", share: 0.5 }
  ];
  const rota = E.makeRota(family, chores, { weeks: 4 });
  const f = E.fairness(family, rota);
  const mins = Object.fromEntries(f.rows.map((r) => [r.personId, r.minutes]));
  const ratio = mins.k / ((mins.m + mins.d) / 2);
  assert.ok(ratio > 0.4 && ratio < 0.6, `ratio ${ratio}`);
});

test("a chore someone hates goes to others when that stays fair", () => {
  const people = flat.map((p) => (p.id === "a" ? { ...p, dislikes: ["bath"] } : p));
  const rota = E.makeRota(people, chores, { weeks: 4 });
  assert.equal(rota.jobs.filter((j) => j.choreId === "bath" && j.personId === "a").length, 0);
  assert.ok(Math.abs(E.fairness(people, rota).worst) < 0.15);
});

test("if everyone hates it, it is still shared out", () => {
  const people = flat.map((p) => ({ ...p, dislikes: ["bath"] }));
  const rota = E.makeRota(people, chores, { weeks: 4 });
  const who = new Set(rota.jobs.filter((j) => j.choreId === "bath").map((j) => j.personId));
  assert.ok(who.size >= 2);
});

test("a swap sticks and the rest rebalances around it", () => {
  const base = E.makeRota(flat, chores, { weeks: 4 });
  const job = base.jobs.find((j) => j.choreId === "bath" && j.week === 0);
  const other = flat.find((p) => p.id !== job.personId).id;
  const rota = E.makeRota(flat, chores, { weeks: 4, overrides: { [job.key]: other } });
  const moved = rota.jobs.find((j) => j.key === job.key);
  assert.equal(moved.personId, other);
  assert.equal(moved.swapped, true);
  assert.ok(Math.abs(E.fairness(flat, rota).worst) < 0.12);
});

test("a swap to someone who left the rota is ignored", () => {
  const job = E.makeRota(flat, chores).jobs[0];
  const rota = E.makeRota(flat, chores, { overrides: { [job.key]: "gone" } });
  assert.ok(flat.some((p) => p.id === rota.jobs.find((j) => j.key === job.key).personId));
});

test("same input, same rota", () => {
  assert.deepEqual(E.makeRota(flat, chores), E.makeRota(flat, chores));
});

test("no people means no jobs handed out", () => {
  assert.equal(E.makeRota([], chores).jobs.length, 0);
});

test("weeks start on Monday and today finds its rota week", () => {
  assert.equal(E.mondayOf(new Date(2026, 9, 11)), "2026-10-05"); // a Sunday
  assert.equal(E.mondayOf(new Date(2026, 9, 12)), "2026-10-12");
  assert.equal(E.weekIndex("2026-10-05", new Date(2026, 9, 11), 4), 0);
  assert.equal(E.weekIndex("2026-10-05", new Date(2026, 9, 12), 4), 1);
  assert.equal(E.weekIndex("2026-10-05", new Date(2026, 10, 2), 4), 0); // repeats
  assert.equal(E.weekIndex("2026-10-05", new Date(2026, 9, 1), 4), 3); // before start
});

test("the group message lists each person's chores and days", () => {
  const rota = E.makeRota(flat, chores);
  const text = E.weekMessage(flat, chores, rota, 0, "2026-10-05");
  assert.match(text, /^Chores for the week of 5 Oct:/);
  for (const p of flat) assert.match(text, new RegExp("\\n" + p.name + " \\(\\d+ min\\): "));
  assert.match(text, /Dishes (Mon|Tue|Wed|Thu|Fri|Sat|Sun)/);
});

test("share links round-trip, including accents and emoji", () => {
  const data = { people: [{ id: "a", name: "Zoë 🧽" }], chores, start: "2026-10-05" };
  assert.deepEqual(E.decode(E.encode(data)), data);
  assert.equal(E.decode("not-a-link"), null);
  assert.equal(E.decode(E.encode({ hello: 1 })), null);
});

test("nobody gets a job on a day they are away", () => {
  const people = [{ id: "a", name: "Ana", away: [5, 6] }, { id: "b", name: "Ben" }, { id: "c", name: "Cy" }];
  const rota = E.makeRota(people, chores, { weeks: 4 });
  const weekendForAna = rota.jobs.filter((j) => j.personId === "a" && (j.day === 5 || j.day === 6));
  assert.equal(weekendForAna.length, 0);
  const fair = E.fairness(people, rota);
  // Ana can only take weekday jobs, so she runs a little under her share.
  assert.ok(Math.abs(fair.worst) < 0.2, `worst ${fair.worst}`);
});

test("when everyone is away the job still goes to someone", () => {
  const people = [{ id: "a", name: "Ana", away: [5] }, { id: "b", name: "Ben", away: [5] }];
  const rota = E.makeRota(people, [{ id: "bath", name: "Bath", minutes: 45, often: "weekly" }], { weeks: 2 });
  assert.equal(rota.jobs.length, 2);
  assert.ok(rota.jobs.every((j) => j.personId === "a" || j.personId === "b"));
});

test("calendar export has one repeating all-day event per job", () => {
  const people = [{ id: "a", name: "Ana" }, { id: "b", name: "Ben" }];
  const list = [{ id: "bath", name: "Bathroom, upstairs; deep", minutes: 45, often: "weekly" }];
  const rota = E.makeRota(people, list, { weeks: 4 });
  const ics = E.toIcs(people, list, rota, "2026-10-12", "a", new Date("2026-10-12T09:00:00Z"));
  const events = ics.split("BEGIN:VEVENT").length - 1;
  assert.equal(events, rota.jobs.filter((j) => j.personId === "a").length);
  assert.match(ics, /DTSTART;VALUE=DATE:202610\d\d/);
  assert.match(ics, /RRULE:FREQ=WEEKLY;INTERVAL=4;COUNT=13/);
  assert.ok(ics.includes("SUMMARY:Bathroom\\, upstairs\\; deep (45 min)"));
  assert.ok(ics.split("\r\n").every((line) => Buffer.byteLength(line) <= 75));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
});

test("someone away a whole week gets no jobs that week", () => {
  var people = [
    { id: "a", name: "Ana", awayWeeks: [1] },
    { id: "b", name: "Bo" },
    { id: "c", name: "Cy" }
  ];
  var chores = [{ id: "x", name: "Kitchen", minutes: 20, often: "daily" }];
  var rota = E.makeRota(people, chores, { weeks: 4 });
  var week1 = rota.jobs.filter(function (j) { return j.week === 1; });
  assert.ok(week1.length > 0);
  assert.equal(week1.filter(function (j) { return j.personId === "a"; }).length, 0);
  // In a week she is around, she still gets some.
  var week0 = rota.jobs.filter(function (j) { return j.week === 0 && j.personId === "a"; });
  assert.ok(week0.length > 0);
});

test("a week away does not count against your fair share", () => {
  var people = [
    { id: "a", name: "Ana", awayWeeks: [0, 1] },
    { id: "b", name: "Bo" }
  ];
  var chores = [{ id: "x", name: "Kitchen", minutes: 30, often: "daily" }];
  var rota = E.makeRota(people, chores, { weeks: 4 });
  var f = E.fairness(people, rota);
  var ana = f.rows.find(function (r) { return r.personId === "a"; });
  var bo = f.rows.find(function (r) { return r.personId === "b"; });
  // Ana is around half the weeks, so her fair share is about half of Bo's.
  assert.ok(Math.abs(ana.fair * 2 - bo.fair) < 1e-6);
  // And having done fewer minutes should not read as wildly unfair.
  assert.ok(Math.abs(ana.off) < 0.2);
});

test("if everyone is away a week the jobs still get shared out", () => {
  var people = [
    { id: "a", name: "Ana", awayWeeks: [0] },
    { id: "b", name: "Bo", awayWeeks: [0] }
  ];
  var chores = [{ id: "x", name: "Kitchen", minutes: 20, often: "weekly" }];
  var rota = E.makeRota(people, chores, { weeks: 2 });
  var week0 = rota.jobs.filter(function (j) { return j.week === 0; });
  assert.ok(week0.length > 0);
  assert.ok(week0.every(function (j) { return j.personId === "a" || j.personId === "b"; }));
});

test("a hard 'can't do' keeps that chore off a person entirely", () => {
  // Cy can't do the bathroom (say, the bleach). It should never land on them.
  const people = [
    { id: "a", name: "Ana" },
    { id: "b", name: "Ben" },
    { id: "c", name: "Cy", cannot: ["bath"] }
  ];
  const rota = E.makeRota(people, chores, { weeks: 6 });
  const bath = rota.jobs.filter((j) => j.choreId === "bath");
  assert.ok(bath.length > 0);
  assert.ok(bath.every((j) => j.personId !== "c"), "Cy should never get the bathroom");
  // Cy still does other chores, so they're not let off the hook.
  assert.ok(rota.jobs.some((j) => j.personId === "c"));
});

test("a 'can't do' still assigns the chore when only that person is free", () => {
  // Only Cy is around in week 1 (others away that whole week), and Cy can't do
  // the bathroom. It must still be assigned, to Cy, rather than vanish.
  const people = [
    { id: "a", name: "Ana", awayWeeks: [0] },
    { id: "c", name: "Cy", cannot: ["bath"] }
  ];
  const only = [{ id: "bath", name: "Clean the bathroom", minutes: 45, often: "weekly" }];
  const rota = E.makeRota(people, only, { weeks: 1 });
  const bath = rota.jobs.filter((j) => j.choreId === "bath");
  assert.equal(bath.length, 1);
  assert.equal(bath[0].personId, "c");
});

test("'can't do' survives a share-link round trip", () => {
  const people = [{ id: "c", name: "Cy", cannot: ["bath"], dislikes: ["bins"] }];
  const back = E.decode(E.encode({ people, chores, weeks: 4 }));
  assert.deepEqual(back.people[0].cannot, ["bath"]);
  assert.deepEqual(back.people[0].dislikes, ["bins"]);
});
