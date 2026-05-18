/**
 * This is largely based upon a nice writeup from here: https://github.com/testmoapp/junitxml
 */
import { FlakinessReport as FK } from '@flakiness/flakiness-report';
import { ReportUtils } from '@flakiness/sdk';
import { parseXml, XmlElement, XmlNode, XmlText } from '@rgrove/parse-xml';
import assert from 'assert';
import fs from 'fs';
import mime from 'mime';
import path from 'path';
import { Temporal } from 'temporal-polyfill';
import pkg from '../package.json' with { type: 'json' };

let gTZAbbreviationToIANATimezone: Map<string, string>|undefined;
function tzAbbreviationToIANA(tz: string): string|undefined {
  if (!gTZAbbreviationToIANATimezone) {
    gTZAbbreviationToIANATimezone = new Map<string, string>();
    // Probes summer + winter dates to capture both DST and standard abbreviations.
    const probes = [new Date('2026-06-15T12:00:00Z'), new Date('2026-01-15T12:00:00Z')];
    for (const tz of Intl.supportedValuesOf('timeZone')) {
      for (const date of probes) {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(date);
        const abbr = parts.find(p => p.type === 'timeZoneName')?.value;
        if (abbr)
          gTZAbbreviationToIANATimezone.set(abbr, tz);
      }
    }
  }
  return gTZAbbreviationToIANATimezone.get(tz);
}

function parseTimestamp(timestamp: string): number {
  const native = new Date(timestamp).getTime();
  if (!isNaN(native))
    return native;

  // TestNG's JUnitReportReporter uses format "yyyy-MM-dd'T'HH:mm:ss z" where z is
  // either a timezone abbreviation ("MDT") or a GMT offset ("GMT+05:30").
  // https://github.com/testng-team/testng/blob/4c92177dde0b50502c3f3d2de3ab514a23ea0994/testng-core-api/src/main/java/org/testng/reporters/XMLReporterConfig.java#L89
  //
  // Here we try to parse in this format using the constructed list of tz abbreviations to IANA Names.
  const parts = timestamp.split(/\s+/);
  const iana = parts.length === 2 ? tzAbbreviationToIANA(parts[1]) : undefined;
  if (iana) {
    const d = Temporal.PlainDateTime.from(parts[0]);
    return d.toZonedDateTime(iana).epochMilliseconds;
  }
  throw new Error(`failed to parse timestamp: ${timestamp}`);
}

type ProcessingContext = {
  report: FK.Report,
  attachments: Map<FK.AttachmentId, ReportUtils.Attachment>,
  currentSuite?: FK.Suite,
  currentEnv: FK.Environment,
  currentEnvIndex: number,
  currentTimeMs: number,
  ignoreAttachments: boolean,
}

function getProperties(element: XmlElement): [string, string][] {
  const propertiesNodes = element.children.filter(node => node instanceof XmlElement).filter(node => node.name === 'properties');
  if (!propertiesNodes.length)
    return [];
  const result: [string, string][] = [];
  for (const propertiesNode of propertiesNodes) {
    const properties = propertiesNode.children.filter(node => node instanceof XmlElement).filter(node => node.name === 'property');
    for (const property of properties) {
      const name = property.attributes['name'];
      const innerText = property.children.find(node => node instanceof XmlText);
      const value = property.attributes['value'] ?? innerText?.text ?? '';
      result.push([name, value]);
    }
  }
  return result;
}

function extractErrors(testcase: XmlElement): FK.ReportError[]|undefined {
  const xmlErrors = testcase.children
    .filter(e => e instanceof XmlElement)
    .filter(element => element.name === 'error' || element.name === 'failure');
  if (!xmlErrors.length)
    return undefined;
  return xmlErrors.map(xmlErr => parseError(xmlErr));
}

