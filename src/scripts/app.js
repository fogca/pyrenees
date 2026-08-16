// Global runtime: Lenis smooth scroll (singleton across ClientRouter swaps),
// curtain page transitions, per-page init dispatch.
// ClientRouter keeps this module alive across navigations — everything here
// must be idempotent and re-entrant (astro:page-load fires on every swap).
//
// Transition design (two distinct systems, never combined):
//  - work card -> detail: NO curtain; the shared-element image morph
//    (transition:name) carries the navigation.
//  - all other navigations: ink curtain covers fully (navigation is held via
//    e.loader until it does), swap happens blind, curtain exits upward.
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initTop } from './top.js';

gsap.registerPlugin(ScrollTrigger);

let lenis = null;
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function ensureLenis() {
  if (lenis) return lenis;
  // reduced motion: lerp 1 = no smoothing, scroll behaves natively
  lenis = new Lenis({ autoRaf: false, lerp: REDUCED ? 1 : 0.11 });
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.on('scroll', ScrollTrigger.update);
  return lenis;
}

/* ——— curtain ————————————————————————————
   The curtain's position is owned 100% by gsap yPercent. It must NOT also
   carry a CSS translate: the two compose, and a curtain animating yPercent
   101 -> 0 on top of a CSS translateY(101%) never actually reaches the
   viewport — which made swaps happen in plain sight (the original "broken
   transitions" bug). */
const LABELS = [
  ['/works', 'Works'],
  ['/about', 'About'],
  ['/contact', 'Contact'],
  ['/archive/', 'Archive'],
  ['/', 'Pyrenees Pictures'],
];
const labelFor = (path) => (LABELS.find(([p]) => (p === '/' ? path === '/' : path.startsWith(p))) ?? [null, 'Pyrenees Pictures'])[1];

let curtainUp = false;

function ownCurtain() {
  const el = document.getElementById('curtain');
  if (!el || el.dataset.owned) return;
  el.dataset.owned = '1';
  gsap.set(el, { yPercent: 101, visibility: 'visible' });
}

function curtainIn(label) {
  const el = document.getElementById('curtain');
  if (!el) return Promise.resolve();
  const labelEl = document.getElementById('curtainLabel');
  if (labelEl) labelEl.textContent = label;
  // see the note in Base.astro: the ink goes on for the navigation only
  el.style.backgroundColor = 'var(--color-ink)';
  curtainUp = true;
  return gsap.timeline()
    .set(el, { yPercent: 101 })
    .to(el, { yPercent: 0, duration: REDUCED ? 0 : 0.5, ease: 'power3.inOut' })
    .then();
}
function curtainOut() {
  if (!curtainUp) return; // first load / tile-morph navs: nothing to lift
  const el = document.getElementById('curtain');
  if (!el) return;
  curtainUp = false;
  gsap.to(el, {
    yPercent: -101, duration: REDUCED ? 0 : 0.55, ease: 'power3.inOut', delay: REDUCED ? 0 : 0.06,
    onComplete: () => {
      gsap.set(el, { yPercent: 101 });
      el.style.backgroundColor = 'transparent';
    },
  });
}

let curtainNav = false;

document.addEventListener('astro:before-preparation', (e) => {
  // A picture clicked on the top strip or the works grid rides the
  // shared-element morph instead of the curtain — its own frame becomes the
  // detail hero, so a curtain would hide the one thing worth watching.
  // A menu row has no on-screen counterpart to morph from, so it takes the
  // curtain like any other navigation.
  const link = e.sourceElement?.closest?.('[data-work-link], .tp__card');
  curtainNav = !link;
  if (!curtainNav) return;
  const originalLoader = e.loader;
  e.loader = async function () {
    await curtainIn(labelFor(new URL(e.to).pathname));
    await originalLoader();
  };
});

document.addEventListener('astro:before-swap', (e) => {
  // Old page's scroll choreography dies with the old DOM.
  ScrollTrigger.getAll().forEach((t) => t.kill());
  // Curtain navigations swap BLIND — but both documents carry tile-<slug>
  // names (top stages, works grid), and named view-transition groups paint
  // in the ::view-transition layer ABOVE the ink. Skip the transition
  // entirely: the swap is covered, nothing is lost, and cards no longer
  // fly across the curtain.
  if (curtainNav) {
    // skipTransition() rejects the transition's own promises; nothing here
    // awaits them, so swallow it or every curtain navigation logs an
    // unhandled AbortError in the console.
    e.viewTransition?.ready?.catch(() => {});
    e.viewTransition?.finished?.catch(() => {});
    e.viewTransition?.skipTransition?.();
  }
});

/* ——— language ————————————————————————————
   The switch is CSS-only (both languages ship in the HTML, see T.astro), so
   all this does is move one attribute and remember the choice. URLs never
   change: every link works identically in either language. */
function applyLang(lang) {
  document.documentElement.dataset.lang = lang;
  document.documentElement.lang = lang;
  try { localStorage.setItem('pps-lang', lang); } catch { /* private mode */ }
  const btn = document.getElementById('langBtn');
  if (btn) {
    // the label shows the CURRENT language, so the accessible name has to
    // say what pressing it will do — otherwise it reads as a statement
    btn.setAttribute('aria-label', lang === 'ja' ? 'Switch to English' : '日本語に切り替える');
  }
  // FONTPLUS serves a subset of exactly the characters it saw; a language
  // swap reveals glyphs that were hidden at first scan, so ask for a rescan.
  whenFontplus((fp) => fp.reload(false));
}
function whenFontplus(cb, timeoutMs = 6000) {
  const t0 = performance.now();
  const poll = () => {
    const fp = window.FONTPLUS;
    if (fp && typeof fp.reload === 'function') { cb(fp); return; }
    if (performance.now() - t0 > timeoutMs) return; // not contracted yet
    setTimeout(poll, 80);
  };
  poll();
}

let top = null;

document.addEventListener('astro:before-swap', () => {
  top?.leave();
  top = null;
});

document.addEventListener('astro:page-load', () => {
  const l = ensureLenis();
  l.scrollTo(0, { immediate: true, force: true });
  l.start();

  ownCurtain();

  applyLang(document.documentElement.dataset.lang === 'ja' ? 'ja' : 'en');
  document.getElementById('langBtn')?.addEventListener('click', () => {
    applyLang(document.documentElement.dataset.lang === 'ja' ? 'en' : 'ja');
  });
  whenFontplus((fp) => fp.reload(!window.__fpLoaded));
  window.__fpLoaded = true;

  // '/' is the one path the build does not append a slash to, so equality is
  // safe here — anything deeper must compare with the trailing slash in mind.
  if (document.body.dataset.path === '/') {
    top = initTop({ lenis: l, reduced: REDUCED });
    top?.enter();
  }
  ScrollTrigger.refresh();

  curtainOut();
});

window.addEventListener('resize', () => top?.resize());
// the iOS toolbars sliding in and out resize the visual viewport without
// firing a window resize, and the strip is measured against that height
window.visualViewport?.addEventListener('resize', () => top?.resize());
