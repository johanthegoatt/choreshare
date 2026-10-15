// ChoreShare engine: turns a list of people and chores into a fair rota.
// Pure functions, no DOM, so the same file runs in the page and in node --test.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ChoreEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // How often a chore comes round, and on which days of which weeks.
  // Weeks are counted from the start of the rota (week 0, 1, 2 ...).
  var HOW_OFTEN = {
    daily: { label: "Every day", days: [0, 1, 2, 3, 4, 5, 6], everyWeeks: 1 },
    thrice: { label: "3 times a week", days: [0, 2, 4], everyWeeks: 1 },
    twice: { label: "Twice a week", days: [1, 4], everyWeeks: 1 },
    weekly: { label: "Once a week", days: [5], everyWeeks: 1 },
    fortnightly: { label: "Every 2 weeks", days: [5], everyWeeks: 2 },
    monthly: { label: "Every 4 weeks", days: [6], everyWeeks: 4 }
  };

  // Scoring weights. A job goes to whoever ends up with the lowest score.
  // Load is measured in minutes divided by each person's share, so someone
  // on a half share is "full" at half the minutes.
  var REPEAT_WEIGHT = 0.6; // nudges the same chore to rotate between people
  var DISLIKE_WEIGHT = 1.0; // a hated job only lands on you if others are busier

  function jobsFor(chores, weeks) {
    var jobs = [];
    for (var w = 0; w < weeks; w++) {
      chores.forEach(function (chore) {
        var plan = HOW_OFTEN[chore.often] || HOW_OFTEN.weekly;
        if (w % plan.everyWeeks !== 0) return;
        plan.days.forEach(function (d) {
          jobs.push({
            key: chore.id + "@" + w + "-" + d,
            choreId: chore.id,
            week: w,
            day: d,
            minutes: Math.max(1, Number(chore.minutes) || 1)
          });
        });
      });
    }
    return jobs;
  }

  function shareOf(person) {
    var s = Number(person.share);
    return s > 0 ? s : 1;
  }

  // Build the rota one week at a time, carrying everyone's running total
  // forward so a heavy week for one person is paid back the next week.
  // Inside a week, jobs go out longest first (Graham's LPT rule, 1969), which
  // keeps the biggest totals close to the best split possible.
  function makeRota(people, chores, opts) {
    opts = opts || {};
    var weeks = opts.weeks || 4;
    var overrides = opts.overrides || {};
    var jobs = jobsFor(chores, weeks);
    var result = { jobs: [], weeks: weeks };
    if (!people.length) return result;

    var load = {}, count = {};
    people.forEach(function (p) { load[p.id] = 0; count[p.id] = {}; });
    var hates = {};
    people.forEach(function (p) {
      hates[p.id] = {};
      (p.dislikes || []).forEach(function (c) { hates[p.id][c] = true; });
    });
    var ids = {};
    people.forEach(function (p) { ids[p.id] = true; });
    var away = {};
    people.forEach(function (p) {
      away[p.id] = {};
      (p.away || []).forEach(function (d) { away[p.id][d] = true; });
    });

    for (var w = 0; w < weeks; w++) {
      var week = jobs.filter(function (j) { return j.week === w; });
      week.sort(function (a, b) {
        return b.minutes - a.minutes || a.day - b.day || (a.choreId < b.choreId ? -1 : a.choreId > b.choreId ? 1 : 0);
      });
      week.forEach(function (job) {
        var who = overrides[job.key];
        if (!ids[who]) {
          var best = null, bestScore = Infinity;
          // Nobody gets a job on a day they are not home, unless nobody is.
          var home = people.filter(function (p) { return !away[p.id][job.day]; });
          (home.length ? home : people).forEach(function (p, index) {
            var s = shareOf(p);
            var times = count[p.id][job.choreId] || 0;
            var score = (load[p.id] + job.minutes) / s +
              REPEAT_WEIGHT * job.minutes * times / s +
              (hates[p.id][job.choreId] ? DISLIKE_WEIGHT * job.minutes * 2 / s : 0);
            // Ties go to the person listed first, so the result is repeatable.
            if (score < bestScore - 1e-9 || (Math.abs(score - bestScore) <= 1e-9 && best === null)) {
              best = p.id;
              bestScore = score;
            }
            void index;
          });
          who = best;
        }
        load[who] += job.minutes;
        count[who][job.choreId] = (count[who][job.choreId] || 0) + 1;
        result.jobs.push(Object.assign({}, job, { personId: who, swapped: !!overrides[job.key] && ids[overrides[job.key]] }));
      });
    }

    result.jobs.sort(function (a, b) { return a.week - b.week || a.day - b.day || b.minutes - a.minutes; });
    return result;
  }

  // Minutes per person against what a fair split would give them.
  function fairness(people, rota, week) {
    var jobs = week == null ? rota.jobs : rota.jobs.filter(function (j) { return j.week === week; });
    var total = 0, mins = {};
    people.forEach(function (p) { mins[p.id] = 0; });
    jobs.forEach(function (j) { mins[j.personId] = (mins[j.personId] || 0) + j.minutes; total += j.minutes; });
    var shares = people.reduce(function (t, p) { return t + shareOf(p); }, 0);
    var worst = 0;
    var rows = people.map(function (p) {
      var fair = shares ? total * shareOf(p) / shares : 0;
      var off = fair ? (mins[p.id] - fair) / fair : 0;
      if (Math.abs(off) > Math.abs(worst)) worst = off;
      return { personId: p.id, minutes: mins[p.id], fair: fair, off: off };
    });
    return { total: total, rows: rows, worst: worst };
  }

  // Monday of the week a date falls in, as YYYY-MM-DD in local time.
  function mondayOf(date) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var back = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - back);
    return iso(d);
  }

  function iso(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  function dateOf(start, week, day) {
    var parts = start.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2] + week * 7 + day);
  }

  // Which rota week "today" falls in. The rota repeats after its last week.
  function weekIndex(start, today, weeks) {
    var a = dateOf(start, 0, 0);
    var b = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var days = Math.round((b - a) / 86400000);
    var w = Math.floor(days / 7);
    return ((w % weeks) + weeks) % weeks;
  }

  // An iCalendar file of one person's jobs, each repeating with the rota.
  // All-day events, since a chore has a day but rarely a time.
  function toIcs(people, chores, rota, start, personId, now) {
    var names = {};
    chores.forEach(function (c) { names[c.id] = c.name; });
    var person = people.find(function (p) { return p.id === personId; });
    var stamp = (now || new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ChoreShare//EN", "CALSCALE:GREGORIAN",
      "X-WR-CALNAME:" + icsText("Chores" + (person ? " for " + person.name : ""))];
    rota.jobs.forEach(function (j) {
      if (j.personId !== personId) return;
      var day = dateOf(start, j.week, j.day);
      var next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
      lines.push(
        "BEGIN:VEVENT",
        "UID:" + j.key + "-" + start + "@choreshare",
        "DTSTAMP:" + stamp,
        "DTSTART;VALUE=DATE:" + iso(day).replace(/-/g, ""),
        "DTEND;VALUE=DATE:" + iso(next).replace(/-/g, ""),
        // The rota repeats every `weeks` weeks; a year of repeats is plenty.
        "RRULE:FREQ=WEEKLY;INTERVAL=" + rota.weeks + ";COUNT=" + Math.ceil(52 / rota.weeks),
        "SUMMARY:" + icsText((names[j.choreId] || "Chore") + " (" + j.minutes + " min)"),
        "TRANSP:TRANSPARENT",
        "END:VEVENT"
      );
    });
    lines.push("END:VCALENDAR");
    return lines.map(fold).join("\r\n") + "\r\n";
  }

  // RFC 5545 3.3.11: escape backslash, semicolon, comma and newlines.
  function icsText(text) {
    return String(text).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  }

  // RFC 5545 3.1: lines longer than 75 octets continue after CRLF + space.
  function fold(line) {
    var out = "";
    var bytes = 0;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      var size = encodeURIComponent(ch).replace(/%[0-9A-F]{2}/g, "x").length;
      if (bytes + size > 75) {
        out += "\r\n ";
        bytes = 1;
      }
      out += ch;
      bytes += size;
    }
    return out;
  }

  // The group-chat message for one week.
  function weekMessage(people, chores, rota, week, start) {
    var names = {}, choreNames = {};
    people.forEach(function (p) { names[p.id] = p.name; });
    chores.forEach(function (c) { choreNames[c.id] = c.name; });
    var monday = dateOf(start, week, 0);
    var lines = ["Chores for the week of " + monday.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + ":"];
    people.forEach(function (p) {
      var mine = rota.jobs.filter(function (j) { return j.week === week && j.personId === p.id; });
      if (!mine.length) { lines.push(p.name + ": a week off"); return; }
      var byChore = {};
      var order = [];
      mine.forEach(function (j) {
        if (!byChore[j.choreId]) { byChore[j.choreId] = []; order.push(j.choreId); }
        byChore[j.choreId].push(DAYS[j.day]);
      });
      var mins = mine.reduce(function (t, j) { return t + j.minutes; }, 0);
      lines.push(p.name + " (" + mins + " min): " + order.map(function (c) {
        return choreNames[c] + " " + byChore[c].join("/");
      }).join(", "));
    });
    return lines.join("\n");
  }

  // Share links carry the whole setup in the URL fragment, which the browser
  // never sends to a server.
  function encode(data) {
    var json = JSON.stringify(data);
    var b64 = typeof btoa === "function"
      ? btoa(unescape(encodeURIComponent(json)))
      : Buffer.from(json, "utf8").toString("base64");
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function decode(text) {
    try {
      var b64 = text.replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      var json = typeof atob === "function"
        ? decodeURIComponent(escape(atob(b64)))
        : Buffer.from(b64, "base64").toString("utf8");
      var data = JSON.parse(json);
      if (!data || !Array.isArray(data.people) || !Array.isArray(data.chores)) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  return {
    DAYS: DAYS,
    HOW_OFTEN: HOW_OFTEN,
    jobsFor: jobsFor,
    makeRota: makeRota,
    fairness: fairness,
    mondayOf: mondayOf,
    dateOf: dateOf,
    weekIndex: weekIndex,
    weekMessage: weekMessage,
    toIcs: toIcs,
    encode: encode,
    decode: decode
  };
});
