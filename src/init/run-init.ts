import path from 'node:path';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { glob } from 'tinyglobby';
import { locateCommand } from '../platform/command-discovery.js';

export type InitAgentPreset = 'claude' | 'copilot';
export type InitAgentPreference = InitAgentPreset | 'auto';
export type InitFormat = 'human' | 'json';

interface PromptSourceCandidate {
  kind: 'file' | 'module-candidate';
  path: string;
}

interface DetectedAgent {
  name: InitAgentPreset;
  available: boolean;
  command: string;
  location?: string;
}

interface InitProjectMap {
  version: 1;
  generatedAt: string;
  workspaceRoot: string;
  promptSources: PromptSourceCandidate[];
  agents: DetectedAgent[];
  recommendedAgent?: InitAgentPreset;
  legacyConfigPath?: string;
}

interface InitConfigFile {
  version: 1;
  workspaceRoot: string;
  recommendedAgent?: InitAgentPreset;
  connectedAgent: null;
  paths: {
    projectMap: string;
    testsDir: string;
    skillsDir: string;
  };
  legacyConfigPath?: string;
}

export interface InitCliOptions {
  cwd?: string;
  agent?: InitAgentPreference;
  format?: InitFormat;
}

export interface InitReport {
  workspaceRoot: string;
  promptSourceCount: number;
  promptSources: PromptSourceCandidate[];
  agents: DetectedAgent[];
  recommendedAgent?: InitAgentPreset;
  createdPaths: string[];
  legacyConfigPath?: string;
  warnings: string[];
}

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.git/**',
  '**/.agentest/**',
];

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function detectLegacyConfig(workspaceRoot: string): Promise<string | undefined> {
  const candidates = ['agentest.config.mjs', 'agentest.config.js', 'agentest.config.ts'];
  for (const candidate of candidates) {
    const candidatePath = path.join(workspaceRoot, candidate);
    if (await fileExists(candidatePath)) {
      return path.relative(workspaceRoot, candidatePath).replaceAll('\\', '/');
    }
  }

  return undefined;
}

async function detectPromptSources(workspaceRoot: string): Promise<PromptSourceCandidate[]> {
  const fileSources = await glob([
    'prompts/**/*.{md,txt,prompt}',
    '**/*prompt*.{md,txt}',
  ], {
    cwd: workspaceRoot,
    onlyFiles: true,
    ignore: IGNORE_PATTERNS,
  });

  const moduleSources = await glob([
    'src/**/*prompt*.{ts,js,mjs,cjs,tsx,jsx}',
    '**/prompts/**/*.{ts,js,mjs,cjs,tsx,jsx}',
  ], {
    cwd: workspaceRoot,
    onlyFiles: true,
    ignore: IGNORE_PATTERNS,
  });

  const seen = new Set<string>();
  const promptSources: PromptSourceCandidate[] = [];

  for (const entry of fileSources) {
    const normalized = entry.replaceAll('\\', '/');
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    promptSources.push({
      kind: 'file',
      path: normalized,
    });
  }

  for (const entry of moduleSources) {
    const normalized = entry.replaceAll('\\', '/');
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    promptSources.push({
      kind: 'module-candidate',
      path: normalized,
    });
  }

  return promptSources.sort((left, right) => left.path.localeCompare(right.path));
}

async function detectAgents(workspaceRoot: string): Promise<DetectedAgent[]> {
  const definitions: Array<{ name: InitAgentPreset; command: string }> = [
    { name: 'claude', command: process.env.CLAUDE_BIN ?? 'claude' },
    { name: 'copilot', command: process.env.COPILOT_BIN ?? 'copilot' },
  ];

  const agents: DetectedAgent[] = [];
  for (const definition of definitions) {
    const resolved = await locateCommand(definition.command, workspaceRoot);
    agents.push({
      name: definition.name,
      available: resolved.found,
      command: definition.command,
      location: resolved.location,
    });
  }

  return agents;
}

