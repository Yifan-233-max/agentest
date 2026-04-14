import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import YAML from 'yaml';
import { access } from 'node:fs/promises';
import { loadConfig, resolveConfigReference, type ResolvedConfigReference } from '../config/load-config.js';
import { detectPromptSources, type PromptSourceCandidate } from '../project/discover-prompt-sources.js';
import { run, type SuiteSummary } from '../runner/run-tests.js';
import type { PromptSourceSpec, PromptTestSpec, PromptTestSpecMock } from '../spec/types.js';
import type { ResolvedAgentestConfig } from '../types.js';

export type CreateFormat = 'human' | 'json';
export type CreateOutputKind = 'yaml' | 'ts';

export interface CreateCliOptions {
  intent: string;
  configPath?: string;
  source?: string;
  outputPath?: string;
  name?: string;
  format?: CreateFormat;
  outputKind?: CreateOutputKind;
  runAfterCreate?: boolean;
  force?: boolean;
}

export interface CreateReport {
  outputPath: string;
  testName: string;
  promptSource: string;
  inferredFlow: string[];
  selectedTools: string[];
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
  runSummary?: {
    passed: number;
    failed: number;
    total: number;
  };
}

interface ToolInference {
  name: string;
  stage: number;
  score: number;
}

type ToolKind = 'search' | 'read' | 'analysis' | 'write' | 'notify' | 'generic';

interface PromptSourceSelection {
  promptSource: PromptSourceSpec;
  summary: string;
  confidence: number;
  warnings: string[];
  previewText?: string;
}

