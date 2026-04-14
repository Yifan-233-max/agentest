import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadPromptTestSpec, isYamlTestFile } from '../spec/load-spec.js';
import type { PromptSourceSpec, PromptTestSpec } from '../spec/types.js';

export type FlowFormat = 'human' | 'json' | 'mermaid';

export interface FlowCliOptions {
  filePath: string;
  format?: FlowFormat;
  writePath?: string;
}

export interface FlowReport {
  filePath: string;
  name: string;
  promptSource: string;
  mockedTools: string[];
  expectedFlow: string[];
  assertions: string[];
  chaosProfile: string;
  stability: {
    runs?: number;
    minPassRate?: number;
  };
  mermaid: string;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function withDotPrefix(relativePath: string): string {
  if (relativePath.startsWith('.')) {
    return relativePath;
  }

  return `./${relativePath}`;
}

function summarizePromptSource(promptSource: PromptSourceSpec): string {
  switch (promptSource.kind) {
    case 'inline':
      return 'inline prompt';
    case 'file':
      return `file ${promptSource.path}`;
    case 'module':
      return `module ${promptSource.ref}`;
    case 'command':
      return `command ${promptSource.command}${promptSource.args?.length ? ` ${promptSource.args.join(' ')}` : ''}`;
    default:
      return 'unknown prompt source';
  }
}

function summarizeMatcher(matcher: unknown): string {
  if (typeof matcher === 'string') {
    return JSON.stringify(matcher);
  }

  if (Array.isArray(matcher)) {
    return matcher.map((item) => summarizeMatcher(item)).join(', ');
  }

  if (matcher && typeof matcher === 'object') {
    const record = matcher as Record<string, unknown>;
    if (typeof record.contains === 'string') {
      return `contains ${JSON.stringify(record.contains)}`;
    }

    if (typeof record.regex === 'string') {
      const flags = typeof record.flags === 'string' ? record.flags : '';
      return `matches /${record.regex}/${flags}`;
    }
  }

  return 'custom matcher';
}

function deriveExpectedFlow(spec: PromptTestSpec): string[] {
  if (spec.assert?.tools?.sequence?.length) {
    return unique(spec.assert.tools.sequence);
  }

  const mockedTools = unique((spec.mocks ?? []).map((mockDefinition) => mockDefinition.tool));
  if (mockedTools.length > 0) {
    return mockedTools;
  }

  return unique(spec.assert?.tools?.required ?? []);
}

function deriveAssertions(spec: PromptTestSpec): string[] {
  const assertions: string[] = [];

  if (spec.assert?.tools?.required?.length) {
    assertions.push(`required tools: ${spec.assert.tools.required.join(', ')}`);
  }

  if (spec.assert?.tools?.sequence?.length) {
    assertions.push(`sequence: ${spec.assert.tools.sequence.join(' -> ')}`);
  }

  if (spec.assert?.tools?.only?.length) {
    assertions.push(`only tools: ${spec.assert.tools.only.join(', ')}`);
  }

  if (spec.assert?.tools?.noUnmatchedCalls) {
    assertions.push('no unmatched tool calls');
  }

  if (spec.assert?.process?.exitCode !== undefined) {
    assertions.push(`exitCode=${spec.assert.process.exitCode}`);
  }

  if (spec.assert?.process?.timeout !== undefined) {
    assertions.push(`timeout=${String(spec.assert.process.timeout)}`);
  }

  if (spec.assert?.process?.durationMsMax !== undefined) {
    assertions.push(`duration<=${spec.assert.process.durationMsMax}ms`);
  }

  for (const matcher of spec.assert?.output?.stdoutContains ?? []) {
    assertions.push(`stdout ${summarizeMatcher(matcher)}`);
  }

  for (const matcher of spec.assert?.output?.stderrContains ?? []) {
    assertions.push(`stderr ${summarizeMatcher(matcher)}`);
  }

  for (const matcher of spec.assert?.output?.stdoutNotContains ?? []) {
    assertions.push(`stdout not ${summarizeMatcher(matcher)}`);
  }

  for (const matcher of spec.assert?.output?.stderrNotContains ?? []) {
    assertions.push(`stderr not ${summarizeMatcher(matcher)}`);
  }

  return assertions;
}

function escapeMermaidLabel(value: string): string {
  return value.replaceAll('"', '\'').replaceAll('\n', ' ');
}

function buildMermaid(report: Omit<FlowReport, 'mermaid'>): string {
  const lines = ['flowchart LR'];
  let previousNode = 'P0';

  lines.push(`  ${previousNode}["Prompt Source\\n${escapeMermaidLabel(report.promptSource)}"]`);

  report.expectedFlow.forEach((toolName, index) => {
    const nodeId = `T${index}`;
    lines.push(`  ${previousNode} --> ${nodeId}["${escapeMermaidLabel(toolName)}"]`);
    previousNode = nodeId;
  });

  const assertionLabel = report.assertions.length > 0
    ? report.assertions.slice(0, 4).join('\\n')
    : 'no explicit assertions';
  lines.push(`  ${previousNode} --> A0["Assertions\\n${escapeMermaidLabel(assertionLabel)}"]`);
  lines.push(`  A0 --> C0["Chaos Profile\\n${escapeMermaidLabel(report.chaosProfile)}"]`);

  return lines.join('\n');
}

function toHumanReport(report: FlowReport): string {
  const lines = [
    `Test: ${report.name}`,
    `Spec: ${report.filePath}`,
    `Prompt source: ${report.promptSource}`,
    `Mocked tools: ${report.mockedTools.length > 0 ? report.mockedTools.join(', ') : '(none)'}`,
    `Flow: ${report.expectedFlow.length > 0 ? report.expectedFlow.join(' -> ') : '(no ordered tools inferred)'}`,
    `Assertions: ${report.assertions.length > 0 ? report.assertions.join(' | ') : '(none)'}`,
    `Chaos profile: ${report.chaosProfile}`,
  ];

  if (report.stability.runs !== undefined || report.stability.minPassRate !== undefined) {
    lines.push(
      `Stability: runs=${report.stability.runs ?? 1}, minPassRate=${report.stability.minPassRate ?? 1}`,
    );
  }

  return lines.join('\n');
}

export async function flow(options: FlowCliOptions): Promise<FlowReport> {
  const format = options.format ?? 'human';
  const absoluteFilePath = path.resolve(process.cwd(), options.filePath);
  if (!isYamlTestFile(absoluteFilePath)) {
    throw new Error(`agentest flow currently supports YAML specs only. Received ${options.filePath}.`);
  }

  const spec = await loadPromptTestSpec(absoluteFilePath);
  const displayPath = withDotPrefix(path.relative(process.cwd(), absoluteFilePath).replaceAll('\\', '/'));
  const expectedFlow = deriveExpectedFlow(spec);
  const reportWithoutMermaid = {
    filePath: displayPath,
    name: spec.name,
    promptSource: summarizePromptSource(spec.promptSource),
    mockedTools: unique((spec.mocks ?? []).map((mockDefinition) => mockDefinition.tool)),
    expectedFlow,
    assertions: deriveAssertions(spec),
    chaosProfile: spec.chaos?.profile ?? 'off',
    stability: {
      runs: spec.execution?.stability?.runs,
      minPassRate: spec.execution?.stability?.minPassRate,
    },
  } satisfies Omit<FlowReport, 'mermaid'>;

  const report: FlowReport = {
    ...reportWithoutMermaid,
    mermaid: buildMermaid(reportWithoutMermaid),
  };

  const output = format === 'json'
    ? JSON.stringify(report, null, 2)
    : format === 'mermaid'
      ? report.mermaid
      : toHumanReport(report);

  if (options.writePath) {
    const absoluteWritePath = path.resolve(process.cwd(), options.writePath);
    await mkdir(path.dirname(absoluteWritePath), { recursive: true });
    await writeFile(absoluteWritePath, `${output}\n`, 'utf8');
  }

  process.stdout.write(`${output}\n`);
  return report;
}