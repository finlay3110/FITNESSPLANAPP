/* JRFT 8-week prep tracker — plan data in data.js, everything logged in localStorage. */
(function () {
  'use strict';

  var PLAN = window.PLAN_DATA;
  var LIB = PLAN.exerciseLibrary || {};
  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var STORE_KEY = 'jrft-tracker-v1';
  var MEDIA_CACHE = 'jrft-media-v1';
  var CHART_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
  var PRESETS = [45, 60, 90, 120];

  var state = load();
  var currentWeek = state.lastWeek || 1;
  var openDays = {};      // "1.Tue" -> true, so open/closed survives a re-render
  var charts = [];        // live Chart.js instances, destroyed before each progress re-render

  /* ---------------- storage ---------------- */

  function blank() {
    return {
      v: 2,
      startDate: '',
      lastWeek: 1,
      timer: { duration: 90, auto: true, endsAt: 0 },
      days: {}
    };
  }

  function load() {
    var s;
    try {
      var raw = localStorage.getItem(STORE_KEY);
      s = raw ? JSON.parse(raw) : null;
    } catch (e) { /* corrupt or unavailable storage — start fresh */ }
    if (!s || !s.days) return blank();
    // v1 stored no start date, week memory or timer prefs; per-exercise ticks are
    // migrated lazily in exState, where the set count for that exercise is known.
    var base = blank();
    s.v = 2;
    if (typeof s.startDate !== 'string') s.startDate = base.startDate;
    if (typeof s.lastWeek !== 'number') s.lastWeek = base.lastWeek;
    if (!s.timer || typeof s.timer !== 'object') s.timer = base.timer;
    if (typeof s.timer.duration !== 'number') s.timer.duration = 90;
    if (typeof s.timer.auto !== 'boolean') s.timer.auto = true;
    if (typeof s.timer.endsAt !== 'number') s.timer.endsAt = 0;
    return s;
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Could not save progress:', e);
    }
  }

  function dayState(week, day) {
    var key = week + '.' + day;
    if (!state.days[key]) state.days[key] = { done: false, notes: '', level: '', items: {}, ex: {} };
    var s = state.days[key];
    if (!s.items) s.items = {};
    if (!s.ex) s.ex = {};
    return s;
  }

  function exState(week, day, i, target) {
    var s = dayState(week, day);
    if (!s.ex[i]) s.ex[i] = { sets: 0, weight: '', reps: '' };
    var st = s.ex[i];
    if (typeof st.sets !== 'number') st.sets = st.done ? target.required : 0;   // v1 -> v2
    return st;
  }

  /* ---------------- small DOM helper ---------------- */

  function el(tag, props, kids) {
    var n = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        if (k === 'class') n.className = props[k];
        else if (k === 'text') n.textContent = props[k];
        else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), props[k]);
        else if (props[k] === true) n.setAttribute(k, '');
        else if (props[k] !== false && props[k] != null) n.setAttribute(k, props[k]);
      });
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  function $(id) { return document.getElementById(id); }

  /* ---------------- plan lookups ---------------- */

  function weekData(n) { return PLAN.weeks[n - 1]; }
  function dayPlan(week, day) { return weekData(week).days[day]; }

  // "3" -> 3 pips, 3 needed. "3-4" -> 4 pips, 3 needed (the extra set is optional).
  function setsTarget(ex) {
    var nums = String(ex.sets == null ? '' : ex.sets).match(/\d+/g);
    if (!nums) return { pips: 1, required: 1 };
    var lo = parseInt(nums[0], 10) || 1;
    var hi = parseInt(nums[nums.length - 1], 10) || lo;
    return { pips: Math.max(hi, 1), required: Math.max(lo, 1) };
  }

  function exerciseDone(week, day, ex, i) {
    var t = setsTarget(ex);
    return exState(week, day, i, t).sets >= t.required;
  }

  // How many tickable things a day holds, and how many are ticked.
  function dayTally(week, day) {
    var plan = dayPlan(week, day);
    var s = dayState(week, day);
    if (plan.type === 'strength') {
      var list = plan.exercises || [], done = 0;
      list.forEach(function (ex, i) { if (exerciseDone(week, day, ex, i)) done++; });
      return { done: done, total: list.length };
    }
    if (plan.type === 'test') {
      var items = (plan.items || []).length, ticked = 0;
      for (var j = 0; j < items; j++) if (s.items[j]) ticked++;
      return { done: ticked, total: items };
    }
    return { done: s.done ? 1 : 0, total: 1 };
  }

  function weekTally(n) {
    var done = 0, total = 0;
    DAYS.forEach(function (d) {
      var t = dayTally(n, d);
      done += t.done;
      total += t.total;
    });
    return { done: done, total: total };
  }

  function describeTarget(ex) {
    var bits = [];
    if (ex.sets) bits.push(ex.sets + ' sets');
    if (ex.reps) bits.push(ex.reps + (/[a-z]/i.test(String(ex.reps)) ? '' : ' reps'));
    var line = bits.join(' × ');
    if (ex.weight) line += (line ? ' · ' : '') + ex.weight;
    return line;
  }

  function exKey(ex) { return ex.exerciseId || ex.name; }

  // The most recent earlier week this exercise was logged in — the number you actually
  // want in front of you when deciding today's load.
  function lastLogged(week, key) {
    for (var w = week - 1; w >= 1; w--) {
      for (var d = 0; d < DAYS.length; d++) {
        var plan = dayPlan(w, DAYS[d]);
        if (plan.type !== 'strength') continue;
        var list = plan.exercises || [];
        for (var i = 0; i < list.length; i++) {
          if (exKey(list[i]) !== key) continue;
          var st = exState(w, DAYS[d], i, setsTarget(list[i]));
          if ((st.weight || '').trim() || (st.reps || '').trim()) {
            return { week: w, weight: (st.weight || '').trim(), reps: (st.reps || '').trim() };
          }
        }
      }
    }
    return null;
  }

  /* ---------------- dates ---------------- */

  var DAY_MS = 86400000;

  function parseISO(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0) : null;
  }

  function todayNoon() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0);
  }

  function dayOffset() {
    var start = parseISO(state.startDate);
    if (!start) return null;
    return Math.round((todayNoon() - start) / DAY_MS);
  }

  // Where "today" sits in the plan, or null if the plan has not started / has finished.
  function todaySlot() {
    var off = dayOffset();
    if (off == null || off < 0 || off > 55) return null;
    return { week: Math.floor(off / 7) + 1, day: DAYS[off % 7] };
  }

  function daysToTest() {
    var off = dayOffset();
    return off == null ? null : 54 - off;   // week 8, Saturday
  }

  function renderCountdown() {
    var chip = $('countdown');
    var n = daysToTest();
    if (n == null) { chip.hidden = true; return; }
    chip.hidden = false;
    chip.textContent = n > 1 ? n + ' days to test day'
      : n === 1 ? 'Test day tomorrow'
      : n === 0 ? 'Test day today'
      : 'Plan complete';
    chip.classList.toggle('is-close', n >= 0 && n <= 7);
    $('today-btn').hidden = !todaySlot();
  }

  /* ---------------- week selector ---------------- */

  function renderPills() {
    var wrap = $('week-pills');
    wrap.textContent = '';
    PLAN.weeks.forEach(function (w) {
      wrap.appendChild(el('button', {
        class: 'pill', type: 'button', 'data-week': w.week,
        onclick: function () { goToWeek(w.week); }
      }, [el('span', { text: 'Week ' + w.week }), el('span', { class: 'dot', hidden: true, 'aria-label': 'complete' })]));
    });
    syncPills();
  }

  // Updates the pills in place so ticking something never scrolls the strip back to Week 1.
  function syncPills() {
    Array.prototype.forEach.call(document.querySelectorAll('#week-pills .pill'), function (btn) {
      var n = Number(btn.getAttribute('data-week'));
      var t = weekTally(n);
      btn.classList.toggle('is-active', n === currentWeek);
      btn.setAttribute('aria-pressed', n === currentWeek ? 'true' : 'false');
      btn.querySelector('.dot').hidden = !(t.total > 0 && t.done === t.total);
    });
  }

  function goToWeek(n, scroll) {
    currentWeek = n;
    state.lastWeek = n;
    save();
    syncPills();
    renderWeek();
    if (scroll !== false) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------- plan view ---------------- */

  function renderWeek() {
    var w = weekData(currentWeek);
    var head = $('week-head');
    head.textContent = '';
    head.appendChild(el('h2', { text: 'Week ' + w.week + ' — ' + w.title }));
    head.appendChild(el('p', { text: w.goal }));
    head.appendChild(el('div', { class: 'bar' }, [el('span')]));
    head.appendChild(el('p', { class: 'small muted' }));
    updateWeekBar();

    var list = $('days');
    list.textContent = '';
    DAYS.forEach(function (d) { list.appendChild(renderDay(currentWeek, d)); });
  }

  function updateWeekBar() {
    var t = weekTally(currentWeek);
    var pct = t.total ? Math.round((t.done / t.total) * 100) : 0;
    var head = $('week-head');
    head.querySelector('.bar span').style.width = pct + '%';
    head.querySelector('.small').textContent = t.done + ' of ' + t.total + ' items ticked this week';
  }

  function statusNode(week, day) {
    var t = dayTally(week, day);
    return t.total > 0 && t.done === t.total
      ? el('span', { class: 'tick', text: '✓' })
      : el('span', { class: 'count', text: t.total > 1 ? t.done + '/' + t.total : '' });
  }

  function renderDay(week, day) {
    var plan = dayPlan(week, day);
    var key = week + '.' + day;
    var open = !!openDays[key];
    var slot = todaySlot();
    var isToday = !!slot && slot.week === week && slot.day === day;

    var card = el('div', {
      class: 'day' + (open ? ' is-open' : '') + (isToday ? ' is-today' : ''),
      'data-type': plan.type, 'data-day': key
    });

    var head = el('button', {
      class: 'day-head', type: 'button', 'aria-expanded': open ? 'true' : 'false',
      onclick: function () {
        openDays[key] = !openDays[key];
        card.replaceWith(renderDay(week, day));
      }
    }, [
      el('span', { class: 'dayname', text: day }),
      el('span', { class: 'title' }, [
        el('span', { text: plan.title }),
        isToday ? el('span', { class: 'today-chip', text: 'Today' }) : null
      ]),
      statusNode(week, day),
      el('span', { class: 'badge', text: plan.type }),
      el('span', { class: 'chev', text: '▼' })
    ]);
    card.appendChild(head);

    // Body (with its images) is only built once the day is expanded.
    if (open) card.appendChild(renderDayBody(week, day, card));
    return card;
  }

  // Updates the header count, week bar and pills without rebuilding the day body, so
  // open form tips stay open and the photos are not re-fetched.
  function refresh(week, day, card) {
    save();
    card.querySelector('.day-head .tick, .day-head .count').replaceWith(statusNode(week, day));
    updateWeekBar();
    syncPills();
  }

  function renderDayBody(week, day, card) {
    var plan = dayPlan(week, day);
    var s = dayState(week, day);
    var body = el('div', { class: 'day-body' });

    if (plan.type === 'strength') {
      (plan.exercises || []).forEach(function (ex, i) {
        body.appendChild(renderExercise(week, day, ex, i, card));
      });
      body.appendChild(notesField(s));
      return body;
    }

    if (plan.type === 'test') {
      (plan.items || []).forEach(function (item, i) {
        body.appendChild(el('label', { class: 'check-row' }, [
          el('input', {
            type: 'checkbox', checked: !!s.items[i],
            onchange: function (e) {
              if (e.target.checked) s.items[i] = true; else delete s.items[i];
              refresh(week, day, card);
            }
          }),
          el('span', { text: item })
        ]));
      });
      var lvl = el('input', {
        type: 'number', step: '0.1', min: '1', max: '23', inputmode: 'decimal',
        placeholder: 'e.g. 5.4', value: s.level,
        oninput: function (e) { s.level = e.target.value; save(); }
      });
      body.appendChild(el('label', { class: 'field level-field', text: 'Bleep test level reached' }, [lvl]));
      body.appendChild(notesField(s));
      return body;
    }

    // cardio + rest: the session as a read-only list, one big tick, and notes
    var ul = el('ul', { class: 'items' });
    (plan.items || []).forEach(function (item) { ul.appendChild(el('li', { text: item })); });
    body.appendChild(ul);
    body.appendChild(el('label', { class: 'check-row' }, [
      el('input', {
        type: 'checkbox', checked: !!s.done,
        onchange: function (e) { s.done = e.target.checked; refresh(week, day, card); }
      }),
      el('span', { text: plan.type === 'rest' ? 'Rested' : 'Session completed' })
    ]));
    body.appendChild(notesField(s));
    return body;
  }

  function notesField(s) {
    var ta = el('textarea', {
      placeholder: 'How did it feel? Times, splits, anything worth remembering.',
      oninput: function (e) { s.notes = e.target.value; save(); }
    });
    ta.value = s.notes || '';
    return el('label', { class: 'field', text: 'Notes' }, [ta]);
  }

  function renderExercise(week, day, ex, i, card) {
    var target = setsTarget(ex);
    var st = exState(week, day, i, target);
    var lib = ex.exerciseId ? LIB[ex.exerciseId] : null;
    var wrap = el('div', { class: 'ex' });

    var head = el('div', { class: 'ex-head' }, [
      el('span', { class: 'ex-name' }, [
        el('span', { class: 'ex-label', text: ex.name }),
        describeTarget(ex) ? el('span', { class: 'target', text: describeTarget(ex) }) : null
      ]),
      el('span', { class: 'ex-tick', text: '✓' })
    ]);
    wrap.appendChild(head);

    // One pip per set: tapping pip n logs n sets done, tapping the last one undoes it.
    var pips = el('div', { class: 'pips', role: 'group', 'aria-label': 'Sets completed' });
    function paint() {
      wrap.classList.toggle('is-done', st.sets >= target.required);
      Array.prototype.forEach.call(pips.children, function (b, n) {
        var on = n < st.sets;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    for (var n = 0; n < target.pips; n++) {
      (function (idx) {
        pips.appendChild(el('button', {
          class: 'pip' + (idx >= target.required ? ' optional' : ''),
          type: 'button', text: String(idx + 1),
          'aria-label': 'Set ' + (idx + 1) + (idx >= target.required ? ' (optional)' : ''),
          onclick: function () {
            var before = st.sets;
            st.sets = (st.sets === idx + 1) ? idx : idx + 1;
            paint();
            refresh(week, day, card);
            if (st.sets > before) autoRest();
          }
        }));
      })(n);
    }
    wrap.appendChild(el('div', { class: 'sets-row' }, [el('span', { class: 'sets-label', text: 'Sets' }), pips]));

    var weight = el('input', {
      type: 'text', inputmode: 'text', placeholder: ex.weight ? String(ex.weight) : 'weight',
      oninput: function (e) { st.weight = e.target.value; save(); }
    });
    weight.value = st.weight || '';
    var reps = el('input', {
      type: 'text', inputmode: 'text', placeholder: ex.reps ? String(ex.reps) : 'reps',
      oninput: function (e) { st.reps = e.target.value; save(); }
    });
    reps.value = st.reps || '';
    wrap.appendChild(el('div', { class: 'inputs' }, [
      el('label', { text: 'Weight' }, [weight]),
      el('label', { text: 'Reps' }, [reps])
    ]));

    var prev = lastLogged(week, exKey(ex));
    if (prev) {
      var summary = 'Last: ' + [prev.weight, prev.reps ? prev.reps + ' reps' : ''].filter(Boolean).join(' × ')
        + ' (week ' + prev.week + ')';
      wrap.appendChild(el('div', { class: 'lastline' }, [
        el('span', { text: summary }),
        el('button', {
          class: 'use', type: 'button', text: 'Use',
          onclick: function () {
            if (prev.weight) { weight.value = prev.weight; st.weight = prev.weight; }
            if (prev.reps) { reps.value = prev.reps; st.reps = prev.reps; }
            save();
          }
        })
      ]));
    }

    var images = (lib && lib.images) || [];
    if (images.length) {
      var shots = el('div', { class: 'shots' });
      images.forEach(function (src, k) {
        var cap = (lib.name || ex.name) + (images.length > 1 ? (k === 0 ? ' — start position' : ' — end position') : '');
        var img = el('img', { src: src, alt: cap, loading: 'lazy', decoding: 'async' });
        var btn = el('button', {
          type: 'button', 'aria-label': 'Enlarge photo: ' + cap,
          onclick: function () { openLightbox(src, cap); }
        }, [img]);
        img.addEventListener('error', function () { btn.remove(); });
        shots.appendChild(btn);
      });
      wrap.appendChild(shots);
    }

    var cues = (lib && lib.cues) || [];
    if (cues.length) {
      var ul = el('ul');
      cues.forEach(function (c) { ul.appendChild(el('li', { text: c })); });
      wrap.appendChild(el('details', { class: 'cues' }, [el('summary', { text: 'Form tips' }), ul]));
    }

    paint();
    return wrap;
  }

  /* ---------------- lightbox ---------------- */

  var box = $('lightbox'), boxImg = $('lightbox-img'), boxCap = $('lightbox-cap');

  function openLightbox(src, caption) {
    boxImg.src = src;
    boxImg.alt = caption;
    boxCap.textContent = caption;
    box.hidden = false;
    $('lightbox-close').focus();
  }

  function closeLightbox() {
    box.hidden = true;
    boxImg.removeAttribute('src');
  }

  box.addEventListener('click', function (e) { if (e.target !== boxImg) closeLightbox(); });
  $('lightbox-close').addEventListener('click', closeLightbox);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !box.hidden) closeLightbox(); });

  /* ---------------- rest timer ---------------- */

  var audio = null, ticker = null;

  function fmt(sec) {
    sec = Math.max(0, Math.ceil(sec));
    return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
  }

  function beep() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      [0, 0.28, 0.56].forEach(function (offset) {
        var osc = audio.createOscillator(), gain = audio.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.001, audio.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.35, audio.currentTime + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + offset + 0.18);
        osc.connect(gain).connect(audio.destination);
        osc.start(audio.currentTime + offset);
        osc.stop(audio.currentTime + offset + 0.2);
      });
    } catch (e) { /* audio blocked — the visual countdown still works */ }
    if (navigator.vibrate) navigator.vibrate([180, 90, 180]);
  }

  function startRest(seconds) {
    // Touching the audio context inside the tap that starts the timer unlocks it on iOS.
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (e) { /* no audio available */ }
    state.timer.endsAt = Date.now() + seconds * 1000;
    save();
    paintTimer();
  }

  function stopRest() {
    state.timer.endsAt = 0;
    save();
    paintTimer();
  }

  function autoRest() {
    if (state.timer.auto) startRest(state.timer.duration);
  }

  function paintTimer() {
    var running = state.timer.endsAt > Date.now();
    $('timer-idle').hidden = running;
    $('timer-run').hidden = !running;
    if (running) {
      var left = (state.timer.endsAt - Date.now()) / 1000;
      $('timer-left').textContent = fmt(left);
      $('timer-fill').style.width = Math.max(0, Math.min(100, (left / state.timer.duration) * 100)) + '%';
      if (!ticker) ticker = setInterval(paintTimer, 200);
    } else if (ticker) {
      clearInterval(ticker);
      ticker = null;
      if (state.timer.endsAt) {          // ran down rather than being stopped by hand
        state.timer.endsAt = 0;
        save();
        beep();
        var bar = $('timerbar');
        bar.classList.add('done');
        setTimeout(function () { bar.classList.remove('done'); }, 2500);
      }
    }
  }

  function renderTimerControls() {
    var wrap = $('timer-presets');
    wrap.textContent = '';
    PRESETS.forEach(function (sec) {
      wrap.appendChild(el('button', {
        class: 'preset' + (sec === state.timer.duration ? ' on' : ''),
        type: 'button', text: sec < 60 ? sec + 's' : fmt(sec),
        'aria-pressed': sec === state.timer.duration ? 'true' : 'false',
        onclick: function () {
          state.timer.duration = sec;
          save();
          renderTimerControls();
        }
      }));
    });
    $('timer-auto').checked = state.timer.auto;
  }

  $('timer-auto').addEventListener('change', function (e) {
    state.timer.auto = e.target.checked;
    save();
  });
  $('timer-start').addEventListener('click', function () { startRest(state.timer.duration); });
  $('timer-stop').addEventListener('click', stopRest);
  $('timer-add').addEventListener('click', function () {
    state.timer.endsAt = Math.max(Date.now(), state.timer.endsAt) + 30000;
    save();
    paintTimer();
  });

  /* ---------------- progress view ---------------- */

  var GRID = 'rgba(148,163,184,.18)';

  // Logged weights are free text ("2x10kg", "25kg", "12-14kg"). The last number in the
  // string is the useful one to plot: the per-hand load, or the top of a range.
  function numeric(value) {
    var m = String(value == null ? '' : value).match(/\d+(?:\.\d+)?/g);
    return m ? parseFloat(m[m.length - 1]) : null;
  }

  function renderProgress() {
    charts.forEach(function (c) { c.destroy(); });
    charts = [];
    if (window.Chart) {
      Chart.defaults.color = '#97a1b2';
      Chart.defaults.borderColor = GRID;
      Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    }
    renderBleep();
    renderStrength();
  }

  function bleepSeries() {
    return PLAN.weeks.map(function (w) {
      var testDay = DAYS.filter(function (d) { return w.days[d] && w.days[d].type === 'test'; })[0];
      if (!testDay) return null;
      var v = parseFloat(dayState(w.week, testDay).level);
      return isNaN(v) ? null : v;
    });
  }

  function renderBleep() {
    var data = bleepSeries();
    var any = data.some(function (v) { return v != null; });
    var canvas = $('bleep-chart'), note = $('bleep-empty');
    if (!window.Chart) {
      canvas.parentNode.hidden = true;
      note.hidden = false;
      note.textContent = 'Charts need a connection the first time (Chart.js loads from a CDN) — everything you have logged is still saved below and on the plan.';
      return;
    }
    note.hidden = any;
    note.textContent = 'No bleep test levels logged yet. Log a level on a Saturday test day.';
    canvas.parentNode.hidden = !any;
    if (!any) return;
    charts.push(new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: PLAN.weeks.map(function (w) { return 'W' + w.week; }),
        datasets: [{
          label: 'Level reached',
          data: data,
          spanGaps: true,
          borderColor: '#e2b23c',
          backgroundColor: 'rgba(226,178,60,.16)',
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: '#e2b23c',
          pointBorderColor: '#0d1016',
          pointBorderWidth: 2,
          fill: true,
          tension: .25
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: GRID }, ticks: { color: '#97a1b2' } },
          y: {
            beginAtZero: false,
            grid: { color: GRID },
            ticks: { color: '#97a1b2' },
            title: { display: true, text: 'Level', color: '#97a1b2' }
          }
        }
      }
    }));
  }

  // Every strength exercise, in plan order, with the weeks it appears in.
  function strengthGroups() {
    var order = [], byKey = {};
    PLAN.weeks.forEach(function (w) {
      DAYS.forEach(function (d) {
        var plan = w.days[d];
        if (!plan || plan.type !== 'strength') return;
        (plan.exercises || []).forEach(function (ex, i) {
          // Week 8's "optional session or full rest" line is a note, not a tracked lift.
          if (!ex.exerciseId && !ex.sets && !ex.reps) return;
          var key = exKey(ex);
          if (!byKey[key]) {
            byKey[key] = { name: (LIB[ex.exerciseId] && LIB[ex.exerciseId].name) || ex.name, rows: [] };
            order.push(key);
          }
          byKey[key].rows.push({
            week: w.week,
            target: ex.weight || '—',
            logged: (exState(w.week, d, i, setsTarget(ex)).weight || '').trim()
          });
        });
      });
    });
    return order.map(function (k) { return byKey[k]; });
  }

  // Charts are queued rather than built here: Chart.js sizes a canvas from its
  // container, so each card must be in the document before its chart is created.
  function exerciseCard(g, gi, pending) {
    var card = el('div', { class: 'card' }, [el('h3', { text: g.name })]);
    var points = g.rows.map(function (r) { return r.logged ? numeric(r.logged) : null; });
    var plottable = points.filter(function (v) { return v != null; }).length;

    if (plottable >= 2 && window.Chart) {
      var cv = el('canvas', { id: 'ex-chart-' + gi });
      card.appendChild(el('div', { class: 'chart-wrap mini' }, [cv]));
      pending.push(function () {
        charts.push(new Chart(cv.getContext('2d'), {
          type: 'line',
          data: {
            labels: g.rows.map(function (r) { return 'W' + r.week; }),
            datasets: [{
              label: 'Weight logged',
              data: points,
              spanGaps: true,
              borderColor: '#6d8fe8',
              backgroundColor: 'rgba(109,143,232,.16)',
              borderWidth: 2.5,
              pointRadius: 4,
              pointBackgroundColor: '#6d8fe8',
              pointBorderColor: '#0d1016',
              pointBorderWidth: 2,
              fill: true,
              tension: .25
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { color: GRID }, ticks: { color: '#97a1b2' } },
              y: { beginAtZero: false, grid: { color: GRID }, ticks: { color: '#97a1b2' } }
            }
          }
        }));
      });
    }

    var table = el('table', { class: 'log' }, [
      el('thead', null, [el('tr', null, [
        el('th', { text: 'Week' }), el('th', { text: 'Plan' }), el('th', { text: 'Logged' })
      ])])
    ]);
    var tbody = el('tbody');
    g.rows.forEach(function (r) {
      tbody.appendChild(el('tr', null, [
        el('td', { text: 'Week ' + r.week }),
        el('td', { class: 'muted', text: String(r.target) }),
        el('td', { class: 'val' + (r.logged ? '' : ' none'), text: r.logged || '—' })
      ]));
    });
    table.appendChild(tbody);
    card.appendChild(table);
    return card;
  }

  function renderStrength() {
    var wrap = $('strength-progress');
    wrap.textContent = '';
    var pending = [];
    var logged = [], empty = [];
    strengthGroups().forEach(function (g, i) {
      var has = g.rows.some(function (r) { return r.logged; });
      (has ? logged : empty).push({ g: g, i: i });
    });

    if (!logged.length) {
      wrap.appendChild(el('div', { class: 'card' }, [
        el('p', { class: 'empty', text: 'No weights logged yet. Fill in the weight box next to an exercise on a strength day and it will show up here.' })
      ]));
    }
    logged.forEach(function (item) { wrap.appendChild(exerciseCard(item.g, item.i, pending)); });

    if (empty.length) {
      var fold = el('details', { class: 'card fold' }, [
        el('summary', { text: 'Not logged yet (' + empty.length + ')' })
      ]);
      empty.forEach(function (item) {
        fold.appendChild(el('h3', { class: 'sub', text: item.g.name }));
        var card = exerciseCard(item.g, item.i, pending);
        card.removeChild(card.firstChild);
        card.className = 'plain';
        fold.appendChild(card);
      });
      wrap.appendChild(fold);
    }

    pending.forEach(function (make) { make(); });
  }

  /* ---------------- settings: start date, backup, offline ---------------- */

  $('start-date').value = state.startDate || '';
  $('start-date').addEventListener('change', function (e) {
    state.startDate = e.target.value || '';
    save();
    renderCountdown();
    renderWeek();
    var slot = todaySlot();
    $('start-hint').textContent = slot
      ? 'Today is week ' + slot.week + ', ' + slot.day + '.'
      : state.startDate ? 'That date puts today outside the 8 weeks.'
      : 'Set this and the app opens on the right week and day, and counts down to test day.';
  });

  $('today-btn').addEventListener('click', function () {
    var slot = todaySlot();
    if (!slot) return;
    openDays[slot.week + '.' + slot.day] = true;
    goToWeek(slot.week, false);
    var card = document.querySelector('[data-day="' + slot.week + '.' + slot.day + '"]');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // Reading a day creates its (empty) record, so a raw dump would carry all 56 days.
  // The backup keeps only days that actually hold something.
  function exportable() {
    var out = JSON.parse(JSON.stringify(state));
    out.timer.endsAt = 0;
    Object.keys(out.days).forEach(function (k) {
      var d = out.days[k];
      var used = d.done || (d.notes || '').trim() || String(d.level || '').trim()
        || Object.keys(d.items || {}).length
        || Object.keys(d.ex || {}).some(function (i) {
          var e = d.ex[i];
          return e.sets > 0 || (e.weight || '').trim() || (e.reps || '').trim();
        });
      if (!used) delete out.days[k];
    });
    return out;
  }

  $('export-btn').addEventListener('click', function () {
    var stamp = new Date().toISOString().slice(0, 10);
    var payload = exportable();
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: 'jrft-progress-' + stamp + '.json' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    $('backup-msg').textContent = 'Backup saved as jrft-progress-' + stamp + '.json ('
      + Object.keys(payload.days).length + ' days logged).';
  });

  $('import-btn').addEventListener('click', function () { $('import-file').click(); });

  $('import-file').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var incoming;
      try {
        incoming = JSON.parse(reader.result);
      } catch (err) {
        $('backup-msg').textContent = 'That file is not valid JSON.';
        return;
      }
      if (!incoming || typeof incoming !== 'object' || !incoming.days || typeof incoming.days !== 'object') {
        $('backup-msg').textContent = 'That does not look like a JRFT backup.';
        return;
      }
      var n = Object.keys(incoming.days).length;
      if (!confirm('Replace everything currently logged with this backup (' + n + ' days)?')) return;
      state = incoming;
      state.v = 2;
      if (!state.timer) state.timer = blank().timer;
      save();
      state = load();
      currentWeek = state.lastWeek || 1;
      openDays = {};
      $('start-date').value = state.startDate || '';
      renderTimerControls();
      renderCountdown();
      syncPills();
      renderWeek();
      $('backup-msg').textContent = 'Backup restored.';
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // Warms the offline cache in one go: every exercise photo plus Chart.js.
  $('offline-btn').addEventListener('click', function () {
    var msg = $('offline-msg');
    // Without a service worker nothing would ever read the cache back, so saving
    // media only helps when the app is served over http(s).
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) {
      msg.textContent = 'Offline saving needs the app served over http(s) — it does nothing when the file is opened directly from disk.';
      return;
    }
    var urls = [];
    Object.keys(LIB).forEach(function (k) {
      (LIB[k].images || []).forEach(function (u) { if (urls.indexOf(u) < 0) urls.push(u); });
    });
    urls.push(CHART_URL);

    var done = 0, failed = 0;
    msg.textContent = 'Saving 0 of ' + urls.length + '…';
    $('offline-btn').disabled = true;

    // cache.add() rejects an opaque cross-origin response, so fetch and put by hand,
    // preferring a CORS response and falling back to an opaque one.
    function store(cache, url) {
      return fetch(url, { mode: 'cors' })
        .then(function (res) {
          if (!res || !res.ok) throw new Error('bad response');
          return cache.put(url, res);
        })
        .catch(function () {
          return fetch(url, { mode: 'no-cors' }).then(function (res) { return cache.put(url, res); });
        })
        .catch(function () { failed++; })
        .then(function () {
          done++;
          msg.textContent = 'Saving ' + done + ' of ' + urls.length + '…';
        });
    }

    var opened = ('caches' in window) ? caches.open(MEDIA_CACHE) : Promise.reject(new Error('no cache'));
    opened.then(function (cache) {
      return urls.reduce(function (chain, url) {
        return chain.then(function () { return store(cache, url); });
      }, Promise.resolve()).then(function () {
        msg.textContent = failed
          ? (urls.length - failed) + ' of ' + urls.length + ' saved — ' + failed + ' could not be fetched. Try again on a better connection.'
          : 'All ' + urls.length + ' files saved. The app now works with no signal.';
      });
    }).catch(function () {
      msg.textContent = 'Could not save for offline in this browser.';
    }).then(function () {
      $('offline-btn').disabled = false;
    });
  });

  $('reset-btn').addEventListener('click', function () {
    if (!confirm('Reset all logged progress?\n\nThis clears every tick, weight, rep, note and bleep test level. The 8-week plan itself stays exactly as it is.')) return;
    var keepStart = state.startDate, keepTimer = state.timer;
    state = blank();
    state.startDate = keepStart;
    state.timer = keepTimer;
    state.timer.endsAt = 0;
    save();
    openDays = {};
    currentWeek = 1;
    syncPills();
    renderWeek();
    paintTimer();
    if (!$('view-progress').hidden) renderProgress();
  });

  /* ---------------- tabs, boot ---------------- */

  function showView(name) {
    var plan = name === 'plan';
    $('view-plan').hidden = !plan;
    $('view-progress').hidden = plan;
    $('tab-plan').classList.toggle('is-active', plan);
    $('tab-progress').classList.toggle('is-active', !plan);
    $('tab-plan').setAttribute('aria-selected', plan ? 'true' : 'false');
    $('tab-progress').setAttribute('aria-selected', plan ? 'false' : 'true');
    $('week-pills').parentNode.hidden = !plan;
    $('timerbar').hidden = !plan;
    if (!plan) renderProgress();
    window.scrollTo({ top: 0 });
  }

  $('tab-plan').addEventListener('click', function () { showView('plan'); });
  $('tab-progress').addEventListener('click', function () { showView('progress'); });

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (e) {
        console.warn('Service worker not registered:', e);
      });
    });
  }

  var slot = todaySlot();
  if (slot) {
    currentWeek = slot.week;
    openDays[slot.week + '.' + slot.day] = true;
  }
  renderPills();
  renderWeek();
  renderCountdown();
  renderTimerControls();
  paintTimer();
})();