function parseError(xmlErr: XmlElement, explicitStackTrace?: 'explicit-stack-trace'): FK.ReportError {
  const stackTraceContainer = explicitStackTrace ? xmlErr.children.find(child => child instanceof XmlElement && child.name === 'stackTrace') as XmlElement | undefined : xmlErr;
  const xmlStackNodes = stackTraceContainer?.children.filter(child => child instanceof XmlText);
  let stack = xmlStackNodes ? xmlStackNodes.map(node => node.text).join('\n') : undefined;
  let message = '';
  let stackPrefix = '';
  for (const token of [xmlErr.attributes['type'], xmlErr.attributes['message']]) {
    if (!token)
      continue;
    message = (message ? message + ' ' : '') + token;
    if (!stack?.includes(token))
      stackPrefix = (stackPrefix ? stackPrefix + ' ' : '') + token;
  }
  if (stack && stackPrefix)
    stack = stackPrefix + '\n' + stack;
  return {
    message,
    stack,
  };
}

function extractStdIO(testcase: XmlElement): FK.TimedSTDIOEntry[] {
  const xmlStdio = testcase.children
    .filter(e => e instanceof XmlElement)
    .filter(element => element.name === 'system-out' || element.name === 'system-err');
  return xmlStdio.map(node => {
    return node.children.filter(child => child instanceof XmlText).map(txtNode => ({
      stream: node.name === 'system-out' ? FK.STREAM_STDOUT : FK.STREAM_STDERR,
      text: txtNode.text,
      dts: 0 as FK.DurationMS,
    }));
  }).flat();
}

async function parseAttachment(value: string): Promise<ReportUtils.Attachment> {
  // There are 3 types of attachments: files, data URLs, and just some values.
  // Check if the value points to a local file
  let absolutePath = path.resolve(process.cwd(), value);
  if (fs.existsSync(absolutePath))
    return ReportUtils.createFileAttachment(mime.getType(absolutePath) ?? 'image/png', absolutePath);

  //TODO: handle URLs and data URLs as well.
  return ReportUtils.createDataAttachment('text/plain', Buffer.from(value));
}