function chooseRecommendedAgent(
  agents: DetectedAgent[],
  preference: InitAgentPreference,
  warnings: string[],
): InitAgentPreset | undefined {
  if (preference !== 'auto') {
    const requestedAgent = agents.find((agent) => agent.name === preference);
    if (requestedAgent?.available) {
      return preference;
    }

    warnings.push(`Requested agent "${preference}" was not detected in PATH.`);
    return undefined;
  }

  return agents.find((agent) => agent.available)?.name;
}

function toHumanReport(report: InitReport): string {
  const lines = [
    `Initialized agentest in ${report.workspaceRoot}`,
    `Detected ${report.promptSourceCount} prompt source candidate(s).`,
  ];

  if (report.agents.some((agent) => agent.available)) {
    lines.push(`Detected agent runtimes: ${report.agents.filter((agent) => agent.available).map((agent) => agent.name).join(', ')}`);
  } else {
    lines.push('Detected agent runtimes: none');
  }

  if (report.recommendedAgent) {
    lines.push(`Recommended agent: ${report.recommendedAgent}`);
    lines.push(`Next step: npx agentest connect ${report.recommendedAgent}`);
  } else {
    lines.push('Recommended agent: none');
    lines.push('Next step: install Claude Code or Copilot CLI, then run npx agentest connect <agent>');
  }

  for (const createdPath of report.createdPaths) {
    lines.push(`Wrote ${createdPath}`);
  }

  if (report.legacyConfigPath) {
    lines.push(`Detected legacy JS config: ${report.legacyConfigPath}`);
  }

  for (const warning of report.warnings) {
    lines.push(`WARN ${warning}`);
  }

  return lines.join('\n');
}

export async function init(options: InitCliOptions = {}): Promise<InitReport> {
  const workspaceRoot = options.cwd
    ? path.resolve(process.cwd(), options.cwd)
    : process.cwd();
  const requestedAgent = options.agent ?? 'auto';
  const warnings: string[] = [];

  const agentestRoot = path.join(workspaceRoot, '.agentest');
  const cacheDir = path.join(agentestRoot, 'cache');
  const testsDir = path.join(agentestRoot, 'tests');
  const skillsDir = path.join(agentestRoot, 'skills');

  await mkdir(cacheDir, { recursive: true });
  await mkdir(testsDir, { recursive: true });
  await mkdir(skillsDir, { recursive: true });

  const promptSources = await detectPromptSources(workspaceRoot);
  const agents = await detectAgents(workspaceRoot);
  const recommendedAgent = chooseRecommendedAgent(agents, requestedAgent, warnings);
  const legacyConfigPath = await detectLegacyConfig(workspaceRoot);

  const projectMap: InitProjectMap = {
    version: 1,
    generatedAt: new Date().toISOString(),
    workspaceRoot,
    promptSources,
    agents,
    recommendedAgent,
    legacyConfigPath,
  };

  const configFile: InitConfigFile = {
    version: 1,
    workspaceRoot: '.',
    recommendedAgent,
    connectedAgent: null,
    paths: {
      projectMap: '.agentest/cache/project-map.json',
      testsDir: '.agentest/tests',
      skillsDir: '.agentest/skills',
    },
    legacyConfigPath,
  };

  const projectMapPath = path.join(cacheDir, 'project-map.json');
  const configPath = path.join(agentestRoot, 'config.json');
  await writeFile(projectMapPath, JSON.stringify(projectMap, null, 2), 'utf8');
  await writeFile(configPath, JSON.stringify(configFile, null, 2), 'utf8');

  const report: InitReport = {
    workspaceRoot,
    promptSourceCount: promptSources.length,
    promptSources,
    agents,
    recommendedAgent,
    createdPaths: [
      path.relative(workspaceRoot, configPath).replaceAll('\\', '/'),
      path.relative(workspaceRoot, projectMapPath).replaceAll('\\', '/'),
      path.relative(workspaceRoot, testsDir).replaceAll('\\', '/'),
      path.relative(workspaceRoot, skillsDir).replaceAll('\\', '/'),
    ],
    legacyConfigPath,
    warnings,
  };

  const format = options.format ?? 'human';
  const output = format === 'json'
    ? JSON.stringify(report, null, 2)
    : toHumanReport(report);

  process.stdout.write(`${output}\n`);
  return report;
}