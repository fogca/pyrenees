/* ============================================================
   TOP — the strip
   A single vertical column of images that scrolls under a fixed
   viewport, flanked by two columns of project names.

   Measured from the reference (cathydolle.com, 1440x810, 2026-08-14):
   On a phone the same strip lies DOWN: the frames run left to right and the
   page's own vertical scroll drives them (the runway element behind the
   stage supplies the scroll distance, 1px of scroll = 1px of travel). Native
   scrolling means native momentum and no touch-action fight; the loop is
   dropped there because a native scrollbar cannot wrap.

   - the reference stacks the frames edge to edge; this build sets them with
     a small gap (principal's call, 2026-08-14) so each picture reads on its
     own. The ragged silhouette still comes from the pictures' own widths.
   - every image is fitted into a box of span-3 x 40vh of a 12-column
     grid (350 x 324 at 1440x810) at its TRUE aspect: a landscape frame
     hits the width limit (350x200), a portrait one hits the height
     limit (232x324). Nothing is cropped, nothing is stretched.
   - the reference names all twelve projects in two flanking columns; this
     build names ONLY the one on the centre line, on the left, and turns it
     over like a die when the centre changes (principal's call).
   - the scroll is free and wrapping, and once the throw has spent itself the
     nearest frame is eased onto the centre line (the reference does not
     snap; this build does, again by request).
   - the picture inside each frame PARALLAXES against it: tracking one
     landscape frame through 237px of travel, its content shifted 24px the
     other way, i.e. the image lags the frame by ~10% of the frame's own
     displacement from the centre line. The frame never changes size.
   - the opening (timed off a warm-cache reload): a 7px filled square waits
     on the centre line, stretches horizontally into a row of ~9px
     thumbnails spanning the strip's own width (~1.35s, ease-in-out), and
     those thumbnails then grow and travel into the vertical strip before the
     name columns blur in last. The growth is a symmetric ease-in-out: it
     leaves the row slowly and, more importantly, LANDS slowly — an
     accelerating profile arrives at full size still moving, which is what
     read as wrong.
   ============================================================ */
