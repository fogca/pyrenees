// Build pipeline for the archive + brand assets. Run: npm run gen
//  1. Optimizes every source image (scripts/source-images/, currently the
//     MILES158 stand-in set) to 1600w webp in public/images/archive/
//  2. Writes src/data/archive.json from the real project folders in CMS/
//     (title/credits from index.md, pictures from images/ when present and
//     from the placeholder pool until then)
//  3. Generates the OG image (1200x630) and the icon set (favicon.svg,
//     apple-touch-icon, 192/512 manifest icons)
// Swap source-images for real photography as it exists; rerun.
import { mkdirSync, writeFileSync, readdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'scripts/source-images');
const OUT_DIR = join(ROOT, 'public/images/archive');
const DATA_FILE = join(ROOT, 'src/data/archive.json');

const INK = '#0d0d0c';
const PAPER = '#ffffff';

// Pool order is deliberate: photography first (leads the feed), brand boards
// interleaved later for rhythm.
const POOL = [
  'scene-coast.webp', 'hero_1_poster.jpg', 'LandCruiserFJ-VX.webp', 'scene-machiya.webp',
  'LC500.png', 'place.jpg', 'symbol.png', 'scene-mountain.webp',
  'AlphardHybrid-Z.webp', 'scene-aerial.webp', 'tagline.png', 'cleaning.webp',
  'LM500.png', '01_logotype_primary.png', 'colors.png', '08_typography_latin.png',
  '10_type_in_use.png', 'app_icon.png', '06_color_palette.png',
];

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
const CMS_DIR = join(ROOT, 'CMS');

// Running order. Also the fallback display name for a folder whose index.md
// has no title yet — these are the studio's own project names, not invented.
const PROJECTS = [
  { dir: 'miles158', name: 'MILES158' },
  { dir: 'jds', name: 'Japanese Dark Spirits' },
  { dir: 'ondo', name: 'Ondo' },
  { dir: 'sann', name: 'SANN' },
  { dir: 'naun', name: 'NAUN' },
  { dir: 'unknown', name: 'Unknown' },
];

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

const IMG_RE = /\.(jpe?g|png|webp|avif|tiff?)$/i;
function realImages(dir) {
  const d = join(CMS_DIR, dir, 'images');
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((f) => IMG_RE.test(f)).sort()
    .map((f) => join(d, f));
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
    slug: slugify(dir),
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
