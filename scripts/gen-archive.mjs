// Build pipeline for the archive + brand assets. Run: npm run gen
//  1. Optimizes every source image (scripts/source-images/, currently the
//     MILES158 stand-in set) to 1600w webp in public/images/archive/
//  2. Writes src/data/archive.json from the real project folders in CMS/
//     (title/credits from index.md, pictures from images/ when present and
//     from the placeholder pool until then)
//  3. Generates the OG image (1200x630) and the icon set (favicon.svg,
//     apple-touch-icon, 192/512 manifest icons)
// Swap source-images for real photography as it exists; rerun.
import { mkdirSync, writeFileSync, readdirSync, rmSync, existsSync, readFileSync,
  openSync, readSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Sniff the first bytes rather than trust the extension — files arrive from
// a phone or a download with no suffix at all, and a silently skipped
// picture looks exactly like a folder nobody has filled in yet.
const MAGIC = [
  [0xff, 0xd8, 0xff],                     // jpeg
  [0x89, 0x50, 0x4e, 0x47],               // png
  [0x52, 0x49, 0x46, 0x46],               // riff -> webp
  [0x49, 0x49, 0x2a],                     // tiff le
  [0x4d, 0x4d, 0x00],                     // tiff be
];
function isImageFile(file) {
  let fd;
  try {
    fd = openSync(file, 'r');
    const buf = Buffer.alloc(12);
    readSync(fd, buf, 0, 12, 0);
    if (MAGIC.some((m) => m.every((b, i) => buf[i] === b))) return true;
    // heif/avif carry their brand at offset 4
    return buf.slice(4, 8).toString('latin1') === 'ftyp';
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
// Stand-in pool. `placeholder-photos/` wins when it has anything in it, so a
// temporary look can be swapped in and out by adding or emptying one folder;
// `source-images/` (the studio's own MILES158 frames) is the fallback.
const PHOTO_DIR = join(ROOT, 'scripts/placeholder-photos');
const usePhotos = existsSync(PHOTO_DIR)
  && readdirSync(PHOTO_DIR).some((f) => isImageFile(join(PHOTO_DIR, f)));
const SRC_DIR = usePhotos ? PHOTO_DIR : join(ROOT, 'scripts/source-images');
const OUT_DIR = join(ROOT, 'public/images/archive');
const DATA_FILE = join(ROOT, 'src/data/archive.json');
const CMS_DIR = join(ROOT, 'CMS');

const INK = '#0d0d0c';
const PAPER = '#ffffff';

// Read the pool off disk in filename order — naming the files is how the
// order is set, so there is no list here to fall out of sync with the folder.
const POOL = readdirSync(SRC_DIR).filter((f) => isImageFile(join(SRC_DIR, f))).sort();

/* ——— 1. optimize images ————————————————————— */
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const POOL_META = [];
for (const file of POOL) {
  const base = file.replace(/\.[a-z]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const out = `${base}.webp`;
  const img = sharp(join(SRC_DIR, file));
  const meta = await img.metadata();
  const width = Math.min(1600, meta.width);
  await img.resize({ width }).webp({ quality: 82 }).toFile(join(OUT_DIR, out));
  const final = await sharp(join(OUT_DIR, out)).metadata();
  // plate derivative: the vision top keeps all 28 cards in the DOM at small
  // sizes — the 1600w hero would be ~20x the bytes for a card that is never
  // wider than about a sixth of the viewport
  const plate = `${base}-plate.webp`;
  await sharp(join(SRC_DIR, file))
    .resize({ width: Math.min(760, meta.width) })
    .webp({ quality: 78 })
    .toFile(join(OUT_DIR, plate));
  const pmeta = await sharp(join(OUT_DIR, plate)).metadata();
  POOL_META.push({
    src: `/images/archive/${out}`,
    w: final.width,
    h: final.height,
    aspect: +(final.width / final.height).toFixed(4),
    plate: `/images/archive/${plate}`,
    plateW: pmeta.width,
    plateH: pmeta.height,
  });
}

/* ——— 2. archive data —————————————————————————
   The archive is the real project list, read from CMS/. Each folder there is
   one entry; index.md carries the copy and images/ the pictures. Anything a
   folder has not filled in yet falls back: the title to the display name
   below, the pictures to the placeholder pool above. So the site names real
   work from day one and fills in with real images as each folder is
   completed, with no further code changes. */
// The running order IS the folder order — name the folders `01_x`, `02_y`
// and that is what the site shows, first to last. Nothing to keep in sync
// here. Folders starting with `_` are skipped so notes can live alongside.
// This map only fixes the casing of a name that a folder name cannot carry;
// anything missing falls back to the folder name with its number stripped.
const NAMES = {
  miles158: 'MILES158',
  jds: 'Japanese Dark Spirits',
  ondo: 'Ondo',
  sann: 'SANN',
  naun: 'NAUN',
  unknown: 'Unknown',
  pru: 'PRU',
  ysove2001: 'YSOVE 2001',
  msf: 'MSF',
};
const dirName = (dir) => {
  const key = dir.replace(/^\d+[_-]?/, '');
  return NAMES[key] ?? key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};
// A NUMBER IS THE PUBLISH FLAG. A folder without one is still being decided
// on and does not go on the site — drop the number back off to pull an entry
// without deleting anything.
const PROJECTS = readdirSync(CMS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^\d+[_-]/.test(d.name))
  .map((d) => d.name)
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  .map((dir) => ({ dir, name: dirName(dir) }));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const GENERIC_CREDITS = [['Direction', 'Pyrenees Pictures Studio'], ['Year', '2026']];
const CODE_PREFIX = {
  'Film': 'FI', 'Interior': 'IN', 'Still Life': 'ST',
  'Tabletop': 'TA', 'Material Study': 'MA', 'Editorial': 'ED',
};

/* Minimal frontmatter reader — the files are hand-written and tiny, so a
   YAML dependency would cost more than it explains. Understands scalars and
   the `- [Key, "Value"]` credit rows the template uses. */
function readEntryFile(dir) {
  const file = join(CMS_DIR, dir, 'index.md');
  if (!existsSync(file)) return { front: {}, body: '' };
  const raw = readFileSync(file, 'utf8');
  const m = raw.match(/^[\s\S]*?---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { front: {}, body: raw.trim() };
  const front = {};
  let creditKey = null;
  for (const line of m[1].split('\n')) {
    const row = line.match(/^\s*-\s*\[(.+?),\s*"(.*)"\]\s*$/);
    if (row && creditKey) { (front[creditKey] ||= []).push([row[1].trim(), row[2]]); continue; }
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!kv) continue;
    const [, k, vRaw] = kv;
    const v = vRaw.trim().replace(/^"(.*)"$/, '$1');
    if (v === '') { creditKey = k; front[k] = undefined; }
    else { creditKey = null; front[k] = v; }
  }
  return { front, body: m[2].trim() };
}

function realImages(dir) {
  const d = join(CMS_DIR, dir, 'images');
  if (!existsSync(d)) return [];
  return readdirSync(d).sort()
    .map((f) => join(d, f))
    .filter(isImageFile);
}

const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const plate = ({ src, w, h, aspect }) => ({ src, w, h, aspect });

const entries = [];
for (let i = 0; i < PROJECTS.length; i++) {
  const { dir, name } = PROJECTS[i];
  const { front, body } = readEntryFile(dir);
  const title = (front.title && front.title.trim()) || name;
  const category = (front.category && front.category.trim()) || null;
  const year = Number(front.year) || 2026;
  const monthName = front.month && MONTHS.includes(front.month) ? front.month : null;

  // pictures: the folder's own if it has any, otherwise the placeholder pool
  const own = realImages(dir);
  let hero, gallery;
  if (own.length) {
    const made = [];
    for (const [n, file] of own.entries()) {
      const base = `${dir}-${String(n + 1).padStart(2, '0')}`;
      const src = sharp(file);
      const meta = await src.metadata();
      await src.resize({ width: Math.min(1600, meta.width) }).webp({ quality: 82 })
        .toFile(join(OUT_DIR, `${base}.webp`));
      const full = await sharp(join(OUT_DIR, `${base}.webp`)).metadata();
      await sharp(file).resize({ width: Math.min(760, meta.width) }).webp({ quality: 78 })
        .toFile(join(OUT_DIR, `${base}-plate.webp`));
      const pm = await sharp(join(OUT_DIR, `${base}-plate.webp`)).metadata();
      made.push({
        src: `/images/archive/${base}.webp`, w: full.width, h: full.height,
        aspect: +(full.width / full.height).toFixed(4),
        plate: `/images/archive/${base}-plate.webp`, plateW: pm.width, plateH: pm.height,
      });
    }
    hero = made[0];
    gallery = made.slice(1).map(plate);
  } else {
    const N = POOL_META.length;
    hero = POOL_META[(i * 3) % N];
    gallery = [7, 13, 4].map((off) => POOL_META[(i * 3 + off) % N])
      .filter((g) => g.src !== hero.src).map(plate);
  }

  entries.push({
    no: String(i + 1).padStart(2, '0'),
    slug: slugify(dir.replace(/^\d+[_-]?/, '')),
    title,
    category,
    monthName,
    year,
    aspect: hero.aspect,
    image: hero.src,
    width: hero.w,
    height: hero.h,
    plate: hero.plate,
    plateW: hero.plateW,
    plateH: hero.plateH,
    gallery,
    body: body || null,
    credits: front.credits?.length ? front.credits : GENERIC_CREDITS,
    // catalogue code: the category's two letters when one is set, else the
    // studio's own prefix
    code: `${(category && CODE_PREFIX[category]) || 'PP'}${String(i + 1).padStart(2, '0')}`,
    // true once the folder has its own pictures — the placeholder pool is
    // standing in until then
    placeholderImages: !own.length,
  });
}

mkdirSync(dirname(DATA_FILE), { recursive: true });
writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2) + '\n');

/* ——— 3. brand assets: OG + icons —————————————————
   Text is rendered via SVG -> sharp; verify visually after regenerating —
   librsvg resolves fonts through fontconfig and can silently fall back. */
const OG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="${PAPER}"/>
<text x="70" y="290" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="400" font-size="104" letter-spacing="-1" fill="${INK}">Pyrenees</text>
<text x="70" y="400" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="400" font-size="104" letter-spacing="-1" fill="${INK}">Pictures Studio</text>
<text x="72" y="512" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="30" fill="${INK}">Live action to full CG - Tokyo</text>
</svg>`;
await sharp(Buffer.from(OG_SVG)).png().toFile(join(ROOT, 'public/og.png'));

const ICON_SVG = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
<rect width="${s}" height="${s}" fill="${INK}"/>
<text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="700" font-size="${s * 0.62}" fill="${PAPER}">P</text>
</svg>`;
writeFileSync(join(ROOT, 'public/favicon.svg'), ICON_SVG(64));
await sharp(Buffer.from(ICON_SVG(180))).png().toFile(join(ROOT, 'public/apple-touch-icon.png'));
await sharp(Buffer.from(ICON_SVG(192))).png().toFile(join(ROOT, 'public/icon-192.png'));
await sharp(Buffer.from(ICON_SVG(512))).png().toFile(join(ROOT, 'public/icon-512.png'));

const files = readdirSync(OUT_DIR);
console.log(`optimized ${files.length} images -> public/images/archive/ (webp, <=1600w)`);
console.log(`wrote ${entries.length} entries -> src/data/archive.json`);
console.log('brand assets: og.png, favicon.svg, apple-touch-icon.png, icon-192/512.png');