function withDotPrefix(relativePath: string): string {
  if (relativePath.startsWith('.')) {
    return relativePath;
  }

  return `./${relativePath}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 72) || 'generated-test';
}

function splitTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 1);
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
      return `command ${promptSource.command}`;
    default:
      return 'unknown prompt source';
  }
}

function inferDefaultTestsDir(config: ResolvedAgentestConfig): string {
  const patterns = config.test?.files ?? [];
  for (const pattern of patterns) {
    const normalized = pattern.replaceAll('\\', '/').replace(/^\.\//, '');
    const globIndex = normalized.search(/[\[*?{]/);
    const prefix = globIndex >= 0 ? normalized.slice(0, globIndex) : normalized;
    const trimmed = prefix.replace(/\/$/, '');
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return 'tests';
}

function detectToolKind(toolName: string): ToolKind {
  const tokens = splitTokens(toolName);
  const hasToken = (value: string): boolean => tokens.includes(value);

  if (['grep', 'search', 'find', 'query', 'locate', 'scan', 'lookup'].some((value) => hasToken(value))) {
    return 'search';
  }

  if (['replace', 'write', 'update', 'edit', 'patch', 'save', 'apply'].some((value) => hasToken(value))) {
    return 'write';
  }

  if (['submit', 'create', 'publish', 'send', 'notify'].some((value) => hasToken(value))) {
    return 'notify';
  }

  if (['read', 'open', 'load', 'get', 'fetch'].some((value) => hasToken(value)) || hasToken('spec') || hasToken('report')) {
    return 'read';
  }

  if (['analyze', 'analyse', 'inspect', 'plan', 'diff'].some((value) => hasToken(value))) {
    return 'analysis';
  }

  return 'generic';
}

function detectToolStage(toolName: string): number {
  switch (detectToolKind(toolName)) {
    case 'search':
      return 10;
    case 'read':
      return 20;
    case 'analysis':
      return 30;
    case 'write':
      return 40;
    case 'notify':
      return 50;
    default:
      return 60;
  }
}

function keywordHintsForTool(toolName: string): string[] {
  switch (detectToolKind(toolName)) {
    case 'search':
      return ['search', 'find', 'locate', 'bug', 'issue', 'match'];
    case 'read':
      return ['read', 'load', 'fetch', 'inspect', 'context', 'file', 'spec', 'report'];
    case 'write':
      return ['fix', 'patch', 'update', 'edit', 'replace', 'write', 'save'];
    case 'notify':
      return ['submit', 'publish', 'create', 'send', 'finish'];
    case 'analysis':
      return ['analyze', 'inspect', 'plan', 'diff'];
    default:
      return splitTokens(toolName);
  }
}

function inferTools(config: ResolvedAgentestConfig, corpus: string, warnings: string[]): ToolInference[] {
  const corpusTokens = splitTokens(corpus);
  const inferred = config.tools.map((toolDefinition) => {
    const nameTokens = splitTokens(toolDefinition.name);
    const hintedTokens = keywordHintsForTool(toolDefinition.name);
    let score = 0;

    for (const token of nameTokens) {
      if (corpusTokens.includes(token)) {
        score += 2;
      }
    }

    for (const token of hintedTokens) {
      if (corpusTokens.includes(token)) {
        score += 3;
      }
    }

    if (corpus.includes(toolDefinition.name.toLowerCase())) {
      score += 5;
    }

    return {
      name: toolDefinition.name,
      stage: detectToolStage(toolDefinition.name),
      score,
    } satisfies ToolInference;
  });

  let selected = inferred
    .filter((toolInference) => toolInference.score > 0)
    .sort((left, right) => right.score - left.score || left.stage - right.stage || left.name.localeCompare(right.name));

  if (selected.length === 0) {
    warnings.push('Tool inference had low confidence, so the generated case used the first configured tools as a fallback.');
    selected = inferred.slice(0, Math.min(3, inferred.length));
  }

  return selected
    .slice(0, Math.min(4, selected.length))
    .sort((left, right) => left.stage - right.stage || right.score - left.score || left.name.localeCompare(right.name));
}

function escapeRegexToken(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildFilePathRegex(filePath: string): string {
  const fileName = escapeRegexToken(path.basename(filePath));
  return `(^|/)${fileName}$`;
}

function buildKeywordRegex(intent: string): string {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'should', 'agent', 'workflow', 'test', 'case']);
  const keywords = splitTokens(intent)
    .filter((token) => token.length > 2 && !stopWords.has(token))
    .slice(0, 3)
    .map((token) => escapeRegexToken(token));

  return keywords.length > 0 ? keywords.join('|') : 'workflow|prompt|agent';
}

function extractExampleFilePath(corpus: string): string {
  const fileMatch = corpus.match(/[A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|py|java|cs|go|rs|md|txt|json)/);
  if (!fileMatch?.[0]) {
    return 'src/example.ts';
  }

  if (fileMatch[0].includes('/')) {
    return fileMatch[0];
  }

  return `src/${fileMatch[0]}`;
}

function buildMock(toolName: string, exampleFilePath: string, keywordRegex: string): PromptTestSpecMock {
  const toolKind = detectToolKind(toolName);

  if (toolKind === 'search') {
    return {
      tool: toolName,
      when: {
        query: {
          regex: keywordRegex,
          flags: 'i',
        },
      },
      returns: [
        {
          file: exampleFilePath,
          line: 1,
          text: `// matched context for ${toolName}`,
        },
      ],
    };
  }

  if (toolKind === 'read') {
    if (splitTokens(toolName).includes('file')) {
      return {
        tool: toolName,
        when: {
          filePath: {
            regex: buildFilePathRegex(exampleFilePath),
          },
        },
        returns: [
          `// Placeholder file contents for ${exampleFilePath}`,
          'export const value = "replace me";',
        ].join('\n'),
      };
    }

    return {
      tool: toolName,
      returns: `Placeholder response for ${toolName}`,
    };
  }

  if (toolKind === 'write') {
    return {
      tool: toolName,
      returns: {
        success: true,
      },
    };
  }

  if (toolKind === 'notify') {
    return {
      tool: toolName,
      returns: {
        accepted: true,
      },
    };
  }

  return {
    tool: toolName,
    returns: {
      ok: true,
    },
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function detectModuleExport(filePath: string): Promise<string> {
  try {
    const sourceText = await readFile(filePath, 'utf8');
    if (/export\s+default\b/.test(sourceText)) {
      return 'default';
    }

    const preferredExports = ['buildPrompt', 'createPrompt', 'prompt', 'build'];
    for (const exportName of preferredExports) {
      const pattern = new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${exportName}\\b`);
      if (pattern.test(sourceText)) {
        return exportName;
      }
    }

    const genericExportMatch = sourceText.match(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/)
      ?? sourceText.match(/export\s+const\s+([A-Za-z0-9_]+)/);
    return genericExportMatch?.[1] ?? 'buildPrompt';
  } catch {
    return 'buildPrompt';
  }
}

async function readPreview(filePath: string): Promise<string | undefined> {
  try {
    return (await readFile(filePath, 'utf8')).slice(0, 1200);
  } catch {
    return undefined;
  }
}

async function toPromptSourceSpec(options: {
  sourceRef: string;
  projectRoot: string;
  outputDir: string;
}): Promise<PromptSourceSelection> {
  const warnings: string[] = [];
  const [sourcePath, explicitExportName] = options.sourceRef.split('#');
  const resolvedPath = path.resolve(options.projectRoot, sourcePath);
  const relativePath = withDotPrefix(path.relative(options.outputDir, resolvedPath).replaceAll('\\', '/'));
  const extension = path.extname(resolvedPath).toLowerCase();

  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(extension)) {
    const exportName = explicitExportName ?? await detectModuleExport(resolvedPath);
    if (!explicitExportName) {
      warnings.push(`Auto-selected module export "${exportName}" for ${options.sourceRef}. Use --source <file>#<export> to override.`);
    }

    return {
      promptSource: {
        kind: 'module',
        ref: `${relativePath}#${exportName}`,
      },
      summary: `module ${relativePath}#${exportName}`,
      confidence: explicitExportName ? 3 : 2,
      warnings,
      previewText: await readPreview(resolvedPath),
    };
  }

  return {
    promptSource: {
      kind: 'file',
      path: relativePath,
    },
    summary: `file ${relativePath}`,
    confidence: 3,
    warnings,
    previewText: await readPreview(resolvedPath),
  };
}

function scoreCandidate(candidate: PromptSourceCandidate, intent: string): number {
  const intentTokens = splitTokens(intent);
  const candidateTokens = splitTokens(candidate.path);
  let score = candidate.kind === 'module-candidate' ? 1 : 0;
  for (const token of candidateTokens) {
    if (intentTokens.includes(token)) {
      score += 3;
    }
  }

  if (candidate.path.includes('prompt')) {
    score += 1;
  }

  return score;
}

async function selectPromptSource(options: {
  intent: string;
  explicitSource?: string;
  projectRoot: string;
  outputDir: string;
}): Promise<PromptSourceSelection> {
  if (options.explicitSource) {
    return toPromptSourceSpec({
      sourceRef: options.explicitSource,
      projectRoot: options.projectRoot,
      outputDir: options.outputDir,
    });
  }

  const candidates = await detectPromptSources(options.projectRoot);
  if (candidates.length === 0) {
    return {
      promptSource: {
        kind: 'inline',
        text: options.intent,
      },
      summary: 'inline prompt',
      confidence: 1,
      warnings: ['No prompt or workflow source candidates were detected, so the generated test uses the natural-language intent as an inline prompt.'],
    };
  }

  const [selectedCandidate] = [...candidates].sort((left, right) => {
    const scoreDifference = scoreCandidate(right, options.intent) - scoreCandidate(left, options.intent);
    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    if (left.kind !== right.kind) {
      return left.kind === 'module-candidate' ? -1 : 1;
    }

    return left.path.localeCompare(right.path);
  });

  const selection = await toPromptSourceSpec({
    sourceRef: selectedCandidate.path,
    projectRoot: options.projectRoot,
    outputDir: options.outputDir,
  });

  if (candidates.length > 1) {
    selection.warnings.push(`Auto-selected prompt source ${selectedCandidate.path}. Use --source to override.`);
  }

  return selection;
}

function determineConfidence(warnings: string[], sourceConfidence: number, toolInferences: ToolInference[]): 'high' | 'medium' | 'low' {
  if (sourceConfidence >= 3 && warnings.length === 0 && toolInferences.every((toolInference) => toolInference.score > 0)) {
    return 'high';
  }

  if (sourceConfidence >= 2 && toolInferences.length > 0) {
    return 'medium';
  }

  return 'low';
}

function buildHumanReport(report: CreateReport): string {
  const lines = [
    `Generated ${report.outputPath}`,
    `Test name: ${report.testName}`,
    `Prompt source: ${report.promptSource}`,
    `Inferred flow: ${report.inferredFlow.length > 0 ? report.inferredFlow.join(' -> ') : '(none)'}`,
    `Confidence: ${report.confidence}`,
  ];

  for (const warning of report.warnings) {
    lines.push(`WARN ${warning}`);
  }

  if (report.runSummary) {
    lines.push(
      `Initial validation run: ${report.runSummary.failed === 0 ? 'PASS' : 'FAIL'} (${report.runSummary.passed}/${report.runSummary.total})`,
    );
  }

  lines.push(`Next step: npx agentest flow ${report.outputPath}`);
  return lines.join('\n');
}

function toRunnableConfigPath(configReference: ResolvedConfigReference): string {
  if (configReference.kind === 'package-json-inline') {
    if (!configReference.packageJsonPath) {
      throw new Error(`Invalid package.json config reference: ${configReference.configPath}.`);
    }

    return configReference.packageJsonPath;
  }

  if (!configReference.filePath) {
    throw new Error(`Invalid file config reference: ${configReference.configPath}.`);
  }

  return configReference.filePath;
}

export async function create(options: CreateCliOptions): Promise<CreateReport> {
  const intent = options.intent.trim();
  if (!intent) {
    throw new Error('agentest create requires a natural-language intent.');
  }

  const outputKind = options.outputKind ?? 'yaml';
  if (outputKind !== 'yaml') {
    throw new Error('agentest create currently supports only YAML output. Use --as yaml or omit --as.');
  }

  const configReference = await resolveConfigReference(options.configPath);
  const config = await loadConfig(configReference);
  if (config.tools.length === 0) {
    throw new Error(`No tools are configured in ${configReference.configPath}. Add tools before running agentest create.`);
  }

  const testsDir = inferDefaultTestsDir(config);
  const fileSlug = options.name ? slugify(options.name) : slugify(intent);
  const outputAbsolutePath = options.outputPath
    ? path.resolve(configReference.projectRoot, options.outputPath)
    : path.join(configReference.projectRoot, testsDir, `${fileSlug}.agentest.yaml`);
  const outputDir = path.dirname(outputAbsolutePath);

  if (!options.force && await fileExists(outputAbsolutePath)) {
    throw new Error(`Refusing to overwrite ${outputAbsolutePath}. Pass --force to replace it.`);
  }

  const promptSourceSelection = await selectPromptSource({
    intent,
    explicitSource: options.source,
    projectRoot: configReference.projectRoot,
    outputDir,
  });

  const corpus = [intent, promptSourceSelection.summary, promptSourceSelection.previewText ?? ''].join('\n').toLowerCase();
  const warnings = [...promptSourceSelection.warnings];
  const inferredTools = inferTools(config, corpus, warnings);
  const inferredFlow = inferredTools.map((toolInference) => toolInference.name);
  const keywordRegex = buildKeywordRegex(intent);
  const exampleFilePath = extractExampleFilePath([intent, promptSourceSelection.previewText ?? ''].join('\n'));
  const spec: PromptTestSpec = {
    version: 0.1,
    name: options.name?.trim() || intent.replace(/\s+/g, ' ').trim().replace(/[.?!]+$/, ''),
    description: `Generated from intent: ${intent}`,
    promptSource: promptSourceSelection.promptSource,
    execution: config.test?.timeoutMs !== undefined
      ? { timeoutMs: config.test.timeoutMs }
      : undefined,
    mocks: inferredFlow.map((toolName) => buildMock(toolName, exampleFilePath, keywordRegex)),
    assert: {
      tools: {
        required: inferredFlow,
        sequence: inferredFlow.length > 1 ? inferredFlow : undefined,
        only: inferredFlow,
        noUnmatchedCalls: true,
      },
      process: {
        exitCode: 0,
        timeout: false,
      },
    },
  };

  const yamlText = YAML.stringify(spec);
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputAbsolutePath, yamlText, 'utf8');

  let runSummary: SuiteSummary | undefined;
  if (options.runAfterCreate) {
    runSummary = await run({
      configPath: toRunnableConfigPath(configReference),
      patterns: [path.relative(configReference.projectRoot, outputAbsolutePath).replaceAll('\\', '/')],
    });
  }

  const displayPath = withDotPrefix(path.relative(process.cwd(), outputAbsolutePath).replaceAll('\\', '/'));
  const report: CreateReport = {
    outputPath: displayPath,
    testName: spec.name,
    promptSource: summarizePromptSource(spec.promptSource),
    inferredFlow,
    selectedTools: inferredFlow,
    confidence: determineConfidence(warnings, promptSourceSelection.confidence, inferredTools),
    warnings,
    runSummary: runSummary
      ? {
        passed: runSummary.passed,
        failed: runSummary.failed,
        total: runSummary.total,
      }
      : undefined,
  };

  const output = (options.format ?? 'human') === 'json'
    ? JSON.stringify(report, null, 2)
    : buildHumanReport(report);
  process.stdout.write(`${output}\n`);
  return report;
}