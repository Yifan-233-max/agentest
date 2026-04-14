import path from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { glob } from 'tinyglobby';
import { importModuleDefault } from '../platform/load-module.js';
import type {
  AgentestConfig,
  ResolvedAgentestConfig,
  ToolConfigInput,
  ToolDefinition,
} from '../types.js';

export const DEFAULT_TEST_PATTERNS = [
  'tests/**/*.agent.test.{js,mjs,ts}',
  '**/*.agent.test.{js,mjs,ts}',
  'tests/**/*.agentest.{yaml,yml}',
  '**/*.agentest.{yaml,yml}',
];

const DEFAULT_TEST_IGNORE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.git/**',
];

const DEFAULT_TOOL_INPUT_SCHEMA = {
  type: 'object',
  properties: {},
  additionalProperties: true,
};

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export interface ConfigResolutionResult {
  configReference?: ResolvedConfigReference;
  error?: Error;
}

export interface ResolvedConfigReference {
  kind: 'file' | 'package-json-inline';
  configPath: string;
  projectRoot: string;
  filePath?: string;
  packageJsonPath?: string;
}

interface PackageJsonWithAgentest {
  agentest?: AgentestConfig | string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function isToolDefinitionInput(value: unknown): value is Exclude<ToolConfigInput, string> {
  return isPlainObject(value) && typeof value.name === 'string';
}

function asFileReference(filePath: string): ResolvedConfigReference {
  return {
    kind: 'file',
    configPath: filePath,
    projectRoot: path.dirname(filePath),
    filePath,
  };
}

async function readPackageJson(packageJsonPath: string): Promise<PackageJsonWithAgentest> {
  return JSON.parse(await readFile(packageJsonPath, 'utf8')) as PackageJsonWithAgentest;
}

async function resolvePackageJsonConfig(packageJsonPath: string): Promise<ResolvedConfigReference | undefined> {
  const packageJson = await readPackageJson(packageJsonPath);

  if (typeof packageJson.agentest === 'string') {
    return asFileReference(path.resolve(path.dirname(packageJsonPath), packageJson.agentest));
  }

  if (isPlainObject(packageJson.agentest)) {
    return {
      kind: 'package-json-inline',
      configPath: `${packageJsonPath}#agentest`,
      projectRoot: path.dirname(packageJsonPath),
      packageJsonPath,
    };
  }

  return undefined;
}

export async function resolveConfigReference(explicitPath?: string): Promise<ResolvedConfigReference> {
  if (explicitPath) {
    const resolvedPath = path.resolve(process.cwd(), explicitPath);
    if (path.basename(resolvedPath) === 'package.json') {
      const packageJsonReference = await resolvePackageJsonConfig(resolvedPath);
      if (packageJsonReference) {
        return packageJsonReference;
      }

      throw new Error(`No "agentest" config was found in ${resolvedPath}.`);
    }

    return asFileReference(resolvedPath);
  }

  const candidates = [
    'agentest.config.mjs',
    'agentest.config.js',
    'agentest.config.ts',
  ].map((candidate) => path.resolve(process.cwd(), candidate));

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return asFileReference(candidate);
    } catch {
      continue;
    }
  }

  const packageJsonPath = path.resolve(process.cwd(), 'package.json');
  try {
    await access(packageJsonPath);
    const packageJsonReference = await resolvePackageJsonConfig(packageJsonPath);
    if (packageJsonReference) {
      return packageJsonReference;
    }
  } catch {
    // Ignore missing package.json during config discovery.
  }

  throw new Error('Unable to find an agentest config. Add agentest.config.* or package.json#agentest, or pass one with --config.');
}

export async function tryResolveConfigPath(explicitPath?: string): Promise<ConfigResolutionResult> {
  try {
    return {
      configReference: await resolveConfigReference(explicitPath),
    };
  } catch (error) {
    return {
      error: toError(error),
    };
  }
}

export async function importDefaultModule<T>(filePath: string): Promise<T> {
  return importModuleDefault<T>(filePath);
}

export async function resolveConfigPath(explicitPath?: string): Promise<string> {
  return (await resolveConfigReference(explicitPath)).configPath;
}

function normalizeToolDefinition(tool: ToolConfigInput, configPath: string, index: number): ToolDefinition {
  if (typeof tool === 'string') {
    return {
      name: tool,
      description: `Tool ${tool}`,
      inputSchema: DEFAULT_TOOL_INPUT_SCHEMA,
    };
  }

  if (!isToolDefinitionInput(tool)) {
    throw new Error(
      `Invalid tool definition at ${configPath} (tools[${index}]). Tools may be strings like "read_file" or objects with a string "name" field.`,
    );
  }

  return {
    name: tool.name,
    description: tool.description,
    inputSchema: isPlainObject(tool.inputSchema) ? tool.inputSchema : DEFAULT_TOOL_INPUT_SCHEMA,
  };
}

function normalizeConfig(config: AgentestConfig, configPath: string): ResolvedAgentestConfig {
  return {
    ...config,
    tools: config.tools.map((tool, index) => normalizeToolDefinition(tool, configPath, index)),
  };
}

function validateConfig(config: unknown, configPath: string): AgentestConfig {
  if (!isPlainObject(config) || !config.agent || !Array.isArray(config.tools)) {
    throw new Error(
      `Invalid agentest config at ${configPath}. Expected an object with "agent" and "tools". Add package.json#agentest or create agentest.config.ts/mjs.`,
    );
  }

  return config as unknown as AgentestConfig;
}

export async function loadConfig(configSource: string | ResolvedConfigReference): Promise<ResolvedAgentestConfig> {
  const configReference = typeof configSource === 'string'
    ? asFileReference(configSource)
    : configSource;

  if (configReference.kind === 'package-json-inline') {
    if (!configReference.packageJsonPath) {
      throw new Error(`Invalid package.json config reference: ${configReference.configPath}.`);
    }

    const packageJson = await readPackageJson(configReference.packageJsonPath);
    return normalizeConfig(validateConfig(packageJson.agentest, configReference.configPath), configReference.configPath);
  }

  if (!configReference.filePath) {
    throw new Error(`Invalid file config reference: ${configReference.configPath}.`);
  }

  const config = await importDefaultModule<AgentestConfig>(configReference.filePath);
  return normalizeConfig(validateConfig(config, configReference.configPath), configReference.configPath);
}

export async function discoverTestFiles(
  projectRoot: string,
  config: ResolvedAgentestConfig,
  patterns: string[],
): Promise<string[]> {
  const configuredPatterns = patterns.length > 0 ? patterns : config.test?.files ?? DEFAULT_TEST_PATTERNS;
  const files = await glob(configuredPatterns, {
    cwd: projectRoot,
    absolute: true,
    ignore: DEFAULT_TEST_IGNORE,
  });

  return [...new Set(files)].sort();
}