#!/usr/bin/env node
import { FlakinessReport } from '@flakiness/flakiness-report';
import { CIUtils, GitWorktree, ReportUtils, uploadReport, writeReport } from '@flakiness/sdk';
import { Command, Option } from 'commander';
import fs from 'node:fs/promises';
import path from 'node:path';
import pkg from '../package.json' with { type: 'json' };
import { parseJUnit } from './parser.js';

const STDERR_LOGGER = {
  log: (...args: unknown[]) => console.error(...args),
  warn: (...args: unknown[]) => console.error(...args),
  error: (...args: unknown[]) => console.error(...args),
};

function envBool(name: string): boolean {
  return ['1', 'true'].includes(process.env[name]?.toLowerCase() ?? '');
}

const program = new Command('flakiness-junit-xml')
  .description('Convert JUnit XML report(s) to a Flakiness report and upload it to flakiness.io')
  .version(pkg.version, '-v, --version', 'Output the version number')
  .argument('<junit-path>', 'Path to a JUnit XML file or a directory containing XML files')
  .option('-c, --category <category>', 'Report category identifier (e.g. `bun`, `rust`). Defaults to `junit`.')
  .option('--env-name <name>', 'Environment name for the report (defaults to --category, or `junit` if neither is set)')
  .option('--commit-id <id>', 'Git commit ID (auto-detected from the current working directory if not provided)')
  .addOption(new Option('--title <title>', 'Human-readable report title').env('FLAKINESS_TITLE'))
  .option('--output-dir <dir>', 'Output directory for the report', 'flakiness-report')
  .addOption(new Option('--flakiness-project <project>', 'Flakiness project identifier in `org/project` format').env('FLAKINESS_PROJECT'))
  // Backwards-compat alias: the Flakiness CLI historically exposed this as `-p, --project`.
  // Hidden from help so `--flakiness-project` is the one documented form.
  .addOption(new Option('-p, --project <org/project>').hideHelp())
  .addOption(new Option('--token <token>', 'Flakiness.io access token for upload').env('FLAKINESS_ACCESS_TOKEN'))
  .option('--endpoint <url>', 'Flakiness.io API endpoint override')
  .addOption(new Option('--disable-upload', 'Convert only; do not upload to flakiness.io').env('FLAKINESS_DISABLE_UPLOAD'))
  .action(async (junitPath: string, options: {
    envName?: string,
    commitId?: string,
    title?: string,
    outputDir: string,
    category?: string,
    flakinessProject?: string,
    project?: string,
    token?: string,
    endpoint?: string,
    disableUpload?: boolean,
  }) => {
    await runConvert(junitPath, {
      envName: options.envName ?? options.category ?? 'junit',
      outputDir: options.outputDir,
      commitId: options.commitId,
      title: options.title,
      category: options.category,
      flakinessProject: options.flakinessProject ?? options.project,
      token: options.token,
      endpoint: options.endpoint,
      disableUpload: !!options.disableUpload,
    });
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

async function runConvert(junitPath: string, options: {
  envName: string,
  commitId?: string,
  title?: string,
  outputDir: string,
  flakinessProject?: string,
  category?: string,
  token?: string,
  endpoint?: string,
  disableUpload?: boolean,
}): Promise<void> {
  const fullPath = path.resolve(junitPath);
  if (!(await exists(fullPath))) {
    console.error(`Error: path ${fullPath} is not accessible`);
    process.exit(1);
  }

  const stat = await fs.stat(fullPath);
  const xmlContents: string[] = [];

  if (stat.isFile()) {
    xmlContents.push(await fs.readFile(fullPath, 'utf-8'));
  } else if (stat.isDirectory()) {
    const xmlFiles = await findXmlFiles(fullPath);
    if (xmlFiles.length === 0) {
      console.error(`Error: No XML files found in directory ${fullPath}`);
      process.exit(1);
    }
    console.log(`Found ${xmlFiles.length} XML file(s)`);
    for (const xmlFile of xmlFiles)
      xmlContents.push(await fs.readFile(xmlFile, 'utf-8'));
  } else {
    console.error(`Error: ${fullPath} is neither a file nor a directory`);
    process.exit(1);
  }

  let commitId: FlakinessReport.CommitId;
  if (options.commitId) {
    commitId = options.commitId as FlakinessReport.CommitId;
  } else {
    const result = GitWorktree.initialize(process.cwd());
    if (!result.ok) {
      console.error(`Failed to detect git commit (${result.error}). Please provide --commit-id.`);
      process.exit(1);
    }
    commitId = result.commitId;
  }

  const { report, attachments } = await parseJUnit(xmlContents, {
    commitId,
    defaultEnv: ReportUtils.createEnvironment({ name: options.envName }),
    runStartTimestamp: Date.now() as FlakinessReport.UnixTimestampMS,
    runDuration: 0 as FlakinessReport.DurationMS,
    runUrl: CIUtils.runUrl(),
    category: options.category,
  });

  if (options.title)
    report.title = options.title;
  if (options.flakinessProject)
    report.flakinessProject = options.flakinessProject;

  await writeReport(report, attachments, options.outputDir);
  console.log(`✓ Saved to ${options.outputDir}`);

  // Auto-upload, matching the reporter family's contract. Gated by
  // --disable-upload / FLAKINESS_DISABLE_UPLOAD. Auth is via --token /
  // FLAKINESS_ACCESS_TOKEN, or GitHub OIDC when `flakinessProject` is set.
  const disableUpload = options.disableUpload || envBool('FLAKINESS_DISABLE_UPLOAD');
  if (!disableUpload) {
    await uploadReport(report, attachments, {
      flakinessAccessToken: options.token,
      flakinessEndpoint: options.endpoint,
      logger: STDERR_LOGGER,
    });
  }
}

async function exists(p: string): Promise<boolean> {
  return fs.access(p, fs.constants.F_OK).then(() => true).catch(() => false);
}

async function findXmlFiles(dir: string, result: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.xml'))
      result.push(fullPath);
    else if (entry.isDirectory())
      await findXmlFiles(fullPath, result);
  }
  return result;
}
