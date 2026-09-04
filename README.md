# JRFT 8-Week Prep Tracker

A single-page tracker for an 8-week police fitness prep plan (JRFT / bleep test).
Plain HTML, CSS and JavaScript — no build step, no framework. Dark theme throughout;
it is designed for dark only, with no light variant. Everything you log is saved in the
browser's `localStorage`, so it persists between visits on that device.

## Running it

Open `index.html` in a browser and it works straight away.

To install it on your phone as an app — and to have it work with no signal — it needs to
be **served over http(s)** rather than opened from disk. Any static host will do
(GitHub Pages, or `npx http-server .` on your machine). Then open it in mobile Chrome or
Safari and use "Add to Home Screen".

## Files

| File | What it holds |
| --- | --- |
| `index.html` | Page shell: top bar, week pills, plan/progress views, timer bar, lightbox |
| `style.css` | Mobile-first dark styling, colour coding by day type |
| `app.js` | Rendering, logging, check-ins, timer, backup, localStorage, charts |
| `data.js` | The 8-week plan and exercise library (seed data — never modified by the app) |
| `sw.js` | Service worker: offline caching |
| `manifest.webmanifest`, `icon-*.png` | Home-screen install metadata and icons |

## What it does

**The plan.** A Week 1–8 selector, each week showing its 7 days as expandable cards,
colour coded: teal cardio, blue strength, gold test days, grey rest. A progress bar per
week, and a green dot on each pill once a week is fully ticked.

- **Cardio / rest days**: the session listed out, one "completed" tick, and notes.
- **Strength days**: one row per exercise with **a tick per set**, an editable weight and
  reps box (the plan's own target shows as the placeholder), form photos side by side —
  tap for a full-size view — and a collapsible "Form tips" list. Under the inputs, the
  weight and reps you logged last time you did that exercise, with a **Use** button to
  copy them across. Notes at the bottom of the day.
- **Test days**: the day's items as a checklist plus a "bleep test level reached" input.

**Daily check-in.** A card at the top of each week with a chip per day — tap a day to
log it, and the chip's underline fills once that morning is done, so a week's routine is
visible at a glance. All of these are taken sitting still, which is what a fingertip
pulse oximeter can actually measure:

- **Resting HR** — on waking, before you sit up. Noisy day to day (sleep, alcohol,
  illness, dehydration all move it), which is exactly why it is logged daily: the app
  charts every morning and reads the trend off weekly averages.
- **SpO2** — resting oxygen saturation. This is *not* a fitness metric: in a healthy
  adult at sea level it already sits near its ceiling and training does not raise it.
  It is here as an illness flag — a couple of points down alongside a raised resting HR
  usually means something is brewing.
- **Bodyweight** — daily, before food. Day-to-day swings of a kilo or two are just food
  and fluid, so the chart draws a 7-day rolling average over the daily points and that
  dashed line is the one to read. Treat it as a check rather than a target: steady
  weight while your bleep level climbs is the pattern you want.
- **Sleep** — hours last night. It explains most of the movement in the numbers above.
- **HR at 1 min** and **HR at 2 min** — on interval days only. Sit down straight after
  your last hard rep and read at those two fixed times. A fingertip oximeter needs a
  still, settled hand and cannot catch a peak, so the protocol uses fixed times instead.
  The 1-minute value falling week to week off the same session means fitter; the app
  also shows how much further it falls during the second minute. Compare within blocks —
  the plan raises the pace at weeks 3, 5 and 7.

**Readiness.** Above the day list, the app compares the selected day's resting HR
against your baseline — the average of the last 14 logged days before it, once at least
three exist — and looks at SpO2 and sleep. If resting HR is 7+ bpm above baseline, SpO2
is under 95%, or you slept under 6.5 hours, it says so and suggests taking the easy
option; otherwise it confirms you are in line with baseline.

**Per session.** Every training day takes a **session RPE** (1–10, "how hard did that
feel") — the same work feeling easier week to week is progress, feeling harder at the
same pace means fatigue is stacking up. Cardio days also take **rep times**, entered as
a comma-separated list (`1:32, 1:30, 1:31`); the app shows the count, average and best,
and charts the weekly average per session so you can watch your pace improve between
bleep tests.

**Today.** Set your plan start date**Today.** Set your plan start date (the Monday of Week 1) under *Settings & backup*.
The app then opens on the current week with today's session already expanded, marks that
card "Today", shows a countdown to test day, and gives you a **Today** button to jump
back from any week.

**Rest timer.** A bar along the bottom with 45s / 1:00 / 1:30 / 2:00 presets, a +30s
button, and a beep and buzz when it runs out. With **Auto** on it starts itself every
time you tick a set. It counts against a wall-clock time, so it stays accurate if the
screen sleeps and it survives a reload.

**Progress view.** Bleep test level across the 8 Saturdays; then the check-in metrics as
daily lines with weekly-average trends — resting HR, 1-minute recovery, SpO2 (as recent
readings and a lowest-reading summary rather than a trend line, since it should not
trend), sleep, and bodyweight with its rolling average; then session RPE and average rep
times per session; then a chart and table per strength exercise showing the weight
logged each week it appears.
Exercises you have logged sort to the top; the rest fold away.

**Backup.** *Export backup* saves a JSON file of everything logged; *Import backup*
restores one. Worth doing before you clear browser data or change phone.

**Offline.** Served over http(s), the app installs a service worker that caches itself,
so it opens and works with no signal. *Save photos for offline* fetches all 26 exercise
photos and Chart.js in one go — do that on wifi before the gym. The app shell refreshes
in the background whenever you are online, so updates still arrive.

**Reset progress** clears everything logged (after a confirmation) and leaves the plan,
your start date and your timer settings untouched.

## Notes

- Sets: `"3-4 sets"` in the plan gives 4 pips, the 4th dashed as optional — the exercise
  counts as done at 3. Tapping pip *n* logs *n* sets; tapping the last filled pip undoes it.
- Weight is a free-text field ("60kg", "2x12kg", "5kg per side"). For the per-exercise
  charts the last number in the value is plotted — the per-hand load, or the top of a
  range. The table always shows exactly what you typed.
- Bleep test level is stored as you type it (e.g. `5.4`) and plotted as a decimal. Note
  that `5.4` is really level 5, shuttle 4, so the chart's spacing between levels is
  approximate.
- Exercise photos come from the public-domain
  [Free Exercise DB](https://github.com/yuhonas/free-exercise-db), referenced by URL and
  lazy-loaded. Chart.js loads from a CDN; with no connection and nothing cached, the
  charts are skipped and a note is shown — logged data is unaffected.
- Getting a good oximeter reading: warm hands (cold fingers are the main cause of a junk
  reading), hand at heart level and resting on something, no talking, wait about 30
  seconds for the number to settle, same finger each time, no nail polish. Optical
  sensors are unreliable while you are moving, which is why the recovery protocol waits
  a full minute before the first reading.
- Check-ins recorded in the earlier weekly version are migrated to that week's Monday
  the first time the new version loads.
- Rep times accept `1:32`, `92`, or `1:32.5`; anything unparseable in the box is ignored.
- The rest timer's beep uses the Web Audio API, which iOS silences while the browser is
  in the background; the vibration and the countdown still work.
- Everything is stored under the single `jrft-tracker-v1` key, on that device only.