const clamp = (lo, hi, x) => Math.min(hi, Math.max(lo, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => {
  const t = clamp(0, 1, (x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
// The opening's two profiles. Both are symmetric: the spread opens and
// closes gently, and the growth holds low, moves through the middle, then
// settles into full size instead of slamming into it.
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeGrow = (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);

export function initTop({ lenis, reduced }) {
  const stage = document.getElementById('topStage');
  if (!stage) return null;

  // Content lag as a fraction of the frame's displacement from the centre
  // line. The reference runs 0.10, but its excursion needs the picture blown
  // up well past its frame; REACH caps the enlargement at 12% so the
  // pictures are not visibly over-zoomed, and the lag simply holds at the
  // ends of its range.
  const SNAP_VEL = 6; // throw is spent below this; snapping takes over
  const PARALLAX = 0.06;
  const REACH = 0.06; // half the extra picture height, as a fraction of the frame
  const strip = stage.querySelector('.tp__strip');
  const cards = [...strip.querySelectorAll('.tp__card')];
  const pics = cards.map((c) => c.querySelector('img'));
  const info = cards.map((c) => ({
    no: c.dataset.no,
    title: c.dataset.title,
    href: c.getAttribute('href'),
  }));
  const dot = stage.querySelector('.tp__dot');
  const run = document.querySelector('.tp__run'); // sibling of the stage
  const meta = stage.querySelector('.tp__meta');
  const flip = meta?.querySelector('.tp__flip') ?? null;
  const faces = meta ? [...meta.querySelectorAll('.tp__face')] : [];
  const cross = stage.querySelector('.tp__cross');
  const N = cards.length;
  if (!N) return null;

  /* ---------- layout ---------- */
  const L = { vw: 0, vh: 0, boxW: 0, boxH: 0, total: 0, mobile: false };
  const geo = new Array(N); // {w, h, top} in strip space

  function measure() {
    L.vw = window.innerWidth;
    // visualViewport is the height actually on screen right now; innerHeight
    // and CSS 100vh both report the toolbar-collapsed maximum on iOS, and
    // mixing the two is what leaves layouts hanging behind the address bar
    L.vh = window.visualViewport?.height ?? window.innerHeight;
    L.mobile = L.vw < 768;

    // The reference box is span-3 of a 12-column grid. Read the page padding
    // from the token rather than restating it, so the strip and the name
    // columns stay on the same grid when --pad-inline changes.
    const pad = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--pad-inline')
    ) || 8;
    const cols = 12;
    const gut = 8;
    const col = (L.vw - pad * 2 - gut * (cols - 1)) / cols;
    if (L.mobile) {
      // lying down: the long axis is X, so the frame is capped by height and
      // allowed most of the width
      L.boxW = L.vw * 0.78;
      L.boxH = L.vh * 0.52;
    } else {
      L.boxW = col * 3 + gut * 2;
      L.boxH = L.vh * 0.4;
    }

    L.gap = L.mobile ? 10 : Math.round(clamp(12, 22, L.vh * 0.022));

    let top = 0;
    for (let i = 0; i < N; i++) {
      const a = Number(cards[i].dataset.aspect) || 1.5;
      // fit inside the box at true aspect — width-limited when landscape,
      // height-limited when portrait. No cropping either way.
      let w = L.boxW;
      let h = w / a;
      if (h > L.boxH) { h = L.boxH; w = h * a; }
      // `top` is the position along the travel axis: Y on desktop, X on a
      // phone. Everything downstream reads it through that one name.
      geo[i] = { w, h, top };
      top += (L.mobile ? w : h) + L.gap;
    }
    L.total = top; // the trailing gap is what keeps the loop evenly spaced

    for (let i = 0; i < N; i++) {
      const g = geo[i];
      cards[i].style.width = `${g.w.toFixed(1)}px`;
      cards[i].style.height = `${g.h.toFixed(1)}px`;
      // Headroom for the parallax: the picture has to be taller than its
      // frame by the full excursion at BOTH ends, or the lag would expose a
      // gap the moment the frame reaches the edge of the viewport.
      g.reach = REACH * g.h;
      const ph = g.h + g.reach * 2;
      pics[i].style.height = `${ph.toFixed(1)}px`;
      pics[i].style.top = `${(-g.reach).toFixed(1)}px`;
    }

    // The phone scrolls the document itself; the runway is what gives it
    // something to scroll. One pixel of scroll is one pixel of travel, and
    // the strip position is the scroll position MODULO the loop — so the
    // runway just has to be long enough that nobody reaches its end. Laying
    // out many loops beats wrapping the scrollbar by hand: a scrollTo mid
    // fling kills iOS momentum, and this way there is never a jump at all.
    L.loops = 40;
    L.base = Math.floor(L.loops / 2) * L.total; // room to scroll back, too
    if (run) {
      run.style.height = L.mobile ? `${(L.loops * L.total + L.vh).toFixed(0)}px` : '0px';
    }

    // The opening row: N thumbnails on the centre line, spanning the same
    // width the strip itself occupies. The row is laid out AROUND `L.mid` —
    // the frame that comes to rest on the centre line — so the thumbnail
    // sitting at the middle of the screen is the one that stays there.
    L.thumb = 9;
    // the thumbnail row runs ACROSS the strip: a horizontal row above a
    // vertical strip on desktop, a vertical column beside a horizontal strip
    // on a phone — the same move, mirrored
    L.pitch = (L.mobile ? L.boxH : L.boxW) / N;
    L.mid = Math.round((N - 1) / 2);
  }

  /* ---------- state ---------- */
  const S = {
    off: 0,      // strip offset in px (wraps over L.total)
    vel: 0,
    raf: null,
    last: 0,
    live: false,
    active: -1,
    hoverRow: -1,
    target: null, // set when a name row is clicked: absolute offset to ease to
    mx: 0, my: 0, cx: 0, cy: 0, cvis: 0,
    pointer: false,
    touching: false,
    face: 0,           // which of the two name faces is currently showing
    dir: 1,            // travel direction, so the die turns with the scroll
    prevOff: 0,
    intro: 1,          // 0..1 while the opening runs, 1 once it is over
    introDone: true,
    // The hold needs its own flag. Encoding it as `intro === 0` did not work:
    // the frame loop advances the clock whenever intro < 1, so by the time
    // the decode gate opened the clock had already left 0 and the handover
    // bailed out on its own guard — leaving the square lit forever.
    held: false,
  };

  const wrap = (v) => ((v % L.total) + L.total) % L.total;
  /* shortest signed distance around the loop */
  const wrapDelta = (v) => {
    let d = wrap(v);
    if (d > L.total / 2) d -= L.total;
    return d;
  };
  /* size of a frame along the travel axis */
  const along = (g) => (L.mobile ? g.w : g.h);
  /* the strip offset that puts frame i on the centre line — same on both
     layouts now that the phone loops too */
  const restFor = (i) => wrap(geo[i].top + along(geo[i]) / 2 - (L.mobile ? L.vw : L.vh) / 2);

  /* Nearest frame to the centre line. Not "the frame containing the centre":
     there are gaps between frames, and the centre line spends real time
     inside one of them. */
  function activeIndex() {
    const centre = wrap(S.off + (L.mobile ? L.vw : L.vh) / 2);
    let best = 0, bd = Infinity;
    for (let i = 0; i < N; i++) {
      const d = Math.abs(wrapDelta(geo[i].top + along(geo[i]) / 2 - centre));
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function place() {
    const off = wrap(S.off);
    for (let i = 0; i < N; i++) {
      const g = geo[i];
      // Place each frame at the loop representative NEAREST the centre line.
      // The old pair of one-way corrections could not do this: a frame just
      // above the viewport (y slightly under -h) was pushed a whole loop
      // DOWN, so during the opening the frames that belong above the centre
      // travelled the long way to the bottom instead of rising. Anchoring on
      // the centred position makes the sign of y match the frame's place in
      // the running order — left of the row goes up, right of it goes down.
      const centred = (L.mobile ? L.vw : L.vh) / 2 - along(g) / 2;
      const raw = g.top - off;
      // During the opening the frames must fan out in RUNNING ORDER, so the
      // raw (unwrapped) position is what counts. The nearest representative
      // is wrong there: with an even count the frame exactly half a loop
      // from the centred one sits on the tie and gets sent the other way —
      // which is the single frame that was seen swinging down instead of up.
      // Both agree for everything on screen, so the handover is invisible.
      const y = S.intro < 1 ? raw : centred + wrapDelta(raw - centred);
      const el = cards[i];
      // Every card stays rendered and focusable — the stage clips whatever
      // sits outside it. Hiding the off-screen ones with visibility made
      // them unfocusable, so tabbing could only ever reach the four frames
      // that happened to be on screen.
      let w = g.w, h = g.h;
      // `t` runs on the travel axis, `c` across it. Which CSS axis each maps
      // to is decided once, at the transform.
      let t = y;
      let c = L.mobile ? L.vh / 2 - h / 2 : -w / 2;

      if (S.intro < 1) {
        // Opening, in three moves that barely overlap: the row fans out,
        // the thumbnails travel to their places in the strip STILL SMALL,
        // and only then do they grow. Turning and growing at once read as
        // one muddled gesture.
        const spread = ease(clamp(0, 1, S.intro / 0.40));
        const move = ease(clamp(0, 1, (S.intro - 0.36) / 0.32));
        const grow = easeGrow(clamp(0, 1, (S.intro - 0.66) / 0.34));
        w = lerp(L.thumb, g.w, grow);
        h = lerp(L.thumb - 2, g.h, grow);
        // every thumbnail starts on the centre of the travel axis, and the
        // row opens from L.mid — so the frame in the middle of the row is
        // the one that ends up on the centre line, without travelling
        const t0 = (L.mobile ? L.vw : L.vh) / 2 - (L.mobile ? w : h) / 2;
        const cMid = L.mobile ? L.vh / 2 - h / 2 : -w / 2;
        const c0 = cMid + (i - L.mid) * L.pitch * spread;
        // position is done with `move`; only the box is left to `grow`
        t = lerp(t0, y, move);
        c = lerp(c0, cMid, move);
        el.style.width = `${w.toFixed(1)}px`;
        el.style.height = `${h.toFixed(1)}px`;
      } else if (S.introDone !== true) {
        // hand the boxes back to the measured layout exactly once
        el.style.width = `${g.w.toFixed(1)}px`;
        el.style.height = `${g.h.toFixed(1)}px`;
        if (i === N - 1) {
          S.introDone = true;
          S.active = -1; // force the name to be written once the frames land
          if (meta) meta.style.opacity = '1';
        }
      }

      el.style.transform = L.mobile
        ? `translate3d(${t.toFixed(2)}px, ${c.toFixed(1)}px, 0)`
        : `translate3d(${c.toFixed(1)}px, ${t.toFixed(2)}px, 0)`;

      // parallax: the picture lags the frame's displacement from the centre.
      // NB: not named `off` — the strip offset of that name lives in this
      // same function and a shadowing const would put it in a TDZ for the
      // `let y = g.top - off` line above.
      const half = (L.mobile ? L.vw : L.vh) / 2;
      const mid = t + (L.mobile ? w : h) / 2;
      const lag = clamp(-g.reach, g.reach, -PARALLAX * (mid - half));
      pics[i].style.transform = L.mobile
        ? `translate3d(${lag.toFixed(2)}px, 0, 0)`
        : `translate3d(0, ${lag.toFixed(2)}px, 0)`;
    }

    // The name waits until the frames have landed.
    if (S.intro < 1) return;

    const a = activeIndex();
    if (a !== S.active) {
      const first = S.active < 0;
      S.active = a;
      showName(a, first);
    }
  }

  /* ---------- the name ----------
     Two faces of one die. The face on screen rolls up and out while the
     next rolls in from below; they then swap roles, so no element is ever
     reused mid-turn (which is what makes a two-element flipper stutter). */
  function fill(el, i) {
    el.innerHTML = '';
    const no = document.createElement('span');
    no.className = 'tp__faceNo';
    no.textContent = `${info[i].no}/`;
    const title = document.createElement('span');
    title.textContent = info[i].title;
    el.append(no, title);
  }

  function showName(i, immediate) {
    if (!faces.length) return;
    meta.setAttribute('href', info[i].href);
    const front = faces[S.face];
    const back = faces[1 - S.face];

    if (immediate || reduced) {
      fill(front, i);
      front.dataset.state = 'in';
      back.dataset.state = 'wait';
      return;
    }

    // the turn follows the travel: forward rolls up, backward rolls down
    if (flip) flip.dataset.dir = S.dir < 0 ? 'back' : 'fwd';
    // stage the incoming face off-screen without animating it into position
    back.dataset.state = 'wait';
    fill(back, i);
    // one frame later, let it roll in — set in the same tick and the
    // transition has nothing to interpolate from
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        front.dataset.state = 'out';
        back.dataset.state = 'in';
      });
    });
    S.face = 1 - S.face;
  }

  /* ---------- input ---------- */
  function onWheel(e) {
    if (L.mobile) return;   // the document scrolls itself there
    e.preventDefault();
    S.target = null;
    S.vel += e.deltaY * (reduced ? 1 : 0.65);
  }

  let touchY = 0;
  const onTouchStart = (e) => {
    if (L.mobile) return;
    touchY = e.touches[0].clientY; S.target = null; S.touching = true;
  };
  const onTouchMove = (e) => {
    if (L.mobile) return;
    const y = e.touches[0].clientY;
    S.vel += (touchY - y) * 1.9;
    touchY = y;
    e.preventDefault();
  };
  const onTouchEnd = () => { S.touching = false; };

  /* Land a project on the centre line. The target is stored WRAPPED and the
     delta is recomputed every frame taking the short way round the loop —
     an absolute target cannot work here, because the offset is wrapped at
     the end of each frame and the two would fight the moment the eased
     path crossed the seam. */
  function goTo(i) {
    if (L.mobile) {
      // travel the short way round from wherever the scroll currently is
      lenis.scrollTo(window.scrollY + wrapDelta(restFor(i) - S.off), { force: true });
      return;
    }
    S.target = restFor(i);
    S.vel = 0;
  }

  /* Tabbing to a frame brings it to the centre — otherwise focus lands on
     something the clip is hiding and the page looks unresponsive. */
  function onFocusIn(e) {
    const card = e.target.closest?.('.tp__card');
    if (!card) return;
    const i = Number(card.dataset.i);
    if (Number.isInteger(i)) goTo(i);
  }

  function onMove(e) {
    S.mx = e.clientX; S.my = e.clientY;
    S.pointer = true;
  }

  /* On a phone the offset is simply the scroll position — native momentum,
     native rubber-banding, nothing to emulate. */
  const onScroll = () => { if (L.mobile) S.scrollDirty = true; };

  /* Which way the strip is travelling. Wrap-aware, and it ignores the noise
     of a nearly-still strip so the die does not flip its own direction while
     a throw is settling. */
  function trackDir() {
    const d = wrapDelta(S.off - S.prevOff);
    if (Math.abs(d) > 0.6) S.dir = d > 0 ? 1 : -1;
    S.prevOff = S.off;
  }

  /* ---------- frame ---------- */
  function tick(ts) {
    const dtMs = S.last ? Math.min(50, ts - S.last) : 16.7;
    S.last = ts;

    // The opening runs on both layouts, so its clock has to advance BEFORE
    // the phone branch returns — leaving it below meant the frames stayed
    // 9px thumbnails forever there.
    if (!S.held && S.intro < 1) {
      S.intro = Math.min(1, S.intro + dtMs / 2350);
    }

    if (L.mobile) {
      S.off = wrap(window.scrollY - L.base);
      trackDir();
      place();
      S.raf = requestAnimationFrame(tick);
      return;
    }

    if (S.target !== null) {
      const d = wrapDelta(S.target - S.off);
      if (Math.abs(d) < 0.5) { S.off = S.target; S.target = null; }
      else S.off += d * (1 - Math.pow(reduced ? 0 : 0.88, dtMs / 16.7));
    } else {
      S.off += S.vel * (dtMs / 16.7) * 0.1;
      S.vel *= Math.pow(reduced ? 0 : 0.9, dtMs / 16.7);
      if (Math.abs(S.vel) < 0.02) S.vel = 0;
      // Once the throw has spent itself, ease the nearest frame onto the
      // centre line. Not while a finger is down, and not during the opening
      // — either would fight the gesture the user is still making.
      if (!S.touching && S.intro >= 1 && Math.abs(S.vel) < SNAP_VEL) {
        const rest = restFor(activeIndex());
        if (Math.abs(wrapDelta(rest - S.off)) > 0.5) { S.target = rest; S.vel = 0; }
      }
    }
    S.off = wrap(S.off);
    trackDir();
    place();

    // crosshair: a small square that trails the pointer over the strip,
    // inverted against whatever is beneath it
    if (cross && !L.mobile) {
      const over = S.pointer && Math.abs(S.mx - L.vw / 2) < L.boxW / 2 + 10;
      S.cvis += ((over ? 1 : 0) - S.cvis) * (1 - Math.pow(0.82, dtMs / 16.7));
      S.cx = lerp(S.cx, S.mx, 1 - Math.pow(0.7, dtMs / 16.7));
      S.cy = lerp(S.cy, S.my, 1 - Math.pow(0.7, dtMs / 16.7));
      cross.style.transform = `translate3d(${S.cx.toFixed(1)}px, ${S.cy.toFixed(1)}px, 0)`;
      cross.style.opacity = S.cvis.toFixed(3);
    }

    S.raf = requestAnimationFrame(tick);
  }

  /* ---------- the opening ----------
     A filled square holds the centre line while the leading frames decode,
     then hands over to the thumbnail row, which spreads and grows into the
     strip. Waiting on decode rather than a fixed delay means the frames
     never pop in half-painted — and the square is the honest stand-in for
     "the pictures are coming", exactly as the reference uses it. */
  function intro() {
    if (reduced) {
      S.intro = 1; S.introDone = false; S.held = false;
      if (meta) meta.style.opacity = '1';
      place();
      return;
    }
    S.intro = 0;
    S.introDone = false;
    S.held = true;
    if (dot) dot.style.opacity = '1';
    if (meta) meta.style.opacity = '0';
    for (const c of cards) c.style.opacity = '0';
    const lead = pics.slice(0, 4).map((im) => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()));
    // never hold the square longer than a beat, even on a cold cache
    const start = () => {
      if (!S.live || !S.held) return;
      S.held = false;
      if (dot) dot.style.opacity = '0';
      for (const c of cards) c.style.opacity = '1';
    };
    Promise.all(lead).then(() => setTimeout(start, 260));
    setTimeout(start, 1500);
  }

  return {
    enter() {
      if (S.live) return;
      S.live = true;
      measure();
      if (L.mobile) {
        // the document is the input. Start part way down the runway so the
        // strip can be scrolled backwards too, positioned so the frame in
        // the middle of the opening row is the one on the centre line.
        // ⚠️ lenis caches the document height; measure() has just made the
        // runway tall, so without this the scrollTo is clamped to the old
        // (short) limit and lands at 0.
        lenis.resize();
        lenis.scrollTo(L.base + restFor(L.mid), { immediate: true, force: true });
        window.addEventListener('scroll', onScroll, { passive: true });
      } else {
        // the strip owns the wheel — the document itself never scrolls here
        lenis.stop();
        window.scrollTo(0, 0);
      }
      S.vel = 0; S.last = 0; S.active = -1; S.target = null; S.touching = false;
      S.dir = 1; S.prevOff = 0;
      // start centred on the same frame the opening row is built around
      S.off = restFor(L.mid);
      stage.addEventListener('wheel', onWheel, { passive: false });
      stage.addEventListener('touchstart', onTouchStart, { passive: true });
      stage.addEventListener('touchmove', onTouchMove, { passive: false });
      stage.addEventListener('touchend', onTouchEnd);
      stage.addEventListener('touchcancel', onTouchEnd);
      window.addEventListener('pointermove', onMove);
      stage.addEventListener('focusin', onFocusIn);
      place();
      intro();
      if (!S.raf) S.raf = requestAnimationFrame(tick);
    },
    leave() {
      if (!S.live) return;
      S.live = false;
      stage.classList.remove('is-in', 'is-intro');
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('touchstart', onTouchStart);
      stage.removeEventListener('touchmove', onTouchMove);
      stage.removeEventListener('touchend', onTouchEnd);
      stage.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', onScroll);
      stage.removeEventListener('focusin', onFocusIn);
      cancelAnimationFrame(S.raf); S.raf = null;
      lenis.start();
    },
    resize() {
      if (!S.live) return;
      // keep whatever is centred centred, rather than preserving a raw ratio
      const a = S.active >= 0 ? S.active : 0;
      measure();
      if (L.mobile) { lenis.resize(); lenis.scrollTo(L.base + restFor(a), { immediate: true, force: true }); }
      else S.off = restFor(a);
      S.target = null;
      place();
    },
  };
}
