#!/usr/bin/env pnpm kubik

import esbuild from 'esbuild';
import fs from 'fs';
import { Task } from 'kubik';
import path from 'path';

const { __dirname, $ } = Task.init(import.meta, {
  name: 'junit-xml',
  watch: [ './src' ],
});

const outDir = path.join(__dirname, 'lib');
const typesDir = path.join(__dirname, 'types');
const srcDir = path.join(__dirname, 'src');
await fs.promises.rm(outDir, { recursive: true, force: true });
await fs.promises.rm(typesDir, { recursive: true, force: true });

const { errors } = await esbuild.build({
  color: true,
  // cli.ts (the bin) is the only real entry point; parser.ts gets inlined.
  entryPoints: [
    path.join(srcDir, 'cli.ts'),
  ],
  outdir: outDir,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  sourcemap: true,
  // Bundle all prod dependencies (zod in particular) so the published
  // package has zero runtime dependencies.
  bundle: true,
  banner: {
    // Bundled CJS dependencies require() node builtins at runtime.
    js: `import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);`,
  },
  minify: false,
});

if (!errors.length) {
  await $`tsc --pretty -p .`;
  // The bin entrypoint needs to be executable so that `npm i -g @flakiness/junit-xml`
  // and `npx @flakiness/junit-xml ...` can invoke it directly.
  await fs.promises.chmod(path.join(outDir, 'cli.js'), 0o755);
}
