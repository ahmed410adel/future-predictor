// Bundles client/main.ts (and Three.js) into public/assets/app.js.
// The EC2 instances have no internet, so nothing is loaded from a CDN at run time.
import { build } from 'esbuild';

await build({
  entryPoints: ['client/main.ts'],
  bundle: true,
  minify: true,
  sourcemap: false,
  format: 'iife',
  target: ['es2022'],
  outfile: 'public/assets/app.js',
  legalComments: 'none',
  logLevel: 'info',
});
