import { FlakinessReport } from '@flakiness/flakiness-report';
import { CIUtils, GitWorktree, ReportUtils, writeReport } from '@flakiness/sdk';
import { Command, Option } from 'commander';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseJUnit } from './parser.js';

/**
 * Build a commander `Command` that converts JUnit XML to a Flakiness Report.
 *
 * Used two ways:
 * 1. Standalone — the package's `bin` entrypoint renames it and invokes `parseAsync(process.argv)`.
 * 2. As a subcommand — host CLIs (e.g. the Flakiness monorepo CLI) rename it and `addCommand` it
 *    on their own commander program.
 *
 * @param name - The command name (e.g. `'convert-junit'` as a subcommand, or
 *   `'flakiness-junit-xml'` as a standalone bin). Shown in help/usage output.
 *
 * @example
 * import { createCommand } from '@flakiness/junit-xml';
 * program.addCommand(createCommand('convert-junit'));
 */
export function createCommand(name: string): Command {
  return new Command(name)
    .description('Convert JUnit XML report(s) to Flakiness report format')
    .argument('<junit-path>', 'Path to a JUnit XML file or a directory containing XML files')
    .option('--env-name <name>', 'Environment name for the report (defaults to --category, or `junit` if neither is set)')
    .option('--commit-id <id>', 'Git commit ID (auto-detected from the current working directory if not provided)')
    .addOption(new Option('--title <title>', 'Human-readable report title').env('FLAKINESS_TITLE'))
    .option('--output-dir <dir>', 'Output directory for the report', 'flakiness-report')
    .option('-c, --category <category>', 'Report category identifier (e.g. `bun`, `rust`). Defaults to `junit`.')
    .addOption(new Option('--flakiness-project <project>', 'Flakiness project identifier in `org/project` format').env('FLAKINESS_PROJECT'))
    // Backwards-compat alias: the Flakiness CLI historically exposed this as `-p, --project`.
    // Hidden from help so `--flakiness-project` is the one documented form.
    .addOption(new Option('-p, --project <org/project>').hideHelp())
    .action(async (junitPath: string, options: {
      envName?: string,
      commitId?: string,
      title?: string,
      outputDir: string,
      category?: string,
      flakinessProject?: string,
      project?: string,
    }) => {
      await runConvert(junitPath, {
        envName: options.envName ?? options.category ?? 'junit',
        outputDir: options.outputDir,
        commitId: options.commitId,
        title: options.title,
        category: options.category,
        flakinessProject: options.flakinessProject ?? options.project,
      });
    });
}

async function runConvert(junitPath: string, options: {
  envName: string,
  commitId?: string,
  title?: string,
  outputDir: string,
  flakinessProject?: string,
  category?: string,
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
