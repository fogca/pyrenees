/* Masonry for the archive grid.

   Every picture in the catalogue on one page, so the aspect ratios are all
   over the place and aligned rows would leave holes under the short ones.
   Shortest-column placement instead, which also keeps the reading order
   roughly left to right — CSS multi-column would have been free, but it
   fills each column top to bottom, so the first project would end up stacked
   in column one and the last in column four.

   Positions come from the aspect ratios the build already knows, so the
   layout is right on the first frame and never waits on an image to load.
   Without JS the tiles stay in the plain grid the stylesheet gives them. */

export function initMasonry() {
  const grid = document.querySelector('[data-masonry]');
  if (!grid) return null;
  const items = [...grid.children];
  if (!items.length) return null;

  const cols = () => (window.innerWidth >= 1024 ? 4 : 2);
  const gap = () => (window.innerWidth >= 1024 ? 20 : 5);

  function layout() {
    const n = cols();
    const g = gap();
    const w = (grid.clientWidth - g * (n - 1)) / n;
    const tops = new Array(n).fill(0);

    for (const el of items) {
      const a = Number(el.dataset.aspect) || 1;
      let c = 0;
      for (let i = 1; i < n; i++) if (tops[i] < tops[c] - 0.5) c = i;
      el.style.width = `${w.toFixed(2)}px`;
      el.style.transform = `translate3d(${(c * (w + g)).toFixed(2)}px, ${tops[c].toFixed(2)}px, 0)`;
      tops[c] += w / a + g;
    }
    grid.style.height = `${(Math.max(...tops) - g).toFixed(0)}px`;
    grid.dataset.laidOut = '1';
  }

  let raf = null;
  const onResize = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(layout);
  };

  layout();
  window.addEventListener('resize', onResize);
  // the toolbars sliding away on iOS changes the width on some devices
  window.visualViewport?.addEventListener('resize', onResize);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    },
  };
}
