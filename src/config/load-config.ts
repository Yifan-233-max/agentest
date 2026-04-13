import path from 'node:path';
import { access } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { glob } from 'tinyglobby';
import type { AgentestConfig } from '../types.js';

export const DEFAULT_TEST_PATTERNS = ['tests/**/*.agent.test.{js,mjs,ts}'];

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export interface ConfigResolutionResult {
  configPath?: string;
  error?: Error;
}

export async function resolveConfigPath(explicitPath?: string): Promise<string> {
  if (explicitPath) {
    return path.resolve(process.cwd(), explicitPath);
  }

  const candidates = [
    'agentest.config.mjs',
    'agentest.config.js',
    'agentest.config.ts',
  ].map((candidate) => path.resolve(process.cwd(), candidate));

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error('Unable to find an agentest config file. Pass one with --config.');
}

export async function tryResolveConfigPath(explicitPath?: string): Promise<ConfigResolutionResult> {
  try {
    return {
      configPath: await resolveConfigPath(explicitPath),
    };
  } catch (error) {
    return {
      error: toError(error),
    };
  }
}

export async function importDefaultModule<T>(filePath: string): Promise<T> {
  try {
    const module = await import(pathToFileURL(filePath).href);
    return module.default as T;
  } catch (error) {
    if (path.extname(filePath) === '.ts') {
      throw new Error(
        `Failed to load ${filePath}. TypeScript config/test files require running through a TypeScript loader such as tsx.`,
      );
    }

    throw error;
  }
}

export async function loadConfig(configPath: string): Promise<AgentestConfig> {
  const config = await importDefaultModule<AgentestConfig>(configPath);
  if (!config?.agent || !Array.isArray(config?.tools)) {
    throw new Error(`Invalid agentest config at ${configPath}.`);
  }

  return config;
}

export async function discoverTestFiles(
  projectRoot: string,
  config: AgentestConfig,
  patterns: string[],
): Promise<string[]> {
  const configuredPatterns = patterns.length > 0 ? patterns : config.test?.files ?? DEFAULT_TEST_PATTERNS;
  const files = await glob(configuredPatterns, {
    cwd: projectRoot,
    absolute: true,
  });

  return [...new Set(files)].sort();
}