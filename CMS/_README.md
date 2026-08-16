# CMS — local, folder-based (no microCMS)

Each subfolder here is one future archive entry on the site. No sync service,
no dashboard — just a folder of ordered images and a markdown file.

```
CMS/<project>/
  images/       ordered photos/stills. Name them so they sort in the order
                you want (01.jpg, 02.jpg, 03.jpg...). The first one becomes
                the archive entry's hero/cover image; the rest become the
                detail page's gallery.
  index.md      title, category, month/year, credits (frontmatter) + a
                short body (1-2 paragraphs, present tense, evocative —
                same voice as the existing archive entries).
```

## Status

**番号が掲載スイッチ。** `01_`… と番号の付いたフォルダだけがサイトに出ます。番号
の無いフォルダは検討中の扱いで、生成時に無視されます（消さずに外せます）。並び順
はその番号どおり。

**Wired in (2026-08-14).** `scripts/gen-archive.mjs` builds
`src/data/archive.json` from the folders below — one entry each, in the order
listed in `PROJECTS` in that file. Per folder:

- **title** — `index.md` frontmatter if filled in, otherwise the project's
  display name from `PROJECTS`. So the site names real work already.
- **pictures** — `images/` if it holds any, otherwise the placeholder pool in
  `scripts/source-images/`. The first image becomes the hero, the rest the
  detail gallery. Entries still on the pool are flagged
  `placeholderImages: true` in the JSON.
- **category / month** — only shown when set; nothing is invented.
- **body / credits** — the markdown body and the `credits` rows, falling back
  to Direction + Year.

Drop images in and fill `index.md`, then run `npm run gen`. No code change is
needed per project. To add a project, make the folder and add a row to
`PROJECTS`.

## Current projects

- `miles158/` — Miles158 (rental + booking system)
- `jds/` — Japanese Dark Spirits (logo animation)
- `ondo/` — °Ondo Sake (PV)
- `unknown/` — placeholder, project TBD
- `sann/` — TBD
- `naun/` — TBD
- `pru/` — PRU
- `ysove2001/` — YSOVE 2001
- `msf/` — MSF
