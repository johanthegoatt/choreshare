// Suds, the soap bubble who helps you set up the rota. Suds watches your
// pointer (or whatever you tap or type in on a phone), blinks, bounces when
// tapped, gives a tip that fits the step you are on, reacts to what you do,
// and blows bubbles when a week is all done. Everything Suds says goes
// through the bubble's live region, so screen readers hear it too.
(function () {
  "use strict";
  var btn = document.getElementById("suds");
  var bubble = document.getElementById("suds-bubble");
  var dock = document.getElementById("suds-dock");
  var hide = document.getElementById("suds-hide");
  if (!btn) return;

  var still = matchMedia("(prefers-reduced-motion: reduce)");
  var baseMood = "sleepy", tipKey = "start";
  var flashing = false, flashTimer = null, bubbleTimer = null, tapTimes = [], tipIndex = {};
  var ctx = { people: 0, chores: 0 };

  var TIPS = {
    start: [
      "Hi, I'm Suds! Start by adding everyone who lives with you. You too!",
      "Kids can help. Give them a half share and they get about half the time."
    ],
    chores: [
      "Now the chores. Tap \"Add the usual ones\" and fix the minutes to fit your home.",
      "Minutes matter more than counts. A 45 minute bathroom is not the same as 5 minutes of bins.",
      "Hate a chore? Open \"Anyone really hate a chore?\" and tick it."
    ],
    rota: [
      "Tap a job to tick it off, or swap it to someone else.",
      "The line on each bar is a fair share. Close to the line is good.",
      "Tap \"Copy message\" and I'll write the group chat post for you.",
      "The worst jobs move around each week, so nobody gets the bathroom forever."
    ],
    worried: [
      "One chore is very long, so it's hard to split evenly. Try making it two smaller chores.",
      "Swaps count too. Someone may have picked up a lot."
    ]
  };

  function setMood(m) { btn.setAttribute("data-mood", m); }

  function say(text, ms) {
    if (dock.classList.contains("tucked")) return;
    bubble.textContent = text;
    bubble.classList.remove("pop");
    void bubble.offsetWidth;
    bubble.classList.add("pop");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () { bubble.textContent = ""; }, ms || 7000);
  }

  function flash(m, ms) {
    setMood(m);
    flashing = true;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { flashing = false; setMood(baseMood); }, ms || 1400);
  }

  function play(cls) {
    if (still.matches) return;
    btn.classList.remove("hop", "spin");
    void btn.offsetWidth;
    btn.classList.add(cls);
  }
  btn.addEventListener("animationend", function () { btn.classList.remove("hop", "spin"); });

  function context(c) {
    ctx = c;
    if (c.people < 2) { tipKey = "start"; if (baseMood !== "sleepy" || c.people) baseMood = c.people ? "happy" : "sleepy"; }
    else if (!c.chores) { tipKey = "chores"; baseMood = "happy"; }
    if (!flashing) setMood(baseMood);
  }

  function mood(m) {
    tipKey = m === "worried" ? "worried" : "rota";
    baseMood = m;
    if (!flashing) setMood(baseMood);
  }

  function nextTip() {
    var list = TIPS[tipKey] || TIPS.rota;
    var i = tipIndex[tipKey] || 0;
    tipIndex[tipKey] = (i + 1) % list.length;
    return list[i];
  }

  btn.addEventListener("click", function () {
    if (dock.classList.contains("tucked")) {
      dock.classList.remove("tucked");
      remember(false);
      say("I'm back! Tap me any time for a tip.");
      play("hop");
      return;
    }
    var now = Date.now();
    tapTimes = tapTimes.filter(function (t) { return now - t < 1600; });
    tapTimes.push(now);
    if (tapTimes.length >= 5) {
      tapTimes = [];
      play("spin");
      flash("wow", 1200);
      bubbles(10);
      say("Careful, I pop easily! Okay, I don't. I'm very strong soap.");
      return;
    }
    play("hop");
    if (baseMood === "sleepy") flash("happy", 1600);
    say(nextTip());
  });

  hide.addEventListener("click", function () {
    dock.classList.add("tucked");
    bubble.textContent = "";
    remember(true);
  });

  function remember(tucked) {
    try { localStorage.setItem("choreshare.sudsTucked", tucked ? "1" : ""); } catch (e) {}
  }
  try { if (localStorage.getItem("choreshare.sudsTucked")) dock.classList.add("tucked"); } catch (e) {}

  // Eyes follow the pointer, a few pixels at most.
  var pupils = btn.querySelectorAll(".s-pupil");
  var target = null, frame = 0;
  function look() {
    frame = 0;
    if (!target) return;
    var r = btn.getBoundingClientRect();
    var cx = r.left + r.width * 0.48, cy = r.top + r.height * 0.5;
    var dx = target.x - cx, dy = target.y - cy;
    var d = Math.hypot(dx, dy) || 1;
    var reach = Math.min(1, d / 220);
    var x = (dx / d) * 3.5 * reach, y = (dy / d) * 4 * reach;
    pupils.forEach(function (p) { p.style.transform = "translate(" + x.toFixed(2) + "px," + y.toFixed(2) + "px)"; });
  }
  window.addEventListener("pointermove", function (ev) {
    target = { x: ev.clientX, y: ev.clientY };
    if (!frame) frame = requestAnimationFrame(look);
  }, { passive: true });
  document.addEventListener("focusin", function (ev) {
    var r = ev.target.getBoundingClientRect && ev.target.getBoundingClientRect();
    if (!r || ev.target === btn) return;
    target = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    if (!frame) frame = requestAnimationFrame(look);
  });

  (function blink() {
    setTimeout(function () {
      if (baseMood !== "sleepy" && !document.hidden) {
        btn.classList.add("blink");
        setTimeout(function () { btn.classList.remove("blink"); }, 140);
      }
      blink();
    }, 2600 + Math.random() * 3800);
  })();

  // Little bubbles float up from Suds.
  function bubbles(n) {
    if (still.matches) return;
    var r = btn.getBoundingClientRect();
    for (var i = 0; i < n; i++) {
      var b = document.createElement("span");
      b.className = "pop-bubble";
      var size = 8 + Math.random() * 14;
      b.style.width = b.style.height = size + "px";
      b.style.left = r.left + r.width * (0.2 + Math.random() * 0.6) + "px";
      b.style.top = r.top + r.height * 0.3 + "px";
      document.body.appendChild(b);
      var dx = (Math.random() - 0.5) * 120, dy = -(160 + Math.random() * 220);
      var a = b.animate([
        { transform: "translate(0,0) scale(.6)", opacity: 0.9 },
        { transform: "translate(" + dx / 2 + "px," + dy / 2 + "px) scale(1)", opacity: 0.9, offset: 0.6 },
        { transform: "translate(" + dx + "px," + dy + "px) scale(1.3)", opacity: 0 }
      ], { duration: 1400 + Math.random() * 700, easing: "ease-out" });
      a.onfinish = (function (node) { return function () { node.remove(); }; })(b);
    }
  }

  function react(what, d) {
    d = d || {};
    switch (what) {
      case "hello":
        say("Hi, I'm Suds! I'll help you share the chores fairly. Who lives with you?", 9000);
        break;
      case "opened":
        play("hop");
        flash("wow", 1000);
        say("Someone shared this rota with you. Find your name and tap a job when it's done.", 9000);
        break;
      case "person":
        play("hop");
        if (d.count === 1) say("Hi " + d.name + "! Who else lives here?");
        else if (d.count === 2) say("Hi " + d.name + "! Two people. Now add the chores.");
        else say("Hi " + d.name + "! That's " + d.count + " people.");
        break;
      case "dupe": flash("worried", 1200); say(d.name + " is already here. Add a last initial if there are two."); break;
      case "share":
        say(d.share === 1 ? d.name + " is on a full share." : d.name + " now gets about " + (d.share === 0.5 ? "half" : "a quarter") + " of the time.");
        break;
      case "usual":
        play("hop");
        flash("wow", 900);
        say(d.added ? "Added " + d.added + " usual chores. Change the minutes so they fit your home." : "You already have all the usual ones!");
        break;
      case "removed": flash("worried", 1000); say("Poof! " + d.what + " is gone."); break;
      case "hate":
        say(d.on ? "Got it. I'll keep " + d.chore + " away from " + d.name + " when I can." : "Okay, " + d.name + " can get " + d.chore + " again.");
        break;
      case "swap": play("hop"); say("Swapped to " + d.to + ". I moved other jobs around to keep it fair."); break;
      case "done":
        play("hop");
        if (d.left === 0) {
          flash("party", 2000);
          bubbles(16);
          say("That's everything for " + d.name + " this week. Great job!");
        } else {
          say("Nice one, " + d.name + "! " + d.left + " more to go.");
        }
        break;
      case "copied": play("hop"); say("Copied! Paste it in the group chat so everyone knows."); break;
      case "link": say("Anyone with the link sees the same rota. They can tick off their own jobs."); break;
      case "reset": setMood("sleepy"); baseMood = "sleepy"; say("All clean. Let's start again!"); break;
    }
  }

  window.Suds = { mood: mood, react: react, context: context, say: say };
})();
