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
  // bundle is false, so every module imported at runtime must be its own entry point.
  entryPoints: [
    path.join(srcDir, 'index.ts'),
    path.join(srcDir, 'parser.ts'),
    path.join(srcDir, 'cli.ts'),
    path.join(srcDir, 'bin.ts'),
  ],
  outdir: outDir,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  sourcemap: true,
  bundle: false,
  minify: false,
});

if (!errors.length) {
  await $`tsc --pretty -p .`;
  // The bin entrypoint needs to be executable so that `npm i -g @flakiness/junit-xml`
  // and `npx @flakiness/junit-xml ...` can invoke it directly.
  await fs.promises.chmod(path.join(outDir, 'bin.js'), 0o755);
}
