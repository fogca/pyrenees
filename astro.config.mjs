import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// site: placeholder domain until DNS is confirmed — sitemap/canonical/og all
// derive from it, so flipping this one value re-points everything.
export default defineConfig({
  site: 'https://pyrenees.studio',
  output: 'static',
  integrations: [sitemap()],
  server: {
    host: true,
    port: 4251,
  },
});
