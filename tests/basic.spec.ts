import { ReportUtils } from '@flakiness/sdk';
import type { FlakinessReport as FK } from '@flakiness/flakiness-report';
import { expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';

import { parseJUnit } from '../src/parser.js';
import { assertCount } from './utils.js';

const FIXTURES = path.resolve(import.meta.dirname, 'assets');

async function loadFixture(name: string): Promise<string> {
  return fs.readFile(path.join(FIXTURES, name), 'utf8');
}

function defaultOptions() {
  return {
    defaultEnv: ReportUtils.createEnvironment({ name: 'junit' }),
    commitId: 'fake-commit-id' as FK.CommitId,
    runDuration: 0 as FK.DurationMS,
    runStartTimestamp: Date.now() as FK.UnixTimestampMS,
  };
}

test('should parse TestNG timestamps', async () => {
  const xml = await loadFixture('junit-testng.xml');
  const { report } = await parseJUnit([xml], defaultOptions());

  const [suite] = assertCount(report.suites, 1);
  expect(suite.title).toBe('com.ing.engine.constants.SystemDefaultsNGTest');

  const [test1, test2] = assertCount(suite.tests, 2);
  expect(test1.title).toBe('testGetBuildVersion');
  expect(test2.title).toBe('testPrintSystemInfo');

  // Verify the timestamp was parsed (not NaN).
  expect(test1.attempts[0].startTimestamp).not.toBeNaN();
  expect(test1.attempts[0].startTimestamp).toBeGreaterThan(0);
});

test('should produce a Flakiness Report from a basic JUnit XML', async () => {
  const xml = await loadFixture('junit-basic.xml');
  const { report } = await parseJUnit([xml], defaultOptions());

  const [chromium, webkit] = assertCount(report.suites, 2);
  expect(chromium.title).toBe('chromium');

  const [cTest1, cTest2, cTest3] = assertCount(chromium.tests, 3);
  assertCount(cTest1.attempts, 1);
  assertCount(cTest2.attempts, 1);
  assertCount(cTest3.attempts, 1);

  const [inner] = assertCount(webkit.suites, 1);
  const [iTest1, iTest2, iTest3] = assertCount(inner.tests, 3);
  assertCount(iTest1.attempts, 2);
  assertCount(iTest2.attempts, 1);
  assertCount(iTest3.attempts, 2);

  const [wTest1, wTest2, wTest3] = assertCount(webkit.tests, 3);
  assertCount(wTest1.attempts, 2);
  assertCount(wTest2.attempts, 2);
  assertCount(wTest3.attempts, 1);
});

test('should parse `bun test` JUnit XML', async () => {
  const xml = await loadFixture('junit-bun.xml');
  const { report } = await parseJUnit([xml], defaultOptions());

  const [suite] = assertCount(report.suites, 1);
  expect(suite.title).toBe('sample.test.ts');

  const [pass1, pass2, fail] = assertCount(suite.tests, 3);

  // Passing attempts carry no explicit `status` — `passed` is the implicit
  // default and is omitted from the normalized report.
  expect(pass1.title).toBe('addition works');
  expect(assertCount(pass1.attempts, 1)[0].status ?? 'passed').toBe('passed');

  expect(pass2.title).toBe('string includes');
  expect(assertCount(pass2.attempts, 1)[0].status ?? 'passed').toBe('passed');

  expect(fail.title).toBe('this one fails on purpose');
  const [failAttempt] = assertCount(fail.attempts, 1);
  expect(failAttempt.status).toBe('failed');
  expect(failAttempt.errors?.[0]?.message).toContain('AssertionError');

  // bun's CI-only testsuite <properties> (e.g. `commit`) is runner
  // provenance, not environment metadata — it must not leak in.
  expect(assertCount(report.environments, 1)[0].metadata).toEqual({});
});

test('should parse `cargo nextest` JUnit XML', async () => {
  const xml = await loadFixture('junit-nextest.xml');
  const { report } = await parseJUnit([xml], defaultOptions());

  const [suite] = assertCount(report.suites, 1);
  expect(suite.title).toBe('nextest_sample');

  const [pass1, pass2, fail] = assertCount(suite.tests, 3);

  expect(pass1.title).toBe('tests::addition_works');
  expect(assertCount(pass1.attempts, 1)[0].status ?? 'passed').toBe('passed');

  expect(pass2.title).toBe('tests::string_contains');
  expect(assertCount(pass2.attempts, 1)[0].status ?? 'passed').toBe('passed');

  expect(fail.title).toBe('tests::this_one_fails_on_purpose');
  const [failAttempt] = assertCount(fail.attempts, 1);
  expect(failAttempt.status).toBe('failed');
  expect(JSON.stringify(failAttempt.errors)).toContain('two plus two is not five');
});

// bun on Windows writes file="tests\unit\cli.test.ts" into the JUnit XML.
// GitFilePath must be POSIX/git-style everywhere in the system, so the parser
// has to normalize `\` -> `/` at this ingestion boundary. Pinned to the real
// bun-on-Windows artifact.
test('should normalize Windows backslash paths from bun-on-Windows JUnit XML to POSIX', async () => {
  const xml = await loadFixture('junit-bun-windows.xml');
  const { report } = await parseJUnit([xml], { ...defaultOptions(), category: 'bun' });

  const [suite] = assertCount(report.suites, 1);
  const [pass, fail, skip] = assertCount(suite.tests, 3);

  // (`!` is safe: bun emits file= and line= on every testcase.)
  // `as string`: `file` is the branded `GitFilePath`; bun's strictly-typed
  // `expect` would otherwise demand the brand on the literal.
  for (const t of [pass, fail, skip])
    expect(t.location!.file as string).toBe('tests/unit/cli.test.ts');
});

test('should set the report category to `junit` by default', async () => {
  const xml = await loadFixture('junit-basic.xml');
  const { report } = await parseJUnit([xml], defaultOptions());
  expect(report.category).toBe('junit');
});

test('should honor the `category` override', async () => {
  const xml = await loadFixture('junit-basic.xml');
  const { report } = await parseJUnit([xml], { ...defaultOptions(), category: 'bun' });
  expect(report.category).toBe('bun');
});
