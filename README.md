# JRFT 8-Week Prep Tracker

A single-page tracker for an 8-week police fitness prep plan (JRFT / bleep test).
Plain HTML, CSS and JavaScript — no build step, no server. Dark theme throughout — it
is designed for dark only, with no light variant. Progress is saved in the browser's
`localStorage`, so it persists between visits on that device.

## Running it

Open `index.html` in a browser, or serve the folder (`npx http-server .`) and open it
on your phone. To keep it one tap away at the gym, add it to your home screen.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | Page shell: top bar, week pills, plan/progress views, lightbox |
| `style.css` | Mobile-first dark styling, colour coding by day type |
| `app.js` | Rendering, logging, localStorage, charts |
| `data.js` | The 8-week plan and exercise library (seed data — not modified by the app) |

## What it does

- **Week 1–8 selector**, each week showing its 7 days as expandable cards, colour coded
  against the dark ground: teal cardio, blue strength, gold test days, grey rest.
- **Cardio / rest days**: the session listed out, one "completed" tick, and a notes box.
- **Strength days**: one row per exercise with a tick, an editable weight and reps box
  (the plan's own target shows as the placeholder), the form photos side by side, and a
  collapsible "Form tips" list. Tap a photo to open it full size.
- **Test days**: the day's items as a checklist plus a "bleep test level reached" input.
- **Progress view**: a line chart of bleep test level across the 8 Saturdays, and a chart
  and table per strength exercise showing the weight logged each week it appears.
- **Reset progress** clears everything logged (after a confirmation) and leaves the plan
  itself untouched.

## Notes

- Chart.js loads from a CDN; without a connection the charts are skipped and a note is
  shown — logged data is unaffected. Chart axes, grids and series colours are set for the
  dark background.
- Exercise photos come from the public-domain [Free Exercise DB](https://github.com/yuhonas/free-exercise-db)
  and are referenced by URL and lazy-loaded, so the first paint stays fast.
- Weight is a free-text field ("60kg", "2x12kg", "5kg per side"). For the per-exercise
  charts the last number in the value is plotted — the per-hand load, or the top of a range.
- Everything is stored under the single `jrft-tracker-v1` key, on that device only.
