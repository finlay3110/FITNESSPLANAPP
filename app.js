/* JRFT 8-week prep tracker — plan data in data.js, logged progress in localStorage. */
(function () {
  'use strict';

  var PLAN = window.PLAN_DATA;
  var LIB = PLAN.exerciseLibrary || {};
  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var STORE_KEY = 'jrft-tracker-v1';

  var state = load();
  var currentWeek = 1;
  var openDays = {};      // "1.Tue" -> true, so the open/closed state survives a re-render
  var charts = [];        // live Chart.js instances, destroyed before each progress re-render

  /* ---------------- storage ---------------- */

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      if (parsed && parsed.days) return parsed;
    } catch (e) { /* corrupt or unavailable storage — start fresh */ }
    return { v: 1, days: {} };
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

  function exState(week, day, i) {
    var s = dayState(week, day);
    if (!s.ex[i]) s.ex[i] = { done: false, weight: '', reps: '' };
    return s.ex[i];
  }

  /* ---------------- small DOM helper ---------------- */

  function el(tag, props, kids) {
    var n = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        if (k === 'class') n.className = props[k];
        else if (k === 'text') n.textContent = props[k];
        else if (k === 'html') n.innerHTML = props[k];
        else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), props[k]);
        else if (props[k] === true) n.setAttribute(k, '');
        else if (props[k] !== false && props[k] != null) n.setAttribute(k, props[k]);
      });
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  /* ---------------- plan lookups ---------------- */

  function weekData(n) { return PLAN.weeks[n - 1]; }

  function dayPlan(week, day) { return weekData(week).days[day]; }

  function exerciseCount(plan) {
    return plan.exercises ? plan.exercises.length : 0;
  }

  // How many tickable things a day holds, and how many are ticked.
  function dayTally(week, day) {
    var plan = dayPlan(week, day);
    var s = dayState(week, day);
    if (plan.type === 'strength') {
      var total = exerciseCount(plan), done = 0;
      for (var i = 0; i < total; i++) if (s.ex[i] && s.ex[i].done) done++;
      return { done: done, total: total };
    }
    if (plan.type === 'test') {
      var items = (plan.items || []).length, ticked = 0;
      for (var j = 0; j < items; j++) if (s.items[j]) ticked++;
      return { done: ticked, total: items };
    }
    return { done: s.done ? 1 : 0, total: 1 };
  }

  function describeTarget(ex) {
    var bits = [];
    if (ex.sets) bits.push(ex.sets + (String(ex.sets).indexOf('-') > -1 ? ' sets' : (Number(ex.sets) === 1 ? ' set' : ' sets')));
    if (ex.reps) bits.push(ex.reps + (/[a-z]/i.test(String(ex.reps)) ? '' : ' reps'));
    var line = bits.join(' × ');
    if (ex.weight) line += (line ? ' · ' : '') + ex.weight;
    return line;
  }

  /* ---------------- week selector ---------------- */

  function renderPills() {
    var wrap = document.getElementById('week-pills');
    wrap.textContent = '';
    PLAN.weeks.forEach(function (w) {
      var btn = el('button', {
        class: 'pill', type: 'button', 'data-week': w.week,
        onclick: function () {
          currentWeek = w.week;
          syncPills();
          renderWeek();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, [el('span', { text: 'Week ' + w.week }), el('span', { class: 'dot', hidden: true, 'aria-label': 'complete' })]);
      wrap.appendChild(btn);
    });
    syncPills();
  }

  // Updates the pills in place so ticking something never scrolls the strip back to Week 1.
  function syncPills() {
    var pills = document.querySelectorAll('#week-pills .pill');
    Array.prototype.forEach.call(pills, function (btn) {
      var n = Number(btn.getAttribute('data-week'));
      var t = weekTally(n);
      btn.classList.toggle('is-active', n === currentWeek);
      btn.setAttribute('aria-pressed', n === currentWeek ? 'true' : 'false');
      btn.querySelector('.dot').hidden = !(t.total > 0 && t.done === t.total);
    });
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

  /* ---------------- plan view ---------------- */

  function renderWeek() {
    var w = weekData(currentWeek);
    var t = weekTally(currentWeek);
    var pct = t.total ? Math.round((t.done / t.total) * 100) : 0;

    var head = document.getElementById('week-head');
    head.textContent = '';
    head.appendChild(el('h2', { text: 'Week ' + w.week + ' — ' + w.title }));
    head.appendChild(el('p', { text: w.goal }));
    head.appendChild(el('div', { class: 'bar' }, [el('span', { style: 'width:' + pct + '%' })]));
    head.appendChild(el('p', { class: 'small muted', text: t.done + ' of ' + t.total + ' items ticked this week' }));

    var list = document.getElementById('days');
    list.textContent = '';
    DAYS.forEach(function (d) { list.appendChild(renderDay(currentWeek, d)); });
  }

  function renderDay(week, day) {
    var plan = dayPlan(week, day);
    var key = week + '.' + day;
    var open = !!openDays[key];
    var card = el('div', { class: 'day' + (open ? ' is-open' : ''), 'data-type': plan.type });

    var tally = dayTally(week, day);
    var status = tally.total > 0 && tally.done === tally.total
      ? el('span', { class: 'tick', text: '✓' })
      : el('span', { class: 'count', text: tally.total > 1 ? tally.done + '/' + tally.total : '' });

    var head = el('button', {
      class: 'day-head', type: 'button', 'aria-expanded': open ? 'true' : 'false',
      onclick: function () {
        openDays[key] = !openDays[key];
        card.replaceWith(renderDay(week, day));
      }
    }, [
      el('span', { class: 'dayname', text: day }),
      el('span', { class: 'title', text: plan.title }),
      status,
      el('span', { class: 'badge', text: plan.type }),
      el('span', { class: 'chev', text: '▼' })
    ]);
    card.appendChild(head);

    // Body (with its images) is only built once the day is expanded.
    if (open) card.appendChild(renderDayBody(week, day, card));
    return card;
  }

  // Updates just the header count, the week bar and the pills — the day body is left
  // alone so open form tips stay open and the photos are not re-fetched.
  function refresh(week, day, card) {
    save();
    var t = dayTally(week, day);
    var status = t.total > 0 && t.done === t.total
      ? el('span', { class: 'tick', text: '\u2713' })
      : el('span', { class: 'count', text: t.total > 1 ? t.done + '/' + t.total : '' });
    card.querySelector('.day-head .tick, .day-head .count').replaceWith(status);
    updateWeekBar();
    syncPills();
  }

  function updateWeekBar() {
    var t = weekTally(currentWeek);
    var pct = t.total ? Math.round((t.done / t.total) * 100) : 0;
    var head = document.getElementById('week-head');
    head.querySelector('.bar span').style.width = pct + '%';
    head.querySelector('.small').textContent = t.done + ' of ' + t.total + ' items ticked this week';
  }

  function renderDayBody(week, day, card) {
    var plan = dayPlan(week, day);
    var s = dayState(week, day);
    var body = el('div', { class: 'day-body' });

    if (plan.type === 'strength') {
      (plan.exercises || []).forEach(function (ex, i) {
        body.appendChild(renderExercise(week, day, ex, i, card));
      });
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
    var st = exState(week, day, i);
    var lib = ex.exerciseId ? LIB[ex.exerciseId] : null;
    var wrap = el('div', { class: 'ex' });

    var target = describeTarget(ex);
    wrap.appendChild(el('label', { class: 'ex-top' }, [
      el('input', {
        type: 'checkbox', checked: !!st.done,
        onchange: function (e) { st.done = e.target.checked; refresh(week, day, card); }
      }),
      el('span', { class: 'ex-name' }, [
        el('span', { class: 'ex-label', text: ex.name }),
        target ? el('span', { class: 'target', text: target }) : null
      ])
    ]));

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

    var images = (lib && lib.images) || [];
    if (images.length) {
      var shots = el('div', { class: 'shots' });
      images.forEach(function (src, n) {
        var cap = (lib.name || ex.name) + (images.length > 1 ? (n === 0 ? ' — start position' : ' — end position') : '');
        var img = el('img', { src: src, alt: cap, loading: 'lazy', decoding: 'async' });
        img.addEventListener('error', function () { btn.remove(); });
        var btn = el('button', {
          type: 'button', 'aria-label': 'Enlarge photo: ' + cap,
          onclick: function () { openLightbox(src, cap); }
        }, [img]);
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
    return wrap;
  }

  /* ---------------- lightbox ---------------- */

  var box = document.getElementById('lightbox');
  var boxImg = document.getElementById('lightbox-img');
  var boxCap = document.getElementById('lightbox-cap');

  function openLightbox(src, caption) {
    boxImg.src = src;
    boxImg.alt = caption;
    boxCap.textContent = caption;
    box.hidden = false;
    document.getElementById('lightbox-close').focus();
  }

  function closeLightbox() {
    box.hidden = true;
    boxImg.removeAttribute('src');
  }

  box.addEventListener('click', function (e) { if (e.target !== boxImg) closeLightbox(); });
  document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !box.hidden) closeLightbox(); });

  /* ---------------- progress view ---------------- */

  // Logged weights are free text ("2x10kg", "25kg", "12-14kg"). The last number in the
  // string is the useful one to plot: the per-hand load, or the top of a range.
  function numeric(value) {
    var m = String(value == null ? '' : value).match(/\d+(?:\.\d+)?/g);
    return m ? parseFloat(m[m.length - 1]) : null;
  }

  function renderProgress() {
    charts.forEach(function (c) { c.destroy(); });
    charts = [];
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
    var canvas = document.getElementById('bleep-chart');
    var note = document.getElementById('bleep-empty');
    if (!window.Chart) {
      canvas.parentNode.hidden = true;
      note.hidden = false;
      note.textContent = 'Charts need a connection the first time (Chart.js loads from a CDN) — everything you have logged is still saved below and on the plan.';
      return;
    }
    note.hidden = any;
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
          borderColor: '#c8992e',
          backgroundColor: 'rgba(200,153,46,.15)',
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: '#c8992e',
          fill: true,
          tension: .25
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: false, title: { display: true, text: 'Level' } } }
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
          var key = ex.exerciseId || ex.name;
          if (!byKey[key]) {
            byKey[key] = { name: (LIB[ex.exerciseId] && LIB[ex.exerciseId].name) || ex.name, rows: [] };
            order.push(key);
          }
          byKey[key].rows.push({
            week: w.week,
            target: ex.weight || '—',
            logged: (exState(w.week, d, i).weight || '').trim()
          });
        });
      });
    });
    return order.map(function (k) { return byKey[k]; });
  }

  function exerciseCard(g, gi) {
    var card = el('div', { class: 'card' }, [el('h3', { text: g.name })]);
    var points = g.rows.map(function (r) { return r.logged ? numeric(r.logged) : null; });
    var plottable = points.filter(function (v) { return v != null; }).length;

    if (plottable >= 2 && window.Chart) {
      var cv = el('canvas', { id: 'ex-chart-' + gi });
      card.appendChild(el('div', { class: 'chart-wrap mini' }, [cv]));
      charts.push(new Chart(cv.getContext('2d'), {
        type: 'line',
        data: {
          labels: g.rows.map(function (r) { return 'W' + r.week; }),
          datasets: [{
            label: 'Weight logged',
            data: points,
            spanGaps: true,
            borderColor: '#1b2a4a',
            backgroundColor: 'rgba(27,42,74,.12)',
            borderWidth: 2.5,
            pointRadius: 4,
            pointBackgroundColor: '#1b2a4a',
            fill: true,
            tension: .25
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: false } }
        }
      }));
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
        el('td', { class: 'val' + (r.logged ? '' : ' none'), text: r.logged || '\u2014' })
      ]));
    });
    table.appendChild(tbody);
    card.appendChild(table);
    return card;
  }

  function renderStrength() {
    var wrap = document.getElementById('strength-progress');
    wrap.textContent = '';
    var groups = strengthGroups();
    var logged = [], empty = [];
    groups.forEach(function (g, i) {
      var has = g.rows.some(function (r) { return r.logged; });
      (has ? logged : empty).push({ g: g, i: i });
    });

    if (!logged.length) {
      wrap.appendChild(el('div', { class: 'card' }, [
        el('p', { class: 'empty', text: 'No weights logged yet. Fill in the weight box next to an exercise on a strength day and it will show up here.' })
      ]));
    }
    logged.forEach(function (item) { wrap.appendChild(exerciseCard(item.g, item.i)); });

    if (empty.length) {
      var box = el('details', { class: 'card fold' }, [
        el('summary', { text: 'Not logged yet (' + empty.length + ')' })
      ]);
      empty.forEach(function (item) {
        box.appendChild(el('h3', { class: 'sub', text: item.g.name }));
        var card = exerciseCard(item.g, item.i);
        card.removeChild(card.firstChild);
        card.className = 'plain';
        box.appendChild(card);
      });
      wrap.appendChild(box);
    }
  }

  /* ---------------- tabs, reset, boot ---------------- */

  function showView(name) {
    var plan = name === 'plan';
    document.getElementById('view-plan').hidden = !plan;
    document.getElementById('view-progress').hidden = plan;
    document.getElementById('tab-plan').classList.toggle('is-active', plan);
    document.getElementById('tab-progress').classList.toggle('is-active', !plan);
    document.getElementById('tab-plan').setAttribute('aria-selected', plan ? 'true' : 'false');
    document.getElementById('tab-progress').setAttribute('aria-selected', plan ? 'false' : 'true');
    document.getElementById('week-pills').hidden = !plan;
    if (!plan) renderProgress();
    window.scrollTo({ top: 0 });
  }

  document.getElementById('tab-plan').addEventListener('click', function () { showView('plan'); });
  document.getElementById('tab-progress').addEventListener('click', function () { showView('progress'); });

  document.getElementById('reset-btn').addEventListener('click', function () {
    if (!confirm('Reset all logged progress?\n\nThis clears every tick, weight, rep, note and bleep test level. The 8-week plan itself stays exactly as it is.')) return;
    state = { v: 1, days: {} };
    save();
    openDays = {};
    syncPills();
    renderWeek();
    if (!document.getElementById('view-progress').hidden) renderProgress();
  });

  renderPills();
  renderWeek();
})();