async function traverseJUnitReport(context: ProcessingContext, node: XmlNode) {
  const element = node;
  if (!(element instanceof XmlElement))
    return;

  let { currentEnv, currentEnvIndex, currentSuite, report, currentTimeMs } = context;

  // If the node has a "timestamp" attribute, then this is our new current time.
  if (element.attributes['timestamp'])
    currentTimeMs = parseTimestamp(element.attributes['timestamp']);

  if (element.name === 'testsuite') {
    // Create a new suite for the testSuite node.
    const file = element.attributes['file'];
    const line = parseInt(element.attributes['line'], 10);
    const name = element.attributes['name'];
    const newSuite: FK.Suite = {
      title: name ?? file,
      location: file && !isNaN(line) ? {
        file: file as FK.GitFilePath,
        line: line as FK.Number1Based,
        column: 1 as FK.Number1Based,
      } : undefined,
      type: name ? 'suite' :
            file ? 'file' :
            'anonymous suite',
      suites: [],
      tests: [],
    }
    if (currentSuite) {
      currentSuite.suites ??= [];
      currentSuite.suites.push(newSuite);
    } else {
      report.suites ??= [];
      report.suites.push(newSuite);
    }
    currentSuite = newSuite;
  } else if (element.name === 'testcase') {
    assert(currentSuite);
    const file = element.attributes['file'];
    const name = element.attributes['name'];
    const line = parseInt(element.attributes['line'], 10);
    const duration = parseFloat(element.attributes['time']) * 1000 as FK.DurationMS;

    const annotations: FK.Annotation[] = [];
    const attachments: FK.Attachment[] = [];
    for (const [key, value] of getProperties(element)) {
      // JUnit attachments start with "attachment" key
      if (key.toLowerCase().startsWith('attachment')) {
        if (context.ignoreAttachments)
          continue;

        const attachment = await parseAttachment(value);
        context.attachments.set(attachment.id, attachment);
        attachments.push({
          id: attachment.id,
          contentType: attachment.contentType,
          //TODO: better default names for attachments?
          name: attachment.type === 'file' ? path.basename(attachment.path) : `attachment`,
        });
      } else {
        annotations.push({
          type: key,
          description: value.length ? value : undefined,
        });
      }
    }

    const childElements = element.children.filter(child => child instanceof XmlElement);
    const xmlSkippedAnnotation = childElements.find(child => child.name === 'skipped');
    if (xmlSkippedAnnotation)
      annotations.push({ type: 'skipped', description: xmlSkippedAnnotation.attributes['message'] });

    const expectedStatus: FK.TestStatus = xmlSkippedAnnotation ? 'skipped' : 'passed';

    const errors = extractErrors(element);
    const test: FK.Test = {
      title: name,
      location: file && !isNaN(line) ? {
        file: file as FK.GitFilePath,
        line: line as FK.Number1Based,
        column: 1 as FK.Number1Based,
      } : undefined,
      attempts: [{
        environmentIdx: currentEnvIndex,
        expectedStatus,
        annotations,
        attachments,
        startTimestamp: 0 as FK.UnixTimestampMS,
        duration,
        status: xmlSkippedAnnotation ? 'skipped' : errors ? 'failed' : 'passed',
        errors,
        stdio: extractStdIO(element),
      }]
    };
    for (const rerun of element.children.filter(child => child instanceof XmlElement && ['rerunFailure', 'rerunError', 'flakyError', 'flakyFailure'].includes(child.name)) as XmlElement[]) {
      const duration = parseFloat(rerun.attributes['time'] || '0') * 1000 as FK.DurationMS;
      const attempt: FK.RunAttempt = {
        environmentIdx: currentEnvIndex,
        expectedStatus,
        annotations,
        startTimestamp: 0 as FK.UnixTimestampMS,
        duration,
        status: 'failed',
        errors: [parseError(rerun, 'explicit-stack-trace')],
        stdio: extractStdIO(rerun),
      };
      if (rerun.name.startsWith('flaky'))
        test.attempts.splice(test.attempts.length - 1, 0, attempt);
      else
        test.attempts.push(attempt);
    }
    for (const attempt of test.attempts) {
      attempt.startTimestamp = currentTimeMs as FK.UnixTimestampMS;
      currentTimeMs += attempt.duration!;
    }
    currentSuite.tests ??= [];
    currentSuite.tests.push(test);
  }

  context = { ...context, currentEnv, currentEnvIndex, currentSuite, currentTimeMs };
  for (const child of element.children)
    await traverseJUnitReport(context, child);
}

export async function parseJUnit(xmls: string[], options: {
  defaultEnv: FK.Environment,
  commitId: FK.CommitId,
  runDuration: FK.DurationMS,
  runStartTimestamp: FK.UnixTimestampMS,
  runUrl?: string,
  ignoreAttachments?: boolean,
  category?: string,
}): Promise<{ report: FK.Report, attachments: ReportUtils.Attachment[] }>  {
  const report: FK.Report = {
    category: options.category ?? 'junit',
    commitId: options.commitId,
    generatedBy: { name: pkg.name, version: pkg.version },
    duration: options.runDuration,
    startTimestamp: options.runStartTimestamp,
    url: options.runUrl,
    environments: [options.defaultEnv],
    suites: [],
    unattributedErrors: [],
  };

  const context: ProcessingContext = {
    currentEnv: options.defaultEnv,
    currentEnvIndex: 0,
    currentTimeMs: 0,
    report,
    currentSuite: undefined,
    attachments: new Map(),
    ignoreAttachments: !!options.ignoreAttachments,
  };

  for (const xml of xmls) {
    const doc = parseXml(xml);
    for (const element of doc.children)
      await traverseJUnitReport(context, element);
  }
  return {
    report: ReportUtils.normalizeReport(report),
    attachments: Array.from(context.attachments.values()),
  };
}
