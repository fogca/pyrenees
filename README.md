# Pyrenees Pictures Studio — Official Site

**This folder (`Dev/pyrenees-site`) is the real project.** It was renamed from
`ristorante-site` on 2026-08-14, catching up with two brand renames
(Ristorante -> Studio Pyrénées -> Pyrenees Pictures Studio).
`Dev/_studies/ristorante/` is an early single-file design study kept for
reference only. The dev server is the `pyrenees` entry in
`~/Dropbox/.claude/launch.json` (port 4251); the Cloudflare Pages project is
`pyrenees-site`.

Astro 5 static site for Pyrenees Pictures Studio — an image creation studio for
food, furniture & atmosphere, Tokyo. Rebuilt 2026-08-14 around one rule: the
work renders as plain, crisp rectangles — **no WebGL, no warp, no filters on
imagery**, springs for all motion, everything stands down under
prefers-reduced-motion.

## Pages

- `/` — top page with THREE presentations of the 28 works (`src/scripts/top.js`),
  switched bottom-left ("Top — One, Two, Three") or `?top=vision|codes|deck`:
  - **vision** (default): the measured recreation of the reference clip — a
    rotating wheel of photo cards over a cycling caption; scrolling opens the
    arc, gathers the cards into a pile, and deals them into a 3D cascade.
  - **codes**: the catalogue set in display size (each work a huge code line);
    a floating window spring-follows the active row with its hero.
  - **deck**: one work centred large, neighbours receding flat to the sides,
    one gesture = one step.
- `/works` — the printed-index grid: hairline header, 12-column editorial grid,
  every 4th work led by a text cell, monospaced data voice for metadata.
- `/archive/[slug]` — hero at true aspect, ruled title band, body, plates,
  credits table, prev/next.
- `/about`, `/contact` — centred display statement viewport + ruled bands +
  numbered rows; the contact estimator computes the flat rate live.

## Identity

- Wordmark: **Pyrenees Pictures Studio** — unaccented on purpose: every glyph
  renders in the trial cut of Unica 77 (no fallback mixing in the wordmark).
- Type: Unica 77 LL Regular (display voice) + system mono (`--font-data`) for
  catalogue metadata. TRIAL license — internal/dev only, buy before launch;
  `unicode-range` in `public/css/base.css` guards the broken trial glyphs.
- Imagery: `npm run gen` optimizes `scripts/source-images/` into
  `public/images/archive/` (1600w hero + 760w `-plate`) and writes
  `src/data/archive.json` (incl. the catalogue `code` per work). Current
  content is a stand-in pool — swap in real photography per project via the
  `CMS/` folders, then wire them into `scripts/gen-archive.mjs`.

## Run

```
npm install
npm run dev    # http://localhost:4251
npm run build
```

## Deploy (test)

Cloudflare Pages project `pyrenees-site`, deployed directly via Wrangler CLI
(no GitHub connection — this repo isn't pushed anywhere; the local git here is
the whole-Dropbox one).

```
npm run deploy:test   # builds + uploads to the "test" branch alias
```

- Latest test URL: https://test.pyrenees-site.pages.dev
- Cloudflare account: hi@takumiisobe.com
- robots.txt is pre-launch `Disallow: /` — flip to Allow + Search Console at go-live.
