// ChoreShare page: keeps the setup, draws the three steps and the rota,
// and tells Suds what is going on.
(function () {
  "use strict";
  var E = window.ChoreEngine;
  var Suds = window.Suds || { mood: function () {}, react: function () {} };
  var KEY = "choreshare.v1";
  var WEEKS = 4;

  var USUAL = [
    ["Dishes", 20, "daily"],
    ["Bins and recycling out", 5, "twice"],
    ["Clean the bathroom", 45, "weekly"],
    ["Hoover and mop", 40, "weekly"],
    ["Wipe kitchen tops and hob", 10, "thrice"],
    ["Food shop", 60, "weekly"],
    ["Change bed sheets", 15, "fortnightly"],
    ["Clear out the fridge", 25, "monthly"]
  ];

  var state = load() || blank();
  var viewWeek = E.weekIndex(state.start, new Date(), WEEKS);
  var rota = null;

  function blank() {
    return { people: [], chores: [], overrides: {}, done: {}, start: E.mondayOf(new Date()), seq: 1 };
  }

  function load() {
    var fromLink = location.hash.length > 1 ? E.decode(location.hash.slice(1)) : null;
    if (fromLink) {
      history.replaceState(null, "", location.pathname + location.search);
      return normalise(fromLink, true);
    }
    try {
      var saved = JSON.parse(localStorage.getItem(KEY));
      return saved && Array.isArray(saved.people) ? normalise(saved, false) : null;
    } catch (e) {
      return null;
    }
  }

  function normalise(d, fromLink) {
    var seq = 1;
    (d.people || []).concat(d.chores || []).forEach(function (x) {
      var n = parseInt(String(x.id).slice(1), 10);
      if (n >= seq) seq = n + 1;
    });
    return {
      people: d.people || [],
      chores: d.chores || [],
      overrides: d.overrides || {},
      done: fromLink ? {} : d.done || {},
      start: /^\d{4}-\d{2}-\d{2}$/.test(d.start) ? d.start : E.mondayOf(new Date()),
      seq: Math.max(seq, d.seq || 1),
      linked: !!fromLink
    };
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      // Storage blocked (private mode): the rota still works for this visit.
    }
  }

  function id(prefix) { return prefix + state.seq++; }
  function $(s) { return document.getElementById(s); }
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") n.className = attrs[k];
      else if (k in n && k !== "list") n[k] = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    if (text != null) n.textContent = text;
    return n;
  }
  function personName(pid) {
    var p = state.people.find(function (x) { return x.id === pid; });
    return p ? p.name : "?";
  }
  function choreById(cid) { return state.chores.find(function (c) { return c.id === cid; }); }

  var toastTimer = null;
  function toast(text) {
    var t = $("toast");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  // ---- Step 1: people ----
  $("person-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var input = $("person-name");
    var name = input.value.trim().replace(/\s+/g, " ");
    if (!name) return;
    if (state.people.some(function (p) { return p.name.toLowerCase() === name.toLowerCase(); })) {
      toast(name + " is already on the list.");
      Suds.react("dupe", { name: name });
      return;
    }
    state.people.push({ id: id("p"), name: name, share: 1, dislikes: [] });
    input.value = "";
    input.focus();
    changed();
    Suds.react("person", { name: name, count: state.people.length });
  });

  function drawPeople() {
    var ul = $("people");
    ul.replaceChildren();
    state.people.forEach(function (p) {
      var li = el("li", { class: "person" });
      li.append(el("span", { class: "name" }, p.name));
      var sel = el("select", { "aria-label": "Share for " + p.name });
      [[1, "Full share"], [0.5, "Half share"], [0.25, "Quarter share"]].forEach(function (o) {
        var opt = el("option", { value: String(o[0]) }, o[1]);
        if (Number(p.share) === o[0]) opt.selected = true;
        sel.append(opt);
      });
      sel.addEventListener("change", function () {
        p.share = Number(sel.value);
        changed();
        Suds.react("share", { name: p.name, share: p.share });
      });
      var x = el("button", { type: "button", class: "x", "aria-label": "Remove " + p.name }, "×");
      x.addEventListener("click", function () {
        state.people = state.people.filter(function (q) { return q !== p; });
        changed();
        Suds.react("removed", { what: p.name });
      });
      li.append(sel, x);
      ul.append(li);
    });
  }

  function drawAway() {
    var box = $("away");
    box.replaceChildren();
    if (!state.people.length) {
      box.append(el("p", { class: "hint" }, "Add people first."));
      return;
    }
    var table = el("table");
    var head = el("tr");
    head.append(el("th", { scope: "col" }, "Away on"));
    E.DAYS.forEach(function (d) { head.append(el("th", { scope: "col" }, d)); });
    table.append(head);
    state.people.forEach(function (p) {
      var tr = el("tr");
      tr.append(el("th", { scope: "row" }, p.name));
      E.DAYS.forEach(function (d, day) {
        var td = el("td");
        var box2 = el("input", { type: "checkbox", "aria-label": p.name + " is away on " + d });
        box2.checked = (p.away || []).indexOf(day) >= 0;
        box2.addEventListener("change", function () {
          p.away = (p.away || []).filter(function (x) { return x !== day; });
          if (box2.checked) p.away.push(day);
          changed(true);
        });
        td.append(box2);
        tr.append(td);
      });
      table.append(tr);
    });
    box.append(table);
  }

  function drawHoliday() {
    var box = $("holiday");
    box.replaceChildren();
    if (!state.people.length) {
      box.append(el("p", { class: "hint" }, "Add people first."));
      return;
    }
    var table = el("table");
    var head = el("tr");
    head.append(el("th", { scope: "col" }, "Away for"));
    for (var w = 0; w < WEEKS; w++) {
      var mon = E.dateOf(state.start, w, 0);
      head.append(el("th", { scope: "col" }, mon.toLocaleDateString(undefined, { day: "numeric", month: "short" })));
    }
    table.append(head);
    state.people.forEach(function (p) {
      var tr = el("tr");
      tr.append(el("th", { scope: "row" }, p.name));
      for (var wk = 0; wk < WEEKS; wk++) {
        (function (week) {
          var mon = E.dateOf(state.start, week, 0);
          var td = el("td");
          var cb = el("input", { type: "checkbox", "aria-label": p.name + " is away the week of " + mon.toLocaleDateString(undefined, { day: "numeric", month: "short" }) });
          cb.checked = (p.awayWeeks || []).indexOf(week) >= 0;
          cb.addEventListener("change", function () {
            p.awayWeeks = (p.awayWeeks || []).filter(function (x) { return x !== week; });
            if (cb.checked) p.awayWeeks.push(week);
            changed(true);
          });
          td.append(cb);
          tr.append(td);
        })(wk);
      }
      table.append(tr);
    });
    box.append(table);
  }

  // ---- Step 2: chores ----
  function addChore(name, minutes, often, quiet) {
    var c = { id: id("c"), name: name || "", minutes: minutes || 15, often: often || "weekly" };
    state.chores.push(c);
    if (!quiet) {
      changed();
      var inputs = $("chores").querySelectorAll("input[data-field=name]");
      if (inputs.length) inputs[inputs.length - 1].focus();
    }
    return c;
  }

  $("add-chore").addEventListener("click", function () { addChore("", 15, "weekly"); });
  $("add-usual").addEventListener("click", function () {
    var have = {};
    state.chores.forEach(function (c) { have[c.name.toLowerCase()] = true; });
    var added = 0;
    USUAL.forEach(function (u) {
      if (!have[u[0].toLowerCase()]) { addChore(u[0], u[1], u[2], true); added++; }
    });
    changed();
    Suds.react("usual", { added: added });
  });

  function drawChores() {
    var ul = $("chores");
    ul.replaceChildren();
    state.chores.forEach(function (c) {
      var li = el("li", { class: "chore" });
      var name = el("input", { value: c.name, placeholder: "e.g. Take out the bins", maxLength: 40, "aria-label": "Chore name" });
      name.dataset.field = "name";
      name.addEventListener("change", function () {
        c.name = name.value.trim();
        changed(true);
      });
      var mins = el("input", { type: "number", min: 1, max: 600, inputMode: "numeric", value: c.minutes, "aria-label": "Minutes for " + (c.name || "this chore") });
      mins.addEventListener("change", function () {
        var v = Math.round(Number(mins.value));
        c.minutes = v >= 1 ? Math.min(600, v) : 1;
        mins.value = c.minutes;
        changed(true);
      });
      var often = el("select", { "aria-label": "How often" });
      Object.keys(E.HOW_OFTEN).forEach(function (k) {
        var o = el("option", { value: k }, E.HOW_OFTEN[k].label);
        if (c.often === k) o.selected = true;
        often.append(o);
      });
      often.addEventListener("change", function () { c.often = often.value; changed(true); });
      var x = el("button", { type: "button", class: "x", "aria-label": "Remove " + (c.name || "this chore") }, "×");
      x.addEventListener("click", function () {
        state.chores = state.chores.filter(function (d) { return d !== c; });
        state.people.forEach(function (p) { p.dislikes = (p.dislikes || []).filter(function (d) { return d !== c.id; }); });
        changed();
        Suds.react("removed", { what: c.name || "That chore" });
      });
      li.append(name, mins, often, x);
      ul.append(li);
    });
  }

  function drawHates() {
    var box = $("hates");
    box.replaceChildren();
    var named = state.chores.filter(function (c) { return c.name; });
    if (!state.people.length || !named.length) {
      box.append(el("p", { class: "hint" }, "Add people and chores first."));
      return;
    }
    var table = el("table");
    var head = el("tr");
    head.append(el("th", { scope: "col" }, "Chore"));
    state.people.forEach(function (p) { head.append(el("th", { scope: "col" }, p.name)); });
    table.append(head);
    named.forEach(function (c) {
      var tr = el("tr");
      tr.append(el("th", { scope: "row" }, c.name));
      state.people.forEach(function (p) {
        var td = el("td");
        var box2 = el("input", { type: "checkbox", "aria-label": p.name + " hates " + c.name });
        box2.checked = (p.dislikes || []).indexOf(c.id) >= 0;
        box2.addEventListener("change", function () {
          p.dislikes = (p.dislikes || []).filter(function (d) { return d !== c.id; });
          if (box2.checked) p.dislikes.push(c.id);
          changed(true);
          Suds.react("hate", { name: p.name, chore: c.name, on: box2.checked });
        });
        td.append(box2);
        tr.append(td);
      });
      table.append(tr);
    });
    box.append(table);
  }

  // ---- Step 3: the rota ----
  function ready() {
    return state.people.length >= 2 && state.chores.some(function (c) { return c.name; });
  }

  function computeRota() {
    var chores = state.chores.filter(function (c) { return c.name; });
    rota = E.makeRota(state.people, chores, { weeks: WEEKS, overrides: state.overrides });
  }

  function drawRota() {
    var ok = ready();
    $("rota-empty").hidden = ok;
    $("rota-body").hidden = !ok;
    if (!ok) { rota = null; return; }
    computeRota();
    drawWeeks();
    drawBalance();
    drawBoard();
  }

  function drawWeeks() {
    var bar = $("weeks");
    bar.replaceChildren();
    var nowWeek = E.weekIndex(state.start, new Date(), WEEKS);
    for (var w = 0; w < WEEKS; w++) {
      (function (w) {
        var mon = E.dateOf(state.start, w, 0);
        var b = el("button", { type: "button", role: "tab", "aria-selected": String(w === viewWeek) });
        b.append(document.createTextNode("Week of " + mon.toLocaleDateString(undefined, { day: "numeric", month: "short" })));
        if (w === nowWeek) b.append(el("span", { class: "now" }, "now"));
        b.addEventListener("click", function () { viewWeek = w; drawRota(); });
        bar.append(b);
      })(w);
    }
  }

  function drawBalance() {
    var all = E.fairness(state.people, rota);
    var wk = E.fairness(state.people, rota, viewWeek);
    var box = $("balance");
    box.replaceChildren();
    var max = Math.max.apply(null, wk.rows.map(function (r) { return Math.max(r.minutes, r.fair); }).concat([1]));
    wk.rows.forEach(function (r) {
      var row = el("div", { class: "bar-row" });
      row.append(el("span", { class: "who" }, personName(r.personId)));
      var bar = el("div", { class: "bar", role: "img", "aria-label": personName(r.personId) + ": " + r.minutes + " minutes this week, fair share " + Math.round(r.fair) });
      var fill = el("span");
      fill.style.width = (r.minutes / max * 100).toFixed(1) + "%";
      var mark = el("i");
      mark.style.left = (r.fair / max * 100).toFixed(1) + "%";
      bar.append(fill, mark);
      row.append(bar, el("span", { class: "mins" }, r.minutes + " min"));
      box.append(row);
    });
    var pct = Math.round(Math.abs(all.worst) * 100);
    var hours = (all.total / 60 / WEEKS).toFixed(1).replace(/\.0$/, "");
    var text = pct <= 10
      ? "Fair: over 4 weeks everyone is within " + Math.max(pct, 1) + "% of their share. " + hours + " hours of chores a week in total."
      : "Not quite even: someone is " + pct + "% off their share over 4 weeks. Try splitting a long chore in two.";
    box.append(el("p", { class: "verdict" }, text));
    Suds.mood(pct <= 10 ? "happy" : "worried", { worst: pct });
  }

  function drawBoard() {
    var board = $("board");
    board.replaceChildren();
    var nowWeek = E.weekIndex(state.start, new Date(), WEEKS);
    var today = (new Date().getDay() + 6) % 7;
    state.people.forEach(function (p) {
      var mine = rota.jobs.filter(function (j) { return j.week === viewWeek && j.personId === p.id; });
      var col = el("section", { class: "col" });
      var mins = mine.reduce(function (t, j) { return t + j.minutes; }, 0);
      var left = mine.filter(function (j) { return !state.done[doneKey(j)]; }).length;
      var h = el("h3");
      h.append(document.createTextNode(p.name), el("small", null, mins + " min, " + (left ? left + " to do" : "all done")));
      col.append(h);
      var cal = el("button", { type: "button", class: "linkish cal", "aria-label": "Add " + p.name + "'s chores to a calendar" }, "Add to calendar");
      cal.addEventListener("click", function () { downloadCalendar(p); });
      col.append(cal);
      if (!mine.length) col.append(el("p", { class: "off" }, "A week off."));
      var ul = el("ul");
      mine.forEach(function (j) {
        var c = choreById(j.choreId);
        var li = el("li");
        var b = el("button", { type: "button", class: "job" });
        if (state.done[doneKey(j)]) b.classList.add("done");
        if (viewWeek === nowWeek && j.day === today) b.classList.add("today");
        var what = el("span", { class: "what" }, c ? c.name : "");
        if (j.swapped) what.append(el("span", { class: "tag" }, "swapped"));
        b.append(el("span", { class: "day" }, E.DAYS[j.day]), what, el("span", { class: "m" }, j.minutes + "m"));
        b.setAttribute("aria-label", E.DAYS[j.day] + ": " + (c ? c.name : "") + ", " + j.minutes + " minutes" + (state.done[doneKey(j)] ? ", done" : ""));
        b.addEventListener("click", function () { openJob(j); });
        li.append(b);
        ul.append(li);
      });
      col.append(ul);
      board.append(col);
    });
  }

  function downloadCalendar(p) {
    var chores = state.chores.filter(function (c) { return c.name; });
    var ics = E.toIcs(state.people, chores, rota, state.start, p.id);
    var url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    var a = el("a", { href: url, download: "chores-" + p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".ics" });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    toast("Open the file to add " + p.name + "'s chores to a calendar.");
  }

  // Ticks are kept per calendar week, so next cycle's week 1 starts clean.
  function doneKey(j) {
    var cycle = Math.floor(daysSinceStart() / (7 * WEEKS));
    return cycle + ":" + j.key;
  }
  function daysSinceStart() {
    var a = E.dateOf(state.start, 0, 0), n = new Date();
    var b = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    return Math.max(0, Math.round((b - a) / 86400000));
  }

  var openJobRef = null;
  function openJob(j) {
    openJobRef = j;
    var c = choreById(j.choreId);
    $("job-title").textContent = c ? c.name : "";
    $("job-when").textContent = E.dateOf(state.start, j.week, j.day).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) + ", about " + j.minutes + " minutes.";
    $("job-done").checked = !!state.done[doneKey(j)];
    var who = $("job-who");
    who.replaceChildren();
    state.people.forEach(function (p) {
      var o = el("option", { value: p.id }, p.name);
      if (p.id === j.personId) o.selected = true;
      who.append(o);
    });
    $("job-dialog").showModal();
  }

  $("job-dialog").addEventListener("close", function () {
    var j = openJobRef;
    if (!j || $("job-dialog").returnValue !== "save") return;
    var wasDone = !!state.done[doneKey(j)];
    var nowDone = $("job-done").checked;
    if (nowDone) state.done[doneKey(j)] = true;
    else delete state.done[doneKey(j)];
    var to = $("job-who").value;
    if (to !== j.personId) {
      state.overrides[j.key] = to;
      Suds.react("swap", { from: personName(j.personId), to: personName(to) });
    } else if (nowDone && !wasDone) {
      var left = rota.jobs.filter(function (k) {
        return k.week === viewWeek && k.personId === j.personId && k.key !== j.key && !state.done[doneKey(k)];
      }).length;
      Suds.react("done", { name: personName(j.personId), left: left });
    }
    changed(true);
  });

  // ---- Sharing ----
  function shareData() {
    return { people: state.people, chores: state.chores.filter(function (c) { return c.name; }), overrides: state.overrides, start: state.start };
  }

  function copy(text, okMsg) {
    var done = function () { toast(okMsg); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else {
      fallbackCopy(text);
      done();
    }
  }
  function fallbackCopy(text) {
    var t = el("textarea");
    t.value = text;
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.append(t);
    t.select();
    try { document.execCommand("copy"); } catch (e) {}
    t.remove();
  }

  $("copy-msg").addEventListener("click", function () {
    var chores = state.chores.filter(function (c) { return c.name; });
    copy(E.weekMessage(state.people, chores, rota, viewWeek, state.start), "Copied. Paste it in your group chat.");
    Suds.react("copied");
  });
  $("copy-link").addEventListener("click", function () {
    var url = location.origin + location.pathname + "#" + E.encode(shareData());
    copy(url, "Link copied. Anyone who opens it sees this rota.");
    Suds.react("link");
  });
  $("print").addEventListener("click", function () { window.print(); });

  $("start-over").addEventListener("click", function () {
    if (!confirm("Clear everyone and every chore?")) return;
    state = blank();
    viewWeek = 0;
    changed();
    Suds.react("reset");
    $("person-name").focus();
  });

  // ---- Redraw ----
  function changed(keepInputs) {
    save();
    if (!keepInputs) {
      drawPeople();
      drawChores();
    }
    drawAway();
    drawHoliday();
    drawHates();
    drawRota();
    Suds.context({ people: state.people.length, chores: state.chores.filter(function (c) { return c.name; }).length });
  }

  changed();
  if (state.linked) {
    toast("Opened a shared rota.");
    Suds.react("opened");
  } else if (!state.people.length) {
    Suds.react("hello");
  }
})();
