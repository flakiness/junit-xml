import { readReport } from '@flakiness/sdk';
import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const BIN = path.join(REPO_ROOT, 'lib', 'cli.js');
const BASIC_XML = path.join(REPO_ROOT, 'tests', 'assets', 'junit-basic.xml');

test('the bin converts a JUnit XML file into a Flakiness report on disk', async () => {
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'junit-xml-cli-'));
  const outputDir = path.join(workdir, 'flakiness-report');

  execFileSync('node', [
    BIN,
    BASIC_XML,
    '--commit-id', 'cli-smoke-commit',
    '--output-dir', outputDir,
    '--category', 'bun',
    '--disable-upload',
  ], { stdio: 'pipe' });

  const { report } = await readReport(outputDir);
  // `as string`: `commitId` is the branded `CommitId`; bun's strictly-typed
  // `expect` would otherwise demand the brand on the literal.
  expect(report.commitId as string).toBe('cli-smoke-commit');
  expect(report.category).toBe('bun');
  expect(report.suites).toHaveLength(2);

  await fs.rm(workdir, { recursive: true, force: true });
});
